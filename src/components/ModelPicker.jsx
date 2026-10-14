import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, KeyRound, RefreshCw } from 'lucide-react';
import { useApp } from '../state';
import { EFFORTS, PROVIDERS, fetchModels, modelsFor } from '../lib/providers';
import { tap } from '../lib/native';
import { Sheet } from './ui';

export default function ModelPicker({ open, onClose }) {
  const { settings, setSettings, showToast } = useApp();
  const navigate = useNavigate();
  const [provider, setProvider] = useState(settings.provider);
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setProvider(settings.provider);
      setQ('');
      setCustom('');
    }
  }, [open, settings.provider]);

  const key = settings.keys[provider];
  const list = useMemo(() => {
    const all = modelsFor(provider, settings.modelCache);
    const t = q.trim().toLowerCase();
    return t ? all.filter((m) => m.id.toLowerCase().includes(t) || m.label.toLowerCase().includes(t)) : all;
  }, [provider, settings.modelCache, q]);

  const refresh = async () => {
    if (!key && provider !== 'openrouter') return;
    setLoading(true);
    try {
      const models = await fetchModels(provider, key);
      if (models.length) setSettings((s) => ({ ...s, modelCache: { ...s.modelCache, [provider]: models } }));
      showToast(`${models.length} model dimuat`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const pick = (model) => {
    tap();
    setSettings({ provider, model });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Model AI" className="sheet-tall">
      <div className="chips-row">
        {Object.entries(PROVIDERS).map(([id, p]) => (
          <button key={id} type="button" className={`chip ${provider === id ? 'on' : ''}`} onClick={() => setProvider(id)}>
            {p.short}
            {settings.keys[id] ? '' : ' ·'}
          </button>
        ))}
      </div>

      {!key ? (
        <div className="card pad center">
          <KeyRound size={28} className="muted" />
          <p>Belum ada API key untuk {PROVIDERS[provider].name}.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate('/settings/keys');
            }}
          >
            Tambah API key
          </button>
        </div>
      ) : (
        <>
          <div className="label-row">
            <span className="label">Tingkat berpikir</span>
          </div>
          <div className="segmented">
            {EFFORTS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={settings.effort === e.id ? 'on' : ''}
                onClick={() => {
                  tap();
                  setSettings({ effort: e.id });
                }}
              >
                {e.label}
              </button>
            ))}
          </div>

          <div className="search-row">
            <input className="input" placeholder="Cari model…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="icon-btn bordered" onClick={refresh} aria-label="Muat daftar model terbaru" disabled={loading}>
              <RefreshCw size={20} className={loading ? 'spin' : ''} />
            </button>
          </div>

          <div className="model-list">
            {list.map((m) => {
              const active = settings.provider === provider && settings.model === m.id;
              return (
                <button key={m.id} type="button" className={`model-item ${active ? 'active' : ''}`} onClick={() => pick(m.id)}>
                  <span className="model-text">
                    <span className="truncate">{m.label}</span>
                    {m.label !== m.id && <span className="model-id truncate">{m.id}</span>}
                  </span>
                  {active && <Check size={20} />}
                </button>
              );
            })}
            {list.length === 0 && <p className="muted pad">Tidak ada model yang cocok.</p>}
          </div>

          <form
            className="search-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) pick(custom.trim());
            }}
          >
            <input className="input" placeholder="ID model lain, misal gemini-3-pro" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button type="submit" className="btn btn-primary">
              Pakai
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}
