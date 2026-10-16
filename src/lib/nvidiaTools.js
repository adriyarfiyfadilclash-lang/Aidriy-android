// Fitur NVIDIA selain chat: buat gambar, baca teks (OCR), terjemahan, suara.
// Semua lewat relay Supabase `nvidia-tools` / `nvidia-proxy` dengan API key milik pengguna.
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';

export class NvidiaToolError extends Error {
  constructor(message, code = 'failed') {
    super(message);
    this.code = code;
  }
}

async function session() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new NvidiaToolError('Masuk ke akun A.I.DRIY dulu untuk memakai fitur NVIDIA.', 'auth');
  return token;
}

async function call(fn, key, body, { signal, headers = {} } = {}) {
  if (!key) throw new NvidiaToolError('Tambahkan API key NVIDIA dulu di Pengaturan → Kunci API.', 'nokey');
  const token = await session();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        'content-type': 'application/json',
        'x-provider-key': key,
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new NvidiaToolError('Tidak bisa terhubung ke layanan NVIDIA. Periksa koneksi internet.', 'network');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* bukan JSON */
  }
  if (!res.ok) {
    const err = data?.error;
    const msg = (typeof err === 'string' ? err : err?.message) || data?.detail || `Layanan NVIDIA gagal (HTTP ${res.status})`;
    let code = err?.code || 'failed';
    if (/credit|quota|payment/i.test(msg) || res.status === 402) code = 'credits';
    throw new NvidiaToolError(friendly(msg), code);
  }
  return data;
}

function friendly(msg) {
  if (/function.*not found for account/i.test(msg)) return 'Model ini belum tersedia untuk akun NVIDIA kamu.';
  if (/end of life|no longer available/i.test(msg)) return 'Model ini sudah dihentikan NVIDIA.';
  if (/unauthenticated|invalid.*(key|token)|unauthorized/i.test(msg)) return 'API key NVIDIA ditolak. Periksa kembali key-nya.';
  return msg;
}

// ---------- Buat gambar ----------
export const IMAGE_MODELS = [
  { id: 'flux.2-klein-4b', label: 'FLUX.2 klein 4B', steps: 4 },
];

/** @returns {Promise<{dataUrl:string, seed:number, model:string}>} */
export async function generateImage(key, { prompt, model = IMAGE_MODELS[0].id, seed = 0, signal }) {
  const m = IMAGE_MODELS.find((x) => x.id === model) || IMAGE_MODELS[0];
  const data = await call('nvidia-tools', key, { action: 'image', model: m.id, prompt, seed, steps: m.steps }, { signal });
  if (!data?.image) throw new NvidiaToolError('NVIDIA tidak mengembalikan gambar.');
  if (data.filtered) throw new NvidiaToolError('Gambar diblokir filter keamanan NVIDIA. Coba ubah deskripsinya.', 'filtered');
  return { dataUrl: `data:${data.mime || 'image/jpeg'};base64,${data.image}`, seed: data.seed ?? seed, model: m.id };
}

// ---------- OCR ----------
/** attachments: [{mime, data(base64), name}] → teks per gambar */
export async function readText(key, images, { signal } = {}) {
  const out = [];
  for (const img of images) {
    const data = await call('nvidia-tools', key, { action: 'ocr', mime: img.mime, image: img.data }, { signal });
    out.push({ name: img.name, text: (data?.text || '').trim(), model: data?.model });
  }
  return out;
}

// ---------- Terjemahan (Riva Translate: pesan sistem berisi pasangan bahasa, mis. "id-en") ----------
export const LANGUAGES = [
  { id: 'id', label: 'Indonesia' },
  { id: 'en', label: 'Inggris' },
  { id: 'ja', label: 'Jepang' },
  { id: 'ko', label: 'Korea' },
  { id: 'zh-CN', label: 'Mandarin' },
  { id: 'ar', label: 'Arab' },
  { id: 'th', label: 'Thailand' },
  { id: 'vi', label: 'Vietnam' },
  { id: 'hi', label: 'Hindi' },
  { id: 'es-ES', label: 'Spanyol' },
  { id: 'fr', label: 'Prancis' },
  { id: 'de', label: 'Jerman' },
  { id: 'nl', label: 'Belanda' },
  { id: 'it', label: 'Italia' },
  { id: 'pt-BR', label: 'Portugis' },
  { id: 'ru', label: 'Rusia' },
  { id: 'tr', label: 'Turki' },
];
export const TRANSLATE_MODEL = 'nvidia/riva-translate-4b-instruct-v2';

const ID_WORDS = /\b(yang|dan|di|ke|dari|ini|itu|tidak|dengan|untuk|saya|kamu|aku|ada|akan|sudah|bisa|tolong|apa|kita|mereka|pada|juga|karena|atau|jam|hari|bapak|ibu)\b/gi;
const EN_WORDS = /\b(the|and|is|are|to|of|in|for|you|this|that|with|have|has|will|please|be|it|on|at|we|they|was|were)\b/gi;

/** Tebak bahasa sumber dari teks (cukup untuk memilih pasangan bahasa Riva). */
export function detectLanguage(text) {
  const t = String(text || '');
  if (/[぀-ヿ]/.test(t)) return 'ja';
  if (/[가-힯]/.test(t)) return 'ko';
  if (/[一-鿿]/.test(t)) return 'zh-CN';
  if (/[؀-ۿ]/.test(t)) return 'ar';
  if (/[฀-๿]/.test(t)) return 'th';
  if (/[ऀ-ॿ]/.test(t)) return 'hi';
  if (/[Ѐ-ӿ]/.test(t)) return 'ru';
  if (/[ăâđêôơư]/i.test(t) && /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t)) return 'vi';
  const id = (t.match(ID_WORDS) || []).length;
  const en = (t.match(EN_WORDS) || []).length;
  if (/[äöüß]/i.test(t) && en === 0 && id === 0) return 'de';
  return id >= en ? 'id' : 'en';
}

async function translatePair(key, text, src, target, signal) {
  const data = await callProxyChat(
    key,
    {
      model: TRANSLATE_MODEL,
      messages: [
        { role: 'system', content: `${src}-${target}`.toLowerCase() },
        { role: 'user', content: text },
      ],
      max_tokens: 2048,
      temperature: 0,
    },
    signal
  );
  const out = data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new NvidiaToolError('NVIDIA tidak mengembalikan terjemahan.');
  return out.replace(/^<think>[\s\S]*?<\/think>\s*/, '');
}

/** Riva Translate menerjemahkan dari/ke Inggris; pasangan lain lewat Inggris (mis. Indonesia → Inggris → Jepang). */
export async function translate(key, { text, target, source, signal }) {
  let src = source || detectLanguage(text);
  if (src === target) src = target === 'en' ? 'id' : 'en';
  let out;
  let via = null;
  if (src === 'en' || target === 'en') out = await translatePair(key, text, src, target, signal);
  else {
    via = 'en';
    const english = await translatePair(key, text, src, 'en', signal);
    out = await translatePair(key, english, 'en', target, signal);
  }
  return { text: out, source: src, target, via };
}

export function languageLabel(id) {
  return LANGUAGES.find((l) => l.id.toLowerCase() === String(id).toLowerCase())?.label || id;
}

async function callProxyChat(key, payload, signal) {
  if (!key) throw new NvidiaToolError('Tambahkan API key NVIDIA dulu di Pengaturan → Kunci API.', 'nokey');
  const token = await session();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/nvidia-proxy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, 'content-type': 'application/json', 'x-provider-key': key, 'x-nvidia-path': 'chat/completions' },
      body: JSON.stringify({ ...payload, stream: false }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new NvidiaToolError('Tidak bisa terhubung ke layanan NVIDIA. Periksa koneksi internet.', 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.detail || `HTTP ${res.status}`;
    throw new NvidiaToolError(friendly(typeof msg === 'string' ? msg : JSON.stringify(msg)));
  }
  return data;
}

// ---------- Suara ----------
/** Transkripsi WAV (base64) dengan Whisper large v3 di NVIDIA. */
export async function transcribe(key, { wavBase64, sampleRate = 16000, language = 'multi', signal }) {
  const data = await call('nvidia-tools', key, { action: 'asr', audio: wavBase64, sampleRate, language }, { signal });
  return (data?.text || '').trim();
}

/** Ubah teks jadi suara (WAV base64). */
export async function synthesize(key, { text, language, voice, engine = 'magpie', signal }) {
  const data = await call('nvidia-tools', key, { action: 'tts', text, language, voice, engine }, { signal });
  if (!data?.audio) throw new NvidiaToolError('NVIDIA tidak mengembalikan audio.');
  return `data:${data.mime || 'audio/wav'};base64,${data.audio}`;
}

export async function listVoices(key, engine = 'magpie') {
  const data = await call('nvidia-tools', key, { action: 'voices', engine });
  return data?.voices || [];
}

// ---------- Embedding, rerank, parse ----------
/** Vektor makna (2048 dimensi) untuk tiap teks. inputType: 'passage' (isi) atau 'query' (pertanyaan). */
export async function embedTexts(key, texts, inputType = 'passage', { signal } = {}) {
  const out = [];
  for (let i = 0; i < texts.length; i += 16) {
    const data = await call('nvidia-tools', key, { action: 'embed', texts: texts.slice(i, i + 16), inputType }, { signal });
    out.push(...(data?.vectors || []));
  }
  return out;
}

/** Urutkan ulang potongan teks berdasarkan relevansi dengan pertanyaan. */
export async function rerank(key, query, passages, { signal } = {}) {
  const data = await call('nvidia-tools', key, { action: 'rerank', query, passages }, { signal });
  return data?.rankings || [];
}

/** Baca satu halaman dokumen (gambar) jadi Markdown dengan Nemotron Parse. */
export async function parsePage(key, { mime, data, signal }) {
  const res = await call('nvidia-tools', key, { action: 'parse', mime, image: data }, { signal });
  return (res?.text || '').trim();
}
