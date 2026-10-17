// Relay untuk endpoint AI kustom milik pengguna (kompatibel OpenAI / Anthropic).
// Dipakai hanya bila endpoint tidak mengizinkan panggilan langsung dari aplikasi (CORS).
// API key dikirim per permintaan lewat `x-provider-key`, diteruskan ke endpoint, dan TIDAK disimpan atau dicatat.

const MAX_BODY = 12 * 1024 * 1024;
const RATE = new Map<string, number[]>();
const LIMIT_PER_MIN = 40;
const ALLOWED_PATH = /\/(chat\/completions|messages|models)$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-provider-key, x-target-url, x-auth-style, x-upstream-anthropic-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-type',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

function userId(req: Request): string | null {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'authenticated' && payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

function limited(uid: string) {
  const now = Date.now();
  const list = (RATE.get(uid) || []).filter((t) => now - t < 60_000);
  list.push(now);
  RATE.set(uid, list);
  return list.length > LIMIT_PER_MIN;
}

// Tolak alamat internal/privat supaya relay tidak bisa dipakai menjangkau jaringan dalam.
function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.supabase.co') && h.startsWith('db.')) return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (h.includes(':')) {
    if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:')) return true;
  }
  return false;
}

async function resolvesPrivate(host: string): Promise<boolean> {
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
  try {
    const recs = [
      ...(await Deno.resolveDns(host, 'A').catch(() => [] as string[])),
      ...(await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])),
    ];
    return recs.some((ip) => blockedHost(ip));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const uid = userId(req);
  if (!uid) return json(401, { error: { message: 'Masuk ke akun A.I.DRIY dulu.' } });
  if (limited(uid)) return json(429, { error: { message: 'Terlalu banyak permintaan lewat relay dalam semenit. Tunggu sebentar.' } });

  let target: URL;
  try {
    target = new URL(req.headers.get('x-target-url') || '');
  } catch {
    return json(400, { error: { message: 'Alamat endpoint tidak valid.' } });
  }
  if (target.protocol !== 'https:') return json(400, { error: { message: 'Relay hanya untuk alamat https://.' } });
  if (target.username || target.password) return json(400, { error: { message: 'Alamat endpoint tidak boleh berisi nama pengguna/sandi.' } });
  if (!ALLOWED_PATH.test(target.pathname)) return json(400, { error: { message: 'Jalur tidak diizinkan.' } });
  if (blockedHost(target.hostname) || (await resolvesPrivate(target.hostname))) {
    return json(400, { error: { message: 'Alamat jaringan lokal/privat tidak bisa dipakai lewat relay.' } });
  }

  const isPost = req.method === 'POST';
  let body: string | undefined;
  if (isPost) {
    body = await req.text();
    if (body.length > MAX_BODY) return json(413, { error: { message: 'Permintaan terlalu besar (lampiran terlalu besar).' } });
  }

  const key = req.headers.get('x-provider-key') || '';
  const style = req.headers.get('x-auth-style') || 'bearer';
  const headers: Record<string, string> = {
    accept: isPost ? 'text/event-stream, application/json' : 'application/json',
    'user-agent': 'AIDRIY-relay/1.0',
  };
  if (isPost) headers['content-type'] = 'application/json';
  if (key && style !== 'none') {
    if (style === 'x-api-key') headers['x-api-key'] = key;
    else if (style === 'api-key') headers['api-key'] = key;
    else headers.Authorization = `Bearer ${key}`;
  }
  const av = req.headers.get('x-upstream-anthropic-version');
  if (av && /^[\d-]{6,12}$/.test(av)) headers['anthropic-version'] = av;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { method: isPost ? 'POST' : 'GET', headers, body, signal: req.signal, redirect: 'manual' });
  } catch (e) {
    return json(502, { error: { message: `Endpoint tidak bisa dihubungi: ${(e as Error).message}` } });
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    return json(502, { error: { message: 'Endpoint mengalihkan ke alamat lain. Periksa alamat dasar endpoint.' } });
  }

  const out = new Headers(CORS);
  out.set('content-type', upstream.headers.get('content-type') || 'application/json');
  out.set('cache-control', 'no-cache');
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
