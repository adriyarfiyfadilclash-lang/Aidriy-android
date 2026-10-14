// Layanan pencarian gambar: memanggil Edge Function `image-search` di Supabase.
// API key penyedia pencarian ada di backend, bukan di HP.
import { supabase } from '../supabase';

const TIMEOUT_MS = 20000;

export class ImageSearchError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function validUrl(u) {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// Validasi ulang di sisi aplikasi: hanya hasil dengan URL gambar & halaman sumber yang sah yang ditampilkan.
export function sanitizeResults(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const imageUrl = validUrl(r?.imageUrl);
    const sourceUrl = validUrl(r?.sourceUrl);
    if (!imageUrl || !sourceUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    let domain = typeof r.domain === 'string' && r.domain ? r.domain : '';
    if (!domain) {
      try {
        domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
      } catch {
        domain = '';
      }
    }
    out.push({
      imageUrl,
      thumbnailUrl: validUrl(r.thumbnailUrl) || imageUrl,
      title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 160) : domain,
      sourceUrl,
      domain,
      width: Number(r.width) || null,
      height: Number(r.height) || null,
    });
  }
  return out;
}

export const PROVIDER_LABEL = {
  serper: 'Google Images (Serper)',
  brave: 'Brave Search',
  wikimedia: 'Wikimedia Commons',
};

async function readError(error) {
  // FunctionsHttpError menyimpan Response di error.context
  const res = error?.context;
  if (res && typeof res.json === 'function') {
    try {
      const body = await res.json();
      const status = res.status;
      const code = body?.code || (status === 429 ? 'rate_limited' : 'failed');
      let msg = body?.error || `layanan gagal (HTTP ${status})`;
      if (Array.isArray(body?.details) && body.details.length) msg = body.details.map((d) => d.replace(/^\w+:\s*/, '')).join('; ');
      return new ImageSearchError(msg, code);
    } catch {
      return new ImageSearchError(`Layanan gambar gagal (HTTP ${res.status})`, 'failed');
    }
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(error?.message || '')) {
    return new ImageSearchError('Tidak ada koneksi ke layanan pencarian gambar', 'network');
  }
  return new ImageSearchError(error?.message || 'Pencarian gambar gagal', 'failed');
}

/** @returns {Promise<{query:string, provider:string, results:Array, message?:string}>} */
export async function searchImages(query, { limit = 8 } = {}) {
  const q = String(query || '').trim().slice(0, 200);
  if (q.length < 2) throw new ImageSearchError('Kata kunci gambar terlalu pendek', 'bad_request');

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ImageSearchError('Pencarian gambar terlalu lama (timeout)', 'timeout')), TIMEOUT_MS);
  });
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('image-search', { body: { query: q, limit } }),
      timeout,
    ]);
    if (error) throw await readError(error);
    if (!data || typeof data !== 'object') throw new ImageSearchError('Respons layanan gambar tidak valid', 'bad_response');
    return {
      query: q,
      provider: typeof data.provider === 'string' ? data.provider : '',
      results: sanitizeResults(data.results),
      message: data.message,
    };
  } catch (e) {
    if (e instanceof ImageSearchError) throw e;
    throw await readError(e);
  } finally {
    clearTimeout(timer);
  }
}
