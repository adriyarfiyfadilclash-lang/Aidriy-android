import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, MessageSquare, Mic, MicOff, PhoneOff, RotateCcw } from 'lucide-react';
import { useApp, useBackClose } from '../state';
import {
  onAppBackground,
  speak,
  startListening,
  stopSpeaking,
  tap,
  voiceCapabilities,
  voiceErrorCode,
  voiceErrorMessage,
} from '../lib/native';
import { speakableText } from '../lib/parse';
import { LogoMark } from './Logo';

/**
 * Mode suara (bukan audio realtime):
 * suara → teks oleh pengenal suara HP → model teks pilihanmu → dibacakan oleh suara HP.
 *
 * State: idle | requesting_permission | listening | processing | speaking | error | ended
 */
const LABEL = {
  idle: 'Ketuk mikrofon untuk bicara',
  requesting_permission: 'Menyiapkan mikrofon…',
  listening: 'Mendengarkan…',
  processing: 'Memproses…',
  speaking: 'Berbicara…',
  error: 'Ada masalah',
  ended: 'Sesi suara selesai',
};
const ORB = { listening: 'listening', processing: 'thinking', speaking: 'speaking' };

export default function VoiceMode({ open, onClose, onUtterance, onAbort }) {
  const { settings } = useApp();
  const [state, setState] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [caps, setCaps] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  const stopRef = useRef(null);
  const activeRef = useRef(false);
  const turnRef = useRef(0); // setiap giliran baru membatalkan alur lama
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const stateRef = useRef(state);
  stateRef.current = state;

  const stopListening = async () => {
    const stop = stopRef.current;
    stopRef.current = null;
    if (stop) await stop().catch(() => {});
  };

  const haltAll = useCallback(async () => {
    turnRef.current += 1;
    await stopListening();
    await stopSpeaking();
    if (stateRef.current === 'processing') onAbort?.();
  }, [onAbort]);

  const listen = useCallback(async () => {
    if (!activeRef.current || mutedRef.current) return;
    const turn = ++turnRef.current;
    await stopSpeaking();
    setHeard('');
    setError('');
    setHint('');
    setState('requesting_permission');
    try {
      stopRef.current = await startListening({
        lang: settings.voice.lang,
        onStart: () => {
          if (turn === turnRef.current && activeRef.current) setState('listening');
        },
        onPartial: (t) => {
          if (turn === turnRef.current) setHeard(t);
        },
        onError: (e) => {
          if (turn !== turnRef.current) return;
          if (e.code === 'no-speech') setHint(voiceErrorMessage(e));
          else {
            setError(voiceErrorMessage(e));
            setState('error');
          }
        },
        onEnd: async (text) => {
          stopRef.current = null;
          if (turn !== turnRef.current || !activeRef.current) return;
          const said = (text || '').trim();
          if (!said) {
            if (stateRef.current !== 'error') setState('idle');
            return;
          }
          setHeard(said);
          setState('processing');
          try {
            const answer = await onUtterance(said);
            if (turn !== turnRef.current || !activeRef.current) return;
            setReply(answer || '');
            const spoken = speakableText(answer || '');
            if (spoken) {
              setState('speaking');
              try {
                await speak(spoken, settings.voice);
              } catch (e) {
                if (turn === turnRef.current) setHint(`Tidak bisa membacakan jawaban: ${e.message}`);
              }
            }
            if (turn !== turnRef.current || !activeRef.current) return;
            if (settings.voice.autoListen && !mutedRef.current) listen();
            else setState('idle');
          } catch (e) {
            if (turn !== turnRef.current) return;
            setError(e.message || 'Gagal mendapatkan jawaban.');
            setState('error');
          }
        },
      });
    } catch (e) {
      if (turn !== turnRef.current) return;
      setError(voiceErrorMessage(e));
      setState(voiceErrorCode(e) === 'permission' || voiceErrorCode(e) === 'unavailable' ? 'error' : 'idle');
      if (voiceErrorCode(e) !== 'permission' && voiceErrorCode(e) !== 'unavailable') setHint(voiceErrorMessage(e));
    }
  }, [settings.voice, onUtterance]);

  const end = useCallback(
    async (label = 'ended') => {
      activeRef.current = false;
      await haltAll();
      setState(label);
      onClose();
    },
    [haltAll, onClose]
  );
  useBackClose(open, () => end('ended'));

  // Buka: cek kemampuan perangkat lalu mulai mendengarkan.
  useEffect(() => {
    if (!open) return undefined;
    activeRef.current = true;
    setReply('');
    setHeard('');
    setError('');
    setHint('');
    setMuted(false);
    mutedRef.current = false;
    let cancelled = false;
    voiceCapabilities().then((c) => {
      if (cancelled) return;
      setCaps(c);
      if (!c.stt) {
        setError(voiceErrorMessage({ code: 'unavailable' }));
        setState('error');
      } else listen();
    });
    return () => {
      cancelled = true;
      activeRef.current = false;
      turnRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Aplikasi ke background: hentikan mikrofon & suara, jangan lanjut diam-diam.
  useEffect(() => {
    if (!open) return undefined;
    return onAppBackground(() => {
      if (!activeRef.current) return;
      haltAll();
      setState('idle');
      setHint('Dijeda karena aplikasi ditinggalkan. Ketuk mikrofon untuk lanjut.');
    });
  }, [open, haltAll]);

  if (!open) return null;

  const toggleMute = async () => {
    tap();
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) {
      if (stateRef.current === 'listening' || stateRef.current === 'requesting_permission') {
        turnRef.current += 1;
        await stopListening();
        setState('idle');
      }
    } else if (stateRef.current === 'idle') {
      listen();
    }
  };

  // Ketuk mikrofon / bola: mulai, selesai bicara, atau sela saat AI berbicara.
  const primary = async () => {
    tap('medium');
    const s = stateRef.current;
    if (s === 'listening' || s === 'requesting_permission') {
      await stopListening();
    } else if (s === 'speaking') {
      turnRef.current += 1;
      await stopSpeaking();
      if (!mutedRef.current) listen();
      else setState('idle');
    } else if (s === 'processing') {
      // tidak melakukan apa-apa; pakai Akhiri untuk membatalkan
    } else {
      if (mutedRef.current) {
        setMuted(false);
        mutedRef.current = false;
      }
      listen();
    }
  };

  const label = muted && (state === 'idle' || state === 'listening') ? 'Mikrofon dimatikan' : LABEL[state];

  return (
    <div className="voice-mode" role="dialog" aria-label="Mode suara">
      <div className="voice-top">
        <button type="button" className="icon-btn" onClick={() => end('idle')} aria-label="Kembali ke chat">
          <MessageSquare size={24} />
        </button>
        <span className="voice-badge">Suara HP + model teks</span>
        <button type="button" className="icon-btn" onClick={() => setShowInfo((v) => !v)} aria-label="Tentang mode suara">
          <Info size={24} />
        </button>
      </div>

      <div className="voice-center">
        {showInfo && (
          <div className="voice-info">
            Suaramu diubah jadi teks oleh pengenal suara di perangkat, dijawab model teks pilihanmu, lalu dibacakan oleh suara perangkat. Ini bukan
            percakapan audio realtime, jadi ada jeda sebentar di setiap giliran.
            {caps && (
              <div className="voice-caps">
                Dikte: {caps.stt ? 'tersedia' : 'tidak tersedia'} · Membacakan: {caps.tts ? 'tersedia' : 'tidak tersedia'}
              </div>
            )}
          </div>
        )}
        <button type="button" className={`voice-orb ${ORB[state] || ''} ${muted ? 'muted' : ''}`} onClick={primary} aria-label={state === 'speaking' ? 'Sela dan bicara' : 'Bicara'}>
          <LogoMark size={64} color="var(--on-accent)" />
        </button>
        <div className="voice-state" aria-live="polite">
          {label}
        </div>
        {state === 'speaking' && <div className="voice-hint">Ketuk bola untuk menyela</div>}
        {heard && state !== 'error' && <div className="voice-heard">“{heard}”</div>}
        {reply && state === 'speaking' && <div className="voice-reply">{speakableText(reply).slice(0, 280)}</div>}
        {hint && state !== 'error' && <div className="voice-hint">{hint}</div>}
        {state === 'error' && (
          <div className="voice-error">
            {error}
            {caps?.stt !== false && (
              <button type="button" className="btn btn-ghost small-btn" onClick={() => listen()}>
                <RotateCcw size={16} /> Coba lagi
              </button>
            )}
          </div>
        )}
      </div>

      <div className="voice-bottom">
        <button type="button" className={`voice-side ${muted ? 'on' : ''}`} onClick={toggleMute} aria-label={muted ? 'Nyalakan mikrofon' : 'Matikan mikrofon'} aria-pressed={muted}>
          {muted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <button
          type="button"
          className={`voice-mic ${state === 'listening' ? 'on' : ''}`}
          onClick={primary}
          disabled={state === 'processing'}
          aria-label={state === 'listening' ? 'Selesai bicara' : state === 'speaking' ? 'Sela' : 'Bicara'}
        >
          {state === 'listening' ? <span className="voice-stop" /> : <Mic size={30} />}
        </button>
        <button type="button" className="voice-side end" onClick={() => end('ended')} aria-label="Akhiri sesi suara">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}
