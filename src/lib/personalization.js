// Personalisasi gaya jawaban A.I.DRIY. Disimpan di profil (cloud) dan dipakai di prompt sistem.

export const DEFAULT_PERSONALIZATION = {
  style: 'default',
  warmth: 'default',
  enthusiasm: 'default',
  formatting: 'default',
  emoji: 'default',
  quickAnswers: true,
  visual: 'default',
  customInstructions: '',
};

export const STYLE_OPTIONS = [
  { value: 'default', label: 'Bawaan', hint: 'Gaya dan nada bawaan' },
  { value: 'professional', label: 'Profesional', hint: 'Rapi dan presisi' },
  { value: 'friendly', label: 'Ramah', hint: 'Hangat dan akrab' },
  { value: 'candid', label: 'Lugas', hint: 'Terus terang dan memberi semangat' },
  { value: 'quirky', label: 'Nyentrik', hint: 'Menyenangkan dan imajinatif' },
  { value: 'efficient', label: 'Efisien', hint: 'Singkat dan to the point' },
  { value: 'critical', label: 'Kritis', hint: 'Skeptis dan menantang argumen' },
];

const LEVELS = (more, less) => [
  { value: 'more', label: 'Lebih banyak', hint: more },
  { value: 'default', label: 'Bawaan' },
  { value: 'less', label: 'Lebih sedikit', hint: less },
];

export const LEVEL_FIELDS = [
  { key: 'warmth', label: 'Kehangatan', options: LEVELS('Lebih ramah dan personal', 'Lebih profesional dan faktual') },
  { key: 'enthusiasm', label: 'Antusiasme', options: LEVELS('Lebih berenergi dan seru', 'Lebih tenang dan netral') },
  { key: 'formatting', label: 'Judul dan daftar', options: LEVELS('Lebih terstruktur', 'Lebih banyak paragraf biasa') },
  { key: 'emoji', label: 'Emoji', options: LEVELS('Boleh lebih sering', 'Tanpa emoji') },
];

export const VISUAL_OPTIONS = [
  { value: 'default', label: 'Bawaan', hint: 'Canvas & gambar bila bermanfaat' },
  { value: 'simple', label: 'Sederhana', hint: 'Hanya bila diminta' },
];

export function labelOf(options, value) {
  return options.find((o) => o.value === value)?.label || 'Bawaan';
}

export function normalizePersonalization(p) {
  const out = { ...DEFAULT_PERSONALIZATION, ...(p || {}) };
  out.customInstructions = String(out.customInstructions || '').slice(0, 3000);
  return out;
}

const STYLE_PROMPT = {
  professional: 'Gunakan nada profesional, rapi, dan presisi.',
  friendly: 'Gunakan nada ramah, hangat, dan akrab seperti teman yang membantu.',
  candid: 'Bersikap lugas dan terus terang, sampaikan pendapat dengan jelas, dan beri semangat.',
  quirky: 'Boleh jenaka dan imajinatif, selama jawabannya tetap akurat dan berguna.',
  efficient: 'Jawab sesingkat mungkin: langsung ke inti, tanpa basa-basi.',
  critical: 'Bersikap kritis: uji asumsi, tunjukkan kelemahan argumen, dan jangan sekadar menyetujui. Tetap sopan.',
};
const LEVEL_PROMPT = {
  warmth: { more: 'Tunjukkan lebih banyak kehangatan dan empati.', less: 'Kurangi basa-basi emosional; fokus pada fakta.' },
  enthusiasm: { more: 'Tunjukkan antusiasme dan energi.', less: 'Gunakan nada tenang dan netral.' },
  formatting: { more: 'Gunakan judul, daftar, dan tabel bila membantu keterbacaan.', less: 'Utamakan paragraf biasa; hindari judul dan daftar kecuali benar-benar perlu.' },
  emoji: { more: 'Boleh memakai emoji secukupnya.', less: 'Jangan memakai emoji.' },
};

export function personalizationPrompt(p) {
  const s = normalizePersonalization(p);
  const lines = [];
  if (STYLE_PROMPT[s.style]) lines.push(STYLE_PROMPT[s.style]);
  for (const k of Object.keys(LEVEL_PROMPT)) {
    const v = LEVEL_PROMPT[k][s[k]];
    if (v) lines.push(v);
  }
  if (s.visual === 'simple') lines.push('Jangan membuat Canvas atau galeri gambar kecuali pengguna memintanya secara eksplisit.');
  const custom = s.customInstructions.trim();
  if (!lines.length && !custom) return '';
  const parts = ['', '## Personalisasi dari pengguna', ...lines.map((l) => `- ${l}`)];
  if (custom) parts.push('Instruksi khusus pengguna (ikuti selama tidak bertentangan dengan kejujuran dan keselamatan):', custom);
  return parts.join('\n');
}

// "Jawaban cepat": pertanyaan pendek & sederhana dijawab tanpa mode berpikir agar lebih cepat.
export function isQuickQuestion(text, attachmentsCount) {
  if (attachmentsCount) return false;
  const t = String(text || '').trim();
  if (!t || t.length > 140 || t.includes('\n')) return false;
  if (/\b(kode|code|script|program|buatkan|buat(kan)?\s+(artikel|dokumen|email|surat|laporan)|analisis|analisa|bandingkan|jelaskan secara detail|langkah demi langkah|hitung|rumus|debug|error)\b/i.test(t)) return false;
  return true;
}
