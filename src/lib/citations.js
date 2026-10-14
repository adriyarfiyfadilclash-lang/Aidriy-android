// Mengelola daftar sumber (tanpa duplikat) dan penanda sitasi [n] di teks jawaban.

export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    [...url.searchParams.keys()].forEach((k) => {
      if (/^utm_|^ref$|^fbclid$|^gclid$/i.test(k)) url.searchParams.delete(k);
    });
    url.hostname = url.hostname.toLowerCase();
    let s = url.toString();
    if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}

export function sourceDomain(s) {
  try {
    const host = new URL(s.url).hostname.replace(/^www\./, '');
    // Tautan grounding Gemini adalah pengalihan; judulnya berisi domain asli.
    if (/vertexaisearch|grounding-api-redirect/.test(s.url) && s.title && !/\s/.test(s.title)) return s.title;
    return host;
  } catch {
    return '';
  }
}

export function sourceTitle(s) {
  const t = (s.title || '').trim();
  if (!t || t === s.url) return sourceDomain(s);
  return t;
}

/** Tambah sumber bila belum ada; kembalikan nomor sitasi (mulai 1). */
export function addSource(sources, s) {
  if (!s?.url || !/^https?:\/\//i.test(s.url)) return 0;
  const key = normalizeUrl(s.url);
  const i = sources.findIndex((x) => normalizeUrl(x.url) === key);
  if (i >= 0) {
    if ((!sources[i].title || sources[i].title === sources[i].url) && s.title) sources[i].title = s.title;
    return i + 1;
  }
  sources.push({ url: s.url, title: s.title || s.url });
  return sources.length;
}

export const marker = (nums) => [...new Set(nums)].sort((a, b) => a - b).map((n) => `[${n}](#cite-${n})`).join('');

const LINK_ONLY = /^\s*\(?\s*\[[^\]]*\]\([^)]*\)\s*\)?\s*$/;

function insideCode(text, idx) {
  const before = text.slice(0, idx);
  const fences = (before.match(/```/g) || []).length;
  const openArtifact = before.lastIndexOf('<artifact') > before.lastIndexOf('</artifact>');
  return fences % 2 === 1 || openArtifact;
}

/**
 * Sisipkan penanda setelah potongan teks yang didukung sumber.
 * @param {string} text
 * @param {Array<{snippet:string, n:number}>} cites
 */
export function applySnippetCitations(text, cites) {
  if (!cites.length) return text;
  const groups = new Map();
  for (const c of cites) {
    const snip = (c.snippet || '').trim();
    if (!snip || !c.n) continue;
    if (!groups.has(snip)) groups.set(snip, []);
    groups.get(snip).push(c.n);
  }
  let out = text;
  for (const [snip, nums] of groups) {
    const idx = out.indexOf(snip);
    if (idx < 0 || insideCode(out, idx)) continue;
    const m = marker(nums);
    if (LINK_ONLY.test(snip)) {
      // Tautan sumber bawaan model diganti dengan penanda ringkas.
      out = out.slice(0, idx) + m + out.slice(idx + snip.length);
    } else {
      const end = idx + snip.length;
      if (out.slice(end, end + m.length) === m) continue;
      out = out.slice(0, end) + m + out.slice(end);
    }
  }
  return out;
}
