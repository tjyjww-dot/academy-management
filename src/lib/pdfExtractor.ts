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

/* ================================================================
   Two-column layout detection (histogram-based gap finding)
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

  let bestGapCenter = pageWidth / 2;
  let bestGapWidth = 0;
  let currentGapStart = -1;

  for (let x = gapStart; x <= gapEnd; x += binSize) {
    const bin = Math.floor(x / binSize) * binSize;
    if (!bins[bin] || bins[bin] <= 1) {
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
  if (currentGapStart >= 0) {
    const gapW = gapEnd - currentGapStart;
    if (gapW > bestGapWidth) {
      bestGapWidth = gapW;
      bestGapCenter = currentGapStart + gapW / 2;
    }
  }

  if (bestGapWidth < 15) return singleCol;

  const boundary = bestGapCenter;
  const leftItems = items.filter(i => i.x + i.width / 2 < boundary);
  const rightItems = items.filter(i => i.x + i.width / 2 >= boundary);

  if (leftItems.length < items.length * 0.1 || rightItems.length < items.length * 0.1) {
    return singleCol;
  }

  const leftStart = Math.min(...leftItems.map(i => i.x));

  return {
    isTwoColumn: true,
    columnBoundary: boundary,
    leftStart: Math.max(0, leftStart - 5),
    leftEnd: boundary,
    rightStart: boundary,
    rightEnd: pageWidth,
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
  text: string;
  maxItemHeight: number; // largest font size in this line
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
  const maxItemHeight = Math.max(...sortedByX.map(i => i.height));
  lines.push({ items: sortedByX, y, minX, maxX, text, maxItemHeight });
}

/* ================================================================
   Problem detection - FONT SIZE + LEFT MARGIN based

   Key insight from user's screenshots:
   - Problem numbers are LARGE standalone numbers (5, 6, 7, 8)
   - They appear at the absolute LEFT MARGIN of each column
   - They are visually bigger than equation text numbers
   - 4 problems per page consistently (2 per column)
   ================================================================ */

/**
 * Calculate statistics about text item heights in a column.
 * Returns median height (typical body text size) for comparison.
 */
function calcHeightStats(items: TextItem[]): { median: number; p75: number } {
  const heights = items.map(i => i.height).filter(h => h > 0).sort((a, b) => a - b);
  if (heights.length === 0) return { median: 10, p75: 12 };
  const median = heights[Math.floor(heights.length / 2)];
  const p75 = heights[Math.floor(heights.length * 0.75)];
  return { median, p75 };
}

/**
 * Find the leftmost X position (the column margin) for a set of items.
 */
function findColumnLeftMargin(items: TextItem[]): number {
  if (items.length === 0) return 0;
  const xValues = items.map(i => i.x).sort((a, b) => a - b);
  // Take the 5th percentile as the left margin
  const idx = Math.max(0, Math.floor(xValues.length * 0.05));
  return xValues[idx];
}

/**
 * Detect problem numbers in a column using font size + left margin strategy.
 *
 * Strategy:
 * 1. Find items that are standalone numbers (bare "5", "6" or "5." etc.)
 * 2. Filter by font size: must be >= 1.2x median text height (problem numbers are LARGE)
 * 3. Filter by position: must be near the left margin of the column (within 15px)
 * 4. Validate: detected numbers should form a reasonable sequence
 */
function detectProblemsInColumn(
  items: TextItem[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colWidth: number,
): DetectedProblem[] {
  if (items.length < 3) return [];

  const { median: medianHeight } = calcHeightStats(items);
  const leftMargin = findColumnLeftMargin(items);
  const marginTolerance = 15; // pixels from left margin

  // Font size threshold: problem numbers should be noticeably larger
  // Use 1.15x as minimum - allows some tolerance for rendering differences
  const fontSizeThreshold = medianHeight * 1.15;

  const candidates: DetectedProblem[] = [];

  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;

    // Check if this item is near the left margin
    const distFromMargin = Math.abs(item.x - leftMargin);
    if (distFromMargin > marginTolerance) continue;

    // Check various problem number patterns
    let num: number | null = null;
    let confidence = 0;

    // Pattern 1: "N." or "N. " (number with period)
    const dotMatch = text.match(/^(\d{1,3})\.\s*$/);
    if (dotMatch) {
      num = parseInt(dotMatch[1], 10);
      confidence = 0.95;
    }

    // Pattern 2: "N.text" (number with period, no space - PDF rendering)
    if (!num) {
      const dotMatch2 = text.match(/^(\d{1,3})\.(?=[^\d])/);
      if (dotMatch2) {
        num = parseInt(dotMatch2[1], 10);
        confidence = 0.90;
      }
    }

    // Pattern 3: Bare number - ONLY if font is large enough
    if (!num) {
      const bareMatch = text.match(/^(\d{1,2})$/);
      if (bareMatch && item.height >= fontSizeThreshold) {
        num = parseInt(bareMatch[1], 10);
        confidence = 0.85;
      }
    }

    // Pattern 4: "N)" format (sometimes used for problems too)
    if (!num) {
      const parenMatch = text.match(/^(\d{1,3})\)\s*/);
      if (parenMatch) {
        num = parseInt(parenMatch[1], 10);
        confidence = 0.90;
      }
    }

    // Pattern 5: Check if first item is a number and next item on same line is "."
    // (handles split "1" + "." case)
    if (!num) {
      const bareNum = text.match(/^(\d{1,2})$/);
      if (bareNum) {
        // Look for a "." item very close to this one on the same Y
        const nearby = items.find(other =>
          other !== item &&
          Math.abs(other.y - item.y) < 5 &&
          other.x > item.x &&
          other.x - (item.x + item.width) < 10 &&
          other.text.trim().startsWith('.')
        );
        if (nearby && item.height >= fontSizeThreshold) {
          num = parseInt(bareNum[1], 10);
          confidence = 0.88;
        }
      }
    }

    if (num && num > 0 && num <= 50) {
      candidates.push({
        number: num,
        pageNumber: pageNum,
        bbox: { x: colStartX, y: item.y, width: colWidth, height: 0 },
        confidence,
        column: columnIndex,
      });
    }
  }

  // Deduplicate: if same number appears multiple times, keep highest confidence
  const deduped = new Map<number, DetectedProblem>();
  for (const c of candidates) {
    const existing = deduped.get(c.number);
    if (!existing || c.confidence > existing.confidence) {
      deduped.set(c.number, c);
    }
  }

  return [...deduped.values()].sort((a, b) => a.bbox.y - b.bbox.y);
}

/* ================================================================
   Answer detection - "N)" format in two-column layout

   User says answers consistently use "1)", "2)", "3)" format.
   Left answer column has detailed solutions, right has short answers.
   ================================================================ */

function detectAnswersInColumn(
  items: TextItem[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colWidth: number,
): DetectedAnswer[] {
  if (items.length < 2) return [];

  const lines = groupIntoLines(items);
  const results: DetectedAnswer[] = [];

  for (const line of lines) {
    const sortedByX = line.items;
    if (sortedByX.length === 0) continue;

    // Try to detect "N)" pattern in different ways

    // Strategy 1: Check first item alone
    const firstText = sortedByX[0].text.trim();
    let detected = matchAnswerPattern(firstText);

    // Strategy 2: First two items concatenated (handles "1" + ")" split)
    if (!detected && sortedByX.length > 1) {
      const firstTwo = firstText + sortedByX[1].text.trim();
      detected = matchAnswerPattern(firstTwo);
    }

    // Strategy 3: Full line start (first ~3 items)
    if (!detected) {
      let lineStart = '';
      for (const item of sortedByX.slice(0, 4)) {
        lineStart += item.text;
      }
      detected = matchAnswerPattern(lineStart.trim());
    }

    // Strategy 4: Check each individual item for "N)" pattern
    // (sometimes the number and bracket are in a single text item)
    if (!detected) {
      for (const item of sortedByX.slice(0, 3)) {
        detected = matchAnswerPattern(item.text.trim());
        if (detected) break;
      }
    }

    if (detected) {
      // Collect the rest of the line as answer text
      const fullText = sortedByX.map(i => i.text).join('').trim();
      // Remove the "N)" prefix from the full text to get the answer
      const answerText = detected.answerText || fullText.replace(/^\d{1,3}\)\s*/, '').trim();

      results.push({
        problemNumber: detected.problemNumber,
        answerText,
        y: line.y,
        x: colStartX,
        pageNumber: pageNum,
        confidence: detected.confidence,
        column: columnIndex,
      });
    }
  }

  return results;
}

function matchAnswerPattern(text: string): { problemNumber: number; answerText: string; confidence: number } | null {
  if (!text) return null;

  const patterns: { re: RegExp; conf: number }[] = [
    // "1) ②" or "1) 3" or "1) -8" — primary format user specified
    { re: /^(\d{1,3})\)\s*(.*)$/, conf: 0.95 },
    // "1)" alone at end of text
    { re: /^(\d{1,3})\)\s*$/, conf: 0.93 },
  ];

  for (const { re, conf } of patterns) {
    const match = text.match(re);
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
   Sequential validation - filter out false positives

   After detecting all problems across pages, validate that:
   1. Numbers form a reasonable ascending sequence
   2. No large gaps (>3) in sequence
   3. Remove outliers that don't fit the pattern
   ================================================================ */

function validateAndFilterProblems(problems: DetectedProblem[]): DetectedProblem[] {
  if (problems.length <= 1) return problems;

  // Sort by page, then column, then Y position
  const sorted = [...problems].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.bbox.y - b.bbox.y;
  });

  // Check if numbers are roughly sequential
  const numbers = sorted.map(p => p.number);
  const minNum = Math.min(...numbers);
  const maxNum = Math.max(...numbers);

  // If the range is reasonable (e.g., 1-24 for 24 problems), keep numbers in that range
  // Remove duplicates: keep the one with higher confidence
  const bestByNumber = new Map<number, DetectedProblem>();
  for (const p of sorted) {
    const existing = bestByNumber.get(p.number);
    if (!existing || p.confidence > existing.confidence) {
      bestByNumber.set(p.number, p);
    }
  }

  // Get unique sorted list
  const unique = [...bestByNumber.values()].sort((a, b) => a.number - b.number);

  // Check for sequential pattern: most numbers should be consecutive or close
  // Count how many form a good sequence vs. outliers
  if (unique.length > 3) {
    // Find the longest increasing subsequence that's roughly consecutive
    // Simple approach: check if removing outliers gives a better sequence
    const expectedCount = maxNum - minNum + 1;
    const actualCount = unique.length;

    // If we have way more detections than expected range, something's wrong
    // But if close, it's probably fine
    if (actualCount > expectedCount * 1.5) {
      // Too many detections - try to find the best consecutive sequence
      // Group by consecutive ranges
      const sequences: DetectedProblem[][] = [];
      let currentSeq: DetectedProblem[] = [unique[0]];

      for (let i = 1; i < unique.length; i++) {
        const gap = unique[i].number - unique[i - 1].number;
        if (gap <= 2) { // allow small gaps
          currentSeq.push(unique[i]);
        } else {
          sequences.push(currentSeq);
          currentSeq = [unique[i]];
        }
      }
      sequences.push(currentSeq);

      // Pick the longest sequence
      sequences.sort((a, b) => b.length - a.length);
      return sequences[0];
    }
  }

  return unique;
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
 * Uses font size + left margin strategy for accurate detection.
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

    // Debug: record lines
    if (debugPage) {
      const lines = groupIntoLines(col.items);
      for (const line of lines.slice(0, 30)) {
        debugPage.lines.push({
          y: Math.round(line.y),
          text: line.text.substring(0, 80),
          column: col.index === 0 ? 'L' : 'R',
        });
      }
    }

    const detected = detectProblemsInColumn(
      col.items, pageNum, col.index, col.startX, col.width
    );
    allDetected.push(...detected);
  }

  if (debugPage) {
    debugPage.detectedProblems = allDetected.map(d => ({
      number: d.number, y: Math.round(d.bbox.y), column: d.column,
    }));
  }

  return allDetected;
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

    if (debugPage) {
      const lines = groupIntoLines(col.items);
      for (const line of lines.slice(0, 30)) {
        debugPage.lines.push({
          y: Math.round(line.y),
          text: line.text.substring(0, 80),
          column: col.index === 0 ? 'L' : 'R',
        });
      }
    }

    const detected = detectAnswersInColumn(
      col.items, pageNum, col.index, col.startX, col.width
    );
    allDetected.push(...detected);
  }

  // Deduplicate: keep highest confidence per problem number
  const unique = new Map<number, DetectedAnswer>();
  for (const d of allDetected) {
    const existing = unique.get(d.problemNumber);
    if (!existing || d.confidence > existing.confidence) {
      unique.set(d.problemNumber, d);
    }
  }

  const result = [...unique.values()].sort((a, b) => a.problemNumber - b.problemNumber);

  if (debugPage) {
    debugPage.detectedAnswers = result.map(d => ({
      number: d.problemNumber, y: Math.round(d.y), column: d.column,
    }));
  }

  return result;
}

/**
 * Detect all problems across pages, with debug info collection.
 * Includes sequential validation to eliminate false positives.
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

  // Validate and filter: remove false positives, deduplicate across pages
  const validated = validateAndFilterProblems(allProblems);

  // Sort by page number, column, Y position for correct ordering
  validated.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.bbox.y - b.bbox.y;
  });

  // Calculate bounding box heights
  for (let i = 0; i < validated.length; i++) {
    const current = validated[i];

    // Find next problem in same page AND same column
    let nextInColumn: DetectedProblem | null = null;
    for (let j = i + 1; j < validated.length; j++) {
      if (validated[j].pageNumber === current.pageNumber && validated[j].column === current.column) {
        nextInColumn = validated[j];
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

  return validated;
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

  // Deduplicate across pages
  const unique = new Map<number, DetectedAnswer>();
  for (const a of allAnswers) {
    const existing = unique.get(a.problemNumber);
    if (!existing || a.confidence > existing.confidence) {
      unique.set(a.problemNumber, a);
    }
  }

  return [...unique.values()].sort((a, b) => a.problemNumber - b.problemNumber);
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
