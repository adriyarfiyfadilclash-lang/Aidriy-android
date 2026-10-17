// Menjaga proses tetap berjalan saat aplikasi ditinggal (Android: foreground service + notifikasi),
// dan memberi notifikasi "selesai" bila hasil jadi saat aplikasi di latar belakang.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

const KeepAlive = registerPlugin('KeepAlive');
const enabled = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const jobs = new Map(); // id -> { label }
let seq = 0;
let appActive = true;
let askedPermission = false;
let lastUpdate = 0;
let pendingText = null;
let updateTimer = null;

if (enabled) {
  CapApp.addListener('appStateChange', (s) => {
    appActive = s.isActive;
  }).catch(() => {});
}

export function isAppActive() {
  return appActive && document.visibilityState !== 'hidden';
}

async function ensurePermission() {
  if (askedPermission) return;
  askedPermission = true;
  try {
    const p = await KeepAlive.checkPermissions();
    if (p.notifications === 'prompt' || p.notifications === 'prompt-with-rationale') await KeepAlive.requestPermissions();
  } catch {
    /* tanpa izin notifikasi, proses tetap berjalan; hanya notifikasinya tidak terlihat */
  }
}

/** Mulai pekerjaan latar belakang. Mengembalikan id untuk progress/end. */
export async function beginJob(label, conversationId) {
  const id = ++seq;
  jobs.set(id, { label, conversationId });
  if (!enabled) return id;
  ensurePermission();
  try {
    await KeepAlive.start({ title: 'A.I.DRIY sedang bekerja', text: label, conversationId });
  } catch {
    /* tetap lanjut tanpa layanan latar belakang */
  }
  return id;
}

/** Perbarui teks notifikasi (dibatasi agar hemat baterai). */
export function progressJob(id, text) {
  if (!enabled || !jobs.has(id)) return;
  pendingText = text;
  const now = Date.now();
  const send = () => {
    updateTimer = null;
    lastUpdate = Date.now();
    if (pendingText != null && jobs.size) KeepAlive.update({ title: 'A.I.DRIY sedang bekerja', text: pendingText }).catch(() => {});
  };
  if (now - lastUpdate > 2000) send();
  else if (!updateTimer) updateTimer = setTimeout(send, 2000 - (now - lastUpdate));
}

/**
 * Selesaikan pekerjaan. Bila aplikasi sedang di latar belakang dan `done` diberikan,
 * tampilkan notifikasi yang membuka percakapan terkait saat diketuk.
 */
export async function endJob(id, done) {
  if (!jobs.has(id)) return;
  jobs.delete(id);
  if (!enabled) return;
  if (!jobs.size) {
    clearTimeout(updateTimer);
    updateTimer = null;
    KeepAlive.stop().catch(() => {});
  }
  if (done && !isAppActive()) {
    KeepAlive.notifyDone({ title: done.title, text: (done.text || '').slice(0, 300), conversationId: done.conversationId }).catch(() => {});
  }
}

export function activeJobCount() {
  return jobs.size;
}

/** Ketuk notifikasi "selesai" → buka percakapannya. */
export function onOpenFromNotification(cb) {
  if (!enabled) return () => {};
  let handle = null;
  let removed = false;
  Promise.resolve(KeepAlive.addListener('open', (d) => d?.conversationId && cb(d.conversationId)))
    .then((h) => {
      if (removed) h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove();
  };
}
