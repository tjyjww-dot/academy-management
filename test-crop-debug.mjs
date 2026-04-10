import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const buf = readFileSync('/sessions/gallant-intelligent-rubin/mnt/uploads/4월9일1-1-751f071a.pdf');
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

// Get answer page (page 6)
const page = await pdf.getPage(6);
const vp = page.getViewport({ scale: 1.0 });
console.log(`Page 6 viewport: ${vp.width} x ${vp.height}`);

// Get operator list to find image positions for answers 10, 11
const opList = await page.getOperatorList();
const OPS_SAVE = 10, OPS_RESTORE = 11, OPS_TRANSFORM = 12, OPS_PAINT = 85;

let ctmStack = [[1,0,0,1,0,0]];
let currentCTM = [1,0,0,1,0,0];
let allImages = [];

function multiply(a, b) {
  return [
    a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
    a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
    a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5]
  ];
}

for (let i = 0; i < opList.fnArray.length; i++) {
  const fn = opList.fnArray[i];
  if (fn === OPS_SAVE) {
    ctmStack.push([...currentCTM]);
  } else if (fn === OPS_RESTORE) {
    currentCTM = ctmStack.pop() || [1,0,0,1,0,0];
  } else if (fn === OPS_TRANSFORM) {
    currentCTM = multiply(currentCTM, opList.argsArray[i]);
  } else if (fn === OPS_PAINT) {
    const ctm = currentCTM;
    const imgWidth = Math.abs(ctm[0]) || 1;
    const imgHeight = Math.abs(ctm[3]) || 1;
    const pdfVisualTop = ctm[3] >= 0 ? ctm[5] + ctm[3] : ctm[5];
    const topDownY = vp.height - pdfVisualTop;
    allImages.push({
      x: ctm[4], y: topDownY, w: imgWidth, h: imgHeight,
      rawCtm5: ctm[5], rawCtm3: ctm[3], pdfVisualTop
    });
  }
}

// Also get text items
const tc = await page.getTextContent();
let textItems = tc.items.filter(t => t.str && t.str.trim()).map(t => ({
  str: t.str.trim(),
  x: t.transform[4],
  y: vp.height - t.transform[5],
  h: t.height
}));

// Find items near answer 10 and 11
console.log('\n=== Text items containing "10" or "11" ===');
textItems.filter(t => /^1[01][\)\s]/.test(t.str) || t.str === '10' || t.str === '11').forEach(t => {
  console.log(`  "${t.str}" x=${t.x.toFixed(1)} y=${t.y.toFixed(1)} h=${t.h}`);
});

// Sort images by Y
allImages.sort((a,b) => a.y - b.y);
console.log('\n=== All images on answer page (sorted by Y) ===');
allImages.forEach((img, idx) => {
  console.log(`  #${idx}: x=${img.x.toFixed(1)} y=${img.y.toFixed(1)} w=${img.w.toFixed(1)} h=${img.h.toFixed(1)} | ctm[5]=${img.rawCtm5.toFixed(1)} ctm[3]=${img.rawCtm3.toFixed(1)}`);
});

// Now simulate our detection - what Y values do answers 9-12 get?
// Group images by approximate Y (within 3pt)
let groups = [];
for (const img of allImages) {
  let found = false;
  for (const g of groups) {
    if (Math.abs(g[0].y - img.y) < 3) {
      g.push(img);
      found = true;
      break;
    }
  }
  if (!found) groups.push([img]);
}

console.log('\n=== Image groups by Y (potential answer rows) ===');
groups.forEach((g, idx) => {
  const avgY = g.reduce((s,i) => s+i.y, 0) / g.length;
  console.log(`  Group ${idx}: y≈${avgY.toFixed(1)} (${g.length} images) x-range: [${g.map(i=>i.x.toFixed(0)).join(', ')}]`);
});

