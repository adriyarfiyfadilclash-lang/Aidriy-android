// Fitur NVIDIA selain chat: suara (gRPC Riva), gambar (FLUX), OCR.
// API key pengguna dikirim per permintaan lewat header `x-provider-key`, diteruskan ke NVIDIA,
// dan tidak disimpan atau dicatat.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const fail = (status: number, message: string, code = 'failed') => json(status, { error: { message, code } });

function userId(req: Request): string | null {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.role === 'authenticated' && p.sub ? String(p.sub) : null;
  } catch {
    return null;
  }
}
const RATE = new Map<string, number[]>();
function limited(uid: string, n = 30) {
  const now = Date.now();
  const l = (RATE.get(uid) || []).filter((t) => now - t < 60_000);
  l.push(now);
  RATE.set(uid, l);
  return l.length > n;
}

// ---------- Protobuf mini (cukup untuk pesan Riva) ----------
class PB {
  parts: number[] = [];
  varint(n: number) {
    let v = BigInt(n);
    while (v > 127n) {
      this.parts.push(Number((v & 127n) | 128n));
      v >>= 7n;
    }
    this.parts.push(Number(v));
  }
  tag(field: number, wire: number) {
    this.varint((field << 3) | wire);
  }
  int(field: number, n: number) {
    if (!n) return this;
    this.tag(field, 0);
    this.varint(n);
    return this;
  }
  bool(field: number, b: boolean) {
    if (b) this.int(field, 1);
    return this;
  }
  bytes(field: number, b: Uint8Array) {
    this.tag(field, 2);
    this.varint(b.length);
    for (const x of b) this.parts.push(x);
    return this;
  }
  str(field: number, s: string) {
    if (!s) return this;
    return this.bytes(field, new TextEncoder().encode(s));
  }
  msg(field: number, m: PB) {
    return this.bytes(field, m.done());
  }
  done() {
    return Uint8Array.from(this.parts);
  }
}

type Field = { n: number; w: number; v: number | Uint8Array };
function decode(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  let i = 0;
  const varint = () => {
    let r = 0n;
    let s = 0n;
    for (;;) {
      const b = buf[i++];
      r |= BigInt(b & 127) << s;
      if (!(b & 128)) break;
      s += 7n;
    }
    return Number(r);
  };
  while (i < buf.length) {
    const key = varint();
    const n = key >> 3;
    const w = key & 7;
    if (w === 0) out.push({ n, w, v: varint() });
    else if (w === 2) {
      const len = varint();
      out.push({ n, w, v: buf.subarray(i, i + len) });
      i += len;
    } else if (w === 5) {
      out.push({ n, w, v: new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true) });
      i += 4;
    } else if (w === 1) i += 8;
    else break;
  }
  return out;
}
const sub = (f: Field[], n: number) => f.filter((x) => x.n === n).map((x) => x.v as Uint8Array);
const text = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : '');

// ---------- gRPC lewat fetch (HTTP/2) ----------
async function grpc(path: string, functionId: string, key: string, message: Uint8Array, timeoutMs = 60_000) {
  const frame = new Uint8Array(5 + message.length);
  new DataView(frame.buffer).setUint32(1, message.length);
  frame.set(message, 5);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://grpc.nvcf.nvidia.com${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/grpc',
        te: 'trailers',
        authorization: `Bearer ${key}`,
        'function-id': functionId,
      },
      body: frame,
      signal: ctl.signal,
    });
    const status = res.headers.get('grpc-status');
    const gmsg = decodeURIComponent(res.headers.get('grpc-message') || '');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (status && status !== '0') throw Object.assign(new Error(gmsg || `gRPC status ${status}`), { grpc: Number(status) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text(buf).slice(0, 200)}`);
    if (buf.length < 5) throw new Error(gmsg || 'Respons kosong dari NVIDIA');
    const len = new DataView(buf.buffer, buf.byteOffset).getUint32(1);
    return buf.subarray(5, 5 + len);
  } finally {
    clearTimeout(timer);
  }
}

const b64 = {
  dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  enc: (b: Uint8Array) => {
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  },
};

// Model suara yang dihosting NVIDIA (function-id dari halaman API build.nvidia.com)
const ASR = {
  whisper: 'b702f636-f60c-4a3d-a6f4-f3568c13bd7d', // openai/whisper-large-v3, banyak bahasa
};
const TTS: Record<string, string> = {
  magpie: '877104f7-e885-42b9-8de8-f6e4c6303969',
  chatterbox: 'ddacc747-1269-4fab-bfd9-8f593dead106',
};

function wavHeader(pcmLen: number, rate: number) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  h.setUint32(4, 36 + pcmLen, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, 1, true);
  h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true);
  h.setUint16(32, 2, true);
  h.setUint16(34, 16, true);
  w(36, 'data');
  h.setUint32(40, pcmLen, true);
  return new Uint8Array(h.buffer);
}

async function doAsr(key: string, body: any) {
  const audio = b64.dec(String(body.audio || ''));
  if (audio.length < 1000) return fail(400, 'Rekaman terlalu pendek.', 'no_speech');
  if (audio.length > 8 * 1024 * 1024) return fail(413, 'Rekaman terlalu panjang (maks ±4 menit).');
  const lang = String(body.language || 'multi').slice(0, 10);
  const cfg = new PB()
    .int(1, 1) // LINEAR_PCM (WAV)
    .int(2, Number(body.sampleRate) || 16000)
    .str(3, lang)
    .int(4, 1)
    .int(7, 1)
    .bool(11, true);
  const req = new PB().msg(1, cfg).bytes(2, audio);
  const out = decode(await grpc('/nvidia.riva.asr.RivaSpeechRecognition/Recognize', ASR.whisper, key, req.done(), 90_000));
  const parts: string[] = [];
  for (const r of sub(out, 1)) {
    const alts = sub(decode(r), 1);
    if (alts[0]) parts.push(text(sub(decode(alts[0]), 1)[0]));
  }
  return json(200, { text: parts.join(' ').replace(/\s+/g, ' ').trim(), model: 'openai/whisper-large-v3' });
}

async function doTts(key: string, body: any) {
  const t = String(body.text || '').trim().slice(0, 2000);
  if (!t) return fail(400, 'Teks kosong.');
  const engine = TTS[body.engine] ? body.engine : 'magpie';
  const rate = 22050;
  const req = new PB()
    .str(1, t)
    .str(2, String(body.language || 'en-US'))
    .int(3, 1) // LINEAR_PCM
    .int(4, rate)
    .str(5, String(body.voice || ''));
  const out = decode(await grpc('/nvidia.riva.tts.RivaSpeechSynthesis/Synthesize', TTS[engine], key, req.done(), 60_000));
  const pcm = sub(out, 1)[0] || new Uint8Array();
  if (!pcm.length) return fail(502, 'NVIDIA tidak mengembalikan audio.');
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(wavHeader(pcm.length, rate));
  wav.set(pcm, 44);
  return json(200, { audio: b64.enc(wav), mime: 'audio/wav', engine });
}

async function doVoices(key: string, body: any) {
  const engine = TTS[body.engine] ? body.engine : 'magpie';
  const out = decode(await grpc('/nvidia.riva.tts.RivaSpeechSynthesis/GetRivaSynthesisConfig', TTS[engine], key, new Uint8Array(), 30_000));
  const voices: { name: string; language: string }[] = [];
  for (const cfg of sub(out, 1)) {
    const f = decode(cfg);
    const params: Record<string, string> = {};
    for (const entry of sub(f, 2)) {
      const e = decode(entry);
      params[text(sub(e, 1)[0])] = text(sub(e, 2)[0]);
    }
    const lang = params.language_code || '';
    const subvoices = (params.subvoices || '').split(',').map((s) => s.split(':')[0].trim()).filter(Boolean);
    const base = params.voice_name || '';
    if (subvoices.length) for (const sv of subvoices) voices.push({ name: `${base}.${sv}`, language: lang });
    else if (base) voices.push({ name: base, language: lang });
  }
  return json(200, { engine, voices });
}

// ---------- HTTP biasa (gambar, OCR) ----------
async function nvHttp(url: string, key: string, payload: unknown, timeoutMs = 120_000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    let res2 = res;
    // NVCF bisa menjawab 202 (masih diproses): tanya status sampai selesai.
    while (res2.status === 202) {
      const reqId = res2.headers.get('nvcf-reqid');
      if (!reqId) break;
      await new Promise((r) => setTimeout(r, 1500));
      res2 = await fetch(`https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${reqId}`, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: ctl.signal,
      });
    }
    const t = await res2.text();
    let j: any = null;
    try {
      j = JSON.parse(t);
    } catch {
      /* bukan JSON */
    }
    if (!res2.ok) {
      const msg = j?.detail || j?.error?.message || j?.title || t.slice(0, 300) || `HTTP ${res2.status}`;
      throw Object.assign(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)), { status: res2.status });
    }
    return j ?? t;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Gambar ----------
const IMAGE_MODELS: Record<string, { path: string; maxSteps: number }> = {
  'flux.1-schnell': { path: 'black-forest-labs/flux.1-schnell', maxSteps: 4 },
  'flux.2-klein-4b': { path: 'black-forest-labs/flux.2-klein-4b', maxSteps: 4 },
};

function pickImage(r: any): { b64: string; mime: string; seed?: number; filtered?: boolean } | null {
  const a = r?.artifacts?.[0] || r?.data?.[0] || r?.images?.[0] || r;
  const raw = a?.base64 || a?.b64_json || a?.image || (typeof a === 'string' ? a : '');
  if (!raw || typeof raw !== 'string') return null;
  const m = /^data:([^;]+);base64,(.*)$/.exec(raw);
  const b64str = m ? m[2] : raw;
  const mime = m ? m[1] : b64str.startsWith('/9j/') ? 'image/jpeg' : b64str.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  const filtered = /CONTENT_FILTERED|filtered/i.test(String(a?.finishReason || a?.finish_reason || ''));
  return { b64: b64str, mime, seed: a?.seed, filtered };
}

async function doImage(key: string, body: any) {
  const prompt = String(body.prompt || '').trim().slice(0, 2000);
  if (!prompt) return fail(400, 'Tulis deskripsi gambarnya dulu.');
  const m = IMAGE_MODELS[body.model] || IMAGE_MODELS['flux.2-klein-4b'];
  const seed = Number.isInteger(body.seed) && body.seed > 0 ? body.seed : Math.floor(Math.random() * 2_000_000_000) + 1;
  const steps = Math.min(Math.max(Number(body.steps) || m.maxSteps, 1), m.maxSteps);
  const r = await nvHttp(`https://ai.api.nvidia.com/v1/genai/${m.path}`, key, { prompt, width: 1024, height: 1024, steps, seed }, 120_000);
  const img = pickImage(r);
  if (!img) return fail(502, 'Format respons gambar dari NVIDIA tidak dikenali.');
  return json(200, { image: img.b64, mime: img.mime, seed: img.seed ?? seed, filtered: img.filtered || false });
}

// ---------- OCR ----------
const OCR_URLS = ['https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2', 'https://ai.api.nvidia.com/v1/cv/nvidia/nemoretriever-ocr-v1'];

function ocrText(r: any) {
  const det = r?.data?.[0]?.text_detections || [];
  if (!det.length) return '';
  // Urutkan per baris (y) lalu kiri ke kanan (x).
  const items = det
    .map((d: any) => {
      const pts = d.bounding_box?.points || [];
      const ys = pts.map((p: any) => p.y);
      const xs = pts.map((p: any) => p.x);
      return { t: d.text_prediction?.text || '', y: (Math.min(...ys) + Math.max(...ys)) / 2, x: Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    })
    .filter((i: any) => i.t)
    .sort((a: any, b: any) => a.y - b.y || a.x - b.x);
  const lines: { y: number; h: number; parts: any[] }[] = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(l.h, it.h) * 0.6);
    if (line) line.parts.push(it);
    else lines.push({ y: it.y, h: it.h, parts: [it] });
  }
  return lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.t).join(' ')).join('\n');
}

async function doOcr(key: string, body: any) {
  const image = String(body.image || '');
  const mime = /^image\/(png|jpe?g)$/.test(body.mime) ? body.mime : 'image/jpeg';
  if (image.length < 100) return fail(400, 'Lampirkan foto atau gambar dokumen dulu.');
  if (image.length > 7_000_000) return fail(413, 'Gambar terlalu besar untuk OCR. Perkecil dulu.');
  let lastErr: Error | null = null;
  for (const url of OCR_URLS) {
    try {
      const r = await nvHttp(url, key, { input: [{ type: 'image_url', url: `data:${mime};base64,${image}` }], merge_levels: ['word'] }, 90_000);
      return json(200, { text: ocrText(r), model: url.split('/').pop() });
    } catch (e) {
      lastErr = e as Error;
      if ((e as any).status !== 404) break;
    }
  }
  throw lastErr || new Error('OCR gagal');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const uid = userId(req);
  if (!uid) return fail(401, 'Masuk ke akun A.I.DRIY dulu.', 'auth');
  if (limited(uid)) return fail(429, 'Terlalu banyak permintaan ke NVIDIA dalam semenit. Tunggu sebentar.', 'rate');
  const key = req.headers.get('x-provider-key') || '';
  if (!/^nvapi-[\w-]{20,}$/.test(key)) return fail(400, 'API key NVIDIA tidak valid (harus diawali nvapi-).', 'auth');
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Permintaan tidak valid.');
  }
  try {
    switch (body.action) {
      case 'asr':
        return await doAsr(key, body);
      case 'tts':
        return await doTts(key, body);
      case 'voices':
        return await doVoices(key, body);
      case 'image':
        return await doImage(key, body);
      case 'ocr':
        return await doOcr(key, body);
      default:
        return fail(400, 'Aksi tidak dikenal.');
    }
  } catch (e) {
    const err = e as Error & { status?: number; grpc?: number };
    const m = /aborted/i.test(err.message || '') ? 'NVIDIA terlalu lama merespons (model mungkin sedang sibuk). Coba lagi sebentar lagi.' : err.message || 'Gagal';
    const code = /credit|quota|payment/i.test(m) ? 'credits' : err.grpc === 16 || err.status === 401 || err.status === 403 ? 'auth' : err.grpc === 8 || err.status === 429 ? 'rate' : 'failed';
    return fail(err.status && err.status >= 400 ? err.status : 502, m, code);
  }
});
