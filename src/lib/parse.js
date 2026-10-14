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
  const tags = ['<artifact', '<memory', '</memory'];
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
    let kind = (attr(a, 'type') || 'code').toLowerCase();
    const language = (attr(a, 'language') || '').toLowerCase();
    if (kind === 'code' && (language === 'html' || language === 'svg')) kind = language;
    if (!['html', 'svg', 'markdown', 'code'].includes(kind)) kind = 'code';
    segs.push({
      type: 'artifact',
      title: attr(a, 'title') || 'Artefak',
      kind,
      language: language || (kind === 'code' ? 'text' : kind),
      content: stripFences(m[2]),
      complete: m[3].toLowerCase() === '</artifact>',
      index: idx++,
    });
    last = re.lastIndex;
    if (m[3] === '') break;
  }
  if (last < text.length) segs.push({ type: 'text', text: text.slice(last) });
  return segs.filter((s) => s.type === 'artifact' || s.text.trim());
}

export function plainText(raw) {
  return splitSegments(raw)
    .map((s) => (s.type === 'text' ? s.text : `[Artefak: ${s.title}]`))
    .join('\n')
    .trim();
}

// Untuk dibacakan: tanpa simbol Markdown dan tanpa isi artefak.
export function speakableText(raw) {
  return plainText(raw)
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
