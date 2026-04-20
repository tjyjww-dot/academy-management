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
  answerEndY?: number; // Y position where answer content ends (before 해설)
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

  // Filter footer (bottom 7%) and header (top 3%)
  const items = columnItems.filter(i => i.y > pageHeight * 0.03 && i.y < pageHeight * 0.93);
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

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
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
      // Strip "답 " prefix if present (e.g., "답 ①" → "①")
      ansText = ansText.replace(/^답\s*/, '').trim();
      // Convert circled numbers to digits if answer is just a circled number
      ansText = ansText.replace(/^①$/, '1').replace(/^②$/, '2').replace(/^③$/, '3')
        .replace(/^④$/, '4').replace(/^⑤$/, '5');

      // Text Y from pdfjs is the BASELINE (bottom of text).
      // Adjust to visual top by subtracting text height for consistent cropping.
      const textHeight = line.firstItemHeight || 10;
      const visualTopY = line.y - textHeight;

      // For text-based answers, don't set answerEndY.
      // extractAnswerImages will use nextAnswer.y as the boundary,
      // which includes any explanations (해설) between answers.
      results.push({
        problemNumber: ansNum,
        answerText: ansText,
        y: visualTopY, x: line.minX,
        pageNumber: pageNum, confidence: conf, column: columnIndex,
        // answerEndY intentionally NOT set — let extractAnswerImages
        // use the full height to the next answer (includes 해설)
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
    // 문제 번호 위쪽 여유를 넉넉하게 (그래프, 표, 조건문 등이 번호 위에 올 수 있음)
    const topPad = textH + 12;

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
   OPERATOR LIST answer detection.

   When pdfjs-dist cannot extract text (custom font encoding like
   g_d0_f2), answer numbers "N)" are rendered as small embedded
   images (paintImageXObject). We detect these by:

   1. Getting page.getOperatorList() to find all image positions
   2. Filtering for small images (width<25, height<15) in content area
   3. Grouping by Y position (same answer line)
   4. Identifying "anchor" images at consistent left-margin X positions
      (x≈58 for left column, x≈303 for right column)
   5. Combining with readable text items like "9)", "10)", "11)"
   6. Assigning sequential answer numbers using text anchors

   This approach works without canvas rendering (Node.js compatible)
   and correctly handles PDFs with embedded glyph images.
   ================================================================ */

async function detectAnswersByOperatorList(
  pdf: any,
  pageNum: number,
  viewport: { width: number; height: number },
  expectedCount: number,
): Promise<DetectedAnswer[]> {
  const pw = viewport.width;
  const ph = viewport.height;
  const midX = pw / 2;

  const page = await pdf.getPage(pageNum);

  // --- Get text items ---
  const textContent = await page.getTextContent();
  const textItems = textContent.items
    .filter((item: any) => item.str && item.str.trim())
    .map((item: any) => ({
      text: item.str,
      x: item.transform[4],
      y: ph - item.transform[5],
      width: item.width,
      height: item.height || Math.abs(item.transform[3]),
    }));

  // --- Also collect RAW text items (INCLUDING empty strings) for row position detection ---
  // Rationale: HWP/한글 PDFs often render answer content as unmapped font glyphs that
  // pdfjs reports as empty strings. These still occupy a row position on the page.
  // Without this, rows composed entirely of unmapped glyphs (e.g., answer "13) -17x+17"
  // where "-17x+17" is rendered as font glyphs without unicode mapping) would be missed.
  const rawTextItems = textContent.items
    .map((item: any) => ({
      x: item.transform[4],
      y: ph - item.transform[5],
      height: item.height || Math.abs(item.transform[3]),
    }))
    .filter((t: any) => t.y > 80 && t.y < ph * 0.93 && t.height >= 5 && t.height <= 20);

  // --- Get image positions from operator list ---
  const opList = await page.getOperatorList();
  const ops = opList.fnArray;
  const args = opList.argsArray;

  // OPS enum values for save/restore/transform/paintImageXObject
  const OPS_SAVE = 10;       // OPS.save
  const OPS_RESTORE = 11;    // OPS.restore
  const OPS_TRANSFORM = 12;  // OPS.transform
  const OPS_PAINT_IMG = 85;  // OPS.paintImageXObject

  let ctmStack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  function multiplyMatrix(a: number[], b: number[]): number[] {
    return [
      a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
      a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
      a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5],
    ];
  }

  const allImages: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === OPS_SAVE) { ctmStack.push([...ctm]); }
    else if (op === OPS_RESTORE) { ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0]; }
    else if (op === OPS_TRANSFORM) { ctm = multiplyMatrix(ctm, args[i]); }
    else if (op === OPS_PAINT_IMG) {
      const imgWidth = Math.abs(ctm[0]);
      const imgHeight = Math.abs(ctm[3]);
      // CTM d value (ctm[3]) determines image Y orientation:
      // d > 0: ctm[5] = PDF bottom of image → visual top = ctm[5] + d
      // d < 0: ctm[5] = PDF top of image → visual top = ctm[5]
      const pdfVisualTop = ctm[3] >= 0 ? ctm[5] + ctm[3] : ctm[5];
      allImages.push({
        x: ctm[4],
        y: ph - pdfVisualTop,  // convert to top-down coordinates
        width: imgWidth,
        height: imgHeight,
      });
    }
  }

  // --- Filter: small images in content area (not header/footer) ---
  const contentImages = allImages.filter(img =>
    img.width < 25 && img.height < 15 && img.y > 80 && img.y < ph * 0.93
  );

  console.log(`[opList] Page ${pageNum}: ${allImages.length} images, ${contentImages.length} small content images`);

  if (contentImages.length === 0 && textItems.length === 0) {
    return [];
  }

  // --- Group images by Y position (within 8pt = same answer line) ---
  const Y_GROUP_THRESHOLD = 8;
  const sorted = [...contentImages].sort((a, b) => a.y - b.y);
  const yGroups: typeof contentImages[] = [];

  if (sorted.length > 0) {
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y - group[0].y <= Y_GROUP_THRESHOLD) {
        group.push(sorted[i]);
      } else {
        yGroups.push(group);
        group = [sorted[i]];
      }
    }
    yGroups.push(group);
  }

  // --- Identify anchor X positions ---
  // Find the most common leftmost X positions for answer numbers
  // Left column anchors cluster around x≈55-62, right column around x≈300-310
  // We detect these dynamically rather than hardcoding

  // Collect the minimum X of each Y-group
  const groupMinXs = yGroups.map(g => ({
    minX: Math.min(...g.map(img => img.x)),
    y: g.reduce((s, img) => s + img.y, 0) / g.length,
    count: g.length,
  }));

  // Separate into left and right column groups
  const leftGroups = groupMinXs.filter(g => g.minX < midX);
  const rightGroups = groupMinXs.filter(g => g.minX >= midX);

  // Find the anchor X for each column (most common minX within tolerance)
  function findAnchorX(groups: typeof groupMinXs): number {
    if (groups.length === 0) return 0;
    const xs = groups.map(g => g.minX).sort((a, b) => a - b);
    // Use the most frequent X value (with 5pt tolerance)
    const buckets: { x: number; count: number }[] = [];
    for (const x of xs) {
      const bucket = buckets.find(b => Math.abs(b.x - x) <= 5);
      if (bucket) { bucket.count++; bucket.x = (bucket.x * (bucket.count - 1) + x) / bucket.count; }
      else { buckets.push({ x, count: 1 }); }
    }
    buckets.sort((a, b) => b.count - a.count);
    return buckets[0]?.x || 0;
  }

  const leftAnchorX = findAnchorX(leftGroups);
  const rightAnchorX = findAnchorX(rightGroups);
  const ANCHOR_TOLERANCE = 8;

  console.log(`[opList] Anchors: left=${leftAnchorX.toFixed(1)}, right=${rightAnchorX.toFixed(1)}`);

  // --- Build answer starts from image groups ---
  interface AnswerStart {
    y: number;
    x: number;
    column: number;
    source: string;
    number?: number;
  }

  const answerStarts: AnswerStart[] = [];
  for (const group of yGroups) {
    const minX = Math.min(...group.map(g => g.x));
    const avgY = group.reduce((s, g) => s + g.y, 0) / group.length;

    const isLeftAnchor = leftAnchorX > 0 && Math.abs(minX - leftAnchorX) <= ANCHOR_TOLERANCE && minX < midX;
    const isRightAnchor = rightAnchorX > 0 && Math.abs(minX - rightAnchorX) <= ANCHOR_TOLERANCE && minX >= midX;

    if (isLeftAnchor) {
      answerStarts.push({ y: avgY, x: leftAnchorX, column: 0, source: 'image' });
    }
    if (isRightAnchor) {
      answerStarts.push({ y: avgY, x: rightAnchorX, column: 1, source: 'image' });
    }
  }

  // --- Add text-based "N)" items ---
  // Regex accepts: "1)", "24)", "24) (1)", "24) (1) 2t²", etc.
  // The previous /^(\d{1,2})\)$/ was too strict and missed sub-part answers
  // like "24) (1) 2t²  (2) 8" which pdfjs may report as a single text item.
  for (const t of textItems) {
    const trimmed = (t.text as string).trim();
    // Match "N)" at the start, optionally followed by space / open-paren / other content.
    // The "(?!\d)" prevents matching e.g. "123)" being parsed as 12).
    const m = trimmed.match(/^(\d{1,2})\)(?:$|\s|\()/);
    if (m) {
      const num = parseInt(m[1]);
      const col = t.x < midX ? 0 : 1;
      // Check for duplicate (image at same Y)
      const dup = answerStarts.find(a => a.column === col && Math.abs(a.y - t.y) < 15);
      if (dup) {
        dup.number = num;
        dup.source = 'merged';
      } else {
        answerStarts.push({ y: t.y, x: t.x, column: col, source: 'text', number: num });
      }
    }
  }

  // --- Fill in missing rows using raw text item Y-clusters ---
  // If a column has rows whose content is ONLY unmapped font glyphs (empty str),
  // neither image groups nor "N)" text anchors will detect them. We recover these
  // by clustering ALL text items (including empty strings) by Y position per column
  // and adding any cluster that isn't already covered.
  function clusterYs(ys: number[], threshold: number): number[] {
    if (ys.length === 0) return [];
    const sorted = [...ys].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const last = clusters[clusters.length - 1];
      if (sorted[i] - last[last.length - 1] <= threshold) last.push(sorted[i]);
      else clusters.push([sorted[i]]);
    }
    // Return the TOP (smallest Y) of each cluster to represent the row baseline
    return clusters.map(c => Math.min(...c));
  }

  const ROW_CLUSTER_THRESHOLD = 8; // pts — within 8pt vertically = same row
  const ROW_DUP_TOLERANCE = 18;    // pts — merge with existing answerStart if within 18pt

  const leftRawYs = rawTextItems.filter((t: any) => t.x < midX).map((t: any) => t.y);
  const rightRawYs = rawTextItems.filter((t: any) => t.x >= midX).map((t: any) => t.y);
  const leftRowYs = clusterYs(leftRawYs, ROW_CLUSTER_THRESHOLD);
  const rightRowYs = clusterYs(rightRawYs, ROW_CLUSTER_THRESHOLD);

  // Determine expected row count per column (half of expected answer count, rounded up)
  const expectedPerCol = Math.ceil(expectedCount / 2);

  function fillMissingRows(rowYs: number[], column: number, anchorX: number) {
    const existing = answerStarts.filter(a => a.column === column);
    for (const rowY of rowYs) {
      const dup = existing.find(a => Math.abs(a.y - rowY) < ROW_DUP_TOLERANCE);
      if (!dup) {
        answerStarts.push({
          y: rowY,
          x: anchorX > 0 ? anchorX : (column === 0 ? 58 : 303),
          column,
          source: 'text-cluster',
        });
      }
    }
  }

  // Only fill if a column is under-populated
  const leftCount = answerStarts.filter(a => a.column === 0).length;
  const rightCount = answerStarts.filter(a => a.column === 1).length;
  if (leftCount < expectedPerCol) fillMissingRows(leftRowYs, 0, leftAnchorX);
  if (rightCount < expectedPerCol) fillMissingRows(rightRowYs, 1, rightAnchorX);

  // De-duplicate any rows that ended up too close (keep ones with known number / higher conf)
  function dedupeColumn(column: number) {
    const colEntries = answerStarts
      .filter(a => a.column === column)
      .sort((a, b) => a.y - b.y);
    const kept: AnswerStart[] = [];
    for (const e of colEntries) {
      const near = kept.find(k => Math.abs(k.y - e.y) < ROW_DUP_TOLERANCE);
      if (!near) { kept.push(e); continue; }
      // Prefer entry with known number (text/merged) > image-group > text-cluster fallback.
      // Note: 'merged' entries always carry a number, so they short-circuit via the first check.
      const rank = (a: AnswerStart) => {
        if (a.number !== undefined) return 3; // text or merged (both carry the answer number)
        if (a.source === 'image') return 2;   // image-group anchor (no number, but solid position)
        return 1;                             // text-cluster (raw-text Y fallback)
      };
      if (rank(e) > rank(near)) {
        Object.assign(near, e);
      }
    }
    // Replace column entries with deduplicated ones
    const others = answerStarts.filter(a => a.column !== column);
    answerStarts.length = 0;
    answerStarts.push(...others, ...kept);
  }
  dedupeColumn(0);
  dedupeColumn(1);

  console.log(`[opList] After raw-text row fill: left=${answerStarts.filter(a => a.column === 0).length}, right=${answerStarts.filter(a => a.column === 1).length}`);

  // --- Split by column and sort ---
  const leftCol = answerStarts.filter(a => a.column === 0).sort((a, b) => a.y - b.y);
  const rightCol = answerStarts.filter(a => a.column === 1).sort((a, b) => a.y - b.y);

  console.log(`[opList] Answer starts: left=${leftCol.length}, right=${rightCol.length}`);

  // --- Assign numbers using text anchors ---
  function assignNumbers(positions: AnswerStart[]): (AnswerStart & { assignedNumber: number })[] {
    const result: (AnswerStart & { assignedNumber: number })[] = [];

    for (let i = 0; i < positions.length; i++) {
      if (positions[i].number !== undefined) {
        result.push({ ...positions[i], assignedNumber: positions[i].number! });
      } else {
        // Extrapolate from nearest known number
        let prevKnown: { idx: number; num: number } | null = null;
        let nextKnown: { idx: number; num: number } | null = null;
        for (let j = i - 1; j >= 0; j--) {
          if (positions[j].number !== undefined) { prevKnown = { idx: j, num: positions[j].number! }; break; }
        }
        for (let j = i + 1; j < positions.length; j++) {
          if (positions[j].number !== undefined) { nextKnown = { idx: j, num: positions[j].number! }; break; }
        }

        let num: number;
        if (prevKnown) num = prevKnown.num + (i - prevKnown.idx);
        else if (nextKnown) num = nextKnown.num - (nextKnown.idx - i);
        else num = i + 1; // fallback: sequential from 1
        result.push({ ...positions[i], assignedNumber: num });
      }
    }
    return result;
  }

  const leftAssigned = assignNumbers(leftCol);
  const rightAssigned = assignNumbers(rightCol);

  // If no text anchors at all, use expectedCount to infer numbering
  // Left column = 1..N, Right column = (N+1)..expectedCount
  const hasAnyNumber = [...leftAssigned, ...rightAssigned].some(a => a.source === 'text' || a.source === 'merged');
  if (!hasAnyNumber && expectedCount > 0) {
    const leftCount = leftAssigned.length;
    for (let i = 0; i < leftAssigned.length; i++) leftAssigned[i].assignedNumber = i + 1;
    for (let i = 0; i < rightAssigned.length; i++) rightAssigned[i].assignedNumber = leftCount + i + 1;
  }

  // --- Build final result ---
  const results: DetectedAnswer[] = [];
  for (const a of [...leftAssigned, ...rightAssigned]) {
    results.push({
      problemNumber: a.assignedNumber,
      answerText: a.number !== undefined ? `${a.number})` : `(답 #${a.assignedNumber})`,
      y: a.y,
      x: a.x,
      pageNumber: pageNum,
      confidence: a.source === 'text' || a.source === 'merged' ? 0.95 : 0.90,
      column: a.column,
      answerEndY: a.y + 25, // For image-based answers, content typically ends ~25pt below start
    });
  }

  console.log(`[opList] Total: ${results.length} answers detected: ${results.map(r => r.problemNumber).join(',')}`);
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

  console.log(`[detectAnswersOnPages] Text-based: only ${textFinal.length} answers, trying operator-list detection...`);

  // Pass 2: operator list detection (for PDFs with embedded glyph images)
  // Analyzes paintImageXObject positions to find answer number anchors
  const opListResults: DetectedAnswer[] = [];
  for (let p = startPage; p <= last; p++) {
    const { viewport } = await getPageTextItems(pdf, p);
    const opDetected = await detectAnswersByOperatorList(pdf, p, viewport, expectedCount || 20);
    opListResults.push(...opDetected);
  }

  // Deduplicate operator list results
  const opUnique = new Map<number, DetectedAnswer>();
  for (const a of opListResults) {
    const existing = opUnique.get(a.problemNumber);
    if (!existing || a.confidence > existing.confidence) opUnique.set(a.problemNumber, a);
  }
  const opFinal = [...opUnique.values()].sort((a, b) => a.problemNumber - b.problemNumber);

  // Use operator-list if it found more answers
  if (opFinal.length > textFinal.length) {
    console.log(`[detectAnswersOnPages] Operator-list: ${opFinal.length} answers (using this)`);

    if (debug) {
      for (const dp of debug.pages) {
        if (dp.pageNum >= startPage && dp.pageNum <= last) {
          dp.detectedAnswers = opFinal
            .filter((r: DetectedAnswer) => r.pageNumber === dp.pageNum)
            .map((r: DetectedAnswer) => ({ number: r.problemNumber, y: Math.round(r.y), column: r.column, text: r.answerText }));
          (dp as any).operatorListBased = true;
        }
      }
    }

    return opFinal;
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

  // 왼쪽에 여백을 추가하여 문제 번호/텍스트가 잘리지 않도록 함
  const leftPadding = 25; // PDF 좌표 기준 25pt 왼쪽 여유 (기존 15 → 25)
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
  const MIN_PIXELS = Math.max(2, Math.floor(width * 0.003));  // 얇은 선/글자 획도 콘텐츠로 인식 (기존 5 → 2)

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

  // Advanced: detect large empty gaps in bottom half to trim excess whitespace
  // This handles cases where sparse noise pixels below the actual content
  // prevent basic trimming from working properly
  const contentHeight = bottom - top;
  if (contentHeight > 100) {
    const scanStart = top + Math.floor(contentHeight * 0.45); // 더 아래에서부터 스캔 (기존 0.35)
    const gapThresholdPx = Math.max(50, Math.floor(contentHeight * 0.18)); // 더 큰 빈 공간만 잘라냄 (기존 30/0.12)
    let gapStart = -1;
    let currentGapStart = -1;
    let inGap = false;

    for (let y = scanStart; y <= bottom; y++) {
      if (rowCounts[y] < MIN_PIXELS) {
        if (!inGap) { currentGapStart = y; inGap = true; }
      } else {
        if (inGap) {
          const gapLen = y - currentGapStart;
          if (gapLen >= gapThresholdPx && gapStart === -1) {
            gapStart = currentGapStart;
          }
          inGap = false;
        }
      }
    }
    if (inGap) {
      const gapLen = bottom - currentGapStart;
      if (gapLen >= gapThresholdPx && gapStart === -1) {
        gapStart = currentGapStart;
      }
    }
    if (gapStart > 0) {
      bottom = gapStart;
    }
  }

  // Find left/right cols with content
  let left = 0, right = width - 1;
  while (left < width && colCounts[left] < MIN_PIXELS) left++;
  while (right > left && colCounts[right] < MIN_PIXELS) right--;

  if (top >= bottom || left >= right) return canvas.toDataURL('image/png');

  // 콘텐츠 주변 여백 (잘림 방지를 위해 넉넉하게)
  const padTop = 18;
  const padBottom = 20;
  const padLR = 15;
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

      // Calculate crop height:
      // - If answerEndY is set (operator-list/image-based): tight crop to answer only
      // - If answerEndY is NOT set (text-based): full height to next answer (includes 해설)
      let ansH: number;
      if (ans.answerEndY) {
        // Tight crop: operator-list detected answers (no explanations)
        ansH = ans.answerEndY - ans.y;
      } else if (nextY) {
        // Full height to next answer: includes explanations (해설) if present
        ansH = nextY - ans.y;
      } else {
        // Last answer in column: extend to near bottom of page
        ansH = Math.min(200, vp.height * 0.92 - ans.y);
      }
      // Minimum height to show at least one line
      ansH = Math.max(ansH, 20);
      const colW = vp.width / 2;

      // Start from column beginning to capture full answer including "N)" prefix
      const colStartX = ans.column === 0 ? 0 : vp.width / 2;
      const leftPad = 8;
      const topPad = 15; // generous top padding for superscripts, ascenders (trimWhitespace removes excess)

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
ction dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)![1];
  const bstr = atob(parts[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}
