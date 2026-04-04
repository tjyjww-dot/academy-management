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
    detectedProblems: { number: number; y: number; column: number; method: string }[];
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

  const binSize = 5;
  const bins: Record<number, number> = {};
  for (const item of items) {
    const bin = Math.floor(item.x / binSize) * binSize;
    bins[bin] = (bins[bin] || 0) + 1;
  }

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
  maxItemHeight: number;
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
   Problem detection - MULTI-STRATEGY approach

   Strategy A: Line-based - check if a line starts with a problem number pattern
   Strategy B: Item-based - find standalone number items near left margin
   Both strategies are combined; duplicates resolved by confidence
   ================================================================ */

/**
 * Find the left margin X position for a column (5th percentile of X values)
 */
function findColumnLeftMargin(items: TextItem[]): number {
  if (items.length === 0) return 0;
  const xValues = items.map(i => i.x).sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(xValues.length * 0.03));
  return xValues[idx];
}

/**
 * Try to parse a problem number from text.
 * Returns number + confidence, or null.
 */
function parseProblemNumber(text: string): { number: number; confidence: number } | null {
  const t = text.trim();
  if (!t) return null;

  // "N. " or "N." alone
  let m = t.match(/^(\d{1,3})\.\s*/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 50) return { number: n, confidence: 0.95 };
  }

  // "N)"
  m = t.match(/^(\d{1,3})\)\s*/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 50) return { number: n, confidence: 0.90 };
  }

  // "[N]"
  m = t.match(/^\[(\d{1,3})\]/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 50) return { number: n, confidence: 0.90 };
  }

  // "N번"
  m = t.match(/^(\d{1,3})번/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 50) return { number: n, confidence: 0.88 };
  }

  // Bare number: "5" or "12" (standalone, no other text)
  m = t.match(/^(\d{1,2})$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 50) return { number: n, confidence: 0.70 };
  }

  return null;
}

/**
 * Detect problems using LINE-based approach.
 * Check each line's beginning for a problem number pattern.
 */
function detectByLines(
  lines: LineGroup[],
  leftMargin: number,
  marginTolerance: number,
): { number: number; y: number; confidence: number; method: string }[] {
  const results: { number: number; y: number; confidence: number; method: string }[] = [];

  for (const line of lines) {
    const sx = line.items;
    if (sx.length === 0) continue;

    // Only check lines that start near the left margin
    if (Math.abs(line.minX - leftMargin) > marginTolerance) continue;

    // Try first item alone
    let detected = parseProblemNumber(sx[0].text);

    // Try first two items concatenated (handles "1" + "." split)
    if (!detected && sx.length > 1) {
      detected = parseProblemNumber(sx[0].text.trim() + sx[1].text.trim());
    }

    // Try concatenation of first 3 items
    if (!detected && sx.length > 2) {
      const concat = sx.slice(0, 3).map(i => i.text).join('');
      detected = parseProblemNumber(concat);
    }

    if (detected) {
      results.push({
        number: detected.number,
        y: line.y,
        confidence: detected.confidence,
        method: 'line',
      });
    }
  }

  return results;
}

/**
 * Detect problems using ITEM-based approach.
 * Find standalone number items near the left margin of the column.
 * This catches bare numbers like "5", "6" that start a problem.
 */
function detectByItems(
  items: TextItem[],
  leftMargin: number,
  marginTolerance: number,
): { number: number; y: number; confidence: number; method: string }[] {
  const results: { number: number; y: number; confidence: number; method: string }[] = [];

  // Calculate median height for font-size bonus
  const heights = items.map(i => i.height).filter(h => h > 0).sort((a, b) => a - b);
  const medianHeight = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 10;

  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;

    // Must be near left margin
    const distFromMargin = Math.abs(item.x - leftMargin);
    if (distFromMargin > marginTolerance) continue;

    const parsed = parseProblemNumber(text);
    if (!parsed) continue;

    let confidence = parsed.confidence;

    // Bonus: if font is larger than median, boost confidence
    if (item.height > medianHeight * 1.1) {
      confidence += 0.1;
    }

    // Bonus: if very close to left margin (< 5px), boost
    if (distFromMargin < 5) {
      confidence += 0.05;
    }

    // For bare numbers (confidence 0.70), check additional criteria:
    // - Must be the leftmost item on its Y line (no items to its left)
    if (parsed.confidence === 0.70) {
      const sameLineItems = items.filter(
        other => other !== item && Math.abs(other.y - item.y) < 5 && other.x < item.x
      );
      if (sameLineItems.length > 0) {
        // Not the leftmost item - probably not a problem number
        continue;
      }
    }

    results.push({
      number: parsed.number,
      y: item.y,
      confidence: Math.min(confidence, 1.0),
      method: 'item',
    });
  }

  return results;
}

/**
 * Main problem detection for a column.
 * Combines line-based and item-based strategies.
 */
function detectProblemsInColumn(
  items: TextItem[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colWidth: number,
): DetectedProblem[] {
  if (items.length < 3) return [];

  const leftMargin = findColumnLeftMargin(items);
  const marginTolerance = 20; // 20px tolerance from left margin

  const lines = groupIntoLines(items);

  // Get candidates from both strategies
  const lineResults = detectByLines(lines, leftMargin, marginTolerance);
  const itemResults = detectByItems(items, leftMargin, marginTolerance);

  // Merge: for each problem number, keep highest confidence
  const merged = new Map<number, { number: number; y: number; confidence: number; method: string }>();

  for (const r of [...lineResults, ...itemResults]) {
    const existing = merged.get(r.number);
    if (!existing || r.confidence > existing.confidence) {
      merged.set(r.number, r);
    }
  }

  // Convert to DetectedProblem
  return [...merged.values()]
    .sort((a, b) => a.y - b.y)
    .map(r => ({
      number: r.number,
      pageNumber: pageNum,
      bbox: { x: colStartX, y: r.y, width: colWidth, height: 0 },
      confidence: r.confidence,
      column: columnIndex,
      _method: r.method, // for debug
    } as DetectedProblem & { _method?: string }));
}

/* ================================================================
   Answer detection - "N)" format in two-column layout
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
    const sx = line.items;
    if (sx.length === 0) continue;

    let ansNum: number | null = null;
    let ansText = '';
    let conf = 0;

    // Strategy 1: First item matches "N)"
    const first = sx[0].text.trim();
    let m = first.match(/^(\d{1,3})\)\s*(.*)$/);
    if (m) {
      ansNum = parseInt(m[1], 10);
      ansText = m[2] || '';
      conf = 0.95;
    }

    // Strategy 2: First item is just a number, second is ")"
    if (!ansNum && sx.length > 1) {
      const numMatch = first.match(/^(\d{1,3})$/);
      const secondText = sx[1].text.trim();
      if (numMatch && secondText.startsWith(')')) {
        ansNum = parseInt(numMatch[1], 10);
        ansText = secondText.substring(1).trim();
        conf = 0.93;
      }
    }

    // Strategy 3: Concatenate first 2-3 items and check
    if (!ansNum) {
      let concat = '';
      for (const item of sx.slice(0, 4)) {
        concat += item.text;
      }
      m = concat.trim().match(/^(\d{1,3})\)\s*(.*)$/);
      if (m) {
        ansNum = parseInt(m[1], 10);
        ansText = m[2] || '';
        conf = 0.90;
      }
    }

    // Strategy 4: Check each item individually for "N)" pattern
    if (!ansNum) {
      for (const item of sx.slice(0, 3)) {
        m = item.text.trim().match(/^(\d{1,3})\)\s*(.*)$/);
        if (m) {
          ansNum = parseInt(m[1], 10);
          ansText = m[2] || '';
          conf = 0.88;
          break;
        }
      }
    }

    if (ansNum && ansNum > 0 && ansNum <= 100) {
      // Collect full line text as answer
      const fullText = sx.map(i => i.text).join('').trim();
      const cleanAnswer = ansText || fullText.replace(/^\d{1,3}\)\s*/, '').trim();

      results.push({
        problemNumber: ansNum,
        answerText: cleanAnswer,
        y: line.y,
        x: line.minX,
        pageNumber: pageNum,
        confidence: conf,
        column: columnIndex,
      });
    }
  }

  return results;
}

/* ================================================================
   Sequential validation - filter false positives across all pages
   ================================================================ */

function validateAndFilterProblems(problems: DetectedProblem[]): DetectedProblem[] {
  if (problems.length <= 1) return problems;

  // Sort by page, column, Y
  const sorted = [...problems].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.bbox.y - b.bbox.y;
  });

  // Deduplicate: keep highest confidence per number
  const bestByNumber = new Map<number, DetectedProblem>();
  for (const p of sorted) {
    const existing = bestByNumber.get(p.number);
    if (!existing || p.confidence > existing.confidence) {
      bestByNumber.set(p.number, p);
    }
  }

  const unique = [...bestByNumber.values()].sort((a, b) => a.number - b.number);

  // If we have a reasonable set (e.g. 20-30 problems for a typical test),
  // check for outliers: numbers that are way outside the expected range
  if (unique.length > 3) {
    const numbers = unique.map(p => p.number);
    const minNum = Math.min(...numbers);
    const maxNum = Math.max(...numbers);
    const expectedRange = maxNum - minNum + 1;

    // If detected count is close to expected range, it's good
    // If way more detected than the range allows, filter outliers
    if (unique.length > expectedRange * 1.3) {
      // Find the largest consecutive group
      const groups: DetectedProblem[][] = [];
      let currentGroup: DetectedProblem[] = [unique[0]];

      for (let i = 1; i < unique.length; i++) {
        const gap = unique[i].number - unique[i - 1].number;
        if (gap <= 3) {
          currentGroup.push(unique[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [unique[i]];
        }
      }
      groups.push(currentGroup);

      // Return the largest group
      groups.sort((a, b) => b.length - a.length);
      return groups[0];
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

    if (debugPage) {
      const lines = groupIntoLines(col.items);
      for (const line of lines.slice(0, 40)) {
        debugPage.lines.push({
          y: Math.round(line.y),
          text: line.text.substring(0, 100),
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
      number: d.number,
      y: Math.round(d.bbox.y),
      column: d.column,
      method: (d as any)._method || '',
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
      for (const line of lines.slice(0, 40)) {
        debugPage.lines.push({
          y: Math.round(line.y),
          text: line.text.substring(0, 100),
          column: col.index === 0 ? 'L' : 'R',
        });
      }
    }

    const detected = detectAnswersInColumn(
      col.items, pageNum, col.index, col.startX, col.width
    );
    allDetected.push(...detected);
  }

  // Deduplicate per problem number (keep highest confidence)
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
 * Detect all problems across pages with validation.
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

  // Validate and deduplicate across pages
  const validated = validateAndFilterProblems(allProblems);

  // Sort by page, column, Y for correct visual order
  validated.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.bbox.y - b.bbox.y;
  });

  // Calculate bounding box heights based on content, not next problem
  for (let i = 0; i < validated.length; i++) {
    const current = validated[i];
    const { items, viewport } = await getPageTextItems(pdf, current.pageNumber);
    const layout = detectColumnLayout(items, viewport.width);
    const { left, right } = splitByColumn(items, layout);
    const colItems = current.column === 0 ? left : right;

    // Find next problem in same page AND same column
    let nextInColumn: DetectedProblem | null = null;
    for (let j = i + 1; j < validated.length; j++) {
      if (validated[j].pageNumber === current.pageNumber && validated[j].column === current.column) {
        nextInColumn = validated[j];
        break;
      }
    }

    if (nextInColumn) {
      // Height = distance to next problem (with small padding)
      current.bbox.height = nextInColumn.bbox.y - current.bbox.y;
    } else {
      // Last problem in this column: find the actual bottom of content
      // Instead of extending to page bottom, find the lowest text item in this column
      const itemsBelow = colItems.filter(item => item.y >= current.bbox.y);
      if (itemsBelow.length > 0) {
        const maxY = Math.max(...itemsBelow.map(item => item.y + item.height));
        current.bbox.height = maxY - current.bbox.y + 10;
      } else {
        current.bbox.height = 100; // fallback
      }
    }

    // Add padding
    const padding = 8;
    current.bbox.y = Math.max(0, current.bbox.y - padding);
    current.bbox.height += padding * 2;

    // Safety cap: don't exceed half page height (for 2 problems per column)
    const maxHeight = viewport.height * 0.55;
    if (current.bbox.height > maxHeight) {
      current.bbox.height = maxHeight;
    }
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

  const pad = 10;
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
      const answerHeight = nextY ? (nextY - answer.y) : Math.min(60, vp.height - answer.y);

      const sx = Math.max(0, answer.x * scale);
      const sy = Math.max(0, (answer.y - 5) * scale);
      const sw = Math.min(fullCanvas.width - sx, (vp.width - answer.x) * scale);
      const sh = Math.max(20, (answerHeight + 10) * scale);

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
