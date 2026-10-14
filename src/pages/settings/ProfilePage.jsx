import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../state';
import * as db from '../../lib/db';
import { TopBar } from '../../components/ui';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { uid, user, profile, setProfile, showToast } = useApp();
  const [form, setForm] = useState({ full_name: '', nickname: '', about: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', nickname: profile.nickname || '', about: profile.about || '' });
  }, [profile]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await db.updateProfile(uid, {
        full_name: form.full_name.trim() || null,
        nickname: form.nickname.trim() || null,
        about: form.about.trim() || null,
      });
      setProfile(p);
      showToast('Profil disimpan');
      navigate(-1);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Profil</span>} />
      <main className="page-scroll">
        <form className="form" onSubmit={save}>
          <label className="field">
            <span>Email</span>
            <input className="input" value={user?.email || ''} disabled />
          </label>
          <label className="field">
            <span>Nama lengkap</span>
            <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="Nama lengkap" />
          </label>
          <label className="field">
            <span>Apa panggilanmu?</span>
            <input className="input" value={form.nickname} onChange={set('nickname')} placeholder="Dipakai untuk menyapa di beranda" />
          </label>
          <label className="field">
            <span>Preferensi untuk A.I.DRIY</span>
            <textarea
              className="input textarea"
              rows={6}
              value={form.about}
              onChange={set('about')}
              placeholder="Contoh: Saya developer di Indonesia. Jawab santai, pakai contoh kode JavaScript, dan jangan bertele-tele."
            />
            <small className="muted">Dipakai di semua chat agar jawaban sesuai dengan kamu.</small>
          </label>
          <button type="submit" className="btn btn-dark btn-block" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
        </form>
      </main>
    </div>
  );
}
