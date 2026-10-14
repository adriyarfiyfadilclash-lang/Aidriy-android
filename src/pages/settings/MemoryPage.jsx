import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';
import { useApp } from '../../state';
import * as db from '../../lib/db';
import { tap } from '../../lib/native';
import { ConfirmDialog, IconButton, Toggle } from '../../components/ui';

export default function MemoryPage() {
  const navigate = useNavigate();
  const { uid, profile, setProfile, settings, setSettings, showToast } = useApp();
  const initial = useMemo(
    () => ({ nickname: profile?.nickname || '', occupation: profile?.occupation || '', about: profile?.about || '' }),
    [profile]
  );
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(null);
  const [leaveAsk, setLeaveAsk] = useState(false);

  useEffect(() => setForm(initial), [initial]);
  useEffect(() => {
    db.listMemories()
      .then((m) => setCount(m.length))
      .catch(() => setCount(null));
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!dirty || busy) return;
    tap('medium');
    setBusy(true);
    try {
      const p = await db.updateProfile(uid, {
        nickname: form.nickname.trim() || null,
        occupation: form.occupation.trim() || null,
        about: form.about.trim() || null,
      });
      setProfile(p);
      showToast('Memori disimpan');
    } catch (e) {
      showToast(`Gagal menyimpan: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page p-page">
      <header className="p-head">
        <IconButton label="Kembali" className="p-round" onClick={() => (dirty ? setLeaveAsk(true) : navigate(-1))}>
          <ArrowLeft size={24} strokeWidth={1.75} />
        </IconButton>
        <div className="p-head-title">Memori</div>
        <IconButton label="Simpan" onClick={save} className={`p-round ${dirty ? 'active' : ''}`} disabled={!dirty || busy}>
          {busy ? <span className="spinner small" /> : <Check size={24} strokeWidth={2} />}
        </IconButton>
      </header>

      <main className="page-scroll p-scroll">
        <div className="p-card">
          <div className="p-row static">
            <span className="p-row-label">Aktifkan memori</span>
            <Toggle checked={settings.memory} onChange={(v) => setSettings({ memory: v })} label="Aktifkan memori" />
          </div>
        </div>
        <p className="p-note">
          Biarkan A.I.DRIY mempersonalisasi jawaban berdasarkan chat dan info yang kamu berikan. Chat incognito tidak memakai dan tidak menambah memori.
        </p>

        <div className="p-card">
          <button type="button" className="p-row" onClick={() => navigate('/settings/memory/summary')}>
            <span className="p-row-label">Ringkasan memori</span>
            <ChevronRight size={20} className="muted" />
          </button>
          <button type="button" className="p-row" onClick={() => navigate('/settings/memory/saved')}>
            <span className="p-row-label">Memori tersimpan</span>
            {count !== null && <span className="p-row-value">{count}</span>}
            <ChevronRight size={20} className="muted" />
          </button>
        </div>
        <p className="p-note">
          Lihat ringkasan hal yang telah dipelajari A.I.DRIY tentangmu. Gunakan{' '}
          <button type="button" className="inline-link" onClick={() => navigate('/settings/personalization')}>
            Instruksi khusus
          </button>{' '}
          untuk aturan yang harus selalu diikuti.
        </p>

        <div className="p-section">Nama panggilan Anda</div>
        <div className="p-card">
          <input className="p-input" value={form.nickname} onChange={set('nickname')} placeholder="Nama panggilan" maxLength={60} />
        </div>

        <div className="p-section">Pekerjaan Anda</div>
        <div className="p-card">
          <input className="p-input" value={form.occupation} onChange={set('occupation')} placeholder="Insinyur, pelajar, dll." maxLength={120} />
        </div>

        <div className="p-section">Info lainnya tentang Anda</div>
        <div className="p-card">
          <textarea
            className="p-textarea"
            rows={4}
            value={form.about}
            onChange={set('about')}
            placeholder="Preferensi, nilai, atau pilihan yang perlu diingat"
            maxLength={2000}
          />
        </div>
      </main>

      <ConfirmDialog
        open={leaveAsk}
        onClose={() => setLeaveAsk(false)}
        title="Buang perubahan?"
        message="Perubahan di halaman Memori belum disimpan."
        confirmLabel="Buang"
        onConfirm={() => navigate(-1)}
      />
    </div>
  );
}
