/**
 * Debug: Check text item Y positions for answers 9, 10, 11
 * and understand why their tops get cut off.
 * Also analyze 3-1.pdf answer+explanation structure.
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

function loadPdf(path) {
  const buf = readFileSync(path);
  return pdfjsLib.getDocument({ data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) }).promise;
}

// ===== PDF 1: Check text answers 9, 10, 11 =====
console.log('=== PDF 1: Text answer positions (9, 10, 11) ===\n');

const pdf1 = await loadPdf('/sessions/gallant-intelligent-rubin/mnt/uploads/4월9일1-1-751f071a.pdf');
const p6 = await pdf1.getPage(6);
const vp6 = p6.getViewport({ scale: 1.0 });
const ph = vp6.height;
const pw = vp6.width;

const tc6 = await p6.getTextContent();
const allItems = tc6.items
  .filter(i => i.str && i.str.trim())
  .map(i => ({
    text: i.str, x: i.transform[4],
    y: ph - i.transform[5],
    height: i.height || Math.abs(i.transform[3]),
    fontName: i.fontName,
    rawTransformY: i.transform[5],
  }));

// Find "9)", "10)", "11)" text items
for (const item of allItems) {
  if (item.text.match(/^\d{1,2}\)/)) {
    console.log(`"${item.text}": x=${item.x.toFixed(1)} y(top-down)=${item.y.toFixed(1)} height=${item.height.toFixed(1)} rawY=${item.rawTransformY.toFixed(1)}`);
    console.log(`  → Crop should start at y=${(item.y - item.height - 5).toFixed(1)} (text baseline ${item.y.toFixed(1)} - height ${item.height.toFixed(1)} - pad 5)`);
    console.log(`  → Current crop starts at y=${(item.y - 5).toFixed(1)} (y - topPad=5)`);
  }
}

// Also check what operator-list gives for these same answers
const opList = await p6.getOperatorList();
const ops = opList.fnArray;
const args = opList.argsArray;
let ctmStack = [];
let ctm = [1, 0, 0, 1, 0, 0];
function multiplyMatrix(a, b) {
  return [
    a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
    a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
    a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5],
  ];
}

const images = [];
for (let i = 0; i < ops.length; i++) {
  const op = ops[i];
  if (op === OPS.save) ctmStack.push([...ctm]);
  else if (op === OPS.restore) ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
  else if (op === OPS.transform) ctm = multiplyMatrix(ctm, args[i]);
  else if (op === OPS.paintImageXObject) {
    const pdfVisualTop = ctm[3] >= 0 ? ctm[5] + ctm[3] : ctm[5];
    images.push({ x: ctm[4], y: ph - pdfVisualTop, width: Math.abs(ctm[0]), height: Math.abs(ctm[3]) });
  }
}

// Image-based answers near y=100 (answer 1)
console.log('\nImage answer #1 position for comparison:');
const ans1Imgs = images.filter(img => img.y > 95 && img.y < 115 && img.x < 80 && img.width < 25);
for (const img of ans1Imgs) {
  console.log(`  Image: x=${img.x.toFixed(1)} y=${img.y.toFixed(1)} h=${img.height.toFixed(1)}`);
}

console.log('\nKey insight: Text items report Y as BASELINE position (bottom of text).');
console.log('The text Y in pdfjs is the baseline, not the top of the character.');
console.log('So for text "9)" at y=626.0 with height=8.2:');
console.log(`  Visual TOP of text = ${(626.0 - 8.2).toFixed(1)} (y - height)`);
console.log(`  Visual BOTTOM of text = 626.0 (y = baseline)`);
console.log(`  Crop should start at: ${(626.0 - 8.2 - 5).toFixed(1)} (visualTop - 5 padding)`);

await pdf1.destroy();

// ===== PDF 2: 3-1 answer+explanation structure =====
console.log('\n\n=== PDF 2: 3-1 answer+explanation structure ===\n');

const pdf2 = await loadPdf('/sessions/gallant-intelligent-rubin/mnt/uploads/3-1-8b2c8956.pdf');

// Check page 9 (first answer page) structure
const p9 = await pdf2.getPage(9);
const vp9 = p9.getViewport({ scale: 1.0 });
const ph2 = vp9.height;
const pw2 = vp9.width;
const mid2 = pw2 / 2;

const tc9 = await p9.getTextContent();
const items9 = tc9.items
  .filter(i => i.str && i.str.trim())
  .map(i => ({
    text: i.str, x: i.transform[4],
    y: ph2 - i.transform[5],
    height: i.height || Math.abs(i.transform[3]),
    fontName: i.fontName,
  }));

// Show answer+explanation structure for first few answers
const leftItems = items9.filter(i => i.x < mid2).sort((a, b) => a.y - b.y);

console.log('Left column items (first 60 lines):');
let prevY = 0;
let count = 0;
for (const item of leftItems) {
  if (count > 60) break;
  const gap = item.y - prevY;
  const marker = item.text.match(/^\d{1,2}\)\s*답/) ? '★ANS★' : item.text.includes('해설') ? '★해설★' : '';
  if (gap > 10 || marker) console.log('---');
  console.log(`  y=${item.y.toFixed(1)} h=${item.height.toFixed(1)} "${item.text.substring(0, 40)}" ${marker}`);
  prevY = item.y;
  count++;
}

// For answer 1: find where answer starts and where next answer starts
console.log('\n\n--- Answer 1 boundaries ---');
const ans1Start = items9.find(i => i.text.match(/^1\)\s*답/));
const ans2Start = items9.find(i => i.text.match(/^2\)\s*답/));
const haesul1 = leftItems.find(i => i.y > (ans1Start?.y || 0) && i.text.includes('해설'));
console.log(`Answer 1 start: y=${ans1Start?.y?.toFixed(1)}`);
console.log(`해설 after answer 1: y=${haesul1?.y?.toFixed(1)}`);
console.log(`Answer 2 start: y=${ans2Start?.y?.toFixed(1)}`);
console.log(`Full height (ans1 to ans2): ${ans2Start && ans1Start ? (ans2Start.y - ans1Start.y).toFixed(1) : 'N/A'}`);
console.log(`Answer-only height (ans1 to 해설): ${haesul1 && ans1Start ? (haesul1.y - ans1Start.y).toFixed(1) : 'N/A'}`);

await pdf2.destroy();
