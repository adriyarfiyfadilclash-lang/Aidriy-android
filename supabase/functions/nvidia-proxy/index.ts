// Relay ke NVIDIA NIM (integrate.api.nvidia.com).
// NVIDIA tidak mengizinkan panggilan langsung dari aplikasi (tanpa header CORS), jadi
// permintaan dari HP diteruskan lewat sini. API key milik pengguna dikirim per permintaan
// lewat header `x-provider-key`, diteruskan ke NVIDIA, dan TIDAK disimpan atau dicatat.

const UPSTREAM = 'https://integrate.api.nvidia.com/v1';
const ALLOWED = new Set(['chat/completions', 'models']);
const MAX_BODY = 12 * 1024 * 1024; // lampiran gambar base64
const RATE = new Map<string, number[]>();
const LIMIT_PER_MIN = 40;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider-key, x-nvidia-path',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Tanda tangan JWT sudah diverifikasi gerbang Supabase (verify_jwt); di sini hanya pengguna yang login.
  const uid = userId(req);
  if (!uid) return json(401, { error: { message: 'Masuk ke akun A.I.DRIY dulu.' } });
  if (limited(uid)) return json(429, { error: { message: 'Terlalu banyak permintaan ke NVIDIA dalam semenit. Tunggu sebentar.' } });

  const key = req.headers.get('x-provider-key') || '';
  if (!/^nvapi-[\w-]{20,}$/.test(key)) return json(400, { error: { message: 'API key NVIDIA tidak valid (harus diawali nvapi-).' } });

  const path = req.headers.get('x-nvidia-path') || 'chat/completions';
  if (!ALLOWED.has(path)) return json(400, { error: { message: 'Jalur tidak diizinkan.' } });

  let body: string | undefined;
  if (path === 'chat/completions') {
    if (req.method !== 'POST') return json(405, { error: { message: 'Gunakan POST.' } });
    body = await req.text();
    if (body.length > MAX_BODY) return json(413, { error: { message: 'Permintaan terlalu besar (lampiran terlalu besar).' } });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${path}`, {
      method: path === 'models' ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: path === 'models' ? 'application/json' : 'text/event-stream, application/json',
      },
      body,
      signal: req.signal,
    });
  } catch (e) {
    return json(502, { error: { message: `NVIDIA tidak bisa dihubungi: ${(e as Error).message}` } });
  }

  // Teruskan apa adanya (termasuk stream SSE) dengan header CORS.
  const headers = new Headers(CORS);
  headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
  headers.set('cache-control', 'no-cache');
  return new Response(upstream.body, { status: upstream.status, headers });
});
