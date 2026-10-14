import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, FileText, Mic, Plus, RotateCcw, Square, X } from 'lucide-react';
import { startListening, tap, voiceErrorMessage } from '../lib/native';
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
  const [micLive, setMicLive] = useState(false); // true hanya setelah mikrofon benar-benar aktif
  const [review, setReview] = useState(null); // { base, text } setelah dikte selesai: Rekam ulang / Batal
  const stopRef = useRef(null);
  const baseRef = useRef('');
  const latestRef = useRef('');
  const cancelledRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  // Dikte tidak pernah mengirim otomatis: teks masuk ke kotak pesan untuk diperiksa dulu.
  const startDictation = async (base = value) => {
    tap();
    setReview(null);
    baseRef.current = base ? `${base.trimEnd()} ` : '';
    latestRef.current = '';
    cancelledRef.current = false;
    setMicLive(false);
    setDictating(true);
    try {
      stopRef.current = await startListening({
        lang: settings.voice.lang,
        onStart: () => setMicLive(true),
        onPartial: (t) => {
          latestRef.current = t;
          if (!cancelledRef.current) setValue(baseRef.current + t);
        },
        onEnd: (t) => {
          setDictating(false);
          setMicLive(false);
          stopRef.current = null;
          if (cancelledRef.current) return;
          const said = (t || latestRef.current || '').trim();
          const finalText = (baseRef.current + said).trimEnd();
          setValue(finalText);
          if (said) setReview({ base: baseRef.current.trimEnd(), text: finalText });
          setTimeout(() => ref.current?.focus(), 50);
        },
        onError: (e) => {
          if (e?.code === 'no-speech' && !latestRef.current) showToast(voiceErrorMessage(e));
          else if (e?.code !== 'no-speech') showToast(voiceErrorMessage(e), 'error');
        },
      });
    } catch (e) {
      setDictating(false);
      setMicLive(false);
      showToast(voiceErrorMessage(e), 'error');
    }
  };

  const stopDictation = async () => {
    tap();
    if (stopRef.current) await stopRef.current();
  };

  const cancelDictation = async () => {
    tap();
    cancelledRef.current = true;
    setValue(baseRef.current.trimEnd());
    if (stopRef.current) await stopRef.current();
    setDictating(false);
    setMicLive(false);
  };

  // Tampilkan Rekam ulang / Batal hanya selama teks hasil dikte belum diubah.
  const reviewing = review && value === review.text;

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
          <div className="dictation-status" aria-live="polite">
            {micLive ? 'Mendengarkan… ketuk ■ bila selesai' : 'Menyiapkan mikrofon…'}
          </div>
          <div className="dictation-bar">
            <button type="button" className="round-btn soft" onClick={cancelDictation} aria-label="Batal dikte">
              <X size={22} />
            </button>
            <div className={`wave-dots ${micLive ? '' : 'idle'}`} aria-hidden="true">
              {Array.from({ length: 28 }).map((_, i) => (
                <span key={i} style={{ animationDelay: `${(i % 7) * 0.12}s` }} />
              ))}
            </div>
            <button type="button" className="round-btn dark" onClick={stopDictation} aria-label="Selesai dikte">
              <Square size={16} fill="currentColor" />
            </button>
          </div>
        </>
      ) : (
        <>
          {reviewing && (
            <div className="dictation-chips">
              <button type="button" className="chip" onClick={() => startDictation(review.base)}>
                <RotateCcw size={14} /> Rekam ulang
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  tap();
                  setValue(review.base);
                  setReview(null);
                }}
              >
                <X size={14} /> Batal
              </button>
            </div>
          )}
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
              <button type="button" className="round-btn soft" onClick={() => startDictation()} aria-label="Dikte suara">
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
