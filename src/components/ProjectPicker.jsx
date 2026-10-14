import { useEffect, useMemo, useState } from 'react';
import { Check, FolderClosed, FolderPlus, Search, X } from 'lucide-react';
import { useApp } from '../state';
import * as db from '../lib/db';
import { tap } from '../lib/native';
import { Group, Row, Sheet } from './ui';

/** Pemilih proyek dengan pencarian dan "Buat proyek baru". onPick(projectId|null) boleh async. */
export default function ProjectPicker({ open, onClose, currentId = null, onPick, title = 'Tambah ke proyek', allowNone = true }) {
  const { projects, refreshProjects, showToast } = useApp();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setQ('');
      setCreating(false);
      setName('');
      setBusy(false);
    }
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? projects.filter((p) => p.name.toLowerCase().includes(t) || (p.description || '').toLowerCase().includes(t)) : projects;
  }, [projects, q]);

  const pick = async (pid) => {
    if (busy) return;
    tap();
    setBusy(true);
    try {
      await onPick(pid);
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const p = await db.saveProject({ name: n });
      await refreshProjects();
      setBusy(false);
      await pick(p.id);
    } catch (err) {
      showToast(`Gagal membuat proyek: ${err.message}`, 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {creating ? (
        <form className="pp-create" onSubmit={create}>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama proyek baru" maxLength={80} />
          <div className="share-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)} disabled={busy}>
              Batal
            </button>
            <button type="submit" className="btn btn-dark" disabled={!name.trim() || busy}>
              {busy ? <span className="spinner small" /> : 'Buat & tambahkan'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="pp-search">
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari proyek" aria-label="Cari proyek" />
            {q && (
              <button type="button" aria-label="Hapus pencarian" onClick={() => setQ('')}>
                <X size={18} />
              </button>
            )}
          </div>
          <Group>
            <Row icon={<FolderPlus size={22} strokeWidth={1.6} />} title="Buat proyek baru" onClick={() => { setName(q.trim()); setCreating(true); }} />
            {allowNone && !q && (
              <Row icon={<X size={22} strokeWidth={1.6} />} title="Tanpa proyek" onClick={() => pick(null)} right={currentId === null ? <Check size={20} /> : null} />
            )}
            {list.map((p) => (
              <Row
                key={p.id}
                icon={<FolderClosed size={22} strokeWidth={1.6} />}
                title={p.name}
                subtitle={p.description}
                onClick={() => pick(p.id)}
                right={currentId === p.id ? <Check size={20} /> : null}
              />
            ))}
          </Group>
          {list.length === 0 && <p className="muted pad">{q ? 'Tidak ada proyek yang cocok.' : 'Belum ada proyek.'}</p>}
        </>
      )}
    </Sheet>
  );
}
