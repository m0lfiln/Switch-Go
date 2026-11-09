import { FORMATS } from './formats.js';

export class ConvError extends Error {
  constructor(key) { super(key); this.key = key; }
}

const CDN = 'https://cdn.jsdelivr.net/npm/';
const LIBS = {
  pdflib: [CDN + 'pdf-lib@1.17.1/dist/pdf-lib.min.js', CDN + '@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js'],
  pdfjs: [CDN + 'pdfjs-dist@3.11.174/build/pdf.min.js'],
  mammoth: [CDN + 'mammoth@1.8.0/mammoth.browser.min.js'],
  docx: [CDN + 'docx@8.5.0/build/index.umd.js'],
  xlsx: [CDN + 'xlsx@0.18.5/dist/xlsx.full.min.js'],
};
const PDFJS_WORKER = CDN + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const FONT_URL = CDN + 'dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';

const loadScript = (src) => new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => fail(new ConvError('net'));
  document.head.append(s);
});
const loaded = {};
function useLib(name) {
  loaded[name] ??= (async () => { for (const url of LIBS[name]) await loadScript(url); })()
    .catch((e) => { delete loaded[name]; throw e; });
  return loaded[name];
}


async function readText(file) {
  const buf = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('windows-1251').decode(buf); }
  return text.replace(/^\uFEFF/, '');
}
const textBlob = (text, type = 'text/plain;charset=utf-8') => new Blob([text], { type });


const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

async function toCanvas(file, flatten) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new ConvError('imgBroken'); }
  const canvas = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const ctx = canvas.getContext('2d');
  if (flatten) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return canvas;
}
const canvasBlob = (canvas, type, quality) => new Promise((ok, fail) =>
  canvas.toBlob((b) => (b && b.type === type ? ok(b) : fail(new ConvError('imgFormat'))), type, quality));

async function imageToPdf(file) {
  await useLib('pdflib');
  const canvas = await toCanvas(file, true);
  const bytes = new Uint8Array(await (await canvasBlob(canvas, MIME.jpg, 0.92)).arrayBuffer());
  const doc = await PDFLib.PDFDocument.create();
  const img = await doc.embedJpg(bytes);
  const page = doc.addPage([img.width * 0.75, img.height * 0.75]); // px → pt
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

async function imageToImage(file, target) {
  const canvas = await toCanvas(file, target === 'jpg');
  return canvasBlob(canvas, MIME[target], 0.92);
}


let fontBytes;
async function getFont() {
  if (!fontBytes) {
    try {
      const res = await fetch(FONT_URL);
      if (!res.ok) throw new Error();
      fontBytes = await res.arrayBuffer();
    } catch { throw new ConvError('net'); }
  }
  return fontBytes;
}

async function textToPdf(text) {
  await useLib('pdflib');
  const doc = await PDFLib.PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  const font = await doc.embedFont(await getFont(), { subset: true });
  const [W, H, M, size, lead] = [595.28, 841.89, 56, 11, 15.5];
  const maxW = W - 2 * M;
  const width = (s) => font.widthOfTextAtSize(s, size);

  const lines = [];
  for (const para of text.replace(/\r/g, '').replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (width(next) <= maxW) { line = next; continue; }
      if (line) lines.push(line);
      line = '';
      let rest = word;                       
      while (width(rest) > maxW) {
        let n = rest.length;
        while (n > 1 && width(rest.slice(0, n)) > maxW) n--;
        lines.push(rest.slice(0, n)); rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  const perPage = Math.floor((H - 2 * M) / lead);
  for (let i = 0; i < Math.max(lines.length, 1); i += perPage) {
    const page = doc.addPage([W, H]);
    lines.slice(i, i + perPage).forEach((l, j) =>
      page.drawText(l, { x: M, y: H - M - size - j * lead, size, font, color: PDFLib.rgb(0.11, 0.14, 0.12) }));
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}


async function pdfToText(file) {
  await useLib('pdfjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) { 
    try {
      const code = await (await fetch(PDFJS_WORKER)).text();
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    } catch { throw new ConvError('net'); }
  }
  let pdf;
  try { pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; }
  catch (e) { throw new ConvError(e?.name === 'PasswordException' ? 'pdfPassword' : 'pdfBroken'); }
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const { items } = await (await pdf.getPage(i)).getTextContent();
    pages.push(items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join('').replace(/ +\n/g, '\n').trim());
  }
  const text = pages.join('\n\n').trim();
  if (!text) throw new ConvError('pdfNoText');
  return text;
}

async function docxToText(file) {
  await useLib('mammoth');
  try { return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
  catch { throw new ConvError('docxBroken'); }
}

async function textToDocx(text) {
  await useLib('docx');
  const { Document, Packer, Paragraph, TextRun } = window.docx;
  const children = text.replace(/\r/g, '').split('\n').map((l) => new Paragraph({ children: [new TextRun(l)] }));
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}

async function csvToXlsx(file) {
  await useLib('xlsx');
  const wb = XLSX.read(await readText(file), { type: 'string' });
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
async function xlsxToCsv(file) {
  await useLib('xlsx');
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); }
  catch { throw new ConvError('xlsxBroken'); }
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
  return textBlob('\uFEFF' + csv, 'text/csv;charset=utf-8'); 
}


const isImage = (f) => ['jpg', 'png', 'webp', 'gif', 'bmp'].includes(f);

async function run(file, source, target) {
  if (isImage(source)) return target === 'pdf' ? imageToPdf(file) : imageToImage(file, target);
  if (source === 'csv') return csvToXlsx(file);
  if (source === 'xlsx') return xlsxToCsv(file);
  const text = source === 'txt' ? await readText(file) : source === 'pdf' ? await pdfToText(file) : await docxToText(file);
  if (target === 'txt') return textBlob(text);
  if (target === 'pdf') return textToPdf(text);
  return textToDocx(text);
}

export async function convert(file, source, target) {
  if (!FORMATS[source]?.targets.includes(target)) throw new ConvError('convUnavailable');
  try { return await run(file, source, target); }
  catch (e) {
    if (e instanceof ConvError) throw e;
    console.error(e);
    throw new ConvError('convFailed');
  }
}

export function resultName(originalName, target) {
  const base = originalName.replace(/\.[^.]+$/, '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'file';
  return `${base}.${target}`;
}
