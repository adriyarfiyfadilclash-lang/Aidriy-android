import { useMemo, useState } from 'react';
import { Download, ExternalLink, File as FileIcon, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useApp, useBackClose } from '../state';
import { attachmentUrl } from '../lib/db';
import { formatSize } from '../lib/files';
import { openExternal, shareBlob, tap } from '../lib/native';
import { Sheet, timeAgo } from './ui';

const KIND_LABEL = { image: 'Gambar', pdf: 'PDF', text: 'Teks', file: 'Berkas' };

function typeLabel(a) {
  const ext = (a.name || '').split('.').pop();
  const base = KIND_LABEL[a.kind] || 'Berkas';
  return ext && ext !== a.name && ext.length <= 5 ? `${base} · ${ext.toUpperCase()}` : base;
}

function b64Blob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function ImageViewer({ src, name, onClose }) {
  useBackClose(true, onClose);
  return (
    <div className="image-viewer" onClick={onClose} role="dialog" aria-label={name}>
      <img src={src} alt={name} />
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
        <X size={26} />
      </button>
    </div>
  );
}

/** Daftar semua berkas yang diunggah di percakapan aktif, dari data unggahan asli. */
export default function ChatFilesSheet({ open, onClose, messages, getLocal }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(null);
  const [view, setView] = useState(null);

  const files = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of messages) {
      if (m.role !== 'user') continue;
      for (const a of m.attachments || []) {
        const key = a.path || a.id || `${m.id}-${a.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...a, key, at: m.created_at });
      }
    }
    return out.reverse(); // terbaru di atas
  }, [messages]);

  const source = async (a) => {
    if (a.path) return { url: await attachmentUrl(a.path) };
    const local = getLocal?.(a.id);
    if (local?.data) return { blob: b64Blob(local.data, local.mime) };
    if (a.kind === 'text' && a.text) return { blob: new Blob([a.text], { type: 'text/plain' }) };
    return null;
  };

  const openFile = async (a) => {
    tap();
    setBusy(a.key);
    try {
      const s = await source(a);
      if (!s) throw new Error('Berkas ini tidak tersimpan di cloud (dikirim saat incognito atau unggahan gagal).');
      if (a.kind === 'image') setView({ src: s.url || URL.createObjectURL(s.blob), name: a.name });
      else if (s.url) await openExternal(s.url);
      else await shareBlob(a.name, s.blob);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const download = async (a) => {
    tap();
    setBusy(a.key);
    try {
      const s = await source(a);
      if (!s) throw new Error('Berkas ini tidak tersimpan di cloud (dikirim saat incognito atau unggahan gagal).');
      const blob = s.blob || (await (await fetch(s.url)).blob());
      await shareBlob(a.name, blob);
    } catch (e) {
      if (!/cancel/i.test(e.message || '')) showToast(`Gagal mengunduh: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="File yang diunggah">
        {files.length === 0 ? (
          <div className="files-empty">
            <FileIcon size={34} strokeWidth={1.4} />
            <div>Belum ada file di percakapan ini.</div>
            <div className="muted small">Lampirkan foto atau dokumen lewat tombol + di kolom chat.</div>
          </div>
        ) : (
          <div className="files-list" role="list">
            {files.map((a) => {
              const available = !!(a.path || getLocal?.(a.id)?.data || (a.kind === 'text' && a.text));
              const Icon = a.kind === 'image' ? ImageIcon : a.kind === 'pdf' || a.kind === 'text' ? FileText : FileIcon;
              return (
                <div key={a.key} className="files-row" role="listitem">
                  {a.kind === 'image' && a.thumb ? <img className="files-thumb" src={a.thumb} alt="" /> : <span className="files-icon"><Icon size={22} strokeWidth={1.6} /></span>}
                  <span className="files-text">
                    <span className="files-name truncate">{a.name}</span>
                    <span className="files-meta truncate">
                      {[typeLabel(a), a.size ? formatSize(a.size) : null, a.at ? timeAgo(a.at) : null, available ? null : 'tidak tersimpan'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {busy === a.key ? (
                    <span className="spinner small" />
                  ) : (
                    <>
                      <button type="button" className="files-btn" onClick={() => openFile(a)} disabled={!available} aria-label={`Buka ${a.name}`}>
                        <ExternalLink size={19} />
                      </button>
                      <button type="button" className="files-btn" onClick={() => download(a)} disabled={!available} aria-label={`Unduh ${a.name}`}>
                        <Download size={19} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
      {view && <ImageViewer src={view.src} name={view.name} onClose={() => setView(null)} />}
    </>
  );
}
