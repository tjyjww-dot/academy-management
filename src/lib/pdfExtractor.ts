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
}

export interface DetectedAnswer {
  problemNumber: number;
  answerText: string;
  y: number;
  pageNumber: number;
  confidence: number;
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
const PROBLEM_PATTERNS = [
  /^(\d{1,3})\.\s/,
  /^(\d{1,3})\)\s/,
  /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/,
  /^문제?\s*(\d{1,3})/,
  /^\[(\d{1,3})\]/,
  /^Q\.?\s*(\d{1,3})/,
  /^제\s*(\d{1,3})\s*문/,
  /^(\d{1,3})[\.\)]\s*/,
  /^(\d{1,3})번/,
  /^\((\d{1,3})\)/,
];

const CIRCLED_NUMBER_MAP: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
  '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
};

// Answer detection patterns - matches "1. ②" or "1) 3" format
const ANSWER_PATTERNS = [
  /^(\d{1,3})\.\s*(.+)$/,
  /^(\d{1,3})\)\s*(.+)$/,
];

function detectProblemNumber(text: string): { number: number; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (let i = 0; i < PROBLEM_PATTERNS.length; i++) {
    const match = trimmed.match(PROBLEM_PATTERNS[i]);
    if (match) {
      let num: number;
      if (match[1] && CIRCLED_NUMBER_MAP[match[1]]) {
        num = CIRCLED_NUMBER_MAP[match[1]];
      } else {
        num = parseInt(match[1], 10);
      }
      if (num > 0 && num <= 200) {
        const confidence = i < 3 ? 0.9 : 0.7;
        return { number: num, confidence };
      }
    }
  }
  return null;
}

function detectAnswerNumber(text: string): { problemNumber: number; answerText: string; confidence: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const pattern of ANSWER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 200) {
        return {
          problemNumber: num,
          answerText: match[2] || '',
          confidence: 0.85,
        };
      }
    }
  }
  return null;
}

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

export async function detectProblemsOnPage(
  pdf: any,
  pageNum: number
): Promise<DetectedProblem[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  const detected: DetectedProblem[] = [];

  const sortedItems = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
    return a.y - b.y;
  });

  // Calculate average height for adaptive threshold
  const heights = items.map(i => i.height).filter(h => h > 0);
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b) / heights.length : 10;
  const yThreshold = Math.max(8, avgHeight * 0.8);

  const lines: { items: TextItem[]; y: number; minX: number; maxX: number }[] = [];
  let currentLine: TextItem[] = [];
  let currentY = -1;

  for (const item of sortedItems) {
    if (currentY < 0 || Math.abs(item.y - currentY) > yThreshold) {
      if (currentLine.length > 0) {
        const minX = Math.min(...currentLine.map(i => i.x));
        const maxX = Math.max(...currentLine.map(i => i.x + i.width));
        lines.push({ items: [...currentLine], y: currentY, minX, maxX });
      }
      currentLine = [item];
      currentY = item.y;
    } else {
      currentLine.push(item);
    }
  }
  if (currentLine.length > 0) {
    const minX = Math.min(...currentLine.map(i => i.x));
    const maxX = Math.max(...currentLine.map(i => i.x + i.width));
    lines.push({ items: [...currentLine], y: currentY, minX, maxX });
  }

  for (const line of lines) {
    const sortedByX = [...line.items].sort((a, b) => a.x - b.x);
    const firstItem = sortedByX[0];

    let lineStart = '';
    for (const item of sortedByX.slice(0, 3)) {
      lineStart += item.text;
    }

    const result = detectProblemNumber(lineStart) || detectProblemNumber(firstItem.text);
    if (result) {
      detected.push({
        number: result.number,
        pageNumber: pageNum,
        bbox: {
          x: 0,
          y: line.y,
          width: viewport.width,
          height: 0,
        },
        confidence: result.confidence,
      });
    }
  }

  detected.sort((a, b) => a.number - b.number);

  const unique: DetectedProblem[] = [];
  for (const d of detected) {
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

export async function detectAnswersOnPage(
  pdf: any,
  pageNum: number
): Promise<DetectedAnswer[]> {
  const { items, viewport } = await getPageTextItems(pdf, pageNum);
  const detected: DetectedAnswer[] = [];

  const sortedItems = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
    return a.y - b.y;
  });

  // Calculate average height for adaptive threshold
  const heights = items.map(i => i.height).filter(h => h > 0);
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b) / heights.length : 10;
  const yThreshold = Math.max(8, avgHeight * 0.8);

  const lines: { items: TextItem[]; y: number; minX: number; maxX: number }[] = [];
  let currentLine: TextItem[] = [];
  let currentY = -1;

  for (const item of sortedItems) {
    if (currentY < 0 || Math.abs(item.y - currentY) > yThreshold) {
      if (currentLine.length > 0) {
        const minX = Math.min(...currentLine.map(i => i.x));
        const maxX = Math.max(...currentLine.map(i => i.x + i.width));
        lines.push({ items: [...currentLine], y: currentY, minX, maxX });
      }
      currentLine = [item];
      currentY = item.y;
    } else {
      currentLine.push(item);
    }
  }
  if (currentLine.length > 0) {
    const minX = Math.min(...currentLine.map(i => i.x));
    const maxX = Math.max(...currentLine.map(i => i.x + i.width));
    lines.push({ items: [...currentLine], y: currentY, minX, maxX });
  }

  for (const line of lines) {
    const sortedByX = [...line.items].sort((a, b) => a.x - b.x);
    const firstItem = sortedByX[0];

    let lineStart = '';
    for (const item of sortedByX.slice(0, 3)) {
      lineStart += item.text;
    }

    const result = detectAnswerNumber(lineStart) || detectAnswerNumber(firstItem.text);
    if (result) {
      detected.push({
        problemNumber: result.problemNumber,
        answerText: result.answerText,
        y: line.y,
        pageNumber: pageNum,
        confidence: result.confidence,
      });
    }
  }

  detected.sort((a, b) => a.problemNumber - b.problemNumber);

  return detected;
}

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

  for (let i = 0; i < allProblems.length; i++) {
    const current = allProblems[i];
    const next = allProblems[i + 1];

    if (next && next.pageNumber === current.pageNumber) {
      current.bbox.height = next.bbox.y - current.bbox.y;
    } else {
      const page = await pdf.getPage(current.pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      current.bbox.height = viewport.height - current.bbox.y;
    }

    const padding = 10;
    current.bbox.y = Math.max(0, current.bbox.y - padding);
    current.bbox.height += padding;
  }

  return allProblems;
}

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

export async function extractProblemImage(
  pdf: any,
  problem: DetectedProblem,
  scale: number = 2.0
): Promise<string> {
  const fullCanvas = await renderPageToCanvas(pdf, problem.pageNumber, scale);

  const sx = problem.bbox.x * scale;
  const sy = problem.bbox.y * scale;
  const sw = problem.bbox.width * scale;
  const sh = problem.bbox.height * scale;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, sw);
  cropCanvas.height = Math.max(1, sh);

  const ctx = cropCanvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

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

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    if (onProgress) onProgress(i + 1, problems.length);

    const imageDataUrl = await extractProblemImage(pdf, problem, scale);

    results.push({
      id: `p${problem.pageNumber}-n${problem.number}`,
      number: problem.number,
      pageNumber: problem.pageNumber,
      imageDataUrl,
      bbox: problem.bbox,
    });
  }

  return results;
}

export async function extractAnswerImages(
  pdf: any,
  answers: DetectedAnswer[],
  scale: number = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedProblem[]> {
  const results: ExtractedProblem[] = [];
  const answerBboxMap: Record<number, DetectedAnswer> = {};

  // Map answers by problem number, keeping highest confidence
  for (const answer of answers) {
    if (!answerBboxMap[answer.problemNumber] || answer.confidence > answerBboxMap[answer.problemNumber].confidence) {
      answerBboxMap[answer.problemNumber] = answer;
    }
  }

  const uniqueAnswers = Object.values(answerBboxMap);

  for (let i = 0; i < uniqueAnswers.length; i++) {
    const answer = uniqueAnswers[i];
    if (onProgress) onProgress(i + 1, uniqueAnswers.length);

    try {
      const fullCanvas = await renderPageToCanvas(pdf, answer.pageNumber, scale);
      const viewport = fullCanvas.width;
      const itemHeight = 30 * scale; // Estimate answer line height

      const sx = 0;
      const sy = answer.y * scale;
      const sw = viewport;
      const sh = itemHeight;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, sw);
      cropCanvas.height = Math.max(1, sh);

      const ctx = cropCanvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const imageDataUrl = trimWhitespace(cropCanvas);

      results.push({
        id: `ans${answer.pageNumber}-n${answer.problemNumber}`,
        number: answer.problemNumber,
        pageNumber: answer.pageNumber,
        imageDataUrl,
        bbox: { x: 0, y: answer.y, width: viewport, height: itemHeight },
      });
    } catch (err) {
      console.error(`Failed to extract answer image for problem ${answer.problemNumber}:`, err);
    }
  }

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
