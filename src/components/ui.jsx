import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Menu, X } from 'lucide-react';
import { useApp, useBackClose } from '../state';
import { tap } from '../lib/native';

export function IconButton({ children, onClick, label, className = '', ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} onClick={onClick} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function TopBar({ title, back, right, onTitleClick }) {
  const navigate = useNavigate();
  const { setDrawerOpen } = useApp();
  return (
    <header className="topbar">
      {back ? (
        <IconButton label="Kembali" onClick={() => (typeof back === 'function' ? back() : navigate(-1))}>
          <ArrowLeft size={24} strokeWidth={1.75} />
        </IconButton>
      ) : (
        <IconButton label="Menu" onClick={() => setDrawerOpen(true)}>
          <Menu size={26} strokeWidth={1.6} />
        </IconButton>
      )}
      <div className={`topbar-title ${onTitleClick ? 'clickable' : ''}`} onClick={onTitleClick}>
        {title}
      </div>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children, className = '' }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`sheet ${className}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {title !== undefined && (
          <div className="sheet-head">
            <IconButton label="Tutup" onClick={onClose}>
              <X size={24} strokeWidth={1.75} />
            </IconButton>
            <div className="sheet-title">{title}</div>
            <div style={{ width: 44 }} />
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function ChoiceDialog({ open, onClose, title, options, value, onChange }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-title">{title}</div>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`dialog-option ${o.value === value ? 'selected' : ''}`}
            onClick={() => {
              tap();
              onChange(o.value);
              onClose();
            }}
          >
            <span className="dialog-option-icon">{o.icon}</span>
            <span className="dialog-option-label">{o.label}</span>
            {o.value === value && <Check size={22} strokeWidth={1.75} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Hapus', danger = true, onConfirm }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="dialog-title">{title}</div>
        {message && <p className="dialog-message">{message}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog({ open, onClose, title, initial = '', placeholder, onSubmit, confirmLabel = 'Simpan' }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get('v')?.toString().trim();
          if (!v) return;
          await onSubmit(v);
          onClose();
        }}
      >
        <div className="dialog-title">{title}</div>
        <input className="input" name="v" defaultValue={initial} placeholder={placeholder} autoFocus />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        tap();
        onChange(!checked);
      }}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Row({ icon, title, subtitle, onClick, right, danger, chevron = false }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} className={`row ${danger ? 'row-danger' : ''}`} onClick={onClick}>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      {right}
      {chevron && <ChevronRight size={20} className="row-chevron" />}
    </Comp>
  );
}

export function Group({ children }) {
  return <div className="group">{children}</div>;
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}

export function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
