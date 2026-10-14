import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { useApp } from '../state';
import { plainText } from '../lib/parse';
import { copyText, shareText, tap } from '../lib/native';
import { Sheet } from './ui';

export function messageText(m) {
  return m.role === 'user' ? m.content || (m.attachments?.length ? `[${m.attachments.map((a) => a.name).join(', ')}]` : '') : plainText(m.content || '');
}

export function buildTranscript(title, list) {
  const body = list.map((m) => `${m.role === 'user' ? 'Saya' : 'A.I.DRIY'}:\n${messageText(m)}`).join('\n\n');
  return `${title}\n\n${body}`.trim();
}

/** Kirim teks lewat Sharesheet; bila tidak bisa, salin ke clipboard. */
export async function shareOrCopy(title, text, showToast) {
  try {
    await shareText(title, text);
    return;
  } catch (e) {
    if (/cancel|abort/i.test(`${e?.name} ${e?.message}`)) return;
  }
  const ok = await copyText(text);
  showToast(ok ? 'Berbagi tidak tersedia — teks disalin' : 'Gagal membagikan', ok ? 'info' : 'error');
}

export default function ShareChatSheet({ open, onClose, title, messages }) {
  const { showToast } = useApp();
  const items = useMemo(() => messages.filter((m) => !m.streaming && messageText(m).trim()), [messages]);
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    if (open) setPicked(new Set(items.map((m) => m.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = items.filter((m) => picked.has(m.id));
  const text = buildTranscript(title || 'Chat A.I.DRIY', chosen);
  const all = chosen.length === items.length;

  const toggle = (id) => {
    tap();
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Bagikan chat">
      <div className="share-tools">
        <span>
          {chosen.length} dari {items.length} pesan dipilih
        </span>
        <button type="button" className="link-btn" onClick={() => setPicked(all ? new Set() : new Set(items.map((m) => m.id)))}>
          {all ? 'Kosongkan' : 'Pilih semua'}
        </button>
      </div>
      <div className="share-list">
        {items.map((m) => {
          const on = picked.has(m.id);
          return (
            <button key={m.id} type="button" className={`share-item ${on ? '' : 'off'}`} onClick={() => toggle(m.id)} aria-pressed={on}>
              <span className={`share-check ${on ? 'on' : ''}`}>{on && <Check size={15} strokeWidth={3} />}</span>
              <span className="share-item-text">
                <span className="share-item-role">{m.role === 'user' ? 'Saya' : 'A.I.DRIY'}</span>
                <span className="truncate">{messageText(m).slice(0, 140)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="share-preview" aria-label="Pratinjau">
        {chosen.length ? text.slice(0, 1500) + (text.length > 1500 ? '\n…' : '') : 'Pilih minimal satu pesan.'}
      </div>
      <div className="share-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!chosen.length}
          onClick={async () => {
            tap();
            const ok = await copyText(text);
            showToast(ok ? 'Chat disalin' : 'Gagal menyalin', ok ? 'info' : 'error');
          }}
        >
          <Copy size={18} /> Salin
        </button>
        <button
          type="button"
          className="btn btn-dark"
          disabled={!chosen.length}
          onClick={async () => {
            tap();
            await shareOrCopy(title || 'Chat A.I.DRIY', text, showToast);
            onClose();
          }}
        >
          <Share2 size={18} /> Bagikan
        </button>
      </div>
    </Sheet>
  );
}
