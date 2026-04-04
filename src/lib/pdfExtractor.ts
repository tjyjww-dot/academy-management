import * as pdfjsLib from 'pdfjs-dist';

// Types
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: number[];
}

export interface DetectedProblem {
  number: number;
  pageNumber: number;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  column: number;
}

export interface DetectedAnswer {
  problemNumber: number;
  answerText: string;
  y: number;
  x: number;
  pageNumber: number;
  confidence: number;
  column: number;
}

export interface ExtractedProblem {
  id: string;
  number: number;
  pageNumber: number;
  imageDataUrl: string;
  bbox: { x: number; y: number; width: number; height: number };
  answerPageNumber?: number;
  answerImageDataUrl?: string;
}

export interface DebugInfo {
  pages: {
    pageNum: number;
    isTwoColumn: boolean;
    columnBoundary: number;
    pageWidth: number;
    totalItems: number;
    leftItems: number;
    rightItems: number;
    lines: { y: number; text: string; column: string }[];
    detectedProblems: { number: number; y: number; column: number }[];
    detectedAnswers: { number: number; y: number; column: number }[];
  }[];
}

// PDF.js worker setup
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

const CIRCLED_NUMBER_MAP: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
  '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
};

/* ================================================================
   Problem detection - multi-strategy approach
   ================================================================ */

/**
 * Try to detect a problem number from text.
 * Strategy: try multiple patterns, return first match.
 */
function detectProblemNumber(text: string): { number: number; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Pattern priority order (most specific to least)
  const patterns: { re: RegExp; conf: number }[] = [
    // "1. " or "12. " with space after period
    { re: /^(\d{1,3})\.\s/, conf: 0.95 },
    // "1." alone (text item is just "1." or "1. ")
    { re: /^(\d{1,3})\.\s*$/, conf: 0.93 },
    // "1)" or "12)"
    { re: /^(\d{1,3})\)\s*/, conf: 0.92 },
    // Circled numbers
    { re: /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑲⑳])/, conf: 0.95 },
    // "문제 1" or "문1"
    { re: /^문제?\s*(\d{1,3})/, conf: 0.85 },
    // "[1]"
    { re: /^\[(\d{1,3})\]/, conf: 0.85 },
    // "1번"
    { re: /^(\d{1,3})번/, conf: 0.85 },
    // "(1)"
    { re: /^\((\d{1,3})\)/, conf: 0.8 },
    // "1.xxx" without space (PDF might not have space)
    { re: /^(\d{1,3})\.(?=[^\d])/, conf: 0.85 },
  ];

  for (const { re, conf } of patterns) {
    const match = trimmed.match(re);
    if (match) {
      let num: number;
      if (match[1] && CIRCLED_NUMBER_MAP[match[1]]) {
        num = CIRCLED_NUMBER_MAP[match[1]];
      } else {
        num = parseInt(match[1], 10);
      }
      if (num > 0 && num <= 100) {
        return { number: num, confidence: conf };
      }
    }
  }

  // Last resort: check if the text is JUST a number (bare number like "1", "2", "24")
  const bareMatch = trimmed.match(/^(\d{1,3})$/);
  if (bareMatch) {
    const num = parseInt(bareMatch[1], 10);
    if (num > 0 && num <= 50) {
      return { number: num, confidence: 0.6 };
    }
  }

  return null;
}

/**
 * Detect answer number from text.
 * User says answers use "1)", "2)" format.
 */
function detectAnswerNumber(text: string): { problemNumber: number; answerText: string; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const patterns: { re: RegExp; conf: number }[] = [
    // "1) ②" or "1) 3" — primary format user specified
    { re: /^(\d{1,3})\)\s*(.*)$/, conf: 0.95 },
    // "1)" alone
    { re: /^(\d{1,3})\)\s*$/, conf: 0.93 },
    // "1. ②" or "1. 3"
    { re: /^(\d{1,3})\.\s+(.+)$/, conf: 0.8 },
  ];

  for (const { re, conf } of patterns) {
    const match = trimmed.match(re);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 100) {
        return { problemNumber: num, answerText: match[2] || '', confidence: conf };
      }
    }
  }

  return null;
}

/* ================================================================
   Two-column layout detection
   ================================================================ */

interface ColumnLayout {
  isTwoColumn: boolean;
  columnBoundary: number;
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
}

function detectColumnLayout(items: TextItem[], pageWidth: number): ColumnLayout {
  const singleCol: ColumnLayout = {
    isTwoColumn: false,
    columnBoundary: pageWidth,
    leftStart: 0, leftEnd: pageWidth,
    rightStart: pageWidth, rightEnd: pageWidth,
  };

  if (items.length < 10) return singleCol;

  const midPage = pageWidth / 2;

  // Build histogram of X positions (binned)
  const binSize = 5;
  const bins: Record<number, number> = {};
  for (const item of items) {
    const bin = Math.floor(item.x / binSize) * binSize;
    bins[bin] = (bins[bin] || 0) + 1;
  }

  // Find gap in the middle region (30%-70% of page width)
  const gapStart = pageWidth * 0.3;
  const gapEnd = pageWidth * 0.7;

  // Look for a continuous empty zone in the histogram
  let bestGapCenter = midPage;
  let bestGapWidth = 0;

  let currentGapStart = -1;
  for (let x = gapStart; x <= gapEnd; x += binSize) {
    const bin = Math.floor(x / binSize) * binSize;
    if (!bins[bin] || bins[bin] <= 1) {
      // This bin is empty or nearly empty
      if (currentGapStart < 0) currentGapStart = x;
    } else {
      if (currentGapStart >= 0) {
        const gapW = x - currentGapStart;
        if (gapW > bestGapWidth) {
          bestGapWidth = gapW;
          bestGapCenter = currentGapStart + gapW / 2;
        }
      }
      currentGapStart = -1;
    }
  }
  // Check trailing gap
  if (currentGapStart >= 0) {
    const gapW = gapEnd - currentGapStart;
    if (gapW > bestGapWidth) {
      bestGapWidth = gapW;
      bestGapCenter = currentGapStart + gapW / 2;
    }
  }

  // Need a meaningful gap (at least 15px)
  if (bestGapWidth < 15) return singleCol;

  const boundary = bestGapCenter;

  // Verify both sides have substantial content
  const leftItems = items.filter(i => i.x + i.width / 2 < boundary);
  const rightItems = items.filter(i => i.x + i.width / 2 >= boundary);

  if (leftItems.length < items.length * 0.1 || rightItems.length < items.length * 0.1) {
    return singleCol;
  }

  const leftStart = Math.min(...leftItems.map(i => i.x));
  const leftEnd = boundary;
  const rightStart = boundary;
  const rightEnd = pageWidth;

  return {
    isTwoColumn: true,
    columnBoundary: boundary,
    leftStart: Math.max(0, leftStart - 5),
    leftEnd,
    rightStart,
    rightEnd,
  };
}

function splitByColumn(items: TextItem[], layout: ColumnLayout): { left: TextItem[]; right: TextItem[] } {
  if (!layout.isTwoColumn) return { left: items, right: [] };
  const left: TextItem[] = [];
  const right: TextItem[] = [];
  for (const item of items) {
    if (item.x + item.width / 2 < layout.columnBoundary) {
      left.push(item);
    } else {
      right.push(item);
    }
  }
  return { left, right };
}

/* ================================================================
   Line grouping
   ================================================================ */

interface LineGroup {
  items: TextItem[];
  y: number;
  minX: number;
  maxX: number;
  text: string; // concatenated text for debug
}

function groupIntoLines(items: TextItem[]): LineGroup[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 4) return a.x - b.x;
    return a.y - b.y;
  });

  const heights = items.map(i => i.height).filter(h => h > 0);
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b) / heights.length : 10;
  const yThreshold = Math.max(5, avgHeight * 0.6);

  const lines: LineGroup[] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= yThreshold) {
      currentLine.push(item);
    } else {
      finalizeLine(currentLine, currentY, lines);
      currentLine = [item];
      currentY = item.y;
    }
  }
  finalizeLine(currentLine, currentY, lines);

  return lines;
}

function finalizeLine(items: TextItem[], y: number, lines: LineGroup[]) {
  if (items.length === 0) return;
  const sortedByX = [...items].sort((a, b) => a.x - b.x);
  const minX = sortedByX[0].x;
  const last = sortedByX[sortedByX.length - 1];
  const maxX = last.x + last.width;
  const text = sortedByX.map(i => i.text).join('');
  lines.push({ items: sortedByX, y, minX, maxX, text });
}

/* ================================================================
   Core detection: find problem numbers in lines
   ================================================================ */

function detectInLines(
  lines: LineGroup[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colWidth: number,
  detector: 'problem' | 'answer'
): (DetectedProblem | DetectedAnswer)[] {
  const results: any[] = [];

  for (const line of lines) {
    const sortedByX = line.items;
    if (sortedByX.length === 0) continue;

    // Strategy 1: Check concatenated first few items
    let lineStart = '';
    for (const item of sortedByX.slice(0, 5)) {
      lineStart += item.text;
    }

    // Strategy 2: Check first item alone
    const firstText = sortedByX[0].text.trim();

    // Strategy 3: Check first two items concatenated (handles "1" + "." split)
    let firstTwo = firstText;
    if (sortedByX.length > 1) {
      firstTwo = firstText + sortedByX[1].text.trim();
    }

    let detected: any = null;

    if (detector === 'problem') {
      // Try all strategies
      detected = detectProblemNumber(lineStart)
        || detectProblemNumber(firstTwo)
        || detectProblemNumber(firstText);

      if (detected) {
        results.push({
          number: detected.number,
          pageNumber: pageNum,
          bbox: { x: colStartX, y: line.y, width: colWidth, height: 0 },
          confidence: detected.confidence,
          column: columnIndex,
        });
      }
    } else {
      detected = detectAnswerNumber(lineStart)
        || detectAnswerNumber(firstTwo)
        || detectAnswerNumber(firstText);

      if (detected) {
        results.push({
          problemNumber: detected.problemNumber,
          answerText: detected.answerText,
          y: line.y,
          x: colStartX,
          pageNumber: pageNum,
          confidence: detected.confidence,
          column: columnIndex,
        });
      }
    }
  }

  return results;
}

/* ================================================================
   Find the "left margin" X positions where problems typically start
   ================================================================ */

function findLeftMarginProblems(
  items: TextItem[],
  pageNum: number,
  colStartX: number,
  colWidth: number,
  columnIndex: number
): DetectedProblem[] {
  // Find items that look like problem numbers (bare numbers, "N.", "N)")
  // Group by approximate X position to find the "margin" where problems start

  const candidates: { item: TextItem; number: number; confidence: number }[] = [];

  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;

    // Check if this item is a problem number
    const result = detectProblemNumber(text);
    if (result) {
      candidates.push({ item, number: result.number, confidence: result.confidence });
    }
  }

  if (candidates.length < 2) return [];

  // Find the most common X position (within tolerance) among candidates
  // This is likely the left margin of problem numbers
  const xPositions = candidates.map(c => Math.round(c.item.x / 3) * 3); // bin to 3px
  const xCounts: Record<number, number> = {};
  for (const x of xPositions) {
    xCounts[x] = (xCounts[x] || 0) + 1;
  }

  // Get the X position with the most candidates
  let bestX = 0;
  let bestCount = 0;
  for (const [x, count] of Object.entries(xCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestX = Number(x);
    }
  }

  if (bestCount < 2) return [];

  // Filter candidates that are at this X margin (within 10px tolerance)
  const marginCandidates = candidates.filter(c => Math.abs(c.item.x - bestX) < 10);

  // Convert to DetectedProblem
  return marginCandidates.map(c => ({
    number: c.number,
    pageNumber: pageNum,
    bbox: { x: colStartX, y: c.item.y, width: colWidth, height: 0 },
    confidence: c.confidence + 0.05, // boost confidence for margin-aligned items
    column: columnIndex,
  }));
}

/* ================================================================
   Public API
   ================================================================ */

export async function loadPdf(file: File): Promise<any> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf;
}

export async function getPageTextItems(
  pdf: any,
  pageNum: number
): Promise<{ items: TextItem[]; viewport: { width: number; height: number } }> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();

  const items: TextItem[] = textContent.items
    .filter((item: any) => item.str && item.str.trim())
    .map((item: any) => ({
      text: item.str,
      x: item.transform[4],
      y: viewport.height - item.transform[5],
      width: item.width,
      height: item.height || Math.abs(item.transform[3]),
      transform: item.transform,
    }));

  return { items, viewport: { width: viewport.width, height: viewport.height } };
}

/**
 * Detect problems on a single page with two-column support.
 * Uses multiple strategies: line-based detection + margin-based detection.
 */
export async function detectProblemsOnPage(
  pdf: any,
  pageNum: number,
  debugPage?: any
): Promise<DetectedProblem[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];

  const layout = detectColumnLayout(items, viewport.width);
  const { left, right } = splitByColumn(items, layout);

  // Debug info
  if (debugPage) {
    debugPage.pageNum = pageNum;
    debugPage.isTwoColumn = layout.isTwoColumn;
    debugPage.columnBoundary = Math.round(layout.columnBoundary);
    debugPage.pageWidth = Math.round(viewport.width);
    debugPage.totalItems = items.length;
    debugPage.leftItems = left.length;
    debugPage.rightItems = right.length;
    debugPage.lines = [];
    debugPage.detectedProblems = [];
    debugPage.detectedAnswers = [];
  }

  const allDetected: DetectedProblem[] = [];

  // Process columns
  const columns = layout.isTwoColumn
    ? [
        { items: left, index: 0, startX: layout.leftStart, width: layout.leftEnd - layout.leftStart },
        { items: right, index: 1, startX: layout.rightStart, width: layout.rightEnd - layout.rightStart },
      ]
    : [
        { items: left, index: 0, startX: 0, width: viewport.width },
      ];

  for (const col of columns) {
    if (col.items.length === 0) continue;

    const lines = groupIntoLines(col.items);

    // Debug: record lines
    if (debugPage) {
      for (const line of lines.slice(0, 30)) {
        debugPage.lines.push({
          y: Math.round(line.y),
          text: line.text.substring(0, 80),
          column: col.index === 0 ? 'L' : 'R',
        });
      }
    }

    // Strategy A: Line-based detection
    const lineDetected = detectInLines(
      lines, pageNum, col.index, col.startX, col.width, 'problem'
    ) as DetectedProblem[];

    // Strategy B: Left-margin detection (finds numbers aligned at the same X position)
    const marginDetected = findLeftMarginProblems(
      col.items, pageNum, col.startX, col.width, col.index
    );

    // Merge: combine both strategies, preferring higher confidence
    const merged = new Map<number, DetectedProblem>();
    for (const d of [...lineDetected, ...marginDetected]) {
      const existing = merged.get(d.number);
      if (!existing || d.confidence > existing.confidence) {
        merged.set(d.number, d);
      }
    }

    allDetected.push(...merged.values());
  }

  // Sort by number and deduplicate across columns
  allDetected.sort((a, b) => a.number - b.number);
  const unique: DetectedProblem[] = [];
  for (const d of allDetected) {
    const existing = unique.find(u => u.number === d.number);
    if (!existing) {
      unique.push(d);
    } else if (d.confidence > existing.confidence) {
      const idx = unique.indexOf(existing);
      unique[idx] = d;
    }
  }

  if (debugPage) {
    debugPage.detectedProblems = unique.map(d => ({
      number: d.number, y: Math.round(d.bbox.y), column: d.column,
    }));
  }

  return unique;
}

/**
 * Detect answers on a single page with two-column support.
 */
export async function detectAnswersOnPage(
  pdf: any,
  pageNum: number,
  debugPage?: any
): Promise<DetectedAnswer[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];

  const layout = detectColumnLayout(items, viewport.width);
  const { left, right } = splitByColumn(items, layout);

  if (debugPage) {
    debugPage.pageNum = pageNum;
    debugPage.isTwoColumn = layout.isTwoColumn;
    debugPage.columnBoundary = Math.round(layout.columnBoundary);
    debugPage.pageWidth = Math.round(viewport.width);
    debugPage.totalItems = items.length;
    debugPage.leftItems = left.length;
    debugPage.rightItems = right.length;
    debugPage.lines = debugPage.lines || [];
    debugPage.detectedProblems = debugPage.detectedProblems || [];
    debugPage.detectedAnswers = [];
  }

  const allDetected: DetectedAnswer[] = [];

  const columns = layout.isTwoColumn
    ? [
        { items: left, index: 0, startX: layout.leftStart, width: layout.leftEnd - layout.leftStart },
        { items: right, index: 1, startX: layout.rightStart, width: layout.rightEnd - layout.rightStart },
      ]
    : [
        { items: left, index: 0, startX: 0, width: viewport.width },
      ];

  for (const col of columns) {
    if (col.items.length === 0) continue;
    const lines = groupIntoLines(col.items);

    if (debugPage) {
      for (const line of lines.slice(0, 30)) {
        debugPage.lines.push({
          y: Math.round(line.y),
          text: line.text.substring(0, 80),
          column: col.index === 0 ? 'L' : 'R',
        });
      }
    }

    const detected = detectInLines(
      lines, pageNum, col.index, col.startX, col.width, 'answer'
    ) as DetectedAnswer[];

    allDetected.push(...detected);
  }

  allDetected.sort((a, b) => a.problemNumber - b.problemNumber);

  // Deduplicate
  const unique: DetectedAnswer[] = [];
  for (const d of allDetected) {
    const existing = unique.find(u => u.problemNumber === d.problemNumber);
    if (!existing) {
      unique.push(d);
    } else if (d.confidence > existing.confidence) {
      const idx = unique.indexOf(existing);
      unique[idx] = d;
    }
  }

  if (debugPage) {
    debugPage.detectedAnswers = unique.map(d => ({
      number: d.problemNumber, y: Math.round(d.y), column: d.column,
    }));
  }

  return unique;
}

/**
 * Detect all problems across pages, with debug info collection.
 */
export async function detectAllProblems(
  pdf: any,
  startPage: number = 1,
  endPage?: number,
  debug?: DebugInfo
): Promise<DetectedProblem[]> {
  const totalPages = pdf.numPages;
  const last = endPage || totalPages;
  const allProblems: DetectedProblem[] = [];

  for (let p = startPage; p <= last; p++) {
    let debugPage: any = undefined;
    if (debug) {
      debugPage = {};
      debug.pages.push(debugPage);
    }
    const problems = await detectProblemsOnPage(pdf, p, debugPage);
    allProblems.push(...problems);
  }

  // Calculate bounding box heights
  for (let i = 0; i < allProblems.length; i++) {
    const current = allProblems[i];

    // Find next problem in same page AND same column
    let nextInColumn: DetectedProblem | null = null;
    for (let j = i + 1; j < allProblems.length; j++) {
      if (allProblems[j].pageNumber === current.pageNumber && allProblems[j].column === current.column) {
        nextInColumn = allProblems[j];
        break;
      }
    }

    if (nextInColumn) {
      current.bbox.height = nextInColumn.bbox.y - current.bbox.y;
    } else {
      const page = await pdf.getPage(current.pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      current.bbox.height = viewport.height - current.bbox.y;
    }

    const padding = 10;
    current.bbox.y = Math.max(0, current.bbox.y - padding);
    current.bbox.height += padding * 2;
  }

  return allProblems;
}

/**
 * Detect all answers across pages.
 */
export async function detectAnswersOnPages(
  pdf: any,
  startPage: number = 1,
  endPage?: number,
  debug?: DebugInfo
): Promise<DetectedAnswer[]> {
  const totalPages = pdf.numPages;
  const last = endPage || totalPages;
  const allAnswers: DetectedAnswer[] = [];

  for (let p = startPage; p <= last; p++) {
    let debugPage: any = undefined;
    if (debug) {
      debugPage = debug.pages.find((pg: any) => pg.pageNum === p) || {};
      if (!debug.pages.includes(debugPage)) debug.pages.push(debugPage);
    }
    const answers = await detectAnswersOnPage(pdf, p, debugPage);
    allAnswers.push(...answers);
  }

  return allAnswers;
}

/* ================================================================
   Canvas rendering & image extraction
   ================================================================ */

const pageCanvasCache: Map<string, HTMLCanvasElement> = new Map();

export async function renderPageToCanvas(
  pdf: any,
  pageNum: number,
  scale: number = 2.0
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function getOrRenderPage(pdf: any, pageNum: number, scale: number): Promise<HTMLCanvasElement> {
  const key = `${pageNum}-${scale}`;
  if (pageCanvasCache.has(key)) return pageCanvasCache.get(key)!;
  const canvas = await renderPageToCanvas(pdf, pageNum, scale);
  pageCanvasCache.set(key, canvas);
  return canvas;
}

export function clearPageCache() { pageCanvasCache.clear(); }

export async function extractProblemImage(
  pdf: any,
  problem: DetectedProblem,
  scale: number = 2.0
): Promise<string> {
  const fullCanvas = await getOrRenderPage(pdf, problem.pageNumber, scale);

  const sx = Math.max(0, problem.bbox.x * scale);
  const sy = Math.max(0, problem.bbox.y * scale);
  const sw = Math.min(problem.bbox.width * scale, fullCanvas.width - sx);
  const sh = Math.min(problem.bbox.height * scale, fullCanvas.height - sy);

  if (sw <= 0 || sh <= 0) {
    const fallback = document.createElement('canvas');
    fallback.width = 100; fallback.height = 50;
    return fallback.toDataURL('image/png');
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, Math.round(sw));
  cropCanvas.height = Math.max(1, Math.round(sh));

  const ctx = cropCanvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

  return trimWhitespace(cropCanvas);
}

function trimWhitespace(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  let top = height, bottom = 0, left = width, right = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top >= bottom || left >= right) return canvas.toDataURL('image/png');

  const pad = 15;
  top = Math.max(0, top - pad);
  bottom = Math.min(height - 1, bottom + pad);
  left = Math.max(0, left - pad);
  right = Math.min(width - 1, right + pad);

  const trimW = right - left + 1;
  const trimH = bottom - top + 1;
  const trimCanvas = document.createElement('canvas');
  trimCanvas.width = trimW;
  trimCanvas.height = trimH;
  const trimCtx = trimCanvas.getContext('2d')!;
  trimCtx.fillStyle = 'white';
  trimCtx.fillRect(0, 0, trimW, trimH);
  trimCtx.drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);

  return trimCanvas.toDataURL('image/png');
}

export async function extractAllProblemImages(
  pdf: any,
  problems: DetectedProblem[],
  scale: number = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedProblem[]> {
  clearPageCache();
  const results: ExtractedProblem[] = [];
  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    if (onProgress) onProgress(i + 1, problems.length);
    const imageDataUrl = await extractProblemImage(pdf, problem, scale);
    results.push({
      id: `p${problem.pageNumber}-c${problem.column}-n${problem.number}`,
      number: problem.number,
      pageNumber: problem.pageNumber,
      imageDataUrl,
      bbox: problem.bbox,
    });
  }
  clearPageCache();
  return results;
}

export async function extractAnswerImages(
  pdf: any,
  answers: DetectedAnswer[],
  scale: number = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedProblem[]> {
  clearPageCache();
  const results: ExtractedProblem[] = [];

  // Deduplicate
  const answerMap: Record<number, DetectedAnswer> = {};
  for (const a of answers) {
    if (!answerMap[a.problemNumber] || a.confidence > answerMap[a.problemNumber].confidence) {
      answerMap[a.problemNumber] = a;
    }
  }
  const uniqueAnswers = Object.values(answerMap).sort((a, b) => a.problemNumber - b.problemNumber);

  for (let i = 0; i < uniqueAnswers.length; i++) {
    const answer = uniqueAnswers[i];
    if (onProgress) onProgress(i + 1, uniqueAnswers.length);

    try {
      const fullCanvas = await getOrRenderPage(pdf, answer.pageNumber, scale);

      // Find height: distance to next answer in same page+column
      let nextY: number | null = null;
      for (let j = i + 1; j < uniqueAnswers.length; j++) {
        if (uniqueAnswers[j].pageNumber === answer.pageNumber && uniqueAnswers[j].column === answer.column) {
          nextY = uniqueAnswers[j].y;
          break;
        }
      }

      const page = await pdf.getPage(answer.pageNumber);
      const vp = page.getViewport({ scale: 1.0 });
      const answerHeight = nextY ? (nextY - answer.y) : Math.min(40, vp.height - answer.y);

      const sx = Math.max(0, answer.x * scale);
      const sy = Math.max(0, (answer.y - 3) * scale);
      const sw = Math.min(fullCanvas.width - sx, (vp.width - answer.x) * scale);
      const sh = (answerHeight + 6) * scale;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(sw));
      cropCanvas.height = Math.max(1, Math.round(sh));
      const ctx = cropCanvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

      const imageDataUrl = trimWhitespace(cropCanvas);
      results.push({
        id: `ans${answer.pageNumber}-n${answer.problemNumber}`,
        number: answer.problemNumber,
        pageNumber: answer.pageNumber,
        imageDataUrl,
        bbox: { x: answer.x, y: answer.y, width: sw / scale, height: answerHeight },
      });
    } catch (err) {
      console.error(`Failed to extract answer for #${answer.problemNumber}:`, err);
    }
  }

  clearPageCache();
  return results;
}

export function matchProblemsToAnswers(
  problems: ExtractedProblem[],
  answers: ExtractedProblem[]
): ExtractedProblem[] {
  const answerMap: Record<number, ExtractedProblem> = {};
  for (const a of answers) answerMap[a.number] = a;
  return problems.map(p => ({
    ...p,
    answerPageNumber: answerMap[p.number]?.pageNumber,
    answerImageDataUrl: answerMap[p.number]?.imageDataUrl,
  }));
}

export function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)![1];
  const bstr = atob(parts[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}
