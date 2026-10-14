import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Images, RotateCcw, X } from 'lucide-react';
import { useBackClose } from '../state';
import { openExternal, tap } from '../lib/native';
import { PROVIDER_LABEL } from '../lib/search/imageSearch';

// Gambar dengan cadangan: thumbnail -> gambar asli -> pesan "tidak dapat dimuat".
function SafeImage({ srcs, alt, className, eager }) {
  const list = srcs.filter(Boolean);
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setI(0);
    setLoaded(false);
  }, [list[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (i >= list.length) {
    return (
      <div className={`img-fallback ${className || ''}`} role="img" aria-label={`${alt} (gagal dimuat)`}>
        <ImageOff size={22} />
        <span>Gambar tidak dapat dimuat</span>
      </div>
    );
  }
  return (
    <img
      key={list[i]}
      className={`${className || ''} ${loaded ? 'loaded' : ''}`}
      src={list[i]}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false);
        setI((x) => x + 1);
      }}
    />
  );
}

function Lightbox({ items, index, onClose, onIndex }) {
  useBackClose(true, onClose);
  const it = items[index];
  if (!it) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={it.title}>
      <div className="lightbox-top">
        <span className="lightbox-count">
          {index + 1} / {items.length}
        </span>
        <button type="button" className="icon-btn light" onClick={onClose} aria-label="Tutup">
          <X size={26} />
        </button>
      </div>
      <div className="lightbox-stage" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="lightbox-imgwrap">
          <SafeImage srcs={[it.imageUrl, it.thumbnailUrl]} alt={it.title} className="lightbox-img" eager />
        </div>
        {index > 0 && (
          <button
            type="button"
            className="lightbox-nav left"
            aria-label="Sebelumnya"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            className="lightbox-nav right"
            aria-label="Berikutnya"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>
      <div className="lightbox-info">
        <div className="lightbox-title">{it.title}</div>
        <div className="lightbox-domain">Sumber: {it.domain}</div>
        <div className="lightbox-actions">
          <button type="button" className="btn btn-light" onClick={() => openExternal(it.sourceUrl)}>
            <ExternalLink size={18} /> Buka halaman sumber
          </button>
          <button type="button" className="btn btn-outline-light" onClick={() => openExternal(it.imageUrl)}>
            Gambar asli
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * block: { query, status: 'loading'|'done'|'error', results, provider, error, message }
 */
export default function ImageGallery({ block, onRetry }) {
  const [open, setOpen] = useState(-1);
  if (!block) return null;
  const { query, status, results = [], provider } = block;

  return (
    <section className="gallery" aria-label={`Gambar: ${query}`}>
      <div className="gallery-head">
        <Images size={16} />
        <span className="truncate">
          Gambar: <b>{query}</b>
        </span>
      </div>

      {status === 'loading' && (
        <div className="gallery-track" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="gallery-card skeleton">
              <div className="gallery-thumb shimmer" />
              <div className="gallery-meta">
                <span className="sk-line" />
                <span className="sk-line short" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="gallery-note error">
          <span>Gambar tidak bisa dicari: {block.error || 'layanan tidak merespons'}. Tidak ada gambar yang ditampilkan.</span>
          {onRetry && (
            <button type="button" className="link-btn" onClick={onRetry}>
              <RotateCcw size={14} /> Coba lagi
            </button>
          )}
        </div>
      )}

      {status === 'done' && results.length === 0 && (
        <div className="gallery-note">
          {block.message || 'Tidak ada gambar yang cocok'} untuk “{query}”.
        </div>
      )}

      {status === 'done' && results.length > 0 && (
        <>
          <div className="gallery-track">
            {results.map((r, i) => (
              <div key={r.imageUrl} className="gallery-card">
                <button
                  type="button"
                  className="gallery-thumb"
                  onClick={() => {
                    tap();
                    setOpen(i);
                  }}
                  aria-label={`Perbesar: ${r.title}`}
                >
                  <SafeImage srcs={[r.thumbnailUrl, r.imageUrl]} alt={r.title} className="gallery-img" />
                </button>
                <button type="button" className="gallery-meta" onClick={() => openExternal(r.sourceUrl)} aria-label={`Buka sumber: ${r.domain}`}>
                  <span className="gallery-title">{r.title}</span>
                  <span className="gallery-domain">
                    <ExternalLink size={12} /> {r.domain}
                  </span>
                </button>
              </div>
            ))}
          </div>
          <div className="gallery-credit">
            {results.length} gambar via {PROVIDER_LABEL[provider] || provider || 'pencarian web'} · hak cipta milik pemilik masing-masing
          </div>
        </>
      )}

      {open >= 0 && <Lightbox items={results} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />}
    </section>
  );
}
