// Ringkasan memori: dibuat oleh model AI pilihan pengguna dari memori tersimpan + profil.
import { streamChat, PROVIDERS } from './providers';
import { extractMemories } from './parse';

function requireKey(settings) {
  const key = settings.keys[settings.provider];
  if (!key) throw new Error(`Tambahkan API key ${PROVIDERS[settings.provider]?.short || ''} dulu di Pengaturan → Kunci API.`);
  return key;
}

async function complete(settings, system, userText, signal) {
  let text = '';
  await streamChat(
    {
      provider: settings.provider,
      model: settings.model,
      apiKey: requireKey(settings),
      system,
      history: [{ role: 'user', text: userText }],
      effort: 'off',
      webSearch: false,
      signal,
    },
    { onText: (t) => (text += t) }
  );
  return text.trim();
}

function factsBlock(profile, memories) {
  const lines = [];
  if (profile?.nickname) lines.push(`Nama panggilan: ${profile.nickname}`);
  if (profile?.full_name) lines.push(`Nama lengkap: ${profile.full_name}`);
  if (profile?.occupation) lines.push(`Pekerjaan: ${profile.occupation}`);
  if (profile?.about) lines.push(`Info dari pengguna: ${profile.about}`);
  for (const m of memories) lines.push(`[${m.id}] ${m.content}`);
  return lines.join('\n');
}

/** Buat ringkasan Markdown. Mengembalikan teks ringkasan (tanpa mengarang fakta baru). */
export async function generateSummary(settings, profile, memories, signal) {
  if (!memories.length && !profile?.occupation && !profile?.about && !profile?.nickname) {
    throw new Error('Belum ada memori untuk diringkas. Ceritakan tentang dirimu di chat atau isi kolom di halaman Memori.');
  }
  const system = [
    'Kamu menulis ringkasan memori pengguna untuk aplikasi A.I.DRIY, dalam Bahasa Indonesia, menyapa pengguna dengan "kamu".',
    'Gunakan HANYA fakta yang diberikan. Jangan menambah, menebak, atau melebih-lebihkan. Bila fakta sedikit, ringkasannya juga singkat.',
    'Format Markdown: mulai dengan "## Ringkasan" berisi satu paragraf, lalu beberapa bagian "## Judul Bagian" sesuai tema fakta (misal Pekerjaan dan Industri, Proyek, Preferensi Komunikasi). Tiap bagian berupa paragraf singkat, bukan daftar ID. Jangan menyebut ID dalam kurung siku.',
  ].join('\n');
  const text = await complete(settings, system, `Fakta tentang pengguna:\n${factsBlock(profile, memories)}\n\nTulis ringkasannya.`, signal);
  if (!text) throw new Error('Model tidak mengembalikan ringkasan.');
  return text;
}

/**
 * Pertanyaan / perintah pembaruan memori ("Saya pindah kerja ke X", "Lupakan soal Y").
 * Model menjawab singkat dan memakai tag <memory>fakta</memory> untuk menambah serta <forget id="..."/> untuk menghapus.
 */
export async function askMemory(settings, profile, memories, question, signal) {
  const system = [
    'Kamu mengelola memori pengguna A.I.DRIY. Di bawah ini daftar memori dengan ID-nya.',
    'Bila pengguna bertanya, jawab singkat berdasarkan memori saja (katakan jujur bila tidak ada).',
    'Bila pengguna memberi info baru atau koreksi, tambahkan dengan tag <memory>fakta singkat</memory>. Bila ada memori lama yang salah, usang, atau diminta dilupakan, tulis <forget id="ID"/> untuk tiap ID yang harus dihapus.',
    'Jangan menyimpan data sensitif seperti nomor identitas, kata sandi, atau nomor rekening. Jawab dalam 1–3 kalimat Bahasa Indonesia, lalu tag bila perlu.',
    '',
    'Memori saat ini:',
    factsBlock(profile, memories) || '(kosong)',
  ].join('\n');
  const raw = await complete(settings, system, question, signal);
  const forget = [...raw.matchAll(/<forget\s+id="([^"]+)"\s*\/?>/gi)].map((m) => m[1]).filter((id) => memories.some((x) => x.id === id));
  const withoutForget = raw.replace(/<forget\s+id="[^"]*"\s*\/?>/gi, '');
  const { clean, memories: add } = extractMemories(withoutForget);
  return { answer: clean.trim(), add, forget };
}
