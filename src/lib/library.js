// Pustaka: file milik pengguna (tabel library_items + Storage) dan Canvas (tabel artifacts).
import { supabase } from './supabase';
import * as canvasDb from './canvas';
import { fileToAttachment } from './files';

export const MAX_BYTES = 25 * 1024 * 1024;
const BLOCKED_EXT = /\.(apk|aab|exe|msi|bat|cmd|sh|dll|so|jar|scr|com|ps1|vbs)$/i;
const DOC_EXT = /\.(pdf|docx?|odt|rtf|txt|md|markdown|pptx?|odp|xlsx?|ods|csv|tsv|epub)$/i;
const CACHE_KEY = 'aidriy.library.cache.v1';

export const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'document', label: 'Dokumen' },
  { id: 'image', label: 'Gambar' },
  { id: 'file', label: 'File' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'favorite', label: 'Favorit' },
];

export const SORTS = [
  { value: 'created', label: 'Terbaru ditambahkan' },
  { value: 'updated', label: 'Terakhir diperbarui' },
  { value: 'name', label: 'Nama A–Z' },
];

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export function extOf(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function classify(name, mime) {
  if ((mime || '').startsWith('image/')) return 'image';
  if (DOC_EXT.test(name) || /pdf|msword|officedocument|opendocument|text\/plain|markdown/.test(mime || '')) return 'document';
  return 'file';
}

export function validateFile(file) {
  if (!file || !file.name) return 'Berkas tidak bisa dibaca';
  if (BLOCKED_EXT.test(file.name)) return `"${file.name}": jenis berkas ini tidak diizinkan`;
  if (file.size === 0) return `"${file.name}" kosong`;
  if (file.size > MAX_BYTES) return `"${file.name}" lebih dari 25 MB`;
  return null;
}

async function sha256(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function thumbFromFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 240;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Impor satu berkas. Mengembalikan { item, duplicate }.
 * Berkas disalin ke Storage pribadi agar tetap bisa dibuka setelah aplikasi ditutup.
 */
export async function importFile(uid, file) {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);
  let buf;
  try {
    buf = await file.arrayBuffer();
  } catch {
    throw new Error(`"${file.name}" tidak bisa dibaca dari perangkat`);
  }
  const hash = await sha256(buf);
  const existing = check(await supabase.from('library_items').select('*').eq('sha256', hash).maybeSingle());
  if (existing) return { item: existing, duplicate: true };

  const mime = file.type || 'application/octet-stream';
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${uid}/library/${crypto.randomUUID()}-${safe}`;
  check(await supabase.storage.from('attachments').upload(path, buf, { contentType: mime, upsert: false }));
  const itemType = classify(file.name, mime);
  const thumb = itemType === 'image' ? await thumbFromFile(file) : null;
  try {
    const item = check(
      await supabase
        .from('library_items')
        .insert({
          title: file.name,
          item_type: itemType,
          mime_type: mime,
          extension: extOf(file.name),
          storage_path: path,
          size_bytes: file.size,
          sha256: hash,
          thumb,
        })
        .select()
        .single()
    );
    return { item, duplicate: false };
  } catch (e) {
    // Jangan tinggalkan berkas yatim bila metadata gagal disimpan
    await supabase.storage.from('attachments').remove([path]);
    throw e;
  }
}

/** Gabungan berkas & Canvas dalam satu bentuk untuk tampilan. */
export async function loadLibrary() {
  const [files, canvases] = await Promise.all([
    supabase.from('library_items').select('id,title,item_type,mime_type,extension,storage_path,size_bytes,thumb,is_favorite,source_conversation_id,index_status,created_at,updated_at').order('created_at', { ascending: false }).limit(1000),
    canvasDb.listCanvases(),
  ]);
  const items = [
    ...check(files).map((f) => ({ ...f, source: 'file' })),
    ...canvases.map((c) => ({
      id: c.id,
      source: 'canvas',
      title: c.title,
      item_type: 'canvas',
      kind: canvasDb.kindOf(c),
      language: c.language,
      revision: c.revision,
      is_favorite: c.is_favorite,
      conversation_id: c.conversation_id,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })),
  ];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: items.map(({ thumb, ...rest }) => ({ ...rest, thumb: thumb && thumb.length < 30000 ? thumb : null })) }));
  } catch {
    /* cache penuh: abaikan */
  }
  return items;
}

export function cachedLibrary() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function filterSort(items, { filter, query, sort }) {
  const q = query.trim().toLowerCase();
  let list = items.filter((it) => {
    if (filter === 'favorite' && !it.is_favorite) return false;
    if (filter === 'canvas' && it.source !== 'canvas') return false;
    if (['document', 'image', 'file'].includes(filter) && (it.source !== 'file' || it.item_type !== filter)) return false;
    if (!q) return true;
    const hay = [it.title, it.extension, it.mime_type, it.source === 'canvas' ? `canvas ${canvasDb.KIND_LABEL[it.kind] || ''} ${it.language || ''}` : TYPE_LABEL[it.item_type], it.is_favorite ? 'favorit' : '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
  const by = {
    created: (a, b) => b.created_at.localeCompare(a.created_at),
    updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
    name: (a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' }),
  }[sort];
  list = [...list].sort(by);
  return list;
}

export const TYPE_LABEL = { document: 'Dokumen', image: 'Gambar', file: 'File', canvas: 'Canvas' };

export async function renameItem(it, title) {
  const t = title.trim().slice(0, 160);
  if (!t) throw new Error('Nama tidak boleh kosong');
  if (it.source === 'canvas') {
    const cur = await canvasDb.getCanvas(it.id);
    if (!cur) throw new Error('Canvas tidak ditemukan');
    return canvasDb.saveCanvas(it.id, cur.revision, cur.content, { title: t, source: 'user' });
  }
  return check(await supabase.from('library_items').update({ title: t, updated_at: new Date().toISOString() }).eq('id', it.id).select().single());
}

export async function setFavorite(it, value) {
  if (it.source === 'canvas') return canvasDb.setCanvasFavorite(it.id, value);
  check(await supabase.from('library_items').update({ is_favorite: value }).eq('id', it.id));
}

/** Hapus satu item saja. Canvas: pesan chat asal tetap ada. Berkas: metadata + isi di Storage. */
export async function deleteItem(it) {
  if (it.source === 'canvas') return canvasDb.deleteCanvas(it.id);
  const { error } = await supabase.storage.from('attachments').remove([it.storage_path]);
  if (error && !/not.?found/i.test(error.message)) throw new Error(`Berkas gagal dihapus: ${error.message}`);
  check(await supabase.from('library_items').delete().eq('id', it.id));
}

export async function downloadBlob(it) {
  const { data, error } = await supabase.storage.from('attachments').download(it.storage_path);
  if (error || !data) throw new Error('Berkas tidak tersedia lagi di penyimpanan');
  return data;
}

export async function signedUrl(it) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(it.storage_path, 600);
  if (error) throw new Error('Berkas tidak tersedia lagi di penyimpanan');
  return data.signedUrl;
}

/** Ubah item Pustaka menjadi lampiran chat (hanya saat pengguna memilih "Lampirkan ke chat"). */
export async function toAttachment(it) {
  if (it.source === 'canvas') {
    const c = await canvasDb.getCanvas(it.id);
    if (!c) throw new Error('Canvas tidak ditemukan');
    const name = canvasDb.canvasFilename(c);
    const file = new File([c.content], name, { type: 'text/plain' });
    return fileToAttachment(file);
  }
  const blob = await downloadBlob(it);
  const file = new File([blob], it.title, { type: it.mime_type || blob.type });
  try {
    return await fileToAttachment(file);
  } catch (e) {
    throw new Error(`${it.title}: ${e.message.replace(/^"[^"]*"\s*/, '')}`);
  }
}
