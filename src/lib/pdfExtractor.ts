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
  _textHeight?: number; // height of the problem number text
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
   Two-column layout detection - ROBUST version with consistency

   Key improvement: Detect column layout across ALL pages first,
   then apply the most common layout to all pages for consistency.
   ================================================================ */

interface ColumnLayout {
  isTwoColumn: boolean;
  columnBoundary: number;
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
}

/**
 * Detect column layout for a single page using multiple strategies.
 */
function detectColumnLayoutSingle(items: TextItem[], pageWidth: number, pageHeight: number): ColumnLayout {
  const singleCol: ColumnLayout = {
    isTwoColumn: false,
    columnBoundary: pageWidth,
    leftStart: 0, leftEnd: pageWidth,
    rightStart: pageWidth, rightEnd: pageWidth,
  };

  if (items.length < 8) return singleCol;

  // Filter header/footer
  const contentItems = items.filter(i => i.y > pageHeight * 0.04 && i.y < pageHeight * 0.93);
  if (contentItems.length < 8) return singleCol;

  const midPage = pageWidth / 2;

  // === Strategy 1: Histogram gap detection (fine bins) ===
  const binSize = 2;
  const bins: Record<number, number> = {};
  for (const item of contentItems) {
    const bin = Math.floor(item.x / binSize) * binSize;
    bins[bin] = (bins[bin] || 0) + 1;
  }

  const gapSearchStart = pageWidth * 0.35;
  const gapSearchEnd = pageWidth * 0.65;
  let bestGapCenter = midPage;
  let bestGapWidth = 0;
  let currentGapStart = -1;

  for (let x = gapSearchStart; x <= gapSearchEnd; x += binSize) {
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
    const gapW = gapSearchEnd - currentGapStart;
    if (gapW > bestGapWidth) {
      bestGapWidth = gapW;
      bestGapCenter = currentGapStart + gapW / 2;
    }
  }

  if (bestGapWidth >= 6) {
    return buildTwoColumnLayout(contentItems, bestGapCenter, pageWidth);
  }

  // === Strategy 2: Line-start X clustering ===
  // Group into lines, check where each line starts
  const sortedByY = [...contentItems].sort((a, b) => a.y - b.y);
  const lineStartXs: number[] = [];
  let prevY = -100;
  for (const item of sortedByY) {
    if (Math.abs(item.y - prevY) > 4) {
      lineStartXs.push(item.x);
      prevY = item.y;
    }
  }

  const leftStarts = lineStartXs.filter(x => x < pageWidth * 0.4);
  const rightStarts = lineStartXs.filter(x => x > pageWidth * 0.5);

  if (leftStarts.length >= 2 && rightStarts.length >= 2) {
    // Find the average right column start as boundary
    const avgRightStart = rightStarts.reduce((a, b) => a + b, 0) / rightStarts.length;
    const boundary = (pageWidth * 0.4 + avgRightStart) / 2; // midpoint between clusters
    return buildTwoColumnLayout(contentItems, boundary, pageWidth);
  }

  // === Strategy 3: Simple left-right item count ===
  const leftCount = contentItems.filter(i => i.x + i.width < pageWidth * 0.45).length;
  const rightCount = contentItems.filter(i => i.x > pageWidth * 0.55).length;

  if (leftCount > contentItems.length * 0.15 && rightCount > contentItems.length * 0.15) {
    return buildTwoColumnLayout(contentItems, midPage, pageWidth);
  }

  return singleCol;
}

function buildTwoColumnLayout(items: TextItem[], boundary: number, pageWidth: number): ColumnLayout {
  const leftItems = items.filter(i => i.x + i.width / 2 < boundary);
  const rightItems = items.filter(i => i.x + i.width / 2 >= boundary);

  if (leftItems.length < 2 || rightItems.length < 2) {
    return {
      isTwoColumn: false, columnBoundary: pageWidth,
      leftStart: 0, leftEnd: pageWidth, rightStart: pageWidth, rightEnd: pageWidth,
    };
  }

  const leftStart = Math.min(...leftItems.map(i => i.x));
  const rightEnd = Math.max(...rightItems.map(i => i.x + i.width));

  return {
    isTwoColumn: true,
    columnBoundary: boundary,
    leftStart: Math.max(0, leftStart - 3),
    leftEnd: boundary,
    rightStart: boundary,
    rightEnd: Math.min(pageWidth, rightEnd + 3),
  };
}

/**
 * Detect column layout with cross-page consistency.
 * If ANY page is detected as two-column, apply two-column to ALL pages
 * using the average column boundary.
 */
async function detectConsistentLayout(
  pdf: any,
  startPage: number,
  endPage: number
): Promise<{ layouts: Map<number, ColumnLayout>; globalTwoColumn: boolean; globalBoundary: number }> {
  const layouts = new Map<number, ColumnLayout>();
  const twoColBoundaries: number[] = [];

  for (let p = startPage; p <= endPage; p++) {
    const { items, viewport } = await getPageTextItems(pdf, p);
    const layout = detectColumnLayoutSingle(items, viewport.width, viewport.height);
    layouts.set(p, layout);

    if (layout.isTwoColumn) {
      twoColBoundaries.push(layout.columnBoundary);
    }
  }

  // If at least 1 page is two-column, force all pages to be two-column
  const globalTwoColumn = twoColBoundaries.length > 0;
  const globalBoundary = globalTwoColumn
    ? twoColBoundaries.reduce((a, b) => a + b, 0) / twoColBoundaries.length
    : 0;

  if (globalTwoColumn) {
    // Re-build layouts using the global boundary for all pages
    for (let p = startPage; p <= endPage; p++) {
      const { items, viewport } = await getPageTextItems(pdf, p);
      const contentItems = items.filter(i => i.y > viewport.height * 0.04 && i.y < viewport.height * 0.93);
      layouts.set(p, buildTwoColumnLayout(contentItems, globalBoundary, viewport.width));
    }
  }

  return { layouts, globalTwoColumn, globalBoundary };
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
  const firstItemHeight = sortedByX[0].height;
  lines.push({ items: sortedByX, y, minX, maxX, text, firstItemHeight });
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

  m = t.match(/^\[(\d{1,3})\]/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.90 }; }

  m = t.match(/^(\d{1,3})번/);
  if (m) { const n = parseInt(m[1], 10); if (n > 0 && n <= 50) return { number: n, confidence: 0.88 }; }

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
  colWidth: number,
  pageHeight: number,
): (DetectedProblem & { _method?: string })[] {
  if (columnItems.length < 3) return [];

  // Filter out footer (bottom 10%)
  const footerThreshold = pageHeight * 0.90;
  const items = columnItems.filter(i => i.y < footerThreshold);
  if (items.length < 3) return [];

  // Find column's left margin
  const xValues = items.map(i => i.x).sort((a, b) => a - b);
  const leftMargin = xValues[Math.max(0, Math.floor(xValues.length * 0.03))];
  const marginTolerance = 25;

  const lines = groupIntoLines(items);
  const candidates: (DetectedProblem & { _method?: string })[] = [];

  for (const line of lines) {
    const sx = line.items;
    if (sx.length === 0) continue;

    // Must be near left margin
    if (Math.abs(line.minX - leftMargin) > marginTolerance) continue;

    let detected: { number: number; confidence: number } | null = null;
    let method = '';

    // Strategy 1: First item alone
    detected = parseProblemNumber(sx[0].text);
    if (detected) method = 'first';

    // Strategy 2: First two items concatenated
    if (!detected && sx.length > 1) {
      detected = parseProblemNumber(sx[0].text.trim() + sx[1].text.trim());
      if (detected) method = 'first2';
    }

    // Strategy 3: First 3 items
    if (!detected && sx.length > 2) {
      detected = parseProblemNumber(sx.slice(0, 3).map(i => i.text).join(''));
      if (detected) method = 'first3';
    }

    // Bare numbers: validate they start a new section
    if (detected && detected.confidence === 0.70) {
      const hasContentAfter = sx.length > 1 || line.text.length > 2;
      if (!hasContentAfter) {
        detected.confidence = 0.50;
      }
    }

    if (detected && detected.number > 0) {
      // IMPORTANT: Store the text height for bbox Y adjustment later
      const textHeight = sx[0].height || line.firstItemHeight || 12;
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
    if (!existing || c.confidence > existing.confidence) {
      deduped.set(c.number, c);
    }
  }

  return [...deduped.values()].sort((a, b) => a.bbox.y - b.bbox.y);
}

/* ================================================================
   Answer detection - "N)" format
   ================================================================ */

function detectAnswersInColumn(
  columnItems: TextItem[],
  pageNum: number,
  columnIndex: number,
  colStartX: number,
  colWidth: number,
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

    // Strategy 1: "N)" or "N) text"
    let m = first.match(/^(\d{1,3})\)\s*(.*)$/);
    if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.95; }

    // Strategy 2: number + ")" split
    if (!ansNum && sx.length > 1) {
      const numMatch = first.match(/^(\d{1,3})$/);
      if (numMatch && sx[1].text.trim().startsWith(')')) {
        ansNum = parseInt(numMatch[1], 10);
        ansText = sx[1].text.trim().substring(1).trim();
        conf = 0.93;
      }
    }

    // Strategy 3: Concat first items
    if (!ansNum) {
      let concat = '';
      for (const item of sx.slice(0, 5)) concat += item.text;
      m = concat.trim().match(/^(\d{1,3})\)\s*(.*)$/);
      if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.90; }
    }

    // Strategy 4: Individual items
    if (!ansNum) {
      for (const item of sx.slice(0, 4)) {
        m = item.text.trim().match(/^(\d{1,3})\)\s*(.*)$/);
        if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.88; break; }
      }
    }

    if (ansNum && ansNum > 0 && ansNum <= 100) {
      const fullText = sx.map(i => i.text).join('').trim();
      results.push({
        problemNumber: ansNum,
        answerText: ansText || fullText.replace(/^\d{1,3}\)\s*/, '').trim(),
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
   Validation
   ================================================================ */

function validateAndFilterProblems(problems: DetectedProblem[]): DetectedProblem[] {
  if (problems.length <= 1) return problems;

  // Deduplicate: keep highest confidence per number
  const bestByNumber = new Map<number, DetectedProblem>();
  for (const p of problems) {
    const existing = bestByNumber.get(p.number);
    if (!existing || p.confidence > existing.confidence) {
      bestByNumber.set(p.number, p);
    }
  }

  const unique = [...bestByNumber.values()].sort((a, b) => a.number - b.number);

  if (unique.length > 5) {
    // Find largest consecutive group (gap ≤ 3)
    const groups: DetectedProblem[][] = [];
    let currentGroup: DetectedProblem[] = [unique[0]];

    for (let i = 1; i < unique.length; i++) {
      if (unique[i].number - unique[i - 1].number <= 3) {
        currentGroup.push(unique[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [unique[i]];
      }
    }
    groups.push(currentGroup);

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
 * Detect all problems across pages.
 * Uses cross-page consistent column detection.
 */
export async function detectAllProblems(
  pdf: any,
  startPage: number = 1,
  endPage?: number,
  debug?: DebugInfo
): Promise<DetectedProblem[]> {
  const totalPages = pdf.numPages;
  const last = endPage || totalPages;

  // Step 1: Detect column layout consistently across ALL pages
  const { layouts, globalTwoColumn, globalBoundary } = await detectConsistentLayout(pdf, startPage, last);

  console.log(`[detectAllProblems] Global two-column: ${globalTwoColumn}, boundary: ${globalBoundary}`);

  // Step 2: Detect problems on each page using consistent layout
  const allProblems: DetectedProblem[] = [];

  for (let p = startPage; p <= last; p++) {
    const { items, viewport } = await getPageTextItems(pdf, p);
    const layout = layouts.get(p) || detectColumnLayoutSingle(items, viewport.width, viewport.height);
    const { left, right } = splitByColumn(items, layout);

    let debugPage: any = undefined;
    if (debug) {
      debugPage = {
        pageNum: p,
        isTwoColumn: layout.isTwoColumn,
        columnBoundary: Math.round(layout.columnBoundary),
        pageWidth: Math.round(viewport.width),
        pageHeight: Math.round(viewport.height),
        totalItems: items.length,
        leftItems: left.length,
        rightItems: right.length,
        lines: [] as any[],
        detectedProblems: [] as any[],
        detectedAnswers: [] as any[],
      };
      debug.pages.push(debugPage);
    }

    const columns = layout.isTwoColumn
      ? [
          { items: left, index: 0, startX: layout.leftStart, width: layout.leftEnd - layout.leftStart },
          { items: right, index: 1, startX: layout.rightStart, width: layout.rightEnd - layout.rightStart },
        ]
      : [{ items: left, index: 0, startX: 0, width: viewport.width }];

    for (const col of columns) {
      if (col.items.length === 0) continue;

      if (debugPage) {
        const lines = groupIntoLines(col.items);
        for (const line of lines.slice(0, 50)) {
          debugPage.lines.push({
            y: Math.round(line.y),
            text: line.text.substring(0, 120),
            column: col.index === 0 ? 'L' : 'R',
          });
        }
      }

      const detected = detectProblemsInColumn(
        col.items, p, col.index, col.startX, col.width, viewport.height
      );
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

  console.log(`[detectAllProblems] Raw detected: ${allProblems.map(p => p.number).join(',')}`);

  // Step 3: Validate and deduplicate
  const validated = validateAndFilterProblems(allProblems);

  console.log(`[detectAllProblems] After validation: ${validated.map(p => p.number).join(',')}`);

  // Step 4: Sort by number
  validated.sort((a, b) => a.number - b.number);

  // Step 5: Calculate bounding box heights with PROPER Y adjustment
  const byPosition = [...validated].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.bbox.y - b.bbox.y;
  });

  for (let i = 0; i < byPosition.length; i++) {
    const current = byPosition[i];
    const { items, viewport } = await getPageTextItems(pdf, current.pageNumber);
    const layout = layouts.get(current.pageNumber) || detectColumnLayoutSingle(items, viewport.width, viewport.height);
    const { left, right } = splitByColumn(items, layout);
    const colItems = current.column === 0 ? left : right;

    // Find next problem in same page + column
    let nextInColumn: DetectedProblem | null = null;
    for (let j = i + 1; j < byPosition.length; j++) {
      if (byPosition[j].pageNumber === current.pageNumber && byPosition[j].column === current.column) {
        nextInColumn = byPosition[j];
        break;
      }
    }

    // *** KEY FIX: Adjust Y upward by text height ***
    // PDF Y coordinate is at text baseline. The visual top of the problem number
    // is at (y - textHeight). We need to include the full character.
    const textHeight = current._textHeight || 15;
    const topPadding = textHeight + 8; // text height + extra padding above

    if (nextInColumn) {
      // Height = from current to next problem
      // But we need to account for the upward Y adjustment
      const rawTop = current.bbox.y - topPadding;
      const rawBottom = nextInColumn.bbox.y - 5; // stop just before next problem
      current.bbox.y = Math.max(0, rawTop);
      current.bbox.height = rawBottom - current.bbox.y;
    } else {
      // Last problem in column: extend to content bottom
      const footerY = viewport.height * 0.90;
      const contentItems = colItems.filter(item => item.y >= current.bbox.y && item.y < footerY);
      const contentBottom = contentItems.length > 0
        ? Math.max(...contentItems.map(item => item.y + Math.max(item.height, 5))) + 10
        : current.bbox.y + 80;

      current.bbox.y = Math.max(0, current.bbox.y - topPadding);
      current.bbox.height = contentBottom - current.bbox.y;
    }

    // Safety: cap height at 55% of page
    const maxHeight = viewport.height * 0.55;
    if (current.bbox.height > maxHeight) {
      current.bbox.height = maxHeight;
    }
    // Minimum height
    if (current.bbox.height < 30) {
      current.bbox.height = 30;
    }
  }

  return validated.sort((a, b) => a.number - b.number);
}

/**
 * Detect problems on a single page (for individual use).
 */
export async function detectProblemsOnPage(
  pdf: any,
  pageNum: number,
  debugPage?: any
): Promise<DetectedProblem[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];

  const layout = detectColumnLayoutSingle(items, viewport.width, viewport.height);
  const { left, right } = splitByColumn(items, layout);

  if (debugPage) {
    debugPage.pageNum = pageNum;
    debugPage.isTwoColumn = layout.isTwoColumn;
    debugPage.columnBoundary = Math.round(layout.columnBoundary);
    debugPage.pageWidth = Math.round(viewport.width);
    debugPage.pageHeight = Math.round(viewport.height);
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
    : [{ items: left, index: 0, startX: 0, width: viewport.width }];

  for (const col of columns) {
    if (col.items.length === 0) continue;
    const detected = detectProblemsInColumn(col.items, pageNum, col.index, col.startX, col.width, viewport.height);
    allDetected.push(...detected);
  }

  return allDetected;
}

/**
 * Detect answers on a single page.
 */
export async function detectAnswersOnPage(
  pdf: any,
  pageNum: number,
  debugPage?: any
): Promise<DetectedAnswer[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  if (items.length === 0) return [];

  const layout = detectColumnLayoutSingle(items, viewport.width, viewport.height);
  const { left, right } = splitByColumn(items, layout);

  if (debugPage) {
    debugPage.pageNum = pageNum;
    debugPage.isTwoColumn = layout.isTwoColumn;
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

  const allDetected: DetectedAnswer[] = [];
  const columns = layout.isTwoColumn
    ? [
        { items: left, index: 0, startX: layout.leftStart, width: layout.leftEnd - layout.leftStart },
        { items: right, index: 1, startX: layout.rightStart, width: layout.rightEnd - layout.rightStart },
      ]
    : [{ items: left, index: 0, startX: 0, width: viewport.width }];

  for (const col of columns) {
    if (col.items.length === 0) continue;

    if (debugPage) {
      const lines = groupIntoLines(col.items);
      for (const line of lines.slice(0, 50)) {
        debugPage.lines.push({
          y: Math.round(line.y), text: line.text.substring(0, 120),
          column: col.index === 0 ? 'L' : 'R',
        });
      }
    }

    const detected = detectAnswersInColumn(col.items, pageNum, col.index, col.startX, col.width);
    allDetected.push(...detected);
  }

  const unique = new Map<number, DetectedAnswer>();
  for (const d of allDetected) {
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
      debugPage = debug.pages.find((pg: any) => pg.pageNum === p);
      if (!debugPage) {
        debugPage = {};
        debug.pages.push(debugPage);
      }
    }
    const answers = await detectAnswersOnPage(pdf, p, debugPage);
    allAnswers.push(...answers);
  }

  const unique = new Map<number, DetectedAnswer>();
  for (const a of allAnswers) {
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

  const pad = 8;
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
  pdf: any, answers: DetectedAnswer[], scale: number = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedProblem[]> {
  clearPageCache();
  const results: ExtractedProblem[] = [];

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
      const colWidth = vp.width / 2;

      const sx = Math.max(0, answer.x * scale);
      const sy = Math.max(0, (answer.y - 10) * scale);
      const sw = Math.min(colWidth * scale, fullCanvas.width - sx);
      const sh = Math.max(20, (answerHeight + 15) * scale);

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(sw));
      cropCanvas.height = Math.max(1, Math.round(sh));
      const ctx = cropCanvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

      results.push({
        id: `ans${answer.pageNumber}-n${answer.problemNumber}`,
        number: answer.problemNumber,
        pageNumber: answer.pageNumber,
        imageDataUrl: trimWhitespace(cropCanvas),
        bbox: { x: answer.x, y: answer.y, width: sw / scale, height: answerHeight },
      });
    } catch (err) {
      console.error(`Failed to extract answer for #${answer.problemNumber}:`, err);
    }
  }

  clearPageCache();
  return results;
}

export function matchProblemsToAnswers(problems: ExtractedProblem[], answers: ExtractedProblem[]): ExtractedProblem[] {
  const answerMap: Record<number, ExtractedProblem> = {};
  for (const a of answers) answerMap[a.number] = a;

  console.log('[match] Problems:', problems.map(p => p.number).join(','));
  console.log('[match] Answers:', answers.map(a => a.number).join(','));

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
