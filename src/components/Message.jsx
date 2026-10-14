import { memo, useMemo, useState } from 'react';
import { AlertCircle, Brain, Check, ChevronDown, Code2, Copy, FileText, Globe, ImageIcon, RotateCcw, Square, Volume2 } from 'lucide-react';
import Markdown from './Markdown';
import { splitSegments, plainText, speakableText } from '../lib/parse';
import { copyText, speak, stopSpeaking, tap } from '../lib/native';
import { formatSize } from '../lib/files';

function ArtifactCard({ seg, onOpen }) {
  return (
    <button type="button" className="artifact-card" onClick={() => seg.complete && onOpen(seg)} disabled={!seg.complete}>
      <span className="artifact-card-icon">{seg.kind === 'code' ? <Code2 size={22} /> : <FileText size={22} />}</span>
      <span className="artifact-card-text">
        <span className="artifact-card-title truncate">{seg.title}</span>
        <span className="artifact-card-sub">
          {seg.complete ? `Ketuk untuk membuka · ${seg.kind === 'code' ? seg.language : seg.kind.toUpperCase()}` : 'Sedang dibuat…'}
        </span>
      </span>
      {!seg.complete && <span className="spinner small" />}
    </button>
  );
}

function AttachmentChips({ items }) {
  if (!items?.length) return null;
  return (
    <div className="msg-attachments">
      {items.map((a) =>
        a.kind === 'image' && (a.thumb || a.data) ? (
          <img key={a.id || a.name} className="msg-thumb" src={a.thumb || `data:${a.mime};base64,${a.data}`} alt={a.name} />
        ) : (
          <div key={a.id || a.name} className="file-chip">
            {a.kind === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}
            <span className="file-chip-text">
              <span className="truncate">{a.name}</span>
              <span className="file-chip-sub">{a.kind === 'pdf' ? 'PDF' : a.kind === 'text' ? 'Teks' : 'Berkas'} {formatSize(a.size)}</span>
            </span>
          </div>
        )
      )}
    </div>
  );
}

function Message({ msg, isLast, busy, onRegenerate, onOpenArtifact, voice }) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const segments = useMemo(() => (msg.role === 'assistant' ? splitSegments(msg.content) : []), [msg.role, msg.content]);

  if (msg.role === 'user') {
    return (
      <div className="msg msg-user">
        <AttachmentChips items={msg.attachments} />
        {msg.content && <div className="bubble">{msg.content}</div>}
      </div>
    );
  }

  const sources = msg.meta?.sources || [];
  const thinking = msg.thinking ?? msg.meta?.thinking;
  const streaming = msg.streaming;

  return (
    <div className="msg msg-ai">
      {thinking && (
        <div className="thinking">
          <button type="button" className="thinking-toggle" onClick={() => setShowThinking((v) => !v)}>
            <Brain size={16} />
            <span>{streaming && !msg.content ? 'Sedang berpikir…' : 'Proses berpikir'}</span>
            <ChevronDown size={16} className={showThinking ? 'rot' : ''} />
          </button>
          {showThinking && <div className="thinking-body">{thinking}</div>}
        </div>
      )}

      {streaming && msg.status && !msg.content && (
        <div className="status-line">
          <Globe size={15} /> {msg.status}
        </div>
      )}

      {segments.map((s, i) =>
        s.type === 'text' ? <Markdown key={i} text={s.text} /> : <ArtifactCard key={i} seg={s} onOpen={onOpenArtifact} />
      )}

      {streaming && !msg.content && !thinking && !msg.status && (
        <div className="typing">
          <span />
          <span />
          <span />
        </div>
      )}
      {streaming && msg.content && <span className="cursor" />}

      {msg.notice && <div className="notice">{msg.notice}</div>}

      {msg.error && (
        <div className="error-box">
          <AlertCircle size={18} />
          <div>
            <div>{msg.error}</div>
            {isLast && onRegenerate && (
              <button type="button" className="link-btn" onClick={onRegenerate}>
                Coba lagi
              </button>
            )}
          </div>
        </div>
      )}

      {sources.length > 0 && !streaming && (
        <div className="sources">
          <div className="sources-title">Sumber</div>
          {sources.slice(0, 8).map((s, i) => {
            let host = s.url;
            try {
              host = new URL(s.url).hostname.replace(/^www\./, '');
            } catch {
              /* biarkan */
            }
            return (
              <a key={i} className="source" href={s.url} target="_blank" rel="noreferrer">
                <span className="source-num">{i + 1}</span>
                <span className="source-text">
                  <span className="truncate">{s.title}</span>
                  <span className="source-host truncate">{host}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}

      {!streaming && msg.content && (
        <div className="msg-actions">
          <button
            type="button"
            className="action-btn"
            aria-label="Salin"
            onClick={async () => {
              tap();
              await copyText(plainText(msg.content));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <button
            type="button"
            className="action-btn"
            aria-label={speaking ? 'Hentikan' : 'Bacakan'}
            onClick={async () => {
              tap();
              if (speaking) {
                await stopSpeaking();
                setSpeaking(false);
                return;
              }
              setSpeaking(true);
              try {
                await speak(speakableText(msg.content), voice);
              } catch {
                /* abaikan */
              }
              setSpeaking(false);
            }}
          >
            {speaking ? <Square size={16} /> : <Volume2 size={18} />}
          </button>
          {isLast && onRegenerate && !busy && (
            <button type="button" className="action-btn" aria-label="Buat ulang" onClick={onRegenerate}>
              <RotateCcw size={18} />
            </button>
          )}
          {msg.meta?.model && <span className="msg-model">{msg.meta.model}</span>}
        </div>
      )}
    </div>
  );
}

export default memo(Message);
