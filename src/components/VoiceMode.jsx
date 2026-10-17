import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, MessageSquare, Mic, MicOff, PhoneOff, RotateCcw } from 'lucide-react';
import { useApp, useBackClose } from '../state';
import {
  onAppBackground,
  startListening,
  tap,
  voiceCapabilities,
  voiceErrorCode,
  voiceErrorMessage,
} from '../lib/native';
import { speakableText } from '../lib/parse';
import { LogoMark } from './Logo';
import { speakText as speak, stopText as stopSpeaking, usesNvidiaVoice } from '../lib/voice';
import { startRecording } from '../lib/recorder';
import { transcribe } from '../lib/nvidiaTools';

/** Dengar lewat NVIDIA Whisper: rekam sampai hening ±1,4 detik setelah bicara, lalu transkripsi. */
async function startNvidiaListening(settings, { onStart, onPartial, onEnd, onError }) {
  let spoke = false;
  let quietSince = 0;
  let stopped = false;
  let rec = null;
  const finish = async () => {
    if (stopped) return;
    stopped = true;
    const r = await rec.stop();
    if (!r || r.seconds < 0.5 || !spoke) {
      onEnd('');
      return;
    }
    onPartial('(mentranskripsi…)');
    try {
      const lang = (settings.voice.lang || 'id-ID').split('-')[0];
      const text = await transcribe(settings.keys.nvidia, { wavBase64: r.wavBase64, sampleRate: r.sampleRate, language: lang });
      onPartial(text);
      onEnd(text);
    } catch (e) {
      onError(Object.assign(e, { code: e.code || 'unknown' }));
      onEnd('');
    }
  };
  rec = await startRecording({
    maxMs: 60_000,
    onAutoStop: finish,
    onLevel: (lv) => {
      const now = Date.now();
      if (lv > 0.12) {
        spoke = true;
        quietSince = 0;
      } else if (spoke) {
        if (!quietSince) quietSince = now;
        else if (now - quietSince > 1400) finish();
      }
    },
  });
  onStart();
  return async () => finish();
}

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
  const nvidia = usesNvidiaVoice(settings);
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
      const listenFn = nvidia ? (o) => startNvidiaListening(settings, o) : startListening;
      stopRef.current = await listenFn({
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
                await speak(spoken, settings);
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
  }, [settings, nvidia, onUtterance]);

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
      if (!c.stt && !nvidia) {
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
      // Mikrofon & suara dihentikan; jawaban AI yang sedang ditulis TIDAK dibatalkan.
      const wasProcessing = stateRef.current === 'processing';
      turnRef.current += 1;
      stopListening();
      stopSpeaking();
      setState('idle');
      setHint(
        wasProcessing
          ? 'Mikrofon dijeda. Jawaban tetap ditulis dan tersimpan di chat.'
          : 'Dijeda karena aplikasi ditinggalkan. Ketuk mikrofon untuk lanjut.'
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        <span className="voice-badge">{nvidia ? 'Suara NVIDIA + model teks' : 'Suara HP + model teks'}</span>
        <button type="button" className="icon-btn" onClick={() => setShowInfo((v) => !v)} aria-label="Tentang mode suara">
          <Info size={24} />
        </button>
      </div>

      <div className="voice-center">
        {showInfo && (
          <div className="voice-info">
            {nvidia
              ? 'Suaramu direkam lalu diubah jadi teks oleh NVIDIA Whisper, dijawab model teks pilihanmu, lalu dibacakan suara NVIDIA. '
              : 'Suaramu diubah jadi teks oleh pengenal suara di perangkat, dijawab model teks pilihanmu, lalu dibacakan oleh suara perangkat. '}
            Ini bukan percakapan audio realtime, jadi ada jeda sebentar di setiap giliran.
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
