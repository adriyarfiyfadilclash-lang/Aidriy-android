import { useApp } from '../state';

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind === 'error' ? 'toast-error' : ''}`} key={toast.id} role="status">
      {toast.text}
    </div>
  );
}
