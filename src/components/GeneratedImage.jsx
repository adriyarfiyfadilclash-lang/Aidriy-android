import { useEffect, useState } from 'react';
import { Download, Maximize2, X } from 'lucide-react';
import { attachmentUrl } from '../lib/db';
import { shareBlob, tap } from '../lib/native';
import { useApp, useBackClose } from '../state';

const urlCache = new Map();

function Viewer({ src, onClose }) {
  useBackClose(true, onClose);
  return (
    <div className="image-viewer" onClick={onClose} role="dialog" aria-label="Gambar">
      <img src={src} alt="" />
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
        <X size={26} />
      </button>
    </div>
  );
}

/** Gambar hasil NVIDIA FLUX di dalam pesan AI. */
export default function GeneratedImage({ gen }) {
  const { showToast } = useApp();
  const [src, setSrc] = useState(gen.dataUrl || urlCache.get(gen.path) || '');
  const [error, setError] = useState('');
  const [view, setView] = useState(false);

  useEffect(() => {
    if (src || !gen.path) return;
    let alive = true;
    attachmentUrl(gen.path)
      .then((u) => {
        urlCache.set(gen.path, u);
        if (alive) setSrc(u);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [gen.path, src]);

  const save = async () => {
    tap();
    try {
      const blob = await (await fetch(src)).blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      await shareBlob(`aidriy-gambar-${gen.seed || Date.now()}.${ext}`, blob);
    } catch (e) {
      if (!/cancel/i.test(e.message || '')) showToast(`Gagal menyimpan gambar: ${e.message}`, 'error');
    }
  };

  return (
    <div className="gen-image">
      {src ? (
        <button type="button" onClick={() => setView(true)} aria-label="Lihat gambar penuh" style={{ display: 'block', width: '100%' }}>
          <img src={src} alt={gen.prompt || 'Gambar buatan AI'} />
        </button>
      ) : (
        <div className="gen-image-loading">{error ? `Gambar tidak bisa dimuat: ${error}` : <span className="spinner" />}</div>
      )}
      {src && (
        <div className="gen-image-bar">
          <button type="button" className="cb-btn" onClick={save}>
            <Download size={16} /> Simpan
          </button>
          <button type="button" className="cb-btn" onClick={() => setView(true)}>
            <Maximize2 size={16} /> Perbesar
          </button>
          <span className="gen-image-meta">{gen.modelLabel || gen.model}</span>
        </div>
      )}
      {view && src && <Viewer src={src} onClose={() => setView(false)} />}
    </div>
  );
}
