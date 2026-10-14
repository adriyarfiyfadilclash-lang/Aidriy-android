import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Info, MoreVertical, RefreshCw, Trash2 } from 'lucide-react';
import { useApp, useBackClose } from '../../state';
import * as db from '../../lib/db';
import { askMemory, generateSummary } from '../../lib/memorySummary';
import { tap } from '../../lib/native';
import { ConfirmDialog, IconButton, timeAgo } from '../../components/ui';
import Markdown from '../../components/Markdown';

function MenuPopover({ onClose, items }) {
  useBackClose(true, onClose);
  return (
    <div className="popover-layer" onClick={onClose}>
      <div className="popover" style={{ top: 70, right: 16, width: 'min(320px, calc(100vw - 32px))' }} onClick={(e) => e.stopPropagation()}>
        {items.map((it) => (
          <button key={it.label} type="button" className={`popover-option ${it.danger ? 'danger-text' : ''}`} disabled={it.disabled} onClick={it.onClick}>
            <span className="popover-icon">{it.icon}</span>
            <span className="popover-text">
              <span className="popover-label">{it.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AboutDialog({ onClose }) {
  useBackClose(true, onClose);
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Tentang memori</div>
        <p className="dialog-message">
          Ringkasan ini ditulis oleh model AI pilihanmu dari memori tersimpan, nama panggilan, pekerjaan, dan info yang kamu isi. Ringkasan tidak menambah fakta baru. Untuk
          membuatnya, data itu dikirim ke penyedia AI yang API key-nya kamu pasang. Kamu bisa menghapus semuanya kapan saja.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-dark" onClick={onClose}>
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemorySummaryPage() {
  const navigate = useNavigate();
  const { uid, profile, setProfile, settings, setSettings, showToast } = useApp();
  const summary = profile?.settings?.memory_summary || null;
  const [state, setState] = useState('idle'); // idle | generating | error
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const saveSummary = useCallback(
    async (text) => {
      const p = await db.updateProfile(uid, {
        settings: { ...(profile?.settings || {}), memory_summary: text ? { text, updated_at: new Date().toISOString() } : null },
      });
      setProfile(p);
    },
    [uid, profile, setProfile]
  );

  const regenerate = useCallback(async () => {
    setMenu(false);
    setError('');
    setState('generating');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const memories = await db.listMemories();
      const text = await generateSummary(settings, profile, memories, controller.signal);
      await saveSummary(text);
      setState('idle');
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message);
      setState('error');
    }
  }, [settings, profile, saveSummary]);

  // Buat otomatis sekali bila belum ada ringkasan dan memori aktif.
  const autoRef = useRef(false);
  useEffect(() => {
    if (!autoRef.current && profile && !summary && settings.memory) {
      autoRef.current = true;
      regenerate();
    }
  }, [profile, summary, settings.memory, regenerate]);

  const ask = async (e) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    tap();
    setAsking(true);
    setReply(null);
    try {
      const memories = await db.listMemories();
      const res = await askMemory(settings, profile, memories, q);
      const changes = [];
      if (res.forget.length) {
        for (const id of res.forget) await db.deleteMemory(id);
        changes.push(`${res.forget.length} memori dihapus`);
      }
      if (res.add.length) {
        await db.addMemories(res.add);
        changes.push(`${res.add.length} memori ditambahkan`);
      }
      setReply({ q, answer: res.answer || 'Selesai.', changes });
      setQuestion('');
      if (changes.length) regenerate();
    } catch (err) {
      setReply({ q, answer: '', error: err.message, changes: [] });
    } finally {
      setAsking(false);
    }
  };

  const wipe = async () => {
    try {
      await db.deleteAllMemories(uid);
      await saveSummary(null);
      setSettings({ memory: false });
      showToast('Memori dihapus dan dinonaktifkan');
      navigate(-1);
    } catch (e) {
      showToast(`Gagal menghapus: ${e.message}`, 'error');
    }
  };

  return (
    <div className="page p-page">
      <header className="p-head">
        <IconButton label="Kembali" className="p-round" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} strokeWidth={1.75} />
        </IconButton>
        <div className="p-head-center">
          <div className="p-head-title small">Ringkasan memori</div>
          <div className="p-head-sub">
            {state === 'generating' ? 'Sedang dibuat…' : summary?.updated_at ? `Diperbarui ${timeAgo(summary.updated_at)}` : 'Belum dibuat'}
          </div>
        </div>
        <IconButton label="Menu" className="p-round" onClick={() => setMenu(true)}>
          <MoreVertical size={22} />
        </IconButton>
      </header>

      <main className="page-scroll summary-scroll">
        {!settings.memory && (
          <div className="lib-banner">
            Memori sedang nonaktif. Ringkasan tidak dipakai di chat sampai kamu mengaktifkannya lagi di halaman Memori.
          </div>
        )}
        {state === 'generating' && (
          <div className="summary-skeleton" aria-busy="true">
            <span className="sk-line" />
            <span className="sk-line" />
            <span className="sk-line short" />
            <span className="sk-line" />
            <span className="sk-line short" />
          </div>
        )}
        {state === 'error' && (
          <div className="error-box">
            <div>
              {error}
              <br />
              <button type="button" className="link-btn" onClick={regenerate}>
                Coba lagi
              </button>
            </div>
          </div>
        )}
        {summary?.text && state !== 'generating' && (
          <div className="summary-md">
            <Markdown text={summary.text} />
          </div>
        )}
        {reply && (
          <div className="summary-reply">
            <div className="summary-q">{reply.q}</div>
            {reply.error ? <div className="danger-text">{reply.error}</div> : <Markdown text={reply.answer} />}
            {reply.changes.length > 0 && <div className="muted small">{reply.changes.join(' · ')} — ringkasan diperbarui.</div>}
          </div>
        )}
      </main>

      <form className="summary-ask" onSubmit={ask}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Tanya atau perbarui" maxLength={500} disabled={asking} />
        <button type="submit" className="round-btn soft" disabled={!question.trim() || asking} aria-label="Kirim">
          {asking ? <span className="spinner small" /> : <ArrowUp size={22} />}
        </button>
      </form>

      {menu && (
        <MenuPopover
          onClose={() => setMenu(false)}
          items={[
            { label: 'Tentang memori', icon: <Info size={22} />, onClick: () => { setMenu(false); setAbout(true); } },
            { label: 'Muat ulang ringkasan', icon: <RefreshCw size={22} />, onClick: regenerate, disabled: state === 'generating' },
            { label: 'Hapus dan nonaktifkan memori', icon: <Trash2 size={22} />, danger: true, onClick: () => { setMenu(false); setConfirmWipe(true); } },
          ]}
        />
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      <ConfirmDialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Hapus dan nonaktifkan memori?"
        message="Semua memori tersimpan dan ringkasannya dihapus permanen, lalu memori dimatikan. Nama panggilan, pekerjaan, dan chat tidak ikut terhapus."
        confirmLabel="Hapus"
        onConfirm={wipe}
      />
    </div>
  );
}
