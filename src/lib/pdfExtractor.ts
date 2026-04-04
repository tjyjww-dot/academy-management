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
  column: number; // 0 = left/single, 1 = right
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

// PDF.js worker setup
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

// Problem number detection patterns for Korean math textbooks
// "1. ", "2. " — most common problem format
const PROBLEM_PATTERNS: { pattern: RegExp; confidence: number }[] = [
  { pattern: /^(\d{1,3})\.\s/, confidence: 0.95 },
  { pattern: /^(\d{1,3})\.\s*$/, confidence: 0.9 },  // just "1." at end of text item
  { pattern: /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/, confidence: 0.95 },
  { pattern: /^문제?\s*(\d{1,3})/, confidence: 0.85 },
  { pattern: /^\[(\d{1,3})\]/, confidence: 0.85 },
  { pattern: /^(\d{1,3})번/, confidence: 0.85 },
  { pattern: /^\((\d{1,3})\)/, confidence: 0.8 },
];

// Answer detection patterns — "1) answer" or "1. answer"
const ANSWER_PATTERNS: { pattern: RegExp; confidence: number }[] = [
  { pattern: /^(\d{1,3})\)\s*(.*)$/, confidence: 0.95 },   // "1) ②" or "1) 3"
  { pattern: /^(\d{1,3})\)\s*$/, confidence: 0.9 },         // just "1)" alone
  { pattern: /^(\d{1,3})\.\s*(.+)$/, confidence: 0.8 },     // "1. ②"
];

const CIRCLED_NUMBER_MAP: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
  '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
};

/* ================================================================
   Core helpers
   ================================================================ */

function detectProblemNumber(text: string): { number: number; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const { pattern, confidence } of PROBLEM_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      let num: number;
      if (match[1] && CIRCLED_NUMBER_MAP[match[1]]) {
        num = CIRCLED_NUMBER_MAP[match[1]];
      } else {
        num = parseInt(match[1], 10);
      }
      if (num > 0 && num <= 200) {
        return { number: num, confidence };
      }
    }
  }
  return null;
}

function detectAnswerNumber(text: string): { problemNumber: number; answerText: string; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const { pattern, confidence } of ANSWER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 200) {
        return {
          problemNumber: num,
          answerText: match[2] || '',
          confidence,
        };
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
  // For two-column: boundary X between left and right columns
  columnBoundary: number;
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
}

/**
 * Detect whether a page has a two-column layout by analyzing the X-position
 * distribution of text items. We look for a gap in the middle of the page.
 */
function detectColumnLayout(items: TextItem[], pageWidth: number): ColumnLayout {
  if (items.length < 5) {
    return { isTwoColumn: false, columnBoundary: pageWidth / 2, leftStart: 0, leftEnd: pageWidth, rightStart: pageWidth, rightEnd: pageWidth };
  }

  // Collect all X starting positions
  const xPositions = items.map(i => i.x);
  const midPage = pageWidth / 2;

  // Count items in left half vs right half
  const leftItems = items.filter(i => i.x < midPage - 20);
  const rightItems = items.filter(i => i.x > midPage + 20);

  // If both sides have substantial content, it's likely two columns
  const leftCount = leftItems.length;
  const rightCount = rightItems.length;
  const totalCount = items.length;

  if (leftCount < totalCount * 0.15 || rightCount < totalCount * 0.15) {
    // One side has very few items — probably single column
    return { isTwoColumn: false, columnBoundary: pageWidth, leftStart: 0, leftEnd: pageWidth, rightStart: pageWidth, rightEnd: pageWidth };
  }

  // Find the gap between columns
  // Sort all X positions and look for the largest gap near the middle
  const sortedX = [...xPositions].sort((a, b) => a - b);

  // Look for X gaps in the middle 40% of the page (30%–70%)
  const gapSearchStart = pageWidth * 0.25;
  const gapSearchEnd = pageWidth * 0.75;

  // Find the leftmost X of right-side items and rightmost X of left-side items
  const leftMaxX = Math.max(...leftItems.map(i => i.x + i.width));
  const rightMinX = Math.min(...rightItems.map(i => i.x));

  // The boundary is roughly in between
  const boundary = (leftMaxX + rightMinX) / 2;

  // Verify there's actually a gap
  const gapWidth = rightMinX - leftMaxX;
  if (gapWidth < 10) {
    // No clear gap — treat as single column
    return { isTwoColumn: false, columnBoundary: pageWidth, leftStart: 0, leftEnd: pageWidth, rightStart: pageWidth, rightEnd: pageWidth };
  }

  // Compute actual column bounds
  const leftStart = Math.min(...leftItems.map(i => i.x));
  const leftEnd = leftMaxX;
  const rightStart = rightMinX;
  const rightEnd = Math.max(...rightItems.map(i => i.x + i.width));

  return {
    isTwoColumn: true,
    columnBoundary: boundary,
    leftStart: Math.max(0, leftStart - 5),
    leftEnd: Math.min(boundary, leftEnd + 5),
    rightStart: Math.max(boundary, rightStart - 5),
    rightEnd: Math.min(pageWidth, rightEnd + 5),
  };
}

/**
 * Split text items into column groups (left column items, right column items)
 */
function splitByColumn(items: TextItem[], layout: ColumnLayout): { left: TextItem[]; right: TextItem[] } {
  if (!layout.isTwoColumn) {
    return { left: items, right: [] };
  }

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
   Line grouping within a column
   ================================================================ */

interface LineGroup {
  items: TextItem[];
  y: number;
  minX: number;
  maxX: number;
}

function groupIntoLines(items: TextItem[]): LineGroup[] {
  if (items.length === 0) return [];

  // Sort by Y then X
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
    return a.y - b.y;
  });

  // Adaptive Y threshold based on average text height
  const heights = items.map(i => i.height).filter(h => h > 0);
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b) / heights.length : 10;
  const yThreshold = Math.max(6, avgHeight * 0.7);

  const lines: LineGroup[] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= yThreshold) {
      currentLine.push(item);
    } else {
      const minX = Math.min(...currentLine.map(i => i.x));
      const maxX = Math.max(...currentLine.map(i => i.x + i.width));
      lines.push({ items: [...currentLine], y: currentY, minX, maxX });
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length > 0) {
    const minX = Math.min(...currentLine.map(i => i.x));
    const maxX = Math.max(...currentLine.map(i => i.x + i.width));
    lines.push({ items: [...currentLine], y: currentY, minX, maxX });
  }

  return lines;
}

/* ================================================================
   Detect problems on a single column
   ================================================================ */

function detectProblemsInColumn(
  lines: LineGroup[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colEndX: number,
  pageHeight: number
): DetectedProblem[] {
  const detected: DetectedProblem[] = [];

  for (const line of lines) {
    const sortedByX = [...line.items].sort((a, b) => a.x - b.x);

    // Build the first few characters of the line
    let lineStart = '';
    for (const item of sortedByX.slice(0, 4)) {
      lineStart += item.text;
    }

    // Try detection on combined text first, then on the first item alone
    const result = detectProblemNumber(lineStart) || detectProblemNumber(sortedByX[0].text);
    if (result) {
      detected.push({
        number: result.number,
        pageNumber: pageNum,
        bbox: {
          x: colStartX,
          y: line.y,
          width: colEndX - colStartX,
          height: 0, // calculated later
        },
        confidence: result.confidence,
        column: columnIndex,
      });
    }
  }

  return detected;
}

/* ================================================================
   Detect answers in a single column
   ================================================================ */

function detectAnswersInColumn(
  lines: LineGroup[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colEndX: number
): DetectedAnswer[] {
  const detected: DetectedAnswer[] = [];

  for (const line of lines) {
    const sortedByX = [...line.items].sort((a, b) => a.x - b.x);

    let lineStart = '';
    for (const item of sortedByX.slice(0, 4)) {
      lineStart += item.text;
    }

    const result = detectAnswerNumber(lineStart) || detectAnswerNumber(sortedByX[0].text);
    if (result) {
      detected.push({
        problemNumber: result.problemNumber,
        answerText: result.answerText,
        y: line.y,
        x: colStartX,
        pageNumber: pageNum,
        confidence: result.confidence,
        column: columnIndex,
      });
    }
  }

  return detected;
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
 * Detect all problems on a single page, supporting two-column layout.
 * Left column is processed first, then right column.
 */
export async function detectProblemsOnPage(
  pdf: any,
  pageNum: number
): Promise<DetectedProblem[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];

  const layout = detectColumnLayout(items, viewport.width);
  const { left, right } = splitByColumn(items, layout);

  const allDetected: DetectedProblem[] = [];

  // Process left (or single) column
  if (left.length > 0) {
    const leftLines = groupIntoLines(left);
    const leftProblems = detectProblemsInColumn(
      leftLines, pageNum, 0,
      layout.isTwoColumn ? layout.leftStart : 0,
      layout.isTwoColumn ? layout.leftEnd : viewport.width,
      viewport.height
    );
    allDetected.push(...leftProblems);
  }

  // Process right column (only if two-column)
  if (layout.isTwoColumn && right.length > 0) {
    const rightLines = groupIntoLines(right);
    const rightProblems = detectProblemsInColumn(
      rightLines, pageNum, 1,
      layout.rightStart,
      layout.rightEnd,
      viewport.height
    );
    allDetected.push(...rightProblems);
  }

  // Sort by problem number and deduplicate
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

  return unique;
}

/**
 * Detect answers on a single page, supporting two-column layout.
 */
export async function detectAnswersOnPage(
  pdf: any,
  pageNum: number
): Promise<DetectedAnswer[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];

  const layout = detectColumnLayout(items, viewport.width);
  const { left, right } = splitByColumn(items, layout);

  const allDetected: DetectedAnswer[] = [];

  if (left.length > 0) {
    const leftLines = groupIntoLines(left);
    const leftAnswers = detectAnswersInColumn(
      leftLines, pageNum, 0,
      layout.isTwoColumn ? layout.leftStart : 0,
      layout.isTwoColumn ? layout.leftEnd : viewport.width
    );
    allDetected.push(...leftAnswers);
  }

  if (layout.isTwoColumn && right.length > 0) {
    const rightLines = groupIntoLines(right);
    const rightAnswers = detectAnswersInColumn(
      rightLines, pageNum, 1,
      layout.rightStart,
      layout.rightEnd
    );
    allDetected.push(...rightAnswers);
  }

  allDetected.sort((a, b) => a.problemNumber - b.problemNumber);

  return allDetected;
}

/**
 * Detect all problems across a page range.
 * After detection, calculate bounding box heights based on the next problem
 * in the SAME column on the SAME page.
 */
export async function detectAllProblems(
  pdf: any,
  startPage: number = 1,
  endPage?: number
): Promise<DetectedProblem[]> {
  const totalPages = pdf.numPages;
  const last = endPage || totalPages;
  const allProblems: DetectedProblem[] = [];

  for (let p = startPage; p <= last; p++) {
    const problems = await detectProblemsOnPage(pdf, p);
    allProblems.push(...problems);
  }

  // Calculate bounding box heights
  // Group by (page, column) for proper height calculation
  for (let i = 0; i < allProblems.length; i++) {
    const current = allProblems[i];

    // Find next problem in the same page AND same column
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
      // Last problem in this column on this page → extend to page bottom
      const page = await pdf.getPage(current.pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      current.bbox.height = viewport.height - current.bbox.y;
    }

    // Add padding
    const padding = 10;
    current.bbox.y = Math.max(0, current.bbox.y - padding);
    current.bbox.height += padding * 2;
  }

  return allProblems;
}

/**
 * Detect all answers across a page range.
 */
export async function detectAnswersOnPages(
  pdf: any,
  startPage: number = 1,
  endPage?: number
): Promise<DetectedAnswer[]> {
  const totalPages = pdf.numPages;
  const last = endPage || totalPages;
  const allAnswers: DetectedAnswer[] = [];

  for (let p = startPage; p <= last; p++) {
    const answers = await detectAnswersOnPage(pdf, p);
    allAnswers.push(...answers);
  }

  return allAnswers;
}

/* ================================================================
   Canvas rendering & image extraction
   ================================================================ */

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

// Cache rendered pages to avoid re-rendering the same page multiple times
const pageCanvasCache: Map<string, HTMLCanvasElement> = new Map();

async function getOrRenderPage(pdf: any, pageNum: number, scale: number): Promise<HTMLCanvasElement> {
  const key = `${pageNum}-${scale}`;
  if (pageCanvasCache.has(key)) {
    return pageCanvasCache.get(key)!;
  }
  const canvas = await renderPageToCanvas(pdf, pageNum, scale);
  pageCanvasCache.set(key, canvas);
  return canvas;
}

export function clearPageCache() {
  pageCanvasCache.clear();
}

/**
 * Extract problem image from a specific bounding box on a page.
 * The bbox already has column-aware X and width.
 */
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
    // Fallback to full-width crop
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 100;
    fallbackCanvas.height = 50;
    return fallbackCanvas.toDataURL('image/png');
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

  if (top >= bottom || left >= right) {
    return canvas.toDataURL('image/png');
  }

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
  const results: ExtractedProblem[] = [];
  clearPageCache();

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

/**
 * Extract answer images.
 * For two-column answer pages, we crop just the column area for each answer.
 */
export async function extractAnswerImages(
  pdf: any,
  answers: DetectedAnswer[],
  scale: number = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedProblem[]> {
  const results: ExtractedProblem[] = [];
  clearPageCache();

  // Deduplicate by problem number, keeping highest confidence
  const answerMap: Record<number, DetectedAnswer> = {};
  for (const answer of answers) {
    if (!answerMap[answer.problemNumber] || answer.confidence > answerMap[answer.problemNumber].confidence) {
      answerMap[answer.problemNumber] = answer;
    }
  }

  const uniqueAnswers = Object.values(answerMap).sort((a, b) => a.problemNumber - b.problemNumber);

  // Group answers by (page, column) for height calculation
  for (let i = 0; i < uniqueAnswers.length; i++) {
    const answer = uniqueAnswers[i];
    if (onProgress) onProgress(i + 1, uniqueAnswers.length);

    try {
      const fullCanvas = await getOrRenderPage(pdf, answer.pageNumber, scale);
      const pageWidthPx = fullCanvas.width;

      // Find next answer in same page+column to determine height
      let nextAnswerY: number | null = null;
      for (let j = i + 1; j < uniqueAnswers.length; j++) {
        if (uniqueAnswers[j].pageNumber === answer.pageNumber && uniqueAnswers[j].column === answer.column) {
          nextAnswerY = uniqueAnswers[j].y;
          break;
        }
      }

      // Get page height in PDF units
      const page = await pdf.getPage(answer.pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      const answerHeight = nextAnswerY ? (nextAnswerY - answer.y) : Math.min(40, viewport.height - answer.y);

      const sx = answer.x * scale;
      const sy = Math.max(0, (answer.y - 3) * scale);
      // Use column width or estimate
      const sw = pageWidthPx - sx; // to end of page from column start
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
      console.error(`Failed to extract answer image for problem ${answer.problemNumber}:`, err);
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
  for (const answer of answers) {
    answerMap[answer.number] = answer;
  }

  return problems.map(problem => {
    const matchedAnswer = answerMap[problem.number];
    return {
      ...problem,
      answerPageNumber: matchedAnswer?.pageNumber,
      answerImageDataUrl: matchedAnswer?.imageDataUrl,
    };
  });
}

export function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)![1];
  const bstr = atob(parts[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}
