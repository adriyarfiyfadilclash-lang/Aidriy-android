// Pembungkus fitur HP (Capacitor) dengan cadangan untuk browser.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();

// ---------- Membuka tautan luar ----------
// Di Android, tautan target="_blank" di WebView tidak selalu terbuka, jadi pakai Custom Tabs.
export async function openExternal(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (isNative) {
    try {
      await Browser.open({ url });
      return;
    } catch {
      /* jatuh ke cara biasa */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ---------- Getaran ----------
let hapticsOn = true;
export function setHapticsEnabled(v) {
  hapticsOn = v;
}
export function tap(strength = 'light') {
  if (!hapticsOn) return;
  if (isNative) {
    Haptics.impact({ style: strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(strength === 'medium' ? 15 : 8);
  }
}

// ---------- Status bar ----------
export function applyStatusBar(dark) {
  if (!isNative) return;
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: dark ? '#1C1A17' : '#F7F4EE' }).catch(() => {});
}

// ---------- Pengenalan suara (dikte) ----------
/** Error suara dengan kode yang bisa dijelaskan ke pengguna. */
export class VoiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const VOICE_MESSAGES = {
  permission: 'Izin mikrofon ditolak. Izinkan mikrofon untuk A.I.DRIY di Pengaturan HP, lalu coba lagi.',
  unavailable: 'Pengenalan suara tidak tersedia di perangkat ini. Pasang atau aktifkan aplikasi Google / layanan suara.',
  'no-speech': 'Tidak ada suara yang terdengar. Coba bicara lebih dekat ke mikrofon.',
  'no-mic': 'Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.',
  network: 'Pengenalan suara butuh koneksi internet di perangkat ini.',
  unknown: 'Pengenalan suara berhenti karena kesalahan.',
};

export function voiceErrorMessage(e) {
  if (!e) return VOICE_MESSAGES.unknown;
  if (e.code && VOICE_MESSAGES[e.code]) return VOICE_MESSAGES[e.code];
  const m = String(e.message || e.error || e);
  if (/permission|not-allowed|denied|service-not-allowed/i.test(m)) return VOICE_MESSAGES.permission;
  if (/no.?match|no-speech|didn.?t understand|speech timeout/i.test(m)) return VOICE_MESSAGES['no-speech'];
  if (/audio-capture|recorder|busy/i.test(m)) return VOICE_MESSAGES['no-mic'];
  if (/network/i.test(m)) return VOICE_MESSAGES.network;
  return m || VOICE_MESSAGES.unknown;
}

export function voiceErrorCode(e) {
  if (e?.code) return e.code;
  const m = String(e?.message || e?.error || e || '');
  if (/permission|not-allowed|denied/i.test(m)) return 'permission';
  if (/no.?match|no-speech|didn.?t understand|speech timeout/i.test(m)) return 'no-speech';
  if (/audio-capture/i.test(m)) return 'no-mic';
  if (/aborted/i.test(m)) return 'aborted';
  return 'unknown';
}

/** Mendeteksi kemampuan suara perangkat: STT (dikte) dan TTS (membacakan). */
export async function voiceCapabilities() {
  if (isNative) {
    const stt = await SpeechRecognition.available()
      .then((r) => !!r.available)
      .catch(() => false);
    const tts = await TextToSpeech.getSupportedLanguages()
      .then(() => true)
      .catch(() => false);
    return { stt, tts, native: true };
  }
  return {
    stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    tts: 'speechSynthesis' in window,
    native: false,
  };
}

/**
 * Mulai mendengarkan.
 * - onStart(): mikrofon benar-benar aktif (baru tampilkan "Mendengarkan")
 * - onPartial(text): kata-kata masuk
 * - onEnd(finalText): berhenti (teks bisa kosong)
 * - onError(VoiceError)
 * Mengembalikan fungsi stop(). Melempar VoiceError bila izin/perangkat tidak tersedia.
 */
export async function startListening({ lang = 'id-ID', onStart, onPartial, onEnd, onError }) {
  if (isNative) {
    const avail = await SpeechRecognition.available().catch(() => ({ available: false }));
    if (!avail.available) throw new VoiceError('unavailable', VOICE_MESSAGES.unavailable);
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new VoiceError('permission', VOICE_MESSAGES.permission);
    let latest = '';
    let ended = false;
    let started = false;
    await SpeechRecognition.removeAllListeners();
    const finish = () => {
      if (ended) return;
      ended = true;
      SpeechRecognition.removeAllListeners();
      onEnd?.(latest);
    };
    await SpeechRecognition.addListener('partialResults', (d) => {
      latest = d.matches?.[0] || latest;
      onPartial?.(latest);
    });
    await SpeechRecognition.addListener('listeningState', (d) => {
      if (d.status === 'started' && !started) {
        started = true;
        onStart?.();
      }
      if (d.status === 'stopped') finish();
    });
    SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1 })
      .then((r) => {
        if (r?.matches?.[0]) latest = r.matches[0];
      })
      .catch((e) => {
        const code = voiceErrorCode(e);
        if (code !== 'aborted' && !(code === 'no-speech' && latest)) onError?.(new VoiceError(code, voiceErrorMessage(e)));
        finish();
      });
    return async () => {
      await SpeechRecognition.stop().catch(() => {});
      setTimeout(finish, 400);
    };
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new VoiceError('unavailable', 'Browser ini tidak mendukung pengenalan suara.');
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  let latest = '';
  rec.onstart = () => onStart?.();
  rec.onresult = (e) => {
    latest = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join('');
    onPartial?.(latest);
  };
  rec.onerror = (e) => {
    const code = voiceErrorCode(e);
    if (code !== 'aborted') onError?.(new VoiceError(code, voiceErrorMessage(e)));
  };
  rec.onend = () => onEnd?.(latest);
  rec.start();
  return async () => rec.stop();
}

/** Dipanggil saat aplikasi masuk background (Android) atau tab disembunyikan (browser). Mengembalikan fungsi lepas. */
export function onAppBackground(fn) {
  let handle = null;
  let removed = false;
  if (isNative) {
    Promise.resolve(CapApp.addListener('pause', fn))
      .then((h) => {
        if (removed) h.remove();
        else handle = h;
      })
      .catch(() => {});
  }
  const remove = () => {
    removed = true;
    handle?.remove();
  };
  const vis = () => {
    if (document.visibilityState === 'hidden') fn();
  };
  document.addEventListener('visibilitychange', vis);
  return () => {
    document.removeEventListener('visibilitychange', vis);
    remove();
  };
}

// ---------- Membacakan teks ----------
export async function speak(text, { lang = 'id-ID', rate = 1 } = {}) {
  if (!text) return;
  if (isNative) {
    await TextToSpeech.stop().catch(() => {});
    await TextToSpeech.speak({ text, lang, rate, pitch: 1, volume: 1, category: 'playback' });
    return;
  }
  if (!('speechSynthesis' in window)) throw new Error('Perangkat tidak mendukung pembacaan suara.');
  window.speechSynthesis.cancel();
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}
export async function stopSpeaking() {
  if (isNative) await TextToSpeech.stop().catch(() => {});
  else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ---------- Kamera ----------
export async function takePhoto() {
  if (!isNative) return null; // di browser, input file dengan capture dipakai
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Base64,
    quality: 82,
    width: 1600,
    correctOrientation: true,
  });
  return { name: `foto-${Date.now()}.${photo.format || 'jpeg'}`, mime: `image/${photo.format || 'jpeg'}`, data: photo.base64String };
}

// ---------- Bagikan / simpan berkas ----------
export async function shareText(title, text, url) {
  if (isNative) {
    await Share.share({ title, text, url, dialogTitle: title });
    return;
  }
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return;
  }
  await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n'));
}

export async function shareFile(filename, content, mime = 'text/plain') {
  if (isNative) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Simpan atau bagikan' });
    return;
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Menyalin teks; mengembalikan true hanya bila salin benar-benar berhasil. */
/** Bagikan / simpan berkas biner (Blob) lewat Sharesheet Android atau unduhan di browser. */
export async function shareBlob(filename, blob) {
  if (isNative) {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Berkas tidak bisa dibaca'));
      r.readAsDataURL(blob);
    });
    const res = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Bagikan atau simpan' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* coba cara lama */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}
