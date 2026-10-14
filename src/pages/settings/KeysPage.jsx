import { useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useApp } from '../../state';
import { PROVIDERS, fetchModels } from '../../lib/providers';
import { openExternal, tap } from '../../lib/native';
import { TopBar } from '../../components/ui';

function KeyCard({ id }) {
  const { settings, setSettings, showToast } = useApp();
  const p = PROVIDERS[id];
  const saved = settings.keys[id];
  const [value, setValue] = useState(saved);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    tap();
    try {
      const models = await fetchModels(id, key);
      setSettings((s) => {
        const next = { ...s, keys: { ...s.keys, [id]: key }, modelCache: { ...s.modelCache, [id]: models } };
        // Kalau penyedia aktif belum punya key, pindah ke penyedia ini.
        if (!s.keys[s.provider]) {
          next.provider = id;
          next.model = (PROVIDERS[id].models[0] || models[0])?.id || s.model;
        }
        return next;
      });
      showToast(`${p.short} tersambung · ${models.length} model`);
    } catch (e) {
      showToast(`Gagal memeriksa key: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    tap();
    setValue('');
    setSettings((s) => ({ ...s, keys: { ...s.keys, [id]: '' }, modelCache: { ...s.modelCache, [id]: undefined } }));
  };

  return (
    <div className="card">
      <div className="key-head">
        <div className="card-title">{p.name}</div>
        {saved && (
          <span className="badge-ok">
            <CheckCircle2 size={16} /> Tersambung
          </span>
        )}
      </div>
      <div className="input-with-btn">
        <input
          className="input mono"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={p.keyHint}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label="Tampilkan key">
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <div className="key-actions">
        <button type="button" className="link-btn" onClick={() => openExternal(p.keyUrl)}>
          Dapatkan key <ExternalLink size={14} />
        </button>
        <div className="spacer" />
        {saved && (
          <button type="button" className="icon-btn" onClick={remove} aria-label="Hapus key">
            <Trash2 size={20} />
          </button>
        )}
        <button type="button" className="btn btn-dark" onClick={save} disabled={busy || !value.trim() || value.trim() === saved}>
          {busy ? 'Memeriksa…' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}

export default function KeysPage() {
  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Kunci API</span>} />
      <main className="page-scroll">
        <p className="muted intro">
          A.I.DRIY memakai API key milikmu. Key hanya disimpan di HP ini dan dikirim langsung ke penyedia AI, tidak ke server lain. Biaya pemakaian mengikuti tarif masing-masing penyedia.
        </p>
        {Object.keys(PROVIDERS).map((id) => (
          <KeyCard key={id} id={id} />
        ))}
      </main>
    </div>
  );
}
