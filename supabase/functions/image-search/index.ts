// Layanan pencarian gambar A.I.DRIY.
// Urutan penyedia: Serper (Google Images) -> Brave Image Search -> Wikimedia Commons.
// API key penyedia berbayar hanya disimpan sebagai secret Edge Function, tidak pernah dikirim ke HP.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

type ImageResult = {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  sourceUrl: string;
  domain: string;
  width: number | null;
  height: number | null;
};

class SearchError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TIMEOUT_MS = 9000;
const USER_AGENT = 'A.I.DRIY/1.0 (https://github.com/adriyarfiyfadilclash-lang/Aidriy-android)';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ---------- Validasi ----------
function httpUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null;
  try {
    const u = new URL(v.startsWith('//') ? `https:${v}` : v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
function cleanText(v: unknown, max = 160): string {
  if (typeof v !== 'string') return '';
  return v.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function finalize(items: Array<Partial<ImageResult>>, limit: number): ImageResult[] {
  const seen = new Set<string>();
  const out: ImageResult[] = [];
  for (const it of items) {
    const imageUrl = httpUrl(it.imageUrl);
    const sourceUrl = httpUrl(it.sourceUrl);
    if (!imageUrl || !sourceUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    out.push({
      imageUrl,
      thumbnailUrl: httpUrl(it.thumbnailUrl) || imageUrl,
      title: cleanText(it.title) || hostOf(sourceUrl),
      sourceUrl,
      domain: cleanText(it.domain, 80) || hostOf(sourceUrl),
      width: it.width ?? null,
      height: it.height ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function call(url: string, init: RequestInit, provider: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
    throw new SearchError(timeout ? `${provider} tidak merespons (timeout)` : `${provider} tidak dapat dihubungi`, 504, timeout ? 'timeout' : 'unreachable');
  }
  if (res.status === 429) throw new SearchError(`Batas pemakaian ${provider} tercapai, coba lagi nanti`, 429, 'rate_limited');
  if (res.status === 401 || res.status === 403) throw new SearchError(`API key ${provider} ditolak`, 502, 'bad_key');
  if (!res.ok) throw new SearchError(`${provider} gagal (HTTP ${res.status})`, 502, 'upstream_error');
  try {
    return await res.json();
  } catch {
    throw new SearchError(`Respons ${provider} tidak valid`, 502, 'bad_response');
  }
}

// ---------- Penyedia ----------
async function serper(q: string, limit: number, key: string): Promise<ImageResult[]> {
  const data = await call('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: Math.min(limit * 2, 30) }),
  }, 'Serper');
  const items = Array.isArray(data?.images) ? data.images : [];
  return finalize(items.map((r: any) => ({
    imageUrl: r.imageUrl,
    thumbnailUrl: r.thumbnailUrl,
    title: r.title,
    sourceUrl: r.link,
    domain: r.domain || r.source,
    width: num(r.imageWidth),
    height: num(r.imageHeight),
  })), limit);
}

async function brave(q: string, limit: number, key: string): Promise<ImageResult[]> {
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(q)}&count=${Math.min(limit * 2, 50)}&safesearch=strict`;
  const data = await call(url, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } }, 'Brave Search');
  const items = Array.isArray(data?.results) ? data.results : [];
  return finalize(items.map((r: any) => ({
    imageUrl: r.properties?.url,
    thumbnailUrl: r.thumbnail?.src,
    title: r.title,
    sourceUrl: r.url,
    domain: r.meta_url?.hostname || r.source,
    width: num(r.properties?.width),
    height: num(r.properties?.height),
  })), limit);
}

async function wikimedia(q: string, limit: number): Promise<ImageResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(Math.min(limit * 2, 30)),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'ObjectName|ImageDescription',
    iiurlwidth: '640',
  });
  const data = await call(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } }, 'Wikimedia Commons');
  const pages = Array.isArray(data?.query?.pages) ? [...data.query.pages] : [];
  pages.sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  return finalize(pages
    .filter((p: any) => /^image\/(jpeg|png|webp|gif)$/.test(p.imageinfo?.[0]?.mime || ''))
    .map((p: any) => {
      const ii = p.imageinfo[0];
      const name = cleanText(ii.extmetadata?.ObjectName?.value) || String(p.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
      return {
        imageUrl: ii.url,
        thumbnailUrl: ii.thumburl,
        title: name,
        sourceUrl: ii.descriptionurl,
        domain: 'commons.wikimedia.org',
        width: num(ii.width),
        height: num(ii.height),
      };
    }), limit);
}

// ---------- Pembatas sederhana per pengguna (per instance) ----------
const hits = new Map<string, number[]>();
function allow(user: string, perMinute = 30): boolean {
  const now = Date.now();
  const list = (hits.get(user) || []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) {
    hits.set(user, list);
    return false;
  }
  list.push(now);
  hits.set(user, list);
  return true;
}

function userFromJwt(req: Request): string | null {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'authenticated' && payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung', code: 'method' }, 405);

  // Tanda tangan JWT sudah diverifikasi gerbang Supabase (verify_jwt); di sini hanya pengguna yang login.
  const user = userFromJwt(req);
  if (!user) return json({ error: 'Harus login untuk mencari gambar', code: 'unauthorized' }, 401);
  if (!allow(user)) return json({ error: 'Terlalu banyak pencarian. Tunggu sebentar.', code: 'rate_limited' }, 429);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body harus JSON', code: 'bad_request' }, 400);
  }
  const query = cleanText(body?.query, 200);
  const limit = Math.max(1, Math.min(Number(body?.limit) || 8, 12));
  if (query.length < 2) return json({ error: 'Kata kunci terlalu pendek', code: 'bad_request' }, 400);

  const serperKey = Deno.env.get('SERPER_API_KEY');
  const braveKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
  const chain: Array<{ name: string; run: () => Promise<ImageResult[]> }> = [];
  if (serperKey) chain.push({ name: 'serper', run: () => serper(query, limit, serperKey) });
  if (braveKey) chain.push({ name: 'brave', run: () => brave(query, limit, braveKey) });
  chain.push({ name: 'wikimedia', run: () => wikimedia(query, limit) });

  const errors: string[] = [];
  let lastStatus = 502;
  for (const p of chain) {
    try {
      const results = await p.run();
      if (results.length) return json({ query, provider: p.name, results });
      errors.push(`${p.name}: tidak ada hasil`);
    } catch (e) {
      const err = e as SearchError;
      errors.push(`${p.name}: ${err.message}`);
      lastStatus = err.status || 502;
    }
  }
  const noResults = errors.every((e) => e.endsWith('tidak ada hasil'));
  if (noResults) return json({ query, provider: chain[chain.length - 1].name, results: [], message: 'Tidak ada gambar yang cocok' });
  return json({ error: 'Pencarian gambar gagal', code: 'failed', details: errors }, lastStatus);
});
