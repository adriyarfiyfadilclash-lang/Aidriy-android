// Pencarian berdasarkan makna & "tanya isi dokumen" dengan NVIDIA (embedding + rerank).
// Potongan teks disimpan di tabel semantic_chunks (RLS: hanya pemiliknya yang bisa membaca).
import { supabase } from './supabase';
import { embedTexts, rerank } from './nvidiaTools';
import { plainText } from './parse';

export function semanticReady(settings) {
  return settings?.semantic !== false && !!settings?.keys?.nvidia;
}

// ---------- Potong teks ----------
/** Potong teks jadi bagian ±1200 karakter, mengikuti paragraf, dengan sedikit tumpang tindih. */
export function chunkText(text, size = 1200, overlap = 150) {
  const clean = String(text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paras = clean.split(/\n\n/);
  const out = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
  };
  for (const p of paras) {
    if (p.length > size) {
      // paragraf sangat panjang: potong per kalimat
      const sentences = p.match(/[^.!?\n]+[.!?]*\s*/g) || [p];
      for (const s of sentences) {
        if ((cur + s).length > size && cur) {
          push();
          cur = cur.slice(-overlap);
        }
        cur += s;
      }
      continue;
    }
    if ((cur + '\n\n' + p).length > size && cur) {
      push();
      cur = cur.slice(-overlap);
    }
    cur += (cur ? '\n\n' : '') + p;
  }
  push();
  return out.slice(0, 200);
}

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const vec = (v) => `[${v.join(',')}]`;

// ---------- Indeks ----------
/**
 * Simpan/perbarui indeks satu sumber. Lewati bila isinya tidak berubah.
 * @returns jumlah potongan yang tersimpan
 */
export async function indexSource(key, { type, id, conversationId = null, title = '', text }) {
  const chunks = chunkText(text);
  const { data: existing, error } = await supabase.from('semantic_chunks').select('chunk_index,content_hash').eq('source_type', type).eq('source_id', id);
  if (error) throw new Error(error.message);
  if (!chunks.length) {
    if (existing?.length) await supabase.from('semantic_chunks').delete().eq('source_type', type).eq('source_id', id);
    return 0;
  }
  const hashes = await Promise.all(chunks.map((c) => hash(`${title}\n${c}`)));
  const old = new Map((existing || []).map((r) => [r.chunk_index, r.content_hash]));
  const changed = chunks.map((_, i) => i).filter((i) => old.get(i) !== hashes[i]);
  if (changed.length) {
    // Judul ikut di-embed supaya pencarian nama dokumen juga kena.
    const vectors = await embedTexts(
      key,
      changed.map((i) => (title ? `${title}\n\n${chunks[i]}` : chunks[i])),
      'passage'
    );
    const rows = changed.map((i, k) => ({
      source_type: type,
      source_id: id,
      conversation_id: conversationId,
      chunk_index: i,
      title: title.slice(0, 300),
      content: chunks[i],
      content_hash: hashes[i],
      embedding: vec(vectors[k]),
    }));
    for (let i = 0; i < rows.length; i += 8) {
      const { error: e } = await supabase
        .from('semantic_chunks')
        .upsert(rows.slice(i, i + 8), { onConflict: 'user_id,source_type,source_id,chunk_index' });
      if (e) throw new Error(e.message);
    }
  }
  if ((existing || []).some((r) => r.chunk_index >= chunks.length)) {
    await supabase.from('semantic_chunks').delete().eq('source_type', type).eq('source_id', id).gte('chunk_index', chunks.length);
  }
  return chunks.length;
}

// Antrean supaya pengindeksan latar belakang tidak berjalan bersamaan.
let queue = Promise.resolve();
export function enqueue(fn) {
  queue = queue.then(fn, fn).catch(() => {});
  return queue;
}

/** Indeks satu pesan chat (dipanggil setelah pesan tersimpan). */
export function indexMessageLater(settings, msg, conversationTitle) {
  if (!semanticReady(settings) || !msg?.id || String(msg.id).match(/^(u|ai)-/)) return;
  const text = msg.role === 'assistant' ? plainText(msg.content || '') : msg.content || '';
  if (text.trim().length < 12) return;
  enqueue(() =>
    indexSource(settings.keys.nvidia, {
      type: 'message',
      id: msg.id,
      conversationId: msg.conversation_id,
      title: `${msg.role === 'user' ? 'Saya' : 'A.I.DRIY'} · ${conversationTitle || 'Chat'}`,
      text,
    })
  );
}

export async function chunkCount() {
  const { count } = await supabase.from('semantic_chunks').select('id', { count: 'exact', head: true });
  return count || 0;
}

export async function clearIndex() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return;
  const { error } = await supabase.from('semantic_chunks').delete().eq('user_id', data.user.id);
  if (error) throw new Error(error.message);
}

// ---------- Cari ----------
async function match(key, query, types, count, signal) {
  const [q] = await embedTexts(key, [query], 'query', { signal });
  const { data, error } = await supabase.rpc('match_chunks', { query_embedding: vec(q), match_count: count, types });
  if (error) throw new Error(error.message);
  return data || [];
}

/** Cari potongan relevan lalu urutkan ulang dengan reranker NVIDIA. */
export async function searchChunks(key, query, { types = ['message', 'library', 'canvas'], count = 30, signal } = {}) {
  const rows = await match(key, query, types, count, signal);
  if (rows.length < 2) return rows.map((r) => ({ ...r, score: 0 }));
  try {
    const ranks = await rerank(
      key,
      query,
      rows.map((r) => (r.title ? `${r.title}\n${r.content}` : r.content)),
      { signal }
    );
    const scored = ranks.map((x) => ({ ...rows[x.index], score: x.score }));
    return scored.sort((a, b) => b.score - a.score);
  } catch {
    // reranker tidak tersedia: pakai urutan kemiripan vektor
    return rows.map((r) => ({ ...r, score: (r.similarity - 1) * 10 }));
  }
}

const RELEVANT = -7; // ambang skor reranker (logit)

function snippet(content, query) {
  const t = content.replace(/\s+/g, ' ').trim();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const pos = words.map((w) => t.toLowerCase().indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, pos - 40);
  return (start ? '…' : '') + t.slice(start, start + 160) + (t.length > start + 160 ? '…' : '');
}

/** Hasil per percakapan untuk menu riwayat. */
export async function searchChatsByMeaning(key, query, conversations, { signal } = {}) {
  const rows = await searchChunks(key, query, { types: ['message'], count: 30, signal });
  const byConv = new Map();
  for (const r of rows) {
    if (!r.conversation_id || byConv.has(r.conversation_id)) continue;
    if (r.score < RELEVANT && byConv.size >= 3) continue;
    const conv = conversations.find((c) => c.id === r.conversation_id);
    if (!conv) continue;
    byConv.set(r.conversation_id, { id: conv.id, title: conv.title, snippet: snippet(r.content, query), score: r.score });
  }
  return [...byConv.values()].slice(0, 12);
}

/** Hasil per berkas/Canvas untuk halaman Pustaka. */
export async function searchLibraryByMeaning(key, query, { signal } = {}) {
  const rows = await searchChunks(key, query, { types: ['library', 'canvas'], count: 30, signal });
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.source_id)) continue;
    if (r.score < RELEVANT && seen.size >= 3) continue;
    seen.set(r.source_id, { sourceType: r.source_type, id: r.source_id, title: r.title, snippet: snippet(r.content, query), score: r.score });
  }
  return [...seen.values()].slice(0, 8);
}

/** Konteks untuk "Jawab dari Pustaka": potongan terbaik dari berkas & Canvas. */
export async function retrieveContext(key, query, { k = 6, signal } = {}) {
  const rows = await searchChunks(key, query, { types: ['library', 'canvas'], count: 24, signal });
  const good = rows.filter((r) => r.score >= RELEVANT).slice(0, k);
  return (good.length ? good : rows.slice(0, 2)).map((r, i) => ({
    n: i + 1,
    title: r.title || 'Dokumen',
    content: r.content,
    sourceType: r.source_type,
    sourceId: r.source_id,
    chunk: r.chunk_index,
    weak: r.score < RELEVANT,
  }));
}

// ---------- Pustaka: ekstrak teks berkas lalu indeks ----------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Berkas tidak bisa dibaca'));
    r.readAsDataURL(blob);
  });
}

/**
 * Ambil teks berkas Pustaka (PDF via pdf.js/Nemotron Parse, file teks langsung), simpan ke
 * library_items.extracted_text, lalu indeks. data (base64) opsional; bila kosong diunduh dari Storage.
 */
export async function indexLibraryItem(key, item, { data, onProgress, signal } = {}) {
  const { extractText, isPdf, isTextLike } = await import('./docText');
  if (!isPdf(item.title, item.mime_type) && !isTextLike(item.title, item.mime_type)) {
    await supabase.from('library_items').update({ index_status: 'unsupported' }).eq('id', item.id);
    return { status: 'unsupported', chunks: 0 };
  }
  let text = item.extracted_text || '';
  let info = {};
  if (!text) {
    let b64 = data;
    if (!b64) {
      const { data: blob, error } = await supabase.storage.from('attachments').download(item.storage_path);
      if (error) throw new Error(error.message);
      b64 = await blobToBase64(blob);
    }
    info = await extractText({ name: item.title, mime: item.mime_type, data: b64 }, { key, onProgress, signal });
    text = (info.text || '').trim();
    await supabase
      .from('library_items')
      .update({ extracted_text: text || null })
      .eq('id', item.id);
  }
  const chunks = text ? await indexSource(key, { type: 'library', id: item.id, title: item.title, text }) : 0;
  const status = chunks ? 'indexed' : 'empty';
  await supabase.from('library_items').update({ index_status: status, indexed_at: new Date().toISOString() }).eq('id', item.id);
  return { status, chunks, ...info };
}

/** Indeks ulang semuanya: chat, berkas Pustaka, dan Canvas. onProgress({phase, done, total}) */
export async function reindexAll(key, { onProgress, signal } = {}) {
  const stop = () => {
    if (signal?.aborted) throw new DOMException('Dibatalkan', 'AbortError');
  };
  const result = { messages: 0, library: 0, canvas: 0, failed: 0 };

  // Chat
  const [{ data: convs }, { data: msgs }] = await Promise.all([
    supabase.from('conversations').select('id,title'),
    supabase.from('messages').select('id,conversation_id,role,content').in('role', ['user', 'assistant']).order('created_at', { ascending: false }).limit(3000),
  ]);
  const titles = new Map((convs || []).map((c) => [c.id, c.title]));
  const list = (msgs || []).filter((m) => (m.content || '').trim().length >= 12);
  for (let i = 0; i < list.length; i++) {
    stop();
    onProgress?.({ phase: 'Chat', done: i, total: list.length });
    const m = list[i];
    try {
      await indexSource(key, {
        type: 'message',
        id: m.id,
        conversationId: m.conversation_id,
        title: `${m.role === 'user' ? 'Saya' : 'A.I.DRIY'} · ${titles.get(m.conversation_id) || 'Chat'}`,
        text: m.role === 'assistant' ? plainText(m.content) : m.content,
      });
      result.messages += 1;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      result.failed += 1;
    }
  }

  // Berkas Pustaka
  const { data: items } = await supabase.from('library_items').select('id,title,mime_type,storage_path,extracted_text,index_status');
  const files = items || [];
  for (let i = 0; i < files.length; i++) {
    stop();
    onProgress?.({ phase: 'Pustaka', done: i, total: files.length });
    try {
      const r = await indexLibraryItem(key, files[i], { signal });
      if (r.chunks) result.library += 1;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      result.failed += 1;
    }
  }

  // Canvas
  const { data: arts } = await supabase.from('artifacts').select('id,title,content,conversation_id');
  const canvases = arts || [];
  for (let i = 0; i < canvases.length; i++) {
    stop();
    onProgress?.({ phase: 'Canvas', done: i, total: canvases.length });
    try {
      await indexSource(key, { type: 'canvas', id: canvases[i].id, conversationId: canvases[i].conversation_id, title: canvases[i].title, text: canvases[i].content });
      result.canvas += 1;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      result.failed += 1;
    }
  }
  onProgress?.({ phase: 'Selesai', done: 1, total: 1 });
  return result;
}

/** Indeks satu Canvas di latar belakang (setelah dibuat/diperbarui). */
export function indexCanvasLater(settings, canvas) {
  if (!semanticReady(settings) || !canvas?.id || !canvas.content) return;
  enqueue(() =>
    indexSource(settings.keys.nvidia, { type: 'canvas', id: canvas.id, conversationId: canvas.conversation_id || null, title: canvas.title || 'Canvas', text: canvas.content })
  );
}
