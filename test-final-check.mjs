/**
 * Final check: verify Y positions and crop heights for both PDFs
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

function loadPdf(path) {
  const buf = readFileSync(path);
  return pdfjsLib.getDocument({ data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) }).promise;
}
function multiplyMatrix(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

function groupIntoLines(items) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y);
  const heights = items.map(i => i.height).filter(h => h > 0);
  const avgH = heights.length > 0 ? heights.reduce((a, b) => a + b) / heights.length : 10;
  const yTh = Math.max(4, avgH * 0.55);
  const lines = []; let cur = [sorted[0]], curY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curY) <= yTh) cur.push(sorted[i]);
    else { finLine(cur, curY, lines); cur = [sorted[i]]; curY = sorted[i].y; }
  }
  finLine(cur, curY, lines); return lines;
}
function finLine(items, y, lines) {
  if (!items.length) return;
  const sx = [...items].sort((a, b) => a.x - b.x);
  lines.push({ items: sx, y, minX: sx[0].x, text: sx.map(i => i.text).join(''), firstItemHeight: sx[0].height });
}

function detectTextAnswers(columnItems, pageNum, colIdx, colStartX) {
  if (columnItems.length < 2) return [];
  const lines = groupIntoLines(columnItems);
  const results = [];
  const headerKw = ['수학', '테스트', '시험', '답지', '답안', '정답'];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]; const sx = line.items;
    if (!sx.length) continue;
    const fullText = sx.map(i => i.text).join('').trim();
    if (fullText.length < 2) continue;
    if (headerKw.some(kw => fullText.includes(kw) && !fullText.match(/^\d{1,3}\)/))) continue;
    let ansNum = null, ansText = '', conf = 0, m;
    m = fullText.match(/^(\d{1,3})\)\s*(.*)$/);
    if (m) { ansNum = parseInt(m[1]); ansText = m[2] || ''; conf = 0.95; }
    if (ansNum && ansNum > 0 && ansNum <= 100) {
      if (!ansText) ansText = fullText.replace(/^\d{1,3}\)\s*/, '').trim();
      ansText = ansText.replace(/^답\s*/, '').trim();
      // FIX: Use visual top Y (baseline - textHeight)
      const textH = line.firstItemHeight || 10;
      const visualTopY = line.y - textH;
      results.push({ problemNumber: ansNum, answerText: ansText, y: visualTopY, x: line.minX,
        pageNumber: pageNum, confidence: conf, column: colIdx });
    }
  }
  return results;
}

// ===== PDF 1: Check text answers 9, 10, 11 Y positions =====
console.log('=== PDF 1: Text answer Y position check ===\n');
const pdf1 = await loadPdf('/sessions/gallant-intelligent-rubin/mnt/uploads/4월9일1-1-751f071a.pdf');
const p6 = await pdf1.getPage(6);
const vp6 = p6.getViewport({ scale: 1.0 });
const ph = vp6.height, pw = vp6.width, mid = pw / 2;
const tc = await p6.getTextContent();
const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({
  text: i.str, x: i.transform[4], y: ph - i.transform[5],
  width: i.width, height: i.height || Math.abs(i.transform[3]),
}));
const left = items.filter(i => i.x < mid), right = items.filter(i => i.x >= mid);
const textAns = [...detectTextAnswers(left, 6, 0, 0), ...detectTextAnswers(right, 6, 1, mid)];

// Also get operator-list answers for image-based
const opList = await p6.getOperatorList();
let ctmStack = [], ctm = [1,0,0,1,0,0];
const allImgs = [];
for (let i = 0; i < opList.fnArray.length; i++) {
  const op = opList.fnArray[i];
  if (op === OPS.save) ctmStack.push([...ctm]);
  else if (op === OPS.restore) ctm = ctmStack.pop() || [1,0,0,1,0,0];
  else if (op === OPS.transform) ctm = multiplyMatrix(ctm, opList.argsArray[i]);
  else if (op === OPS.paintImageXObject) {
    const pdfTop = ctm[3] >= 0 ? ctm[5] + ctm[3] : ctm[5];
    allImgs.push({ x: ctm[4], y: ph - pdfTop, width: Math.abs(ctm[0]), height: Math.abs(ctm[3]) });
  }
}

// Image answer #1 visual top for reference
const img1 = allImgs.filter(i => i.y > 95 && i.y < 115 && i.x < 70 && i.width < 20);
console.log('Image-based answer #1 visual top Y:', img1.length ? img1[0].y.toFixed(1) : 'not found');

// Text answers with adjusted Y
console.log('\nText answers (adjusted to visual top):');
for (const a of textAns) {
  console.log(`  #${a.problemNumber}: y=${a.y.toFixed(1)} (crop start: ${(a.y - 5).toFixed(1)})`);
}

// Compare: text answer #9 visual top should be close to other answers' visual top
// Answer #8 (image-based) at ~550, answer #9 (text) should be ~617
console.log('\nExpected: text answer Y values should represent visual TOP of text');
console.log('Answer #9 crop should include full "9)" text plus content below\n');
await pdf1.destroy();

// ===== PDF 2: 3-1 answer heights (should include 해설) =====
console.log('=== PDF 2: 3-1 answer heights (with 해설) ===\n');
const pdf2 = await loadPdf('/sessions/gallant-intelligent-rubin/mnt/uploads/3-1-8b2c8956.pdf');

const allAns = [];
for (let p = 9; p <= 12; p++) {
  const page = await pdf2.getPage(p);
  const vp = page.getViewport({ scale: 1.0 });
  const tc = await page.getTextContent();
  const its = tc.items.filter(i => i.str && i.str.trim()).map(i => ({
    text: i.str, x: i.transform[4], y: vp.height - i.transform[5],
    width: i.width, height: i.height || Math.abs(i.transform[3]),
  }));
  const m = vp.width / 2;
  allAns.push(...detectTextAnswers(its.filter(i => i.x < m), p, 0, 0));
  allAns.push(...detectTextAnswers(its.filter(i => i.x >= m), p, 1, m));
}

// Deduplicate
const unique = new Map();
for (const a of allAns) {
  const ex = unique.get(a.problemNumber);
  if (!ex || a.confidence > ex.confidence) unique.set(a.problemNumber, a);
}
const final = [...unique.values()].sort((a, b) => a.problemNumber - b.problemNumber);

console.log(`Total answers: ${final.length}`);

// Calculate heights (simulating extractAnswerImages logic)
const byPage = {};
for (const a of final) {
  if (!byPage[a.pageNumber]) byPage[a.pageNumber] = [];
  byPage[a.pageNumber].push(a);
}

console.log('\nAnswer heights (answerEndY NOT set → uses full nextY - y):');
for (const a of final) {
  const samePageCol = final.filter(f => f.pageNumber === a.pageNumber && f.column === a.column);
  const sorted = samePageCol.sort((x, y) => x.y - y.y);
  const idx = sorted.findIndex(s => s.problemNumber === a.problemNumber);
  const nextY = idx + 1 < sorted.length ? sorted[idx + 1].y : null;

  let ansH;
  if (a.answerEndY) ansH = a.answerEndY - a.y;
  else if (nextY) ansH = nextY - a.y;
  else ansH = 150; // last in column

  console.log(`  #${String(a.problemNumber).padStart(2)}: y=${a.y.toFixed(1)} h=${ansH.toFixed(1)}pt (p${a.pageNumber} ${a.answerEndY ? 'tight' : 'full'})`);
}

const nums = final.map(a => a.problemNumber).sort((a, b) => a - b);
const expected = Array.from({length: 30}, (_, i) => i + 1);
console.log('\n' + (JSON.stringify(nums) === JSON.stringify(expected) ? '✅ All 30 answers correct' : '❌ FAILED'));

await pdf2.destroy();
