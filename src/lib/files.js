// Mengubah berkas pilihan pengguna menjadi lampiran yang siap dikirim ke AI.

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 120000;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|kt|c|cpp|h|cs|go|rs|php|rb|sql|yaml|yml|toml|ini|log|sh|swift|dart|vue|svelte)$/i;

function readAs(file, how) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Gagal membaca berkas'));
    if (how === 'text') r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak bisa dibuka'));
    img.src = src;
  });
}

async function resizeDataUrl(src, max, quality) {
  const img = await loadImage(src);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

const stripPrefix = (dataUrl) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function imageFromBase64({ name, mime, data }) {
  const src = `data:${mime};base64,${data}`;
  const big = await resizeDataUrl(src, 1600, 0.85);
  const thumb = await resizeDataUrl(src, 320, 0.7);
  return { id: crypto.randomUUID(), kind: 'image', name, mime: 'image/jpeg', data: stripPrefix(big), thumb, size: Math.round((stripPrefix(big).length * 3) / 4) };
}

export async function fileToAttachment(file) {
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" lebih dari 20 MB.`);
  const id = crypto.randomUUID();
  const type = file.type || '';
  if (type.startsWith('image/') && !/svg/.test(type)) {
    const dataUrl = await readAs(file, 'data');
    return imageFromBase64({ name: file.name, mime: type, data: stripPrefix(dataUrl) });
  }
  if (type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const dataUrl = await readAs(file, 'data');
    return { id, kind: 'pdf', name: file.name, mime: 'application/pdf', data: stripPrefix(dataUrl), size: file.size };
  }
  if (type.startsWith('text/') || TEXT_EXT.test(file.name) || /svg|json|xml|javascript/.test(type)) {
    let text = await readAs(file, 'text');
    let truncated = false;
    if (text.length > MAX_TEXT) {
      text = text.slice(0, MAX_TEXT);
      truncated = true;
    }
    return { id, kind: 'text', name: file.name, mime: type || 'text/plain', text: truncated ? `${text}\n…[dipotong]` : text, size: file.size };
  }
  throw new Error(`Jenis berkas "${file.name}" belum didukung. Gunakan gambar, PDF, atau berkas teks/kode.`);
}

export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Data yang disimpan ke database (tanpa isi base64 yang besar).
export function attachmentMeta(a, path) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    mime: a.mime,
    size: a.size,
    thumb: a.thumb || null,
    text: a.kind === 'text' ? a.text : undefined,
    path: path || null,
  };
}
