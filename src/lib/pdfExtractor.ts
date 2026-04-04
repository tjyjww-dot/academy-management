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
  _textHeight?: number;
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
    pageHeight: number;
    totalItems: number;
    leftItems: number;
    rightItems: number;
    lines: { y: number; text: string; column: string }[];
    detectedProblems: { number: number; y: number; column: number; method: string }[];
    detectedAnswers: { number: number; y: number; column: number; text: string }[];
  }[];
}

// PDF.js worker setup
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/* ================================================================
   FORCED Two-column splitting

   After 7 iterations of auto-detection failing, we now FORCE
   two-column mode. The split point is determined by finding the
   largest gap in item X positions near the page center.
   If no clear gap exists, split at the midpoint.
   ================================================================ */

interface ColumnLayout {
  isTwoColumn: boolean;
  columnBoundary: number;
}

/**
 * Force two-column layout. Find the best split point near the center.
 */
function forceColumnSplit(items: TextItem[], pageWidth: number, pageHeight: number): ColumnLayout {
  if (items.length < 5) {
    return { isTwoColumn: false, columnBoundary: pageWidth };
  }

  const midPage = pageWidth / 2;

  // Try to find a natural gap near the center (40%-60% of page)
  // Use X positions of item centers
  const xPositions = items
    .filter(i => i.y > pageHeight * 0.05 && i.y < pageHeight * 0.92)
    .map(i => i.x + i.width / 2)
    .filter(x => x > pageWidth * 0.35 && x < pageWidth * 0.65)
    .sort((a, b) => a - b);

  let bestGap = 0;
  let bestGapCenter = midPage;

  for (let i = 1; i < xPositions.length; i++) {
    const gap = xPositions[i] - xPositions[i - 1];
    if (gap > bestGap) {
      bestGap = gap;
      bestGapCenter = (xPositions[i] + xPositions[i - 1]) / 2;
    }
  }

  // Use gap center if a meaningful gap exists, otherwise use midpoint
  const boundary = bestGap > 5 ? bestGapCenter : midPage;

  console.log(`[forceColumnSplit] pageWidth=${pageWidth.toFixed(0)}, boundary=${boundary.toFixed(1)}, gap=${bestGap.toFixed(1)}`);

  return { isTwoColumn: true, columnBoundary: boundary };
}

function splitByColumn(items: TextItem[], layout: ColumnLayout): { left: TextItem[]; right: TextItem[] } {
  if (!layout.isTwoColumn) return { left: items, right: [] };
  const left: TextItem[] = [];
  const right: TextItem[] = [];
  for (const item of items) {
    // Use item's left edge X for splitting (not center)
    // Items whose left edge is past the boundary go to right column
    if (item.x < layout.columnBoundary) {
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
  firstItemHeight: number;
}

function groupIntoLines(items: TextItem[]): LineGroup[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 4) return a.x - b.x;
    return a.y - b.y;
  });

  const heights = items.map(i => i.height).filter(h => h > 0);
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b) / heights.length : 10;
  const yThreshold = Math.max(4, avgHeight * 0.55);

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
  lines.push({ items: sortedByX, y, minX, maxX, text, firstItemHeight: sortedByX[0].height });
}

/* ================================================================
   Problem detection
   ================================================================ */

function parseProblemNumber(text: string): { number: number; confidence: number } | null {
  const t = text.trim();
  if (!t) return null;

  let m;

  // "N. " or "N."
  m = t.match(/^(\d{1,3})\.\s/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.95 }; }
  m = t.match(/^(\d{1,3})\.\s*$/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.93 }; }
  m = t.match(/^(\d{1,3})\.(?=[^\d])/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.90 }; }

  // "[N]"
  m = t.match(/^\[(\d{1,3})\]/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.90 }; }

  // "N번"
  m = t.match(/^(\d{1,3})번/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.88 }; }

  // "N 한글text" - number + space + Korean/Latin (e.g., "3 다음 두...")
  m = t.match(/^(\d{1,2})\s+[가-힣a-zA-Z(\[]/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.82 }; }

  // "N  " - number + multiple spaces
  m = t.match(/^(\d{1,2})\s{2,}/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.78 }; }

  // Bare number (standalone)
  m = t.match(/^(\d{1,2})$/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.70 }; }

  return null;
}

function detectProblemsInColumn(
  columnItems: TextItem[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colEndX: number,
  pageHeight: number,
): (DetectedProblem & { _method?: string })[] {
  if (columnItems.length < 2) return [];

  // Filter footer (bottom 10%) and header (top 4%)
  const items = columnItems.filter(i => i.y > pageHeight * 0.04 && i.y < pageHeight * 0.90);
  if (items.length < 2) return [];

  // Find column's left margin (leftmost X of items)
  const xValues = items.map(i => i.x).sort((a, b) => a - b);
  const leftMargin = xValues[Math.max(0, Math.floor(xValues.length * 0.02))];
  const marginTolerance = 30; // generous tolerance

  const lines = groupIntoLines(items);
  const candidates: (DetectedProblem & { _method?: string })[] = [];

  for (const line of lines) {
    const sx = line.items;
    if (sx.length === 0) continue;

    // Must be near left margin of this column
    if (Math.abs(line.minX - leftMargin) > marginTolerance) continue;

    let detected: { number: number; confidence: number } | null = null;
    let method = '';

    // Try first item alone
    detected = parseProblemNumber(sx[0].text);
    if (detected) method = 'first';

    // Try first two items concatenated
    if (!detected && sx.length > 1) {
      detected = parseProblemNumber(sx[0].text.trim() + sx[1].text.trim());
      if (detected) method = 'cat2';
    }

    // Try first three items
    if (!detected && sx.length > 2) {
      detected = parseProblemNumber(sx.slice(0, 3).map(i => i.text).join(''));
      if (detected) method = 'cat3';
    }

    // Try full line text (in case spacing is weird)
    if (!detected) {
      detected = parseProblemNumber(line.text);
      if (detected) method = 'line';
    }

    // Validate bare numbers
    if (detected && detected.confidence <= 0.70) {
      const hasContent = sx.length > 1 || line.text.length > 3;
      if (!hasContent) detected.confidence = 0.45;
    }

    if (detected && detected.number > 0 && detected.confidence >= 0.50) {
      const textHeight = sx[0].height || line.firstItemHeight || 12;
      const colWidth = colEndX - colStartX;
      candidates.push({
        number: detected.number,
        pageNumber: pageNum,
        bbox: { x: colStartX, y: line.y, width: colWidth, height: 0 },
        confidence: detected.confidence,
        column: columnIndex,
        _method: method,
        _textHeight: textHeight,
      });
    }
  }

  // Deduplicate
  const deduped = new Map<number, (DetectedProblem & { _method?: string })>();
  for (const c of candidates) {
    const existing = deduped.get(c.number);
    if (!existing || c.confidence > existing.confidence) deduped.set(c.number, c);
  }

  return [...deduped.values()].sort((a, b) => a.bbox.y - b.bbox.y);
}

/* ================================================================
   Answer detection
   ================================================================ */

function detectAnswersInColumn(
  columnItems: TextItem[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
): DetectedAnswer[] {
  if (columnItems.length < 2) return [];

  const lines = groupIntoLines(columnItems);
  const results: DetectedAnswer[] = [];

  for (const line of lines) {
    const sx = line.items;
    if (sx.length === 0) continue;

    let ansNum: number | null = null;
    let ansText = '';
    let conf = 0;
    const first = sx[0].text.trim();
    let m;

    // "N)" or "N) text"
    m = first.match(/^(\d{1,3})\)\s*(.*)$/);
    if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.95; }

    // number + ")" split
    if (!ansNum && sx.length > 1) {
      const numMatch = first.match(/^(\d{1,3})$/);
      if (numMatch && sx[1].text.trim().startsWith(')')) {
        ansNum = parseInt(numMatch[1], 10);
        ansText = sx[1].text.trim().substring(1).trim();
        conf = 0.93;
      }
    }

    // Concat first items
    if (!ansNum) {
      let concat = sx.slice(0, 5).map(i => i.text).join('');
      m = concat.trim().match(/^(\d{1,3})\)\s*(.*)$/);
      if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.90; }
    }

    if (ansNum && ansNum > 0 && ansNum <= 100) {
      const fullText = sx.map(i => i.text).join('').trim();
      results.push({
        problemNumber: ansNum,
        answerText: ansText || fullText.replace(/^\d{1,3}\)\s*/, '').trim(),
        y: line.y, x: line.minX,
        pageNumber: pageNum, confidence: conf, column: columnIndex,
      });
    }
  }
  return results;
}

/* ================================================================
   Validation
   ================================================================ */

function validateAndFilterProblems(problems: DetectedProblem[]): DetectedProblem[] {
  if (problems.length <= 1) return problems;

  const bestByNumber = new Map<number, DetectedProblem>();
  for (const p of problems) {
    const existing = bestByNumber.get(p.number);
    if (!existing || p.confidence > existing.confidence) bestByNumber.set(p.number, p);
  }

  const unique = [...bestByNumber.values()].sort((a, b) => a.number - b.number);

  // Remove outliers: keep largest consecutive group
  if (unique.length > 5) {
    const groups: DetectedProblem[][] = [];
    let cur: DetectedProblem[] = [unique[0]];
    for (let i = 1; i < unique.length; i++) {
      if (unique[i].number - unique[i - 1].number <= 3) {
        cur.push(unique[i]);
      } else {
        groups.push(cur);
        cur = [unique[i]];
      }
    }
    groups.push(cur);
    if (groups.length > 1) {
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
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

export async function getPageTextItems(
  pdf: any, pageNum: number
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
 * Detect all problems across pages.
 * FORCES two-column mode and uses consistent boundary across pages.
 */
export async function detectAllProblems(
  pdf: any,
  startPage: number = 1,
  endPage?: number,
  debug?: DebugInfo
): Promise<DetectedProblem[]> {
  const last = endPage || pdf.numPages;

  // Step 1: Determine column boundary using ALL pages
  // Collect all items from all pages to find the best split point
  let globalBoundary = 0;
  let firstPageWidth = 0;
  let firstPageHeight = 0;
  const allPageItems: { page: number; items: TextItem[]; width: number; height: number }[] = [];

  for (let p = startPage; p <= last; p++) {
    const { items, viewport } = await getPageTextItems(pdf, p);
    allPageItems.push({ page: p, items, width: viewport.width, height: viewport.height });
    if (!firstPageWidth) { firstPageWidth = viewport.width; firstPageHeight = viewport.height; }
  }

  // Find best column boundary from all items combined
  const allItems = allPageItems.flatMap(pi => pi.items);
  const splitResult = forceColumnSplit(allItems, firstPageWidth, firstPageHeight);
  globalBoundary = splitResult.columnBoundary;

  console.log(`[detectAllProblems] Forced 2-col, boundary: ${globalBoundary.toFixed(1)}, pageWidth: ${firstPageWidth.toFixed(1)}`);

  // Step 2: Process each page
  const allProblems: DetectedProblem[] = [];

  for (const pi of allPageItems) {
    const { page: p, items, width: pw, height: ph } = pi;
    const layout: ColumnLayout = { isTwoColumn: true, columnBoundary: globalBoundary };
    const { left, right } = splitByColumn(items, layout);

    let debugPage: any = undefined;
    if (debug) {
      debugPage = {
        pageNum: p, isTwoColumn: true,
        columnBoundary: Math.round(globalBoundary),
        pageWidth: Math.round(pw), pageHeight: Math.round(ph),
        totalItems: items.length, leftItems: left.length, rightItems: right.length,
        lines: [] as any[], detectedProblems: [] as any[], detectedAnswers: [] as any[],
      };
      debug.pages.push(debugPage);
    }

    // Column extents: left column from 0 to boundary, right from boundary to pageWidth
    const leftStart = 0;
    const rightEnd = pw;

    const columns = [
      { items: left, index: 0, startX: leftStart, endX: globalBoundary + pw * 0.03 },
      { items: right, index: 1, startX: globalBoundary - pw * 0.02, endX: rightEnd },
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
        col.items, p, col.index, col.startX, col.endX, ph
      );

      console.log(`[p${p}][col${col.index}] ${col.items.length}items → detected: ${detected.map(d => `${d.number}(${d._method})`).join(', ') || 'none'}`);

      allProblems.push(...detected);

      if (debugPage) {
        for (const d of detected) {
          debugPage.detectedProblems.push({
            number: d.number, y: Math.round(d.bbox.y), column: d.column, method: d._method || '',
          });
        }
      }
    }
  }

  console.log(`[detectAllProblems] Raw: ${allProblems.map(p => p.number).sort((a, b) => a - b).join(',')}`);

  // Step 3: Validate
  const validated = validateAndFilterProblems(allProblems);
  console.log(`[detectAllProblems] Validated: ${validated.map(p => p.number).sort((a, b) => a - b).join(',')}`);

  // Step 4: Sort by number
  validated.sort((a, b) => a.number - b.number);

  // Step 5: Calculate bbox heights using CONTENT-BASED approach
  // Sort by position for height calculation
  const byPos = [...validated].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.bbox.y - b.bbox.y;
  });

  for (let i = 0; i < byPos.length; i++) {
    const cur = byPos[i];
    const pi = allPageItems.find(p => p.page === cur.pageNumber)!;
    const layout: ColumnLayout = { isTwoColumn: true, columnBoundary: globalBoundary };
    const { left, right } = splitByColumn(pi.items, layout);
    const colItems = cur.column === 0 ? left : right;

    // Find next problem in same page + column
    let nextInCol: DetectedProblem | null = null;
    for (let j = i + 1; j < byPos.length; j++) {
      if (byPos[j].pageNumber === cur.pageNumber && byPos[j].column === cur.column) {
        nextInCol = byPos[j];
        break;
      }
    }

    // Text height for Y adjustment
    const textH = cur._textHeight || 15;
    const topPad = textH + 5;

    // Determine content range for this problem
    const problemTop = cur.bbox.y - topPad;
    let problemBottom: number;

    if (nextInCol) {
      // Stop before the next problem's number
      const nextTextH = nextInCol._textHeight || 15;
      problemBottom = nextInCol.bbox.y - nextTextH - 3;
    } else {
      // Last in column: find the Y of the last content item in this problem's area
      const footerY = pi.height * 0.90;
      const belowItems = colItems.filter(item => item.y >= cur.bbox.y - 5 && item.y < footerY);
      if (belowItems.length > 0) {
        const lastItemY = Math.max(...belowItems.map(item => item.y + Math.max(item.height, 3)));
        problemBottom = lastItemY + 5;
      } else {
        problemBottom = cur.bbox.y + 50;
      }
    }

    cur.bbox.y = Math.max(0, problemTop);
    cur.bbox.height = Math.max(25, problemBottom - cur.bbox.y);

    // Cap at 52% of page height
    if (cur.bbox.height > pi.height * 0.52) {
      cur.bbox.height = pi.height * 0.52;
    }
  }

  return validated.sort((a, b) => a.number - b.number);
}

/**
 * Detect problems on a single page (standalone use).
 */
export async function detectProblemsOnPage(
  pdf: any, pageNum: number, debugPage?: any
): Promise<DetectedProblem[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];
  const layout = forceColumnSplit(items, viewport.width, viewport.height);
  const { left, right } = splitByColumn(items, layout);

  const all: DetectedProblem[] = [];
  for (const [colItems, idx] of [[left, 0], [right, 1]] as [TextItem[], number][]) {
    if (colItems.length === 0) continue;
    const startX = idx === 0 ? 0 : layout.columnBoundary;
    const endX = idx === 0 ? layout.columnBoundary : viewport.width;
    all.push(...detectProblemsInColumn(colItems, pageNum, idx, startX, endX, viewport.height));
  }
  return all;
}

/**
 * Detect answers on a single page.
 */
export async function detectAnswersOnPage(
  pdf: any, pageNum: number, debugPage?: any
): Promise<DetectedAnswer[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];
  const layout = forceColumnSplit(items, viewport.width, viewport.height);
  const { left, right } = splitByColumn(items, layout);

  if (debugPage) {
    debugPage.pageNum = pageNum;
    debugPage.isTwoColumn = true;
    debugPage.columnBoundary = Math.round(layout.columnBoundary);
    debugPage.pageWidth = Math.round(viewport.width);
    debugPage.pageHeight = Math.round(viewport.height);
    debugPage.totalItems = items.length;
    debugPage.leftItems = left.length;
    debugPage.rightItems = right.length;
    debugPage.lines = debugPage.lines || [];
    debugPage.detectedProblems = debugPage.detectedProblems || [];
    debugPage.detectedAnswers = [];
  }

  const all: DetectedAnswer[] = [];
  for (const [colItems, idx] of [[left, 0], [right, 1]] as [TextItem[], number][]) {
    if (colItems.length === 0) continue;
    const startX = idx === 0 ? 0 : layout.columnBoundary;

    if (debugPage) {
      const lines = groupIntoLines(colItems);
      for (const line of lines.slice(0, 40)) {
        debugPage.lines.push({
          y: Math.round(line.y), text: line.text.substring(0, 100),
          column: idx === 0 ? 'L' : 'R',
        });
      }
    }

    const detected = detectAnswersInColumn(colItems, pageNum, idx, startX);
    all.push(...detected);
  }

  // Deduplicate
  const unique = new Map<number, DetectedAnswer>();
  for (const d of all) {
    const existing = unique.get(d.problemNumber);
    if (!existing || d.confidence > existing.confidence) unique.set(d.problemNumber, d);
  }
  const result = [...unique.values()].sort((a, b) => a.problemNumber - b.problemNumber);

  if (debugPage) {
    debugPage.detectedAnswers = result.map(d => ({
      number: d.problemNumber, y: Math.round(d.y), column: d.column, text: d.answerText,
    }));
  }
  return result;
}

/**
 * Detect all answers across pages.
 */
export async function detectAnswersOnPages(
  pdf: any, startPage: number = 1, endPage?: number, debug?: DebugInfo
): Promise<DetectedAnswer[]> {
  const last = endPage || pdf.numPages;
  const all: DetectedAnswer[] = [];

  for (let p = startPage; p <= last; p++) {
    let debugPage: any = undefined;
    if (debug) {
      debugPage = debug.pages.find((pg: any) => pg.pageNum === p);
      if (!debugPage) { debugPage = {}; debug.pages.push(debugPage); }
    }
    all.push(...await detectAnswersOnPage(pdf, p, debugPage));
  }

  const unique = new Map<number, DetectedAnswer>();
  for (const a of all) {
    const existing = unique.get(a.problemNumber);
    if (!existing || a.confidence > existing.confidence) unique.set(a.problemNumber, a);
  }
  return [...unique.values()].sort((a, b) => a.problemNumber - b.problemNumber);
}

/* ================================================================
   Canvas rendering & image extraction
   ================================================================ */

const pageCanvasCache: Map<string, HTMLCanvasElement> = new Map();

export async function renderPageToCanvas(pdf: any, pageNum: number, scale: number = 2.0): Promise<HTMLCanvasElement> {
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

export async function extractProblemImage(pdf: any, problem: DetectedProblem, scale: number = 2.0): Promise<string> {
  const fullCanvas = await getOrRenderPage(pdf, problem.pageNumber, scale);

  const sx = Math.max(0, problem.bbox.x * scale);
  const sy = Math.max(0, problem.bbox.y * scale);
  const sw = Math.min(problem.bbox.width * scale, fullCanvas.width - sx);
  const sh = Math.min(problem.bbox.height * scale, fullCanvas.height - sy);

  if (sw <= 0 || sh <= 0) {
    const f = document.createElement('canvas'); f.width = 100; f.height = 50;
    return f.toDataURL('image/png');
  }

  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(sw));
  crop.height = Math.max(1, Math.round(sh));
  const ctx = crop.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, crop.width, crop.height);
  ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);

  return trimWhitespace(crop);
}

/**
 * Trim whitespace from canvas edges.
 * Uses aggressive trimming to remove empty areas.
 */
function trimWhitespace(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  let top = height, bottom = 0, left = width, right = 0;

  // Scan for non-white pixels (threshold 235 for slightly off-white)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] < 235 || data[idx + 1] < 235 || data[idx + 2] < 235) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top >= bottom || left >= right) return canvas.toDataURL('image/png');

  const pad = 12;
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
  pdf: any, problems: DetectedProblem[], scale: number = 2.0,
  onProgress?: (c: number, t: number) => void
): Promise<ExtractedProblem[]> {
  clearPageCache();
  const results: ExtractedProblem[] = [];
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    if (onProgress) onProgress(i + 1, problems.length);
    results.push({
      id: `p${p.pageNumber}-c${p.column}-n${p.number}`,
      number: p.number, pageNumber: p.pageNumber,
      imageDataUrl: await extractProblemImage(pdf, p, scale),
      bbox: p.bbox,
    });
  }
  clearPageCache();
  return results;
}

export async function extractAnswerImages(
  pdf: any, answers: DetectedAnswer[], scale: number = 2.0,
  onProgress?: (c: number, t: number) => void
): Promise<ExtractedProblem[]> {
  clearPageCache();
  const results: ExtractedProblem[] = [];

  const ansMap: Record<number, DetectedAnswer> = {};
  for (const a of answers) {
    if (!ansMap[a.problemNumber] || a.confidence > ansMap[a.problemNumber].confidence)
      ansMap[a.problemNumber] = a;
  }
  const uniq = Object.values(ansMap).sort((a, b) => a.problemNumber - b.problemNumber);

  for (let i = 0; i < uniq.length; i++) {
    const ans = uniq[i];
    if (onProgress) onProgress(i + 1, uniq.length);
    try {
      const fullCanvas = await getOrRenderPage(pdf, ans.pageNumber, scale);
      const page = await pdf.getPage(ans.pageNumber);
      const vp = page.getViewport({ scale: 1.0 });

      let nextY: number | null = null;
      for (let j = i + 1; j < uniq.length; j++) {
        if (uniq[j].pageNumber === ans.pageNumber && uniq[j].column === ans.column) {
          nextY = uniq[j].y; break;
        }
      }

      const ansH = nextY ? (nextY - ans.y) : Math.min(60, vp.height - ans.y);
      const colW = vp.width / 2;

      const sx = Math.max(0, ans.x * scale);
      const sy = Math.max(0, (ans.y - 10) * scale);
      const sw = Math.min(colW * scale, fullCanvas.width - sx);
      const sh = Math.max(20, (ansH + 15) * scale);

      const crop = document.createElement('canvas');
      crop.width = Math.max(1, Math.round(sw));
      crop.height = Math.max(1, Math.round(sh));
      const ctx = crop.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, crop.width, crop.height);
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);

      results.push({
        id: `ans${ans.pageNumber}-n${ans.problemNumber}`,
        number: ans.problemNumber, pageNumber: ans.pageNumber,
        imageDataUrl: trimWhitespace(crop),
        bbox: { x: ans.x, y: ans.y, width: sw / scale, height: ansH },
      });
    } catch (err) {
      console.error(`Answer extract failed #${ans.problemNumber}:`, err);
    }
  }
  clearPageCache();
  return results;
}

export function matchProblemsToAnswers(problems: ExtractedProblem[], answers: ExtractedProblem[]): ExtractedProblem[] {
  const ansMap: Record<number, ExtractedProblem> = {};
  for (const a of answers) ansMap[a.number] = a;
  console.log('[match] Problems:', problems.map(p => p.number).join(','));
  console.log('[match] Answers:', answers.map(a => a.number).join(','));
  return problems.map(p => ({
    ...p,
    answerPageNumber: ansMap[p.number]?.pageNumber,
    answerImageDataUrl: ansMap[p.number]?.imageDataUrl,
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
