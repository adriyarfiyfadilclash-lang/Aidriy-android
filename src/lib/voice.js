// Lapisan suara: memilih suara bawaan HP atau NVIDIA sesuai pengaturan.
import { speak as deviceSpeak, stopSpeaking as deviceStop } from './native';
import { synthesize } from './nvidiaTools';

// Suara NVIDIA bawaan per bahasa. NVIDIA belum punya suara Bahasa Indonesia;
// suara Melayu (ms-MY) dari Chatterbox paling mirip pelafalannya.
export const NVIDIA_VOICE_DEFAULT = {
  'id-ID': { engine: 'chatterbox', voice: 'Chatterbox-Multilingual.ms-MY.Male', language: 'ms-MY' },
  'ms-MY': { engine: 'chatterbox', voice: 'Chatterbox-Multilingual.ms-MY.Male', language: 'ms-MY' },
  'jv-ID': { engine: 'chatterbox', voice: 'Chatterbox-Multilingual.ms-MY.Male', language: 'ms-MY' },
  'en-US': { engine: 'magpie', voice: 'Magpie-Multilingual.EN-US.Aria', language: 'en-US' },
};

export function nvidiaVoiceFor(voiceSettings) {
  const chosen = voiceSettings?.nvidiaVoice;
  if (chosen?.voice) return chosen;
  return NVIDIA_VOICE_DEFAULT[voiceSettings?.lang] || NVIDIA_VOICE_DEFAULT['en-US'];
}

export function usesNvidiaVoice(settings) {
  return settings?.voice?.engine === 'nvidia' && !!settings?.keys?.nvidia;
}

// Potong teks panjang per kalimat (maks ±350 karakter per bagian) supaya suara cepat mulai.
function chunks(text) {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [text];
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > 350 && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > 1800 ? c.match(/.{1,1800}/g) : [c]));
}

let current = null; // { audio, cancelled }

/** Bacakan teks. Resolve saat selesai atau dihentikan. */
export async function speakText(text, settings) {
  await stopText();
  if (!text) return;
  if (!usesNvidiaVoice(settings)) return deviceSpeak(text, settings.voice);
  const v = nvidiaVoiceFor(settings.voice);
  const job = { cancelled: false, audio: null };
  current = job;
  const list = chunks(text);
  let next = synthesize(settings.keys.nvidia, { text: list[0], language: v.language, voice: v.voice, engine: v.engine });
  for (let i = 0; i < list.length; i++) {
    const src = await next;
    if (job.cancelled) return;
    if (i + 1 < list.length) next = synthesize(settings.keys.nvidia, { text: list[i + 1], language: v.language, voice: v.voice, engine: v.engine });
    await new Promise((resolve, reject) => {
      const a = new Audio(src);
      a.playbackRate = settings.voice?.rate || 1;
      job.audio = a;
      a.onended = resolve;
      a.onpause = () => job.cancelled && resolve();
      a.onerror = () => reject(new Error('Audio dari NVIDIA tidak bisa diputar.'));
      a.play().catch(reject);
    });
    if (job.cancelled) return;
  }
  if (current === job) current = null;
}

export async function stopText() {
  if (current) {
    current.cancelled = true;
    try {
      current.audio?.pause();
    } catch {
      /* abaikan */
    }
    current = null;
  }
  await deviceStop();
}
