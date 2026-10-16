// Ambil teks dari dokumen: file teks dibaca langsung; PDF lewat lapisan teks pdf.js,
// dan halaman hasil scan (tanpa teks) dibaca dengan NVIDIA Nemotron Parse.
import { parsePage } from './nvidiaTools';

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|csv|x-sh|sql))/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|kt|c|cpp|h|cs|go|rs|php|rb|sql|ya?ml|toml|sh|swift|dart|log|ini|cfg|env)$/i;
const MAX_PARSE_PAGES = 25;

export function isTextLike(name, mime) {
  return TEXT_MIME.test(mime || '') || TEXT_EXT.test(name || '');
}
export function isPdf(name, mime) {
  return mime === 'application/pdf' || /\.pdf$/i.test(name || '');
}

let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      }
    );
  }
  return pdfjsPromise;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Render halaman PDF ke JPEG yang memenuhi syarat Nemotron Parse (min 1024×1280, maks 1648×2048, < ±140 KB). */
async function renderPage(page) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1600 / base.width, 2000 / base.height);
  const vp = page.getViewport({ scale });
  const W = Math.max(1024, Math.ceil(vp.width));
  const H = Math.max(1280, Math.ceil(vp.height));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  // Abu-abu menghemat ukuran tanpa mengurangi keterbacaan teks.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  for (const q of [0.72, 0.6, 0.48, 0.38, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', q);
    const data = url.slice(url.indexOf(',') + 1);
    if (data.length <= 185_000) return data;
  }
  throw new Error('Halaman terlalu rumit untuk dibaca (gambar terlalu besar).');
}

function pageText(content) {
  // Gabungkan potongan teks pdf.js per baris
  let out = '';
  let lastY = null;
  for (const it of content.items) {
    if (!('str' in it)) continue;
    const y = Math.round(it.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
    else if (out && !out.endsWith(' ') && it.str && !it.str.startsWith(' ')) out += ' ';
    out += it.str;
    lastY = y;
    if (it.hasEOL) out += '\n';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Ekstrak teks dari PDF (base64).
 * opts: { key (API key NVIDIA, opsional), forceParse, onProgress({page, pages, mode}) , signal }
 * Hasil: text, pages, parsedPages, skippedPages
 */
export async function pdfToText(b64, { key, forceParse = false, onProgress, signal } = {}) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: b64ToBytes(b64), isEvalSupported: false }).promise;
  const parts = [];
  let parsedPages = 0;
  let skippedPages = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      const page = await doc.getPage(n);
      let text = pageText(await page.getTextContent());
      const needsParse = forceParse || text.replace(/\s/g, '').length < 60;
      if (needsParse && key && parsedPages < MAX_PARSE_PAGES) {
        onProgress?.({ page: n, pages: doc.numPages, mode: 'parse' });
        try {
          const md = await parsePage(key, { mime: 'image/jpeg', data: await renderPage(page), signal });
          if (md) text = md;
          parsedPages += 1;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          if (!text) skippedPages += 1;
        }
      } else {
        onProgress?.({ page: n, pages: doc.numPages, mode: 'text' });
        if (needsParse && !text) skippedPages += 1;
      }
      if (text) parts.push(doc.numPages > 1 ? `--- Halaman ${n} ---\n${text}` : text);
      page.cleanup();
    }
    return { text: parts.join('\n\n'), pages: doc.numPages, parsedPages, skippedPages };
  } finally {
    doc.destroy();
  }
}

/** Teks dari lampiran/berkas umum. Mengembalikan '' bila jenisnya tidak didukung. */
export async function extractText({ name, mime, data }, opts = {}) {
  if (!data) return { text: '' };
  if (isPdf(name, mime)) return pdfToText(data, opts);
  if (isTextLike(name, mime)) {
    const bytes = b64ToBytes(data);
    return { text: new TextDecoder().decode(bytes).slice(0, 400_000) };
  }
  return { text: '' };
}
