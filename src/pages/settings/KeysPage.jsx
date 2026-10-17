import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, Eye, EyeOff, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import { useApp } from '../../state';
import {
  CUSTOM_PRESETS,
  PROVIDERS,
  fetchModels,
  normalizeBaseUrl,
  providerReady,
  setCustomEndpoints,
  testCustomEndpoint,
  validateBaseUrl,
} from '../../lib/providers';
import { openExternal, tap } from '../../lib/native';
import { ConfirmDialog, TopBar } from '../../components/ui';

function KeyCard({ id }) {
  const { settings, setSettings, showToast } = useApp();
  const p = PROVIDERS[id];
  const saved = settings.keys[id] || '';
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
      {p.viaRelay && (
        <p className="muted small key-note">
          NVIDIA tidak menerima panggilan langsung dari aplikasi, jadi permintaannya lewat relay di server Supabase milik A.I.DRIY. Key diteruskan ke NVIDIA setiap kali
          dipakai dan tidak disimpan di server. Perlu login.
        </p>
      )}
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

const parseModels = (text) => {
  const seen = new Set();
  return String(text || '')
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t) && seen.add(t))
    .map((id) => ({ id, label: id }));
};

const newId = () => Math.random().toString(36).slice(2, 10);

/** Form tambah/ubah endpoint kustom: alamat, format, key, model. Diuji dengan permintaan sungguhan sebelum disimpan. */
function CustomEndpointForm({ ep, onDone }) {
  const { settings, setSettings, showToast } = useApp();
  const pid = ep ? `custom:${ep.id}` : null;
  const [name, setName] = useState(ep?.name || '');
  const [baseUrl, setBaseUrl] = useState(ep?.baseUrl || '');
  const [format, setFormat] = useState(ep?.format || 'openai');
  const [key, setKey] = useState(pid ? settings.keys[pid] || '' : '');
  const [models, setModels] = useState((ep?.models || []).map((m) => m.id).join('\n'));
  const [authStyle, setAuthStyle] = useState(ep?.authStyle || '');
  const [connection, setConnection] = useState(ep?.connection || 'auto');
  const [keyUrl, setKeyUrl] = useState(ep?.keyUrl || '');
  const [advanced, setAdvanced] = useState(!!(ep?.authStyle || (ep?.connection && ep.connection !== 'auto')));
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState(null); // { message, candidate }
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const applyPreset = (p) => {
    tap();
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setFormat('openai');
    setKeyUrl(p.keyUrl || '');
    setProblem(null);
  };

  const commit = (candidate, fetched) => {
    const id = `custom:${candidate.id}`;
    setSettings((s) => {
      const list = (s.customEndpoints || []).filter((e) => e.id !== candidate.id).concat(candidate);
      const next = {
        ...s,
        customEndpoints: list,
        keys: { ...s.keys, [id]: key.trim() },
        modelCache: { ...s.modelCache, [id]: fetched?.length ? fetched : s.modelCache?.[id] },
      };
      const firstModel = candidate.models[0]?.id || fetched?.[0]?.id;
      // Penyedia aktif belum siap (atau endpoint ini sedang dipakai tanpa model) → pakai endpoint ini.
      if ((!providerReady(s, s.provider) || (s.provider === id && !s.model)) && firstModel) {
        next.provider = id;
        next.model = firstModel;
      }
      return next;
    });
  };

  const save = async (skipTest = false) => {
    const url = normalizeBaseUrl(baseUrl);
    const bad = validateBaseUrl(url);
    if (bad) {
      setProblem({ message: bad });
      return;
    }
    const manual = parseModels(models);
    const candidate = {
      id: ep?.id || newId(),
      name: name.trim() || new URL(url).host.replace(/^api\./, ''),
      baseUrl: url,
      format,
      authStyle: authStyle || undefined,
      connection,
      noKey: !key.trim(),
      keyUrl: keyUrl || undefined,
      models: manual,
    };
    if (skipTest) {
      commit(candidate, null);
      showToast(`${candidate.name} disimpan tanpa diuji`);
      onDone();
      return;
    }
    tap();
    setProblem(null);
    const id = `custom:${candidate.id}`;
    // Daftarkan sementara agar bisa diuji; dikembalikan bila gagal.
    setCustomEndpoints([...(settings.customEndpoints || []).filter((e) => e.id !== candidate.id), candidate]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setBusy('Mengambil daftar model…');
      let fetched = [];
      let listError = '';
      try {
        fetched = await fetchModels(id, key.trim());
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        listError = e.message;
      }
      const testModel = manual[0]?.id || fetched[0]?.id;
      if (!testModel) {
        throw new Error(
          listError
            ? `Daftar model tidak bisa diambil (${listError}). Tulis minimal satu ID model secara manual.`
            : 'Endpoint tidak memberi daftar model. Tulis minimal satu ID model secara manual.'
        );
      }
      setBusy(`Menguji ${testModel}…`);
      const reply = await testCustomEndpoint(id, key.trim(), testModel, ctrl.signal);
      if (!reply) throw new Error(`Model ${testModel} tidak mengirim jawaban apa pun.`);
      commit(candidate, fetched);
      showToast(`${candidate.name} tersambung · ${testModel} menjawab "${reply.slice(0, 24)}"${fetched.length ? ` · ${fetched.length} model` : ''}`);
      onDone();
    } catch (e) {
      setCustomEndpoints(settings.customEndpoints);
      if (e.name !== 'AbortError') setProblem({ message: e.message, detail: e.detail });
    } finally {
      abortRef.current = null;
      setBusy('');
    }
  };

  return (
    <div className="card custom-form">
      <div className="key-head">
        <div className="card-title">{ep ? `Ubah ${ep.name}` : 'Endpoint baru'}</div>
      </div>
      {!ep && (
        <div className="chips-row wrap-chips" role="group" aria-label="Isi cepat">
          {CUSTOM_PRESETS.map((p) => (
            <button key={p.name} type="button" className={`chip ${baseUrl === p.baseUrl ? 'on' : ''}`} onClick={() => applyPreset(p)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span>Nama</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Misal: DeepSeek" maxLength={40} />
      </label>
      <label className="field">
        <span>Alamat dasar API</span>
        <input
          className="input mono"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            setKeyUrl(CUSTOM_PRESETS.find((p) => p.baseUrl === normalizeBaseUrl(e.target.value))?.keyUrl || '');
          }}
          placeholder="https://api.contoh.com/v1"
          inputMode="url"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
        />
        <small className="muted">Tanpa /chat/completions di akhir — aplikasi menambahkannya sendiri.</small>
      </label>
      <div className="field">
        <span>Format API (kompatibel)</span>
        <div className="segmented">
          <button type="button" className={format === 'openai' ? 'on' : ''} onClick={() => setFormat('openai')}>
            OpenAI
          </button>
          <button type="button" className={format === 'anthropic' ? 'on' : ''} onClick={() => setFormat('anthropic')}>
            Anthropic
          </button>
        </div>
        <small className="muted">Hampir semua penyedia memakai format OpenAI (/chat/completions). Pilih Anthropic hanya untuk endpoint /messages.</small>
      </div>
      <label className="field">
        <span>API key</span>
        <div className="input-with-btn">
          <input
            className="input mono"
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Kosongkan bila endpoint tanpa key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Sembunyikan key' : 'Tampilkan key'}>
            {show ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {keyUrl && (
          <button type="button" className="link-btn self-start" onClick={() => openExternal(keyUrl)}>
            Dapatkan key <ExternalLink size={14} />
          </button>
        )}
      </label>
      <label className="field">
        <span>ID model</span>
        <textarea
          className="input textarea mono"
          rows={3}
          value={models}
          onChange={(e) => setModels(e.target.value)}
          placeholder={'Satu per baris, misal:\ndeepseek-chat\ndeepseek-reasoner'}
          autoCapitalize="off"
          spellCheck={false}
        />
        <small className="muted">Boleh dikosongkan bila endpoint punya daftar model — akan diambil otomatis.</small>
      </label>

      <button type="button" className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)}>
        Pengaturan lanjutan <ChevronDown size={16} className={advanced ? 'rot' : ''} />
      </button>
      {advanced && (
        <>
          <div className="field">
            <span>Cara mengirim key</span>
            <div className="segmented">
              {[
                ['', 'Otomatis'],
                ['bearer', 'Bearer'],
                ['x-api-key', 'x-api-key'],
                ['api-key', 'api-key'],
              ].map(([v, l]) => (
                <button key={l} type="button" className={authStyle === v ? 'on' : ''} onClick={() => setAuthStyle(v)}>
                  {l}
                </button>
              ))}
            </div>
            <small className="muted">Otomatis: Authorization: Bearer untuk format OpenAI, x-api-key untuk format Anthropic. Azure memakai api-key.</small>
          </div>
          <div className="field">
            <span>Jalur koneksi</span>
            <div className="segmented">
              {[
                ['auto', 'Otomatis'],
                ['direct', 'Langsung'],
                ['relay', 'Lewat relay'],
              ].map(([v, l]) => (
                <button key={v} type="button" className={connection === v ? 'on' : ''} onClick={() => setConnection(v)}>
                  {l}
                </button>
              ))}
            </div>
            <small className="muted">
              Otomatis: langsung dari HP; bila endpoint menolak panggilan dari aplikasi, lewat relay di server A.I.DRIY (key diteruskan, tidak disimpan; perlu login, hanya
              alamat https publik).
            </small>
          </div>
        </>
      )}

      {problem && (
        <div className="error-box" role="alert">
          <AlertCircle size={18} />
          <div className="error-body">
            <div className="error-title">Belum berhasil tersambung</div>
            <div>{problem.message}</div>
            {problem.detail && <div className="error-detail">{problem.detail}</div>}
            <div className="error-actions">
              <button type="button" className="btn btn-ghost small-btn" onClick={() => save(true)}>
                Simpan saja tanpa uji
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="key-actions">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            abortRef.current?.abort();
            onDone();
          }}
        >
          Batal
        </button>
        <div className="spacer" />
        <button type="button" className="btn btn-dark" onClick={() => save(false)} disabled={!!busy || !baseUrl.trim()}>
          {busy || 'Uji & simpan'}
        </button>
      </div>
    </div>
  );
}

function CustomEndpointCard({ ep, onEdit, onDelete }) {
  const { settings } = useApp();
  const pid = `custom:${ep.id}`;
  const count = new Set([...(ep.models || []), ...(settings.modelCache?.[pid] || [])].map((m) => m.id)).size;
  let host = ep.baseUrl;
  try {
    host = new URL(ep.baseUrl).host;
  } catch {
    /* tampilkan apa adanya */
  }
  return (
    <div className="card custom-card">
      <span className="custom-icon" aria-hidden="true">
        <Server size={20} />
      </span>
      <div className="custom-text">
        <div className="card-title truncate">{ep.name}</div>
        <div className="muted small truncate">
          {[host, ep.format === 'anthropic' ? 'Anthropic' : 'OpenAI', `${count} model`, ep.noKey ? 'tanpa key' : null, settings.provider === pid ? 'sedang dipakai' : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Ubah ${ep.name}`}>
        <Pencil size={19} />
      </button>
      <button type="button" className="icon-btn" onClick={onDelete} aria-label={`Hapus ${ep.name}`}>
        <Trash2 size={19} />
      </button>
    </div>
  );
}

function CustomEndpoints() {
  const { settings, setSettings, showToast } = useApp();
  const location = useLocation();
  const [editing, setEditing] = useState(location.state?.addCustom ? 'new' : null);
  const [confirm, setConfirm] = useState(null);
  const ref = useRef(null);
  const list = settings.customEndpoints || [];

  useEffect(() => {
    if (location.state?.addCustom) setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [location.state]);

  const remove = (ep) => {
    const pid = `custom:${ep.id}`;
    setSettings((s) => {
      const next = {
        ...s,
        customEndpoints: (s.customEndpoints || []).filter((e) => e.id !== ep.id),
        keys: { ...s.keys },
        modelCache: { ...s.modelCache },
      };
      delete next.keys[pid];
      delete next.modelCache[pid];
      if (s.provider === pid) {
        // Pindah ke penyedia lain yang siap: bawaan yang punya key, lalu endpoint kustom lain.
        const builtin = Object.keys(PROVIDERS).find((id) => s.keys[id]);
        const other = next.customEndpoints.find((e) => (e.noKey || s.keys[`custom:${e.id}`]) && (e.models[0] || s.modelCache?.[`custom:${e.id}`]?.[0]));
        if (builtin) {
          next.provider = builtin;
          next.model = (s.modelCache?.[builtin]?.[0] || PROVIDERS[builtin].models[0])?.id;
        } else if (other) {
          next.provider = `custom:${other.id}`;
          next.model = (other.models[0] || s.modelCache[`custom:${other.id}`][0]).id;
        }
      }
      return next;
    });
    showToast(`${ep.name} dihapus`);
  };

  return (
    <section ref={ref} className="custom-section" aria-labelledby="custom-title">
      <div className="section-title" id="custom-title">
        Endpoint kustom
      </div>
      <p className="muted small key-note">
        Pakai API key dari penyedia lain (DeepSeek, Groq, Mistral, server sendiri, dan lainnya) yang kompatibel OpenAI atau Anthropic. Key disimpan hanya di HP ini.
      </p>
      {list.map((ep) =>
        editing === ep.id ? (
          <CustomEndpointForm key={ep.id} ep={ep} onDone={() => setEditing(null)} />
        ) : (
          <CustomEndpointCard key={ep.id} ep={ep} onEdit={() => setEditing(ep.id)} onDelete={() => setConfirm(ep)} />
        )
      )}
      {editing === 'new' ? (
        <CustomEndpointForm onDone={() => setEditing(null)} />
      ) : (
        <button
          type="button"
          className="btn btn-ghost add-endpoint"
          onClick={() => {
            tap();
            setEditing('new');
          }}
        >
          <Plus size={18} /> Tambah endpoint
        </button>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Hapus ${confirm?.name || 'endpoint'}?`}
        message="Key dan daftar model endpoint ini dihapus dari HP. Riwayat chat tetap ada."
        onConfirm={() => {
          remove(confirm);
          setConfirm(null);
        }}
      />
    </section>
  );
}

export default function KeysPage() {
  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Kunci API</span>} />
      <main className="page-scroll">
        <p className="muted intro">
          A.I.DRIY memakai API key milikmu. Key hanya disimpan di HP ini dan dikirim langsung ke penyedia AI (kecuali NVIDIA, lewat relay — lihat kartunya). Biaya pemakaian mengikuti tarif masing-masing penyedia.
        </p>
        {Object.keys(PROVIDERS).map((id) => (
          <KeyCard key={id} id={id} />
        ))}
        <CustomEndpoints />
      </main>
    </div>
  );
}
