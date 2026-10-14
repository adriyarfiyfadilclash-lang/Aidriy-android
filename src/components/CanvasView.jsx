import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  History,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Share2,
  Star,
  X,
} from 'lucide-react';
import { useApp, useBackClose } from '../state';
import * as canvasDb from '../lib/canvas';
import { copyText, shareFile, tap } from '../lib/native';
import { timeAgo, Group, IconButton, Row, Sheet } from './ui';
import Markdown from './Markdown';

const AUTOSAVE_MS = 1200;

function frameDoc(kind, content) {
  if (kind === 'svg') {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:100%;max-height:100vh;height:auto}</style></head><body>${content}</body></html>`;
  }
  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) return content;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`;
}

const STATUS = {
  saved: 'Tersimpan',
  dirty: 'Belum tersimpan',
  saving: 'Menyimpan…',
  error: 'Gagal menyimpan',
  conflict: 'Ada versi lain',
  local: 'Incognito · tidak disimpan',
  loading: 'Memuat…',
};

function ManualCopy({ text, onClose }) {
  const ref = useRef();
  useBackClose(true, onClose);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Salin manual</div>
        <p className="dialog-message">Clipboard tidak bisa diakses. Teks sudah dipilih: tekan lama lalu pilih Salin.</p>
        <textarea ref={ref} className="input textarea mono" rows={8} readOnly value={text} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-dark" onClick={onClose}>
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Canvas: ruang kerja untuk hasil akhir AI.
 * - canvasId: Canvas tersimpan di database
 * - local: Canvas di chat incognito (hanya di memori)
 */
export default function CanvasView({ canvasId, local, onClose, docked = false, refreshKey = 0, onOpenConversation, onLocalChange, initialMode = 'preview', onSaved }) {
  const { showToast } = useApp();
  const [art, setArt] = useState(local ? { ...local, revision: 1 } : null);
  const [title, setTitle] = useState(local?.title || '');
  const [content, setContent] = useState(local?.content || '');
  const [mode, setMode] = useState(initialMode === 'edit' ? 'edit' : 'preview');
  const [status, setStatus] = useState(local ? 'local' : 'loading');
  const [loadError, setLoadError] = useState('');
  const [conflict, setConflict] = useState(null); // versi server terbaru saat konflik
  const [menu, setMenu] = useState(false);
  const [revisions, setRevisions] = useState(null);
  const [preview, setPreview] = useState(null);
  const [manualCopy, setManualCopy] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  const latest = useRef({ content, title, art, status });
  latest.current = { content, title, art, status };

  useBackClose(!docked, onClose);

  // Beri tahu chat setiap ada revisi tersimpan, supaya tampilan inline ikut terbaru.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (art?.id && !local && art.revision) onSavedRef.current?.(art);
  }, [art, local]);

  const kind = canvasDb.kindOf(art);
  const isCode = kind === 'code' || kind === 'html' || kind === 'svg';

  // ---------- Muat ----------
  const load = useCallback(async () => {
    if (local || !canvasId) return;
    try {
      const row = await canvasDb.getCanvas(canvasId);
      if (!row) {
        setLoadError('Canvas tidak ditemukan atau sudah dihapus.');
        return;
      }
      const draft = canvasDb.readDraft(canvasId);
      setArt(row);
      if (draft && draft.content !== row.content && draft.baseRevision === row.revision) {
        // Suntingan lokal yang belum sempat tersimpan
        setTitle(draft.title || row.title);
        setContent(draft.content);
        setStatus('dirty');
      } else if (draft && draft.baseRevision < row.revision && draft.content !== row.content) {
        setTitle(row.title);
        setContent(row.content);
        setConflict({ server: row, mine: draft });
        setStatus('conflict');
      } else {
        if (draft) canvasDb.clearDraft(canvasId);
        setTitle(row.title);
        setContent(row.content);
        setStatus('saved');
      }
      setLoadError('');
    } catch (e) {
      const draft = canvasDb.readDraft(canvasId);
      if (draft) {
        setArt((a) => a || { id: canvasId, title: draft.title, content: draft.content, revision: draft.baseRevision, kind: draft.kind || 'document' });
        setTitle(draft.title);
        setContent(draft.content);
        setStatus('error');
      }
      setLoadError(`Tidak bisa memuat Canvas: ${e.message}`);
    }
  }, [canvasId, local]);

  useEffect(() => {
    load();
  }, [load]);

  // Pembaruan dari AI saat Canvas terbuka
  useEffect(() => {
    if (!refreshKey || local || !canvasId) return;
    (async () => {
      try {
        const row = await canvasDb.getCanvas(canvasId);
        if (!row) return;
        const cur = latest.current;
        if (cur.status === 'dirty' || cur.status === 'saving' || cur.status === 'error') {
          if (row.revision !== cur.art?.revision) {
            setConflict({ server: row, mine: { content: cur.content, title: cur.title } });
            setStatus('conflict');
          }
        } else {
          setArt(row);
          setTitle(row.title);
          setContent(row.content);
          setStatus('saved');
        }
      } catch {
        /* abaikan, akan dimuat ulang nanti */
      }
    })();
  }, [refreshKey, canvasId, local]);

  useEffect(() => {
    if (local) {
      setArt({ ...local, revision: 1 });
      setTitle(local.title);
      setContent(local.content);
    }
  }, [local]);

  // ---------- Simpan ----------
  const save = useCallback(
    async (opts = {}) => {
      const cur = latest.current;
      if (local || !cur.art?.id) return;
      clearTimeout(timer.current);
      const base = opts.baseRevision ?? cur.art.revision;
      setStatus('saving');
      try {
        const row = await canvasDb.saveCanvas(cur.art.id, base, cur.content, {
          title: cur.title !== cur.art.title ? cur.title : null,
          source: opts.source || 'user',
        });
        canvasDb.clearDraft(cur.art.id);
        setArt(row);
        setConflict(null);
        // Bila pengguna masih mengetik selama menyimpan, tandai lagi sebagai belum tersimpan.
        const now = latest.current;
        setStatus(now.content === row.content && now.title === row.title ? 'saved' : 'dirty');
      } catch (e) {
        if (e instanceof canvasDb.CanvasConflictError) {
          try {
            const server = await canvasDb.getCanvas(cur.art.id);
            setConflict({ server, mine: { content: cur.content, title: cur.title } });
          } catch {
            /* tetap tampilkan konflik */
          }
          setStatus('conflict');
        } else {
          setStatus('error');
          showToast(`Canvas gagal disimpan: ${e.message}`, 'error');
        }
      }
    },
    [local, showToast]
  );

  const edit = (patch) => {
    const next = { content, title, ...patch };
    if ('content' in patch) setContent(patch.content);
    if ('title' in patch) setTitle(patch.title);
    if (local) {
      onLocalChange?.(next);
      return;
    }
    if (!art?.id) return;
    canvasDb.writeDraft(art.id, { baseRevision: art.revision, content: next.content, title: next.title, kind });
    if (status === 'conflict') return; // tunggu keputusan pengguna
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), AUTOSAVE_MS);
  };

  // Simpan saat Canvas ditutup / pindah halaman
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const cur = latest.current;
      if (!local && cur.art?.id && cur.status === 'dirty') {
        canvasDb.saveCanvas(cur.art.id, cur.art.revision, cur.content, { title: cur.title !== cur.art.title ? cur.title : null }).then(
          () => canvasDb.clearDraft(cur.art.id),
          () => {}
        );
      }
    },
    [local]
  );

  // ---------- Aksi ----------
  const doCopy = async () => {
    tap();
    const ok = await copyText(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      showToast('Isi Canvas disalin');
    } else {
      setManualCopy(content);
    }
  };

  const doShare = async () => {
    setMenu(false);
    try {
      await shareFile(canvasDb.canvasFilename({ ...art, title, kind }), content);
    } catch (e) {
      if (!/cancel/i.test(e.message || '')) showToast(e.message, 'error');
    }
  };

  const openRevisions = async () => {
    setMenu(false);
    setRevisions([]);
    try {
      setRevisions(await canvasDb.listRevisions(art.id));
    } catch (e) {
      showToast(e.message, 'error');
      setRevisions(null);
    }
  };

  const restore = async (rev) => {
    try {
      const row = await canvasDb.saveCanvas(art.id, art.revision, rev.content, { title: rev.title, source: 'restore' });
      canvasDb.clearDraft(art.id);
      setArt(row);
      setTitle(row.title);
      setContent(row.content);
      setStatus('saved');
      setPreview(null);
      setRevisions(null);
      showToast(`Revisi ${rev.revision} dipulihkan sebagai revisi ${row.revision}`);
    } catch (e) {
      showToast(e instanceof canvasDb.CanvasConflictError ? 'Canvas berubah, muat ulang dulu' : e.message, 'error');
    }
  };

  const toggleFavorite = async () => {
    setMenu(false);
    try {
      await canvasDb.setCanvasFavorite(art.id, !art.is_favorite);
      setArt((a) => ({ ...a, is_favorite: !a.is_favorite }));
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const doc = useMemo(() => (kind === 'html' || kind === 'svg' ? frameDoc(kind, content) : ''), [kind, content]);

  // ---------- Tampilan ----------
  if (loadError && !art) {
    return (
      <div className={docked ? 'canvas canvas-docked' : 'canvas canvas-full'}>
        <header className="canvas-head">
          <IconButton label="Kembali ke chat" onClick={onClose}>
            {docked ? <X size={22} /> : <ArrowLeft size={24} />}
          </IconButton>
          <div className="canvas-title-wrap">
            <div className="canvas-title">Canvas</div>
          </div>
        </header>
        <div className="center-fill">
          <div className="empty">
            <div className="empty-title">Canvas tidak bisa dibuka</div>
            <p className="empty-text">{loadError}</p>
            <button type="button" className="btn btn-dark" onClick={load}>
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={docked ? 'canvas canvas-docked' : 'canvas canvas-full'} role="region" aria-label="Canvas">
      <header className="canvas-head">
        <IconButton label="Kembali ke chat" onClick={onClose}>
          {docked ? <X size={22} /> : <ArrowLeft size={24} />}
        </IconButton>
        <div className="canvas-title-wrap">
          {editingTitle ? (
            <input
              className="canvas-title-input"
              value={title}
              autoFocus
              maxLength={120}
              onChange={(e) => edit({ title: e.target.value })}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
            />
          ) : (
            <button type="button" className="canvas-title truncate" onClick={() => setEditingTitle(true)} title="Ubah judul">
              {title || 'Tanpa judul'}
            </button>
          )}
          <div className="canvas-sub">
            <span>{canvasDb.KIND_LABEL[kind] || 'Canvas'}{kind === 'code' && art?.language ? ` · ${art.language}` : ''}</span>
            {!local && art?.revision ? <span>· Rev {art.revision}</span> : null}
            <span className={`canvas-status s-${status}`}>· {STATUS[status]}</span>
          </div>
        </div>
        <IconButton label="Salin isi Canvas" onClick={doCopy}>
          {copied ? <Check size={22} /> : <Copy size={21} strokeWidth={1.75} />}
        </IconButton>
        <IconButton label={mode === 'edit' ? 'Pratinjau' : 'Edit'} onClick={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))} className={mode === 'edit' ? 'on' : ''}>
          {mode === 'edit' ? <Eye size={21} /> : <Pencil size={20} />}
        </IconButton>
        <IconButton label="Menu Canvas" onClick={() => setMenu(true)}>
          <MoreHorizontal size={22} />
        </IconButton>
      </header>

      {status === 'error' && (
        <div className="canvas-banner error">
          <span>Perubahan belum tersimpan ke server (disimpan sementara di HP).</span>
          <button type="button" className="link-btn" onClick={() => save()}>
            Coba simpan lagi
          </button>
        </div>
      )}
      {status === 'conflict' && conflict && (
        <div className="canvas-banner warn">
          <span>Canvas ini diperbarui di tempat lain (revisi {conflict.server?.revision}) saat kamu menyunting.</span>
          <div className="canvas-banner-actions">
            <button
              type="button"
              className="btn btn-ghost small-btn"
              onClick={() => {
                const s = conflict.server;
                canvasDb.clearDraft(s.id);
                setArt(s);
                setTitle(s.title);
                setContent(s.content);
                setConflict(null);
                setStatus('saved');
              }}
            >
              Pakai versi terbaru
            </button>
            <button
              type="button"
              className="btn btn-dark small-btn"
              onClick={() => {
                setContent(conflict.mine.content);
                setTitle(conflict.mine.title || title);
                latest.current = { ...latest.current, content: conflict.mine.content, title: conflict.mine.title || title };
                setArt(conflict.server);
                save({ baseRevision: conflict.server.revision });
              }}
            >
              Simpan versi saya
            </button>
          </div>
        </div>
      )}

      <div className="canvas-body">
        {mode === 'edit' ? (
          <textarea
            className={`canvas-editor ${isCode ? 'mono code' : ''}`}
            value={content}
            spellCheck={!isCode}
            autoCapitalize={isCode ? 'off' : 'sentences'}
            wrap={isCode ? 'off' : 'soft'}
            onChange={(e) => edit({ content: e.target.value })}
            aria-label="Isi Canvas"
          />
        ) : kind === 'html' || kind === 'svg' ? (
          <iframe title={title} className="artifact-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock" srcDoc={doc} />
        ) : kind === 'code' ? (
          <pre className="canvas-code">
            <code>{content}</code>
          </pre>
        ) : (
          <div className="canvas-doc">
            <Markdown text={content || '*Canvas kosong*'} />
          </div>
        )}
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={title || 'Canvas'}>
        <Group>
          <Row icon={<Copy size={22} strokeWidth={1.6} />} title="Salin isi Canvas" onClick={() => { setMenu(false); doCopy(); }} />
          <Row icon={<Share2 size={22} strokeWidth={1.6} />} title="Bagikan / ekspor berkas" subtitle={canvasDb.canvasFilename({ ...art, title, kind })} onClick={doShare} />
          {!local && <Row icon={<History size={22} strokeWidth={1.6} />} title="Riwayat revisi" subtitle={`Revisi saat ini: ${art?.revision || 1}`} onClick={openRevisions} />}
          {!local && (
            <Row icon={<Star size={22} strokeWidth={1.6} />} title={art?.is_favorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'} subtitle="Tampil di Pustaka" onClick={toggleFavorite} />
          )}
          {onOpenConversation && art?.conversation_id && (
            <Row
              icon={<MessageCircle size={22} strokeWidth={1.6} />}
              title="Buka percakapan asal"
              onClick={() => {
                setMenu(false);
                onOpenConversation(art.conversation_id);
              }}
            />
          )}
        </Group>
      </Sheet>

      <Sheet open={revisions !== null} onClose={() => { setRevisions(null); setPreview(null); }} title="Riwayat revisi" className="sheet-tall">
        {preview ? (
          <>
            <div className="rev-preview-head">
              <button type="button" className="link-btn" onClick={() => setPreview(null)}>
                ← Semua revisi
              </button>
              <span className="muted small">Revisi {preview.revision}</span>
            </div>
            <pre className="rev-preview">{preview.content}</pre>
            {preview.revision !== art?.revision && (
              <button type="button" className="btn btn-dark btn-block" onClick={() => restore(preview)}>
                <RotateCcw size={18} /> Pulihkan revisi {preview.revision}
              </button>
            )}
          </>
        ) : (
          <Group>
            {revisions?.length === 0 && <p className="muted pad">Memuat…</p>}
            {revisions?.map((r) => (
              <Row
                key={r.id}
                title={`Revisi ${r.revision}${r.revision === art?.revision ? ' (saat ini)' : ''}`}
                subtitle={`${r.source === 'ai' ? 'Oleh AI' : r.source === 'restore' ? 'Dipulihkan' : 'Suntingan kamu'} · ${timeAgo(r.created_at)}`}
                onClick={() => setPreview(r)}
                chevron
              />
            ))}
          </Group>
        )}
      </Sheet>

      {manualCopy !== null && <ManualCopy text={manualCopy} onClose={() => setManualCopy(null)} />}
    </div>
  );
}
