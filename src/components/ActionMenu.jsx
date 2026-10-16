import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBackClose } from '../state';
import { tap } from '../lib/native';

/**
 * Menu aksi yang muncul di bawah tombol pemicunya (rata kanan), tidak keluar layar,
 * tertutup saat ketuk luar / pilih item / tombol kembali / Escape, dengan animasi masuk & keluar.
 *
 * items: [{ key, label, icon, hint, danger, disabled, onSelect }] atau { divider: true }
 */
export default function ActionMenu({ open, anchor, items, onClose, label = 'Menu', width = 280 }) {
  const ref = useRef();
  const [pos, setPos] = useState(null);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useBackClose(open, onClose);

  // Animasi keluar: tetap dipasang sebentar setelah ditutup
  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setLeaving(true);
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      setPos(null);
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !mounted || !anchor || !ref.current) return undefined;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      const h = ref.current.offsetHeight;
      const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
      let top = r.bottom + 6;
      const maxH = window.innerHeight - top - 12;
      if (h > maxH && r.top - h - 6 > 12) top = r.top - h - 6;
      setPos({ top, left, width: w, maxHeight: Math.max(160, window.innerHeight - top - 12) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, mounted, anchor, width]);

  useEffect(() => {
    if (!open || !mounted) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Fokus ke item pertama untuk keyboard / pembaca layar
    const t = setTimeout(() => ref.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="popover-layer" onClick={onClose}>
      <div
        ref={ref}
        className={`action-menu ${leaving ? 'leaving' : ''}`}
        role="menu"
        aria-label={label}
        style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) =>
          it.divider ? (
            <div key={`d${i}`} className="action-menu-divider" role="separator" />
          ) : (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`action-menu-item ${it.danger ? 'danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                tap();
                onClose();
                it.onSelect();
              }}
            >
              <span className="action-menu-icon" aria-hidden="true">
                {it.icon}
              </span>
              <span className="action-menu-text">
                <span className="action-menu-label">{it.label}</span>
                {it.hint && <span className="action-menu-hint">{it.hint}</span>}
              </span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
