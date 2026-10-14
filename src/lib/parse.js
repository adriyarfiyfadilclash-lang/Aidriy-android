// Memecah jawaban AI menjadi teks biasa dan artefak, serta mengambil tag memori.

function attr(src, name) {
  const m = src.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || src.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? m[1] : '';
}

function stripFences(s) {
  let t = s.replace(/^\s*\n/, '').replace(/\s+$/, '');
  const m = t.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  if (m) t = m[1];
  return t;
}

// Buang potongan tag yang belum lengkap di akhir teks saat streaming.
function trimPartialTag(text) {
  const tags = ['<artifact', '<memory', '</memory', '<image_search'];
  const lt = text.lastIndexOf('<');
  if (lt === -1) return text;
  const tail = text.slice(lt);
  if (tail.includes('>')) return text;
  if (tags.some((t) => t.startsWith(tail.toLowerCase()) || tail.toLowerCase().startsWith(t))) return text.slice(0, lt);
  return text;
}

export function extractMemories(text) {
  const memories = [];
  const clean = text.replace(/<memory>([\s\S]*?)<\/memory>/gi, (_, m) => {
    const v = m.trim();
    if (v) memories.push(v);
    return '';
  });
  return { clean: clean.replace(/<memory>[\s\S]*$/i, '').replace(/\n{3,}/g, '\n\n').trimEnd(), memories };
}

export function cleanForDisplay(text) {
  return extractMemories(trimPartialTag(text || '')).clean;
}

// Jenis Canvas yang didukung: document (Markdown), code, html, svg.
export function normalizeKind(type, language = '') {
  const t = String(type || '').toLowerCase();
  if (t === 'html' || t === 'svg') return t;
  if (t === 'document' || t === 'markdown' || t === 'text' || t === 'doc') return 'document';
  if (t === 'code') return language === 'html' ? 'html' : language === 'svg' ? 'svg' : 'code';
  return language ? 'code' : 'document';
}

/** Ganti isi artefak lama di riwayat dengan penanda (isi terbaru dikirim lewat daftar Canvas aktif). */
export function collapseArtifacts(raw) {
  return String(raw || '').replace(/<artifact\b([^>]*)>[\s\S]*?(<\/artifact>|$)/gi, (_, a) => {
    const title = attr(a, 'title') || 'Canvas';
    return `[Canvas "${title}" — isi terbarunya ada di bagian Canvas aktif]`;
  });
}

/** @returns {Array<{type:'text', text:string} | {type:'artifact', title, kind, language, content, complete:boolean, index:number}>} */
export function splitSegments(raw) {
  const text = cleanForDisplay(raw);
  const segs = [];
  const re = /<artifact\b([^>]*)>([\s\S]*?)(<\/artifact>|$)/gi;
  let last = 0;
  let m;
  let idx = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ type: 'text', text: text.slice(last, m.index) });
    const a = m[1];
    const language = (attr(a, 'language') || '').toLowerCase();
    const kind = normalizeKind(attr(a, 'type'), language);
    const action = (attr(a, 'action') || 'create').toLowerCase() === 'update' ? 'update' : 'create';
    segs.push({
      type: 'artifact',
      action,
      id: attr(a, 'id').trim() || null,
      title: (attr(a, 'title') || 'Canvas').slice(0, 120),
      kind,
      language: kind === 'code' ? language || 'text' : kind,
      content: stripFences(m[2]),
      complete: m[3].toLowerCase() === '</artifact>',
      index: idx++,
    });
    last = re.lastIndex;
    if (m[3] === '') break;
  }
  if (last < text.length) segs.push({ type: 'text', text: text.slice(last) });
  return segs.flatMap(splitImageTags).filter((s) => s.type !== 'text' || s.text.trim());
}

// Tag <image_search query="..." /> menandai tempat galeri hasil pencarian gambar nyata.
export const IMAGE_TAG = /<image_search\b([^>]*?)\/?>(?:\s*<\/image_search>)?/gi;

function splitImageTags(seg) {
  if (seg.type !== 'text' || !/<image_search/i.test(seg.text)) return [seg];
  const out = [];
  let last = 0;
  for (const m of seg.text.matchAll(IMAGE_TAG)) {
    if (m.index > last) out.push({ type: 'text', text: seg.text.slice(last, m.index) });
    const query = attr(m[1], 'query').trim();
    if (query) out.push({ type: 'images', query });
    last = m.index + m[0].length;
  }
  if (last < seg.text.length) out.push({ type: 'text', text: seg.text.slice(last) });
  return out;
}

/** Semua kata kunci gambar yang sudah lengkap ditulis model. */
export function imageQueries(raw) {
  const qs = [];
  for (const m of (raw || '').matchAll(IMAGE_TAG)) {
    const q = attr(m[1], 'query').trim();
    if (q && !qs.some((x) => x.toLowerCase() === q.toLowerCase())) qs.push(q);
  }
  return qs;
}

const CITE = /\[(\d+)\]\(#cite-\d+\)/g;

export function plainText(raw) {
  return splitSegments(raw)
    .filter((s) => s.type !== 'images')
    .map((s) => (s.type === 'text' ? s.text.replace(CITE, '[$1]') : `[Canvas: ${s.title}]`))
    .join('\n')
    .trim();
}

// Untuk dibacakan: tanpa simbol Markdown dan tanpa isi artefak.
export function speakableText(raw) {
  return plainText(raw)
    .replace(/\[\d+\]/g, '')
    .replace(/```[\s\S]*?```/g, ' (blok kode) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .trim();
}
