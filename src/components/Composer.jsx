import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, FileText, Mic, Plus, Square, X } from 'lucide-react';
import { startListening, tap } from '../lib/native';
import { useApp } from '../state';

export default function Composer({
  value,
  setValue,
  attachments,
  onRemoveAttachment,
  onSend,
  onStop,
  busy,
  preparing,
  incognito,
  onPlus,
  modelLabel,
  onModel,
  onVoiceMode,
  placeholder,
}) {
  const { settings, showToast } = useApp();
  const ref = useRef();
  const [dictating, setDictating] = useState(false);
  const stopRef = useRef(null);
  const baseRef = useRef('');
  const sendAfterRef = useRef(false);
  const latestRef = useRef('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  const startDictation = async () => {
    tap();
    baseRef.current = value ? `${value.trimEnd()} ` : '';
    latestRef.current = '';
    sendAfterRef.current = false;
    try {
      setDictating(true);
      stopRef.current = await startListening({
        lang: settings.voice.lang,
        onPartial: (t) => {
          latestRef.current = t;
          setValue(baseRef.current + t);
        },
        onEnd: (t) => {
          const finalText = baseRef.current + (t || latestRef.current);
          setDictating(false);
          stopRef.current = null;
          setValue(finalText);
          if (sendAfterRef.current) {
            sendAfterRef.current = false;
            if (finalText.trim() || attachments.length) onSend(finalText);
          }
        },
        onError: (e) => {
          if (e?.message && !/no match|no-speech|aborted/i.test(e.message)) showToast(e.message, 'error');
        },
      });
    } catch (e) {
      setDictating(false);
      showToast(e.message, 'error');
    }
  };

  const stopDictation = async (send) => {
    tap();
    sendAfterRef.current = send;
    if (stopRef.current) await stopRef.current();
  };

  const cancelDictation = async () => {
    tap();
    sendAfterRef.current = false;
    if (stopRef.current) await stopRef.current();
    setValue(baseRef.current.trimEnd());
  };

  return (
    <div className={`composer ${incognito ? 'incognito' : ''}`}>
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((a) => (
            <div key={a.id} className="att">
              {a.kind === 'image' ? (
                <img src={a.thumb || `data:${a.mime};base64,${a.data}`} alt={a.name} />
              ) : (
                <div className="att-file">
                  <FileText size={18} />
                  <span className="truncate">{a.name}</span>
                </div>
              )}
              <button type="button" className="att-remove" onClick={() => onRemoveAttachment(a.id)} aria-label="Hapus lampiran">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {preparing && <div className="composer-note">Menyiapkan lampiran…</div>}

      {dictating ? (
        <>
          {value && <div className="dictation-preview">{value}</div>}
          <div className="dictation-bar">
            <button type="button" className="round-btn soft" onClick={cancelDictation} aria-label="Batal">
              <X size={22} />
            </button>
            <div className="wave-dots" aria-label="Mendengarkan">
              {Array.from({ length: 28 }).map((_, i) => (
                <span key={i} style={{ animationDelay: `${(i % 7) * 0.12}s` }} />
              ))}
            </div>
            <button type="button" className="round-btn soft" onClick={() => stopDictation(false)} aria-label="Selesai">
              <Square size={18} fill="currentColor" />
            </button>
            <button type="button" className="round-btn accent" onClick={() => stopDictation(true)} aria-label="Kirim">
              <ArrowUp size={22} />
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            ref={ref}
            className="composer-input"
            rows={1}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="composer-row">
            <button type="button" className="round-btn soft" onClick={onPlus} aria-label="Tambah lampiran">
              <Plus size={24} strokeWidth={1.75} />
            </button>
            <button type="button" className="model-chip" onClick={onModel}>
              {modelLabel}
            </button>
            <div className="spacer" />
            {!busy && (
              <button type="button" className="round-btn soft" onClick={startDictation} aria-label="Dikte suara">
                <Mic size={22} strokeWidth={1.75} />
              </button>
            )}
            {busy ? (
              <button type="button" className="round-btn dark" onClick={onStop} aria-label="Hentikan">
                <Square size={16} fill="currentColor" />
              </button>
            ) : hasContent ? (
              <button
                type="button"
                className="round-btn accent"
                disabled={preparing}
                onClick={() => {
                  tap('medium');
                  onSend(value);
                }}
                aria-label="Kirim"
              >
                <ArrowUp size={22} />
              </button>
            ) : (
              <button type="button" className="round-btn dark" onClick={onVoiceMode} aria-label="Mode suara">
                <AudioLines size={22} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
