// Perekam suara ke WAV 16 kHz mono 16-bit (format yang diterima NVIDIA Riva / Whisper).

const TARGET_RATE = 16000;

function downsample(buf, from, to) {
  if (from === to) return buf;
  const ratio = from / to;
  const len = Math.floor(buf.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), buf.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += buf[j];
    out[i] = sum / Math.max(end - start, 1);
  }
  return out;
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Mulai merekam. onLevel(0..1) dipanggil untuk animasi; berhenti otomatis setelah maxMs.
 * Mengembalikan { stop(): Promise<{wavBase64, seconds, sampleRate}>, cancel() }.
 */
export async function startRecording({ onLevel, maxMs = 120_000, onAutoStop } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Perekaman suara tidak didukung di perangkat ini.'), { code: 'unavailable' });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const denied = /denied|not.?allowed|permission/i.test(`${e.name} ${e.message}`);
    throw Object.assign(new Error(denied ? 'Izin mikrofon ditolak. Izinkan mikrofon untuk A.I.DRIY di Pengaturan HP.' : 'Mikrofon tidak bisa dipakai.'), {
      code: denied ? 'permission' : 'no-mic',
    });
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let total = 0;
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    total += d.length;
    if (onLevel) {
      let peak = 0;
      for (let i = 0; i < d.length; i += 64) peak = Math.max(peak, Math.abs(d[i]));
      onLevel(Math.min(1, peak * 2));
    }
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  let finished = false;
  const cleanup = () => {
    finished = true;
    try {
      proc.disconnect();
      source.disconnect();
    } catch {
      /* abaikan */
    }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  const timer = setTimeout(() => onAutoStop?.(), maxMs);

  return {
    async stop() {
      clearTimeout(timer);
      if (finished) return null;
      const rate = ctx.sampleRate;
      cleanup();
      const all = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        all.set(c, off);
        off += c.length;
      }
      const pcm = downsample(all, rate, TARGET_RATE);
      return { wavBase64: toBase64(encodeWav(pcm, TARGET_RATE)), seconds: pcm.length / TARGET_RATE, sampleRate: TARGET_RATE };
    },
    cancel() {
      clearTimeout(timer);
      if (!finished) cleanup();
    },
  };
}
