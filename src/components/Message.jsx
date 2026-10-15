import { memo, useMemo, useState } from 'react';
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Globe,
  ImageIcon,
  RotateCcw,
  Share2,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from 'lucide-react';
import CanvasBlock from './CanvasBlock';
import { useApp } from '../state';
import { PROVIDERS } from '../lib/providers';
import Markdown, { SourcesContext } from './Markdown';
import ImageGallery from './ImageGallery';
import Sources from './Sources';
import { splitSegments, plainText, speakableText } from '../lib/parse';
import { copyText, openExternal, speak, stopSpeaking, tap } from '../lib/native';
import { formatSize } from '../lib/files';

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

function findBlock(blocks, query) {
  const q = query.toLowerCase();
  return (blocks || []).find((b) => b.query.toLowerCase() === q);
}

export const FEEDBACK_REASONS = ['Tidak akurat', 'Tidak mengikuti instruksi', 'Terlalu panjang', 'Kurang lengkap', 'Tidak membantu', 'Lainnya'];

function Message({
  msg,
  isLast,
  busy,
  versions,
  onRegenerate,
  onOpenCanvas,
  onCanvasConflict,
  onRetryCanvas,
  onRetryImages,
  onFeedback,
  onShare,
  onPickModel,
  canvasRows,
  latestCanvas,
  voice,
}) {
  const { showToast } = useApp();
  const [copied, setCopied] = useState(false);
  const [askReason, setAskReason] = useState(false);
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
  const blocks = msg.meta?.images || [];
  const tagged = new Set(segments.filter((s) => s.type === 'images').map((s) => s.query.toLowerCase()));
  const untagged = blocks.filter((b) => !tagged.has(b.query.toLowerCase()));
  const thinking = msg.thinking ?? msg.meta?.thinking;
  const streaming = msg.streaming;
  const retry = (b) => (onRetryImages && !streaming ? () => onRetryImages(msg.id, b.id) : undefined);

  return (
    <SourcesContext.Provider value={sources}>
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

      {untagged.map((b) => (
        <ImageGallery key={b.id} block={b} onRetry={retry(b)} />
      ))}

      {segments.map((s, i) => {
        if (s.type === 'text') return <Markdown key={i} text={s.text} />;
        if (s.type === 'images') {
          const b = findBlock(blocks, s.query);
          return b ? <ImageGallery key={i} block={b} onRetry={retry(b)} /> : null;
        }
        const info = msg.meta?.canvases?.[s.index];
        const row = info?.id ? canvasRows?.[info.id] : null;
        const isLatest = !info?.id || !latestCanvas?.[info.id] || latestCanvas[info.id] === `${msg.id}:${s.index}`;
        return (
          <CanvasBlock
            key={i}
            seg={s}
            info={info}
            row={isLatest && info?.status !== 'conflict' && info?.status !== 'dismissed' ? row : null}
            isLatest={isLatest}
            streaming={streaming}
            onOpen={onOpenCanvas}
            onApply={() => onCanvasConflict?.(msg.id, s.index, 'apply')}
            onDismiss={() => onCanvasConflict?.(msg.id, s.index, 'dismiss')}
            onRetry={onRetryCanvas && !streaming ? () => onRetryCanvas(msg.id) : undefined}
          />
        );
      })}

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
          <div className="error-body">
            {msg.errorInfo?.kind === 'credits' ? (
              <>
                <div className="error-title">Kredit {PROVIDERS[msg.errorInfo.provider]?.short || 'API'} habis</div>
                <div>
                  Saldo atau kuota API key {PROVIDERS[msg.errorInfo.provider]?.short || ''} kamu sudah habis, jadi penyedia menolak permintaan ini. Kredit API ditagih
                  terpisah dari langganan aplikasi chat. Isi ulang kredit, atau ganti ke model dari penyedia lain yang key-nya masih aktif.
                </div>
              </>
            ) : (
              <div>{msg.error}</div>
            )}
            {msg.errorInfo?.detail && <div className="error-detail">{msg.errorInfo.detail}</div>}
            <div className="error-actions">
              {msg.errorInfo?.kind === 'credits' && PROVIDERS[msg.errorInfo.provider]?.billingUrl && (
                <button type="button" className="btn btn-dark small-btn" onClick={() => openExternal(PROVIDERS[msg.errorInfo.provider].billingUrl)}>
                  Isi kredit
                </button>
              )}
              {(msg.errorInfo?.kind === 'credits' || msg.errorInfo?.kind === 'auth') && onPickModel && (
                <button type="button" className="btn btn-ghost small-btn" onClick={onPickModel}>
                  Ganti model
                </button>
              )}
              {isLast && onRegenerate && (
                <button type="button" className="link-btn" onClick={onRegenerate}>
                  Coba lagi
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {sources.length > 0 && !streaming && <Sources sources={sources} />}

      {!streaming && msg.content && (
        <div className="msg-actions" role="toolbar" aria-label="Aksi pesan">
          {versions && versions.count > 1 && (
            <span className="ver-nav" aria-label={`Versi ${versions.index} dari ${versions.count}`}>
              <button type="button" className="action-btn sm" aria-label="Versi sebelumnya" disabled={versions.index <= 1 || busy} onClick={versions.onPrev}>
                <ChevronLeft size={18} />
              </button>
              <span className="ver-count">
                {versions.index}/{versions.count}
              </span>
              <button type="button" className="action-btn sm" aria-label="Versi berikutnya" disabled={versions.index >= versions.count || busy} onClick={versions.onNext}>
                <ChevronRight size={18} />
              </button>
            </span>
          )}
          <button
            type="button"
            className="action-btn"
            aria-label="Salin"
            onClick={async () => {
              tap();
              const ok = await copyText(plainText(msg.content));
              if (!ok) {
                showToast('Gagal menyalin teks', 'error');
                return;
              }
              setCopied(true);
              showToast('Teks disalin');
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          {isLast && onRegenerate && (
            <button type="button" className="action-btn" aria-label="Buat ulang jawaban" disabled={busy} onClick={onRegenerate}>
              <RotateCcw size={18} />
            </button>
          )}
          {onFeedback && (
            <>
              <button
                type="button"
                className={`action-btn ${msg.feedback === 1 ? 'on' : ''}`}
                aria-label="Suka"
                aria-pressed={msg.feedback === 1}
                onClick={() => {
                  tap();
                  setAskReason(false);
                  onFeedback(msg, msg.feedback === 1 ? 0 : 1);
                }}
              >
                <ThumbsUp size={18} fill={msg.feedback === 1 ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className={`action-btn ${msg.feedback === -1 ? 'on' : ''}`}
                aria-label="Tidak suka"
                aria-pressed={msg.feedback === -1}
                onClick={() => {
                  tap();
                  if (msg.feedback === -1) {
                    setAskReason(false);
                    onFeedback(msg, 0);
                  } else {
                    setAskReason(true);
                    onFeedback(msg, -1);
                  }
                }}
              >
                <ThumbsDown size={18} fill={msg.feedback === -1 ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
          {onShare && (
            <button
              type="button"
              className="action-btn"
              aria-label="Bagikan"
              onClick={() => {
                tap();
                onShare(msg);
              }}
            >
              <Share2 size={18} />
            </button>
          )}
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
          {msg.meta?.model && <span className="msg-model">{msg.meta.model}</span>}
        </div>
      )}

      {askReason && msg.feedback === -1 && (
        <div className="fb-reasons">
          <div className="fb-reasons-head">
            <span>Apa yang kurang? (opsional)</span>
            <button type="button" className="action-btn sm" aria-label="Tutup" onClick={() => setAskReason(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="fb-chips">
            {FEEDBACK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip ${msg.feedback_reason === r ? 'on' : ''}`}
                onClick={() => {
                  tap();
                  onFeedback(msg, -1, r);
                  setAskReason(false);
                  showToast('Terima kasih atas masukannya');
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    </SourcesContext.Provider>
  );
}

export default memo(Message);
