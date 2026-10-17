// Cadangan jawaban AI yang sedang ditulis. Bila aplikasi dimatikan sistem di tengah jalan,
// bagian yang sudah tertulis tidak hilang dan bisa dilanjutkan saat chat dibuka lagi.
const PREFIX = 'aidriy.inflight.';
const MAX_AGE = 3 * 24 * 3600 * 1000;

export function saveInflight(convId, data) {
  if (!convId) return;
  try {
    localStorage.setItem(PREFIX + convId, JSON.stringify({ ...data, ts: Date.now() }));
  } catch {
    /* penyimpanan penuh: abaikan */
  }
}

export function readInflight(convId) {
  if (!convId) return null;
  try {
    const d = JSON.parse(localStorage.getItem(PREFIX + convId) || 'null');
    if (!d || !d.text || Date.now() - d.ts > MAX_AGE) return null;
    return d;
  } catch {
    return null;
  }
}

export function clearInflight(convId) {
  if (!convId) return;
  try {
    localStorage.removeItem(PREFIX + convId);
  } catch {
    /* abaikan */
  }
}
