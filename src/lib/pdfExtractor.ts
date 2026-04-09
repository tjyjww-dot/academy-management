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

  // Skip header lines (titles like "중등수학", "복습 테스트", etc.)
  const headerKeywords = ['수학', '테스트', '시험', '답지', '답안', '정답', '해설'];

  for (const line of lines) {
    const sx = line.items;
    if (sx.length === 0) continue;

    // Build full line text (concatenate ALL items on this line)
    const fullText = sx.map(i => i.text).join('').trim();

    // Skip very short lines or header/title lines
    if (fullText.length < 2) continue;
    if (headerKeywords.some(kw => fullText.includes(kw) && !fullText.match(/^\d{1,3}\)/))) continue;

    let ansNum: number | null = null;
    let ansText = '';
    let conf = 0;
    const first = sx[0].text.trim();
    let m;

    // Strategy 1: Full line text match — most reliable
    // "N) answer" pattern on full concatenated text
    m = fullText.match(/^(\d{1,3})\)\s*(.*)$/);
    if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.95; }

    // Strategy 2: Full line with space-joined items
    if (!ansNum) {
      const spaceJoined = sx.map(i => i.text.trim()).filter(t => t).join(' ').trim();
      m = spaceJoined.match(/^(\d{1,3})\s*\)\s*(.*)$/);
      if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.93; }
    }

    // Strategy 3: First item is "N)" or "N) text"
    if (!ansNum) {
      m = first.match(/^(\d{1,3})\)\s*(.*)$/);
      if (m) { ansNum = parseInt(m[1], 10); ansText = m[2] || ''; conf = 0.92; }
    }

    // Strategy 4: First item is just number, second starts with ")"
    if (!ansNum && sx.length > 1) {
      const numMatch = first.match(/^(\d{1,3})$/);
      if (numMatch) {
        // Check if any of the next few items contain ")"
        for (let k = 1; k < Math.min(sx.length, 4); k++) {
          const nextText = sx[k].text.trim();
          if (nextText.startsWith(')')) {
            ansNum = parseInt(numMatch[1], 10);
            ansText = nextText.substring(1).trim();
            // Collect remaining items as answer text
            if (!ansText && k + 1 < sx.length) {
              ansText = sx.slice(k + 1).map(i => i.text).join('').trim();
            }
            conf = 0.91;
            break;
          }
          // ")" might be a separate tiny item
          if (nextText === ')' || nextText === ') ') {
            ansNum = parseInt(numMatch[1], 10);
            ansText = sx.slice(k + 1).map(i => i.text).join('').trim();
            conf = 0.90;
            break;
          }
        }
      }
    }

    // Strategy 5: Concat first N items with no separator
    if (!ansNum) {
      for (let n = 2; n <= Math.min(sx.length, 6); n++) {
        const concat = sx.slice(0, n).map(i => i.text).join('');
        m = concat.trim().match(/^(\d{1,3})\)\s*(.*)$/);
        if (m) {
          ansNum = parseInt(m[1], 10);
          ansText = m[2] || sx.slice(n).map(i => i.text).join('').trim();
          conf = 0.88;
          break;
        }
      }
    }

    // Strategy 6: Look for "N." pattern (some answer sheets use dots)
    if (!ansNum) {
      m = fullText.match(/^(\d{1,3})\.\s+(.+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        // Only use this if the "answer" part doesn't look like a problem statement
        // (short answer, math expression, circled number, etc.)
        const answerPart = m[2].trim();
        if (answerPart.length < 40 && !answerPart.includes('다음') && !answerPart.includes('구하')) {
          ansNum = n; ansText = answerPart; conf = 0.75;
        }
      }
    }

    if (ansNum && ansNum > 0 && ansNum <= 100) {
      // Clean up answer text
      if (!ansText) ansText = fullText.replace(/^\d{1,3}\)\s*/, '').trim();
      // Convert circled numbers to digits if answer is just a circled number
      ansText = ansText.replace(/^①$/, '1').replace(/^②$/, '2').replace(/^③$/, '3')
        .replace(/^④$/, '4').replace(/^⑤$/, '5');

      results.push({
        problemNumber: ansNum,
        answerText: ansText,
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
      { items: left, index: 0, startX: leftStart, endX: globalBoundary - pw * 0.005 },
      { items: right, index: 1, startX: globalBoundary + pw * 0.005, endX: rightEnd },
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

    // Text height for Y adjustment (baseline → top of character)
    const textH = cur._textHeight || 15;
    const topPad = textH + 5;

    // Top of problem: above the number text
    const problemTop = cur.bbox.y - topPad;
    let problemBottom: number;

    if (nextInCol) {
      // Extend to just before the next problem number's top
      // Use generous height to capture graphs/figures, trimWhitespace will remove excess
      const nextTextH = nextInCol._textHeight || 15;
      problemBottom = nextInCol.bbox.y - nextTextH - 2;
    } else {
      // Last problem in this column on this page
      // Extend to the footer boundary to capture any graphs/figures
      const footerY = pi.height * 0.92;
      problemBottom = footerY;
    }

    cur.bbox.y = Math.max(0, problemTop);
    cur.bbox.height = Math.max(25, problemBottom - cur.bbox.y);

    // Cap at 55% of page height
    if (cur.bbox.height > pi.height * 0.55) {
      cur.bbox.height = pi.height * 0.55;
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
    const startX = idx === 0 ? 0 : layout.columnBoundary + viewport.width * 0.005;
    const endX = idx === 0 ? layout.columnBoundary - viewport.width * 0.005 : viewport.width;
    all.push(...detectProblemsInColumn(colItems, pageNum, idx, startX, endX, viewport.height));
  }
  return all;
}

/**
 * Detect answers on a single page using TEXT-BASED approach.
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

/* ================================================================
   GRID-BASED answer detection for PDFs with unreadable fonts.

   Many Korean math PDFs use custom fonts where pdfjs-dist cannot
   decode text. Some answers have ZERO text items at all.

   Strategy: divide the answer page into a uniform grid.
   - Answer pages are 2-column, N/2 rows each
   - Find content area boundaries (below header, above footer)
   - Create equal-sized cells for each answer
   - Return DetectedAnswer[] with grid positions for image cropping
   ================================================================ */

function detectAnswersByGrid(
  items: TextItem[],
  pageNum: number,
  viewport: { width: number; height: number },
  expectedCount: number,
): DetectedAnswer[] {
  const pw = viewport.width;
  const ph = viewport.height;

  // Find content boundaries from actual items
  const bodyItems = items.filter(i => i.y > ph * 0.05 && i.y < ph * 0.97);

  // Find the first and last content Y by looking at items with substance
  // (width > 2, not just whitespace markers)
  const contentItems = bodyItems.filter(i => i.width > 1 || (i.text && i.text.trim()));

  let contentTopY = ph * 0.12;  // default: below header
  let contentBottomY = ph * 0.90; // default: above footer

  if (contentItems.length > 5) {
    const ys = contentItems.map(i => i.y).sort((a, b) => a - b);
    // Skip the very top items (likely header text)
    const headerCutoff = ph * 0.10;
    const bodyYs = ys.filter(y => y > headerCutoff);
    if (bodyYs.length > 2) {
      contentTopY = bodyYs[0] - 15; // a bit above first content
      contentBottomY = bodyYs[bodyYs.length - 1] + 15; // a bit below last
    }
  }

  // Use readable anchor points if available (e.g., "9)", "10)", "11)")
  // to refine the grid
  const anchors: { num: number; y: number; col: number }[] = [];
  const lines = groupIntoLines(bodyItems);
  for (const line of lines) {
    const text = line.items.map(i => i.text).join('').trim();
    const m = text.match(/^(\d{1,3})\)/);
    if (m) {
      const num = parseInt(m[1]);
      const col = line.minX < pw / 2 ? 0 : 1;
      anchors.push({ num, y: line.y, col });
    }
  }

  console.log(`[gridDetect] p${pageNum}: contentY=${Math.round(contentTopY)}-${Math.round(contentBottomY)}, anchors=${anchors.map(a => `${a.num}(y=${Math.round(a.y)},c${a.col})`).join(',')}`);

  // Determine grid dimensions
  const answersPerCol = Math.ceil(expectedCount / 2);
  const contentHeight = contentBottomY - contentTopY;
  const rowHeight = contentHeight / answersPerCol;

  console.log(`[gridDetect] ${expectedCount} answers, ${answersPerCol}/col, rowH=${rowHeight.toFixed(1)}`);

  // If we have anchors, use them to calculate actual row height
  let adjustedTopY = contentTopY;
  let adjustedRowH = rowHeight;

  if (anchors.length >= 2) {
    // Find two anchors in the same column to calculate spacing
    const leftAnchors = anchors.filter(a => a.col === 0).sort((a, b) => a.num - b.num);
    const rightAnchors = anchors.filter(a => a.col === 1).sort((a, b) => a.num - b.num);

    let refAnchors = leftAnchors.length >= 2 ? leftAnchors : rightAnchors;
    let colOffset = refAnchors === leftAnchors ? 0 : answersPerCol;

    if (refAnchors.length >= 2) {
      const a1 = refAnchors[0];
      const a2 = refAnchors[refAnchors.length - 1];
      const numDiff = a2.num - a1.num;
      if (numDiff > 0) {
        adjustedRowH = (a2.y - a1.y) / numDiff;
        // Calculate where answer 1 (or 11) would be
        const firstNumInCol = a1.num;
        const indexInCol = firstNumInCol - 1 - colOffset;
        adjustedTopY = a1.y - indexInCol * adjustedRowH;
      }
    } else if (refAnchors.length === 1) {
      // Single anchor: use it to position
      const a = refAnchors[0];
      const indexInCol = a.num - 1 - colOffset;
      adjustedTopY = a.y - indexInCol * adjustedRowH;
    }
  }

  console.log(`[gridDetect] adjustedTopY=${adjustedTopY.toFixed(1)}, adjustedRowH=${adjustedRowH.toFixed(1)}`);

  // Generate grid-based answers
  const results: DetectedAnswer[] = [];
  const midX = pw / 2;

  // Left column: answers 1..answersPerCol
  for (let i = 0; i < answersPerCol; i++) {
    const ansNum = i + 1;
    if (ansNum > expectedCount) break;
    const y = adjustedTopY + i * adjustedRowH;

    results.push({
      problemNumber: ansNum,
      answerText: `(답 #${ansNum})`,
      y: y,
      x: 0,
      pageNumber: pageNum,
      confidence: 0.85,
      column: 0,
    });
  }

  // Right column: answers (answersPerCol+1)..expectedCount
  for (let i = 0; i < answersPerCol; i++) {
    const ansNum = answersPerCol + i + 1;
    if (ansNum > expectedCount) break;
    const y = adjustedTopY + i * adjustedRowH;

    results.push({
      problemNumber: ansNum,
      answerText: `(답 #${ansNum})`,
      y: y,
      x: midX,
      pageNumber: pageNum,
      confidence: 0.85,
      column: 1,
    });
  }

  console.log(`[gridDetect] Generated ${results.length} grid answers`);
  return results;
}

/**
 * Detect all answers across pages.
 * Uses text-based detection first; if too few found, falls back to
 * position-based detection for PDFs with unreadable fonts.
 */
export async function detectAnswersOnPages(
  pdf: any, startPage: number = 1, endPage?: number, debug?: DebugInfo,
  expectedCount?: number
): Promise<DetectedAnswer[]> {
  const last = endPage || pdf.numPages;

  // Pass 1: text-based detection
  const textResults: DetectedAnswer[] = [];
  for (let p = startPage; p <= last; p++) {
    let debugPage: any = undefined;
    if (debug) {
      debugPage = debug.pages.find((pg: any) => pg.pageNum === p);
      if (!debugPage) { debugPage = {}; debug.pages.push(debugPage); }
    }
    textResults.push(...await detectAnswersOnPage(pdf, p, debugPage));
  }

  // Deduplicate text results
  const textUnique = new Map<number, DetectedAnswer>();
  for (const a of textResults) {
    const existing = textUnique.get(a.problemNumber);
    if (!existing || a.confidence > existing.confidence) textUnique.set(a.problemNumber, a);
  }
  const textFinal = [...textUnique.values()].sort((a, b) => a.problemNumber - b.problemNumber);

  // If text-based found enough answers, use them
  const minExpected = expectedCount ? Math.floor(expectedCount * 0.6) : 5;
  if (textFinal.length >= minExpected) {
    console.log(`[detectAnswersOnPages] Text-based: ${textFinal.length} answers (sufficient)`);
    return textFinal;
  }

  console.log(`[detectAnswersOnPages] Text-based: only ${textFinal.length} answers, trying position-based...`);

  // Pass 2: grid-based detection (for unreadable fonts)
  const gridResults: DetectedAnswer[] = [];
  for (let p = startPage; p <= last; p++) {
    const { items, viewport } = await getPageTextItems(pdf, p);
    const gridDetected = detectAnswersByGrid(items, p, viewport, expectedCount || 20);
    gridResults.push(...gridDetected);
  }

  // Use grid-based if it found more answers
  if (gridResults.length > textFinal.length) {
    console.log(`[detectAnswersOnPages] Grid-based: ${gridResults.length} answers (using this)`);

    if (debug) {
      for (const dp of debug.pages) {
        if (dp.pageNum >= startPage && dp.pageNum <= last) {
          dp.detectedAnswers = gridResults
            .filter(r => r.pageNumber === dp.pageNum)
            .map(r => ({ number: r.problemNumber, y: Math.round(r.y), column: r.column, text: r.answerText }));
          dp.gridBased = true;
        }
      }
    }

    return gridResults;
  }

  return textFinal;
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

  // 왼쪽에 여백을 추가하여 문제 번호가 잘리지 않도록 함
  const leftPadding = 15; // PDF 좌표 기준 15pt 왼쪽 여유
  const adjustedX = Math.max(0, problem.bbox.x - leftPadding);
  const extraWidth = problem.bbox.x - adjustedX; // 실제 추가된 너비

  const sx = Math.max(0, adjustedX * scale);
  const sy = Math.max(0, problem.bbox.y * scale);
  const sw = Math.min((problem.bbox.width + extraWidth) * scale, fullCanvas.width - sx);
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
 * Row/column scanning: a row or column is "content" if enough non-white pixels exist.
 * This prevents stray pixels from inflating bounds and catches thin lines/graphs.
 */
function trimWhitespace(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  const THRESHOLD = 230; // slightly off-white threshold
  const MIN_PIXELS = 3;  // minimum non-white pixels for a row/col to count

  // Count non-white pixels per row
  const rowCounts = new Int32Array(height);
  const colCounts = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] < THRESHOLD || data[idx + 1] < THRESHOLD || data[idx + 2] < THRESHOLD) {
        rowCounts[y]++;
        colCounts[x]++;
      }
    }
  }

  // Find top/bottom rows with content
  let top = 0, bottom = height - 1;
  while (top < height && rowCounts[top] < MIN_PIXELS) top++;
  while (bottom > top && rowCounts[bottom] < MIN_PIXELS) bottom--;

  // Find left/right cols with content
  let left = 0, right = width - 1;
  while (left < width && colCounts[left] < MIN_PIXELS) left++;
  while (right > left && colCounts[right] < MIN_PIXELS) right--;

  if (top >= bottom || left >= right) return canvas.toDataURL('image/png');

  // Small padding around content
  const padTop = 8;
  const padBottom = 10;
  const padLR = 8;
  top = Math.max(0, top - padTop);
  bottom = Math.min(height - 1, bottom + padBottom);
  left = Math.max(0, left - padLR);
  right = Math.min(width - 1, right + padLR);

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

      // Find next answer in same column for height calculation
      let nextY: number | null = null;
      for (let j = i + 1; j < uniq.length; j++) {
        if (uniq[j].pageNumber === ans.pageNumber && uniq[j].column === ans.column) {
          nextY = uniq[j].y; break;
        }
      }

      const ansH = nextY ? (nextY - ans.y) : Math.min(80, vp.height * 0.92 - ans.y);
      const colW = vp.width / 2;

      // Start from column beginning to capture full answer including "N)" prefix
      const colStartX = ans.column === 0 ? 0 : vp.width / 2;
      const leftPad = 8;
      const topPad = 5; // small top padding for descenders

      const sx = Math.max(0, (colStartX - leftPad) * scale);
      const sy = Math.max(0, (ans.y - topPad) * scale);
      const sw = Math.min((colW + leftPad) * scale, fullCanvas.width - sx);
      const sh = Math.max(25, (ansH + topPad) * scale);

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
        bbox: { x: colStartX, y: ans.y, width: colW, height: ansH },
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
