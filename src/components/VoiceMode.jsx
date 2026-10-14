import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { useApp, useBackClose } from '../state';
import { speak, startListening, stopSpeaking, tap } from '../lib/native';
import { speakableText } from '../lib/parse';
import { LogoMark } from './Logo';

const LABEL = {
  idle: 'Ketuk mikrofon untuk bicara',
  listening: 'Mendengarkan…',
  thinking: 'Berpikir…',
  speaking: 'Berbicara…',
};

export default function VoiceMode({ open, onClose, onUtterance }) {
  const { settings, showToast } = useApp();
  const [state, setState] = useState('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const stopRef = useRef(null);
  const activeRef = useRef(false);

  const close = useCallback(async () => {
    activeRef.current = false;
    if (stopRef.current) await stopRef.current().catch(() => {});
    await stopSpeaking();
    setState('idle');
    onClose();
  }, [onClose]);
  useBackClose(open, close);

  const listen = useCallback(async () => {
    if (!activeRef.current) return;
    setHeard('');
    setState('listening');
    try {
      stopRef.current = await startListening({
        lang: settings.voice.lang,
        onPartial: (t) => setHeard(t),
        onEnd: async (text) => {
          stopRef.current = null;
          if (!activeRef.current) return;
          const said = (text || '').trim();
          if (!said) {
            setState('idle');
            return;
          }
          setHeard(said);
          setState('thinking');
          try {
            const answer = await onUtterance(said);
            if (!activeRef.current) return;
            setReply(answer || '');
            setState('speaking');
            await speak(speakableText(answer || ''), settings.voice);
            if (!activeRef.current) return;
            if (settings.voice.autoListen) listen();
            else setState('idle');
          } catch (e) {
            showToast(e.message, 'error');
            setState('idle');
          }
        },
        onError: () => {},
      });
    } catch (e) {
      showToast(e.message, 'error');
      setState('idle');
    }
  }, [settings.voice, onUtterance, showToast]);

  useEffect(() => {
    if (open) {
      activeRef.current = true;
      setReply('');
      listen();
    }
    return () => {
      activeRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="voice-mode">
      <div className="voice-top">
        <button type="button" className="icon-btn" onClick={close} aria-label="Tutup mode suara">
          <X size={26} />
        </button>
      </div>
      <div className="voice-center">
        <div className={`voice-orb ${state}`}>
          <LogoMark size={64} color="var(--on-accent)" />
        </div>
        <div className="voice-state">{LABEL[state]}</div>
        {heard && <div className="voice-heard">“{heard}”</div>}
        {reply && state === 'speaking' && <div className="voice-reply">{speakableText(reply).slice(0, 280)}</div>}
      </div>
      <div className="voice-bottom">
        <button
          type="button"
          className={`voice-mic ${state === 'listening' ? 'on' : ''}`}
          onClick={async () => {
            tap('medium');
            if (state === 'listening') {
              if (stopRef.current) await stopRef.current();
            } else if (state === 'speaking') {
              await stopSpeaking();
            } else if (state === 'idle') {
              listen();
            }
          }}
          aria-label={state === 'listening' ? 'Selesai bicara' : 'Bicara'}
        >
          {state === 'listening' ? <MicOff size={30} /> : <Mic size={30} />}
        </button>
      </div>
    </div>
  );
}
