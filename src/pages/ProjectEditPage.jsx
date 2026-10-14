import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state';
import * as db from '../lib/db';
import { TopBar } from '../components/ui';

export default function ProjectEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast, refreshProjects } = useApp();
  const [form, setForm] = useState({ name: '', description: '', instructions: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.getProject(id)
      .then((p) => p && setForm({ name: p.name, description: p.description || '', instructions: p.instructions || '' }))
      .catch((e) => showToast(e.message, 'error'));
  }, [id, showToast]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const p = await db.saveProject({ id, ...form, name: form.name.trim() });
      await refreshProjects();
      navigate(`/projects/${p.id}`, { replace: true });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">{id ? 'Edit proyek' : 'Proyek baru'}</span>} />
      <main className="page-scroll">
        <form className="form" onSubmit={save}>
          <label className="field">
            <span>Nama proyek</span>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Misal: Toko Shopify" required autoFocus={!id} />
          </label>
          <label className="field">
            <span>Deskripsi</span>
            <input className="input" value={form.description} onChange={set('description')} placeholder="Tentang apa proyek ini?" />
          </label>
          <label className="field">
            <span>Instruksi untuk AI</span>
            <textarea
              className="input textarea"
              rows={8}
              value={form.instructions}
              onChange={set('instructions')}
              placeholder="Contoh: Selalu jawab dengan gaya santai, fokus ke pemasaran TikTok, dan buat deskripsi produk maksimal 100 kata."
            />
            <small className="muted">Instruksi ini dipakai di setiap chat dalam proyek.</small>
          </label>
          <button type="submit" className="btn btn-dark btn-block" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan proyek'}
          </button>
        </form>
      </main>
    </div>
  );
}
