// Penyimpanan Canvas (tabel `artifacts`) dengan revisi dan penanganan konflik.
import { supabase } from './supabase';

export const KIND_LABEL = { document: 'Dokumen', code: 'Kode', html: 'Halaman web', svg: 'Diagram SVG', markdown: 'Dokumen' };

export class CanvasConflictError extends Error {
  constructor() {
    super('Canvas sudah berubah di tempat lain');
    this.code = 'conflict';
  }
}

const COLS = 'id,title,kind,language,content,revision,is_favorite,conversation_id,message_id,created_at,updated_at';

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export function kindOf(row) {
  return row?.kind === 'markdown' ? 'document' : row?.kind || 'document';
}

export async function createCanvas({ conversation_id, message_id, title, kind, language, content }) {
  return check(
    await supabase
      .from('artifacts')
      .insert({ conversation_id, message_id, title: title || 'Canvas', kind, language: kind === 'code' ? language : null, content })
      .select(COLS)
      .single()
  );
}

/** Simpan versi baru. Gagal dengan CanvasConflictError bila revisi dasar sudah tidak terbaru. */
export async function saveCanvas(id, baseRevision, content, { title = null, source = 'user' } = {}) {
  const { data, error } = await supabase.rpc('save_artifact_revision', {
    p_id: id,
    p_base_revision: baseRevision,
    p_content: content,
    p_title: title,
    p_source: source,
  });
  if (error) {
    if (error.code === '40001' || /revision_conflict/.test(error.message)) throw new CanvasConflictError();
    if (/not_found/.test(error.message)) throw new Error('Canvas tidak ditemukan atau sudah dihapus');
    throw new Error(error.message);
  }
  return data;
}

export async function getCanvas(id) {
  return check(await supabase.from('artifacts').select(COLS).eq('id', id).maybeSingle());
}

export async function listConversationCanvases(conversationId, limit = 6) {
  if (!conversationId) return [];
  return check(
    await supabase
      .from('artifacts')
      .select(COLS)
      .eq('conversation_id', conversationId)
      .order('updated_at', { ascending: false })
      .limit(limit)
  );
}

export async function listCanvases() {
  return check(
    await supabase
      .from('artifacts')
      .select('id,title,kind,language,revision,is_favorite,conversation_id,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(500)
  );
}

export async function listRevisions(id) {
  return check(
    await supabase
      .from('artifact_revisions')
      .select('id,revision,title,content,source,created_at')
      .eq('artifact_id', id)
      .order('revision', { ascending: false })
      .limit(50)
  );
}

export async function setCanvasFavorite(id, value) {
  check(await supabase.from('artifacts').update({ is_favorite: value }).eq('id', id));
}

export async function deleteCanvas(id) {
  check(await supabase.from('artifacts').delete().eq('id', id));
}

// ---------- Draf lokal (agar suntingan tidak hilang saat offline / pindah halaman) ----------
const draftKey = (id) => `aidriy.canvas.draft.${id}`;
export function readDraft(id) {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeDraft(id, draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    /* penyimpanan penuh */
  }
}
export function clearDraft(id) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* abaikan */
  }
}

export function canvasFilename(c) {
  const ext = { document: 'md', markdown: 'md', html: 'html', svg: 'svg' }[c.kind] || LANG_EXT[c.language] || 'txt';
  const base = (c.title || 'canvas').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'canvas';
  return `${base}.${ext}`;
}

const LANG_EXT = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', kotlin: 'kt', java: 'java',
  css: 'css', json: 'json', jsx: 'jsx', tsx: 'tsx', sql: 'sql', bash: 'sh', shell: 'sh', dart: 'dart', go: 'go',
  rust: 'rs', php: 'php', c: 'c', cpp: 'cpp', csharp: 'cs', swift: 'swift', ruby: 'rb', yaml: 'yml', xml: 'xml',
};
