import { useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useBackClose } from '../state';
import { tap } from '../lib/native';

/** Menu pilihan yang muncul menempel pada baris pemicunya (seperti dropdown). */
export default function Popover({ anchor, options, value, onSelect, onClose }) {
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useBackClose(true, onClose);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const vh = window.innerHeight;
    const width = Math.min(320, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.right - width, window.innerWidth - width - 16));
    let top = r.bottom + 6;
    if (top + h > vh - 16) top = Math.max(16, r.top - h - 6);
    setPos({ top, left, width });
  }, [anchor]);

  return (
    <div className="popover-layer" onClick={onClose}>
      <div
        ref={ref}
        className="popover"
        role="listbox"
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === value}
            className="popover-option"
            onClick={() => {
              tap();
              onSelect(o.value);
              onClose();
            }}
          >
            <span className="popover-text">
              <span className="popover-label">{o.label}</span>
              {o.hint && <span className="popover-hint">{o.hint}</span>}
            </span>
            {o.value === value && <Check size={22} />}
          </button>
        ))}
      </div>
    </div>
  );
}
