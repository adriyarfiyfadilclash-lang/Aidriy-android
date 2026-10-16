import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, ChevronDown, FileText, Languages, Mic, Plus, RotateCcw, ScanText, Sparkles, Square, X } from 'lucide-react';
import { startListening, tap, voiceErrorMessage } from '../lib/native';
import { startRecording } from '../lib/recorder';
import { transcribe, LANGUAGES } from '../lib/nvidiaTools';
import { usesNvidiaVoice } from '../lib/voice';

const TOOL_LABEL = { image: 'Buat gambar', ocr: 'Baca teks dari foto', translate: 'Terjemahkan ke' };
const TOOL_ICON = { image: Sparkles, ocr: ScanText, translate: Languages };
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
  tool,
  onClearTool,
  onPickLanguage,
}) {
  const { settings, showToast } = useApp();
  const ref = useRef();
  const [dictating, setDictating] = useState(false);
  const [micLive, setMicLive] = useState(false); // true hanya setelah mikrofon benar-benar aktif
  const [level, setLevel] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef(null);
  const nvidiaStt = usesNvidiaVoice(settings);
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
    if (nvidiaStt) {
      try {
        const rec = await startRecording({ onLevel: setLevel, onAutoStop: () => stopRef.current?.() });
        recRef.current = rec;
        setMicLive(true);
        stopRef.current = async () => {
          stopRef.current = null;
          const r = await rec.stop();
          setMicLive(false);
          if (!r || cancelledRef.current) {
            setDictating(false);
            return;
          }
          if (r.seconds < 0.4) {
            setDictating(false);
            showToast('Rekaman terlalu pendek.');
            return;
          }
          setTranscribing(true);
          try {
            const lang = (settings.voice.lang || 'id-ID').split('-')[0];
            const said = await transcribe(settings.keys.nvidia, { wavBase64: r.wavBase64, sampleRate: r.sampleRate, language: lang });
            if (cancelledRef.current) return;
            if (!said) showToast('Tidak ada suara yang dikenali. Coba bicara lebih dekat ke mikrofon.');
            const finalText = (baseRef.current + said).trimEnd();
            setValue(finalText);
            if (said) setReview({ base: baseRef.current.trimEnd(), text: finalText });
          } catch (e) {
            showToast(`Transkripsi NVIDIA gagal: ${e.message}`, 'error');
          } finally {
            setTranscribing(false);
            setDictating(false);
            setTimeout(() => ref.current?.focus(), 50);
          }
        };
      } catch (e) {
        setDictating(false);
        showToast(e.message, 'error');
      }
      return;
    }
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
    if (recRef.current) {
      recRef.current.cancel();
      recRef.current = null;
      stopRef.current = null;
      setTranscribing(false);
    }
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
            {transcribing
              ? 'Mentranskripsi dengan NVIDIA Whisper…'
              : micLive
                ? nvidiaStt
                  ? 'Merekam (NVIDIA)… ketuk ■ bila selesai'
                  : 'Mendengarkan… ketuk ■ bila selesai'
                : 'Menyiapkan mikrofon…'}
          </div>
          <div className="dictation-bar">
            <button type="button" className="round-btn soft" onClick={cancelDictation} aria-label="Batal dikte">
              <X size={22} />
            </button>
            {nvidiaStt ? (
              <div className="rec-level" aria-hidden="true">
                <span style={{ width: `${Math.round((transcribing ? 1 : level) * 100)}%` }} />
              </div>
            ) : (
              <div className={`wave-dots ${micLive ? '' : 'idle'}`} aria-hidden="true">
                {Array.from({ length: 28 }).map((_, i) => (
                  <span key={i} style={{ animationDelay: `${(i % 7) * 0.12}s` }} />
                ))}
              </div>
            )}
            <button type="button" className="round-btn dark" onClick={stopDictation} disabled={transcribing} aria-label="Selesai dikte">
              <Square size={16} fill="currentColor" />
            </button>
          </div>
        </>
      ) : (
        <>
          {tool && (
            <div className="tool-chip-row">
              <span className="tool-chip">
                {(() => {
                  const I = TOOL_ICON[tool.type];
                  return <I size={16} />;
                })()}
                {TOOL_LABEL[tool.type]}
                {tool.type === 'translate' && (
                  <button type="button" className="tool-chip-lang" onClick={onPickLanguage} aria-label="Pilih bahasa tujuan">
                    {LANGUAGES.find((l) => l.id === tool.target)?.label || 'Inggris'} <ChevronDown size={14} />
                  </button>
                )}
                <button type="button" onClick={onClearTool} aria-label="Matikan alat">
                  <X size={15} />
                </button>
              </span>
            </div>
          )}
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
