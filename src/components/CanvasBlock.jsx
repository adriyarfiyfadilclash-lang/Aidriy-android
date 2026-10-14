import { memo, useMemo, useState } from 'react';
import { Check, Code2, Copy, FileText, Maximize2, Pencil } from 'lucide-react';
import Markdown from './Markdown';
import { copyText, tap } from '../lib/native';
import { useApp } from '../state';

const KIND = { document: 'Dokumen', code: 'Kode', html: 'Halaman web', svg: 'Diagram SVG', markdown: 'Dokumen' };

/** Menentukan cara tampil Canvas di chat dari jenis & panjang isinya. */
export function canvasSize(content, kind) {
  const text = content || '';
  const lines = text.split('\n').length;
  const chars = text.length;
  if (kind === 'html' || kind === 'svg') return 'medium';
  if (kind === 'code') return lines <= 15 ? 'short' : lines <= 80 ? 'medium' : 'long';
  if (chars <= 700 && lines <= 14) return 'short';
  if (chars <= 4000 && lines <= 90) return 'medium';
  return 'long';
}

function frame(kind, content) {
  if (kind === 'svg') return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;display:flex;justify-content:center;background:#fff}svg{max-width:100%;height:auto}</style></head><body>${content}</body></html>`;
  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) return content;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`;
}

function Body({ kind, content }) {
  if (kind === 'code') {
    return (
      <pre className="cb-code">
        <code>{content}</code>
      </pre>
    );
  }
  if (kind === 'html' || kind === 'svg') {
    return <iframe title="Pratinjau" className="cb-frame" sandbox="allow-scripts allow-forms allow-modals" srcDoc={frame(kind, content)} loading="lazy" />;
  }
  return (
    <div className="cb-doc">
      <Markdown text={content} />
    </div>
  );
}

/**
 * Canvas di dalam pesan AI.
 * - pendek: isi tampil penuh + Salin/Edit
 * - menengah: pratinjau setinggi wajar + Salin/Edit/Perluas
 * - panjang: kartu ringkas (Canvas dibuka otomatis setelah selesai dibuat)
 */
function CanvasBlock({ seg, info, row, isLatest, streaming, onOpen, onApply, onDismiss, onRetry }) {
  const { showToast } = useApp();
  const [copied, setCopied] = useState(false);
  const content = row?.content ?? seg.content;
  const title = row?.title ?? seg.title;
  const kind = row?.kind === 'markdown' ? 'document' : row?.kind || seg.kind;
  const size = useMemo(() => canvasSize(content, kind), [content, kind]);
  const Icon = kind === 'document' ? FileText : Code2;

  // Sedang ditulis AI: jangan tampilkan dokumen belum lengkap sebagai hasil akhir.
  if (!seg.complete || (streaming && !info)) {
    return (
      <div className="canvas-card">
        <div className="canvas-card-main" aria-busy="true">
          <span className="artifact-card-icon">
            <Icon size={22} />
          </span>
          <span className="artifact-card-text">
            <span className="artifact-card-title truncate">{seg.title}</span>
            <span className="artifact-card-sub">
              {seg.complete ? 'Menyimpan…' : `${seg.action === 'update' ? 'Memperbarui' : 'Membuat'} Canvas… ${seg.content.length.toLocaleString('id-ID')} karakter`}
            </span>
          </span>
          <span className="spinner small" />
        </div>
      </div>
    );
  }

  const copy = async () => {
    tap();
    const ok = await copyText(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      showToast('Isi Canvas disalin');
    } else {
      showToast('Gagal menyalin. Buka Canvas lalu salin manual.', 'error');
    }
  };

  const status =
    info?.status === 'error'
      ? 'Gagal disimpan'
      : info?.status === 'local'
        ? 'Incognito · tidak disimpan'
        : row
          ? `Tersimpan · Rev ${row.revision}`
          : info?.revision
            ? `Rev ${info.revision}`
            : '';

  // Pesan lama yang menunjuk Canvas yang sudah diperbarui di pesan berikutnya
  if (!isLatest) {
    return (
      <div className="canvas-card">
        <button type="button" className="canvas-card-main" onClick={() => onOpen(seg, info, 'preview')}>
          <span className="artifact-card-icon">
            <Icon size={22} />
          </span>
          <span className="artifact-card-text">
            <span className="artifact-card-title truncate">{title}</span>
            <span className="artifact-card-sub">
              {info?.status === 'updated' ? 'Diperbarui' : 'Dibuat'} di sini{info?.revision ? ` (Rev ${info.revision})` : ''} · versi terbaru ada di bawah
            </span>
          </span>
          <span className="canvas-open-pill">Buka</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`cb cb-${size} ${info?.status === 'conflict' ? 'conflict' : ''}`}>
      <div className="cb-head">
        <span className="cb-icon">
          <Icon size={18} />
        </span>
        <span className="cb-title-wrap">
          <span className="cb-title truncate">{title}</span>
          <span className="cb-sub">
            {KIND[kind] || 'Canvas'}
            {status ? ` · ${status}` : ''}
          </span>
        </span>
      </div>

      {info?.status === 'conflict' && (
        <div className="cb-banner">
          Versi AI belum diterapkan karena Canvas sedang kamu sunting.
          <div className="canvas-banner-actions">
            <button type="button" className="btn btn-ghost small-btn" onClick={onDismiss}>
              Abaikan
            </button>
            <button type="button" className="btn btn-dark small-btn" onClick={onApply}>
              Terapkan versi AI
            </button>
          </div>
        </div>
      )}
      {info?.status === 'error' && (
        <div className="cb-banner error">
          {info.error || 'Canvas gagal disimpan.'}
          {onRetry && (
            <button type="button" className="link-btn" onClick={onRetry}>
              Coba simpan lagi
            </button>
          )}
        </div>
      )}

      {size === 'long' ? (
        <button type="button" className="cb-long" onClick={() => onOpen(seg, info, 'preview')}>
          <span className="cb-long-text">{content.slice(0, 280).replace(/[#*`>|]/g, '')}…</span>
          <span className="muted small">{content.length.toLocaleString('id-ID')} karakter · ketuk untuk membaca</span>
        </button>
      ) : (
        <div className={`cb-body ${size === 'medium' ? 'clamped' : ''}`}>
          <Body kind={kind} content={content} />
          {size === 'medium' && kind !== 'html' && kind !== 'svg' && <div className="cb-fade" />}
        </div>
      )}

      <div className="cb-actions">
        <button type="button" className="cb-btn" onClick={copy} aria-label="Salin isi Canvas">
          {copied ? <Check size={17} /> : <Copy size={17} />} Salin
        </button>
        <button type="button" className="cb-btn" onClick={() => onOpen(seg, info, 'edit')} aria-label="Edit Canvas">
          <Pencil size={16} /> Edit
        </button>
        {size !== 'short' && (
          <button type="button" className="cb-btn" onClick={() => onOpen(seg, info, 'preview')} aria-label="Perluas Canvas">
            <Maximize2 size={16} /> Perluas
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(CanvasBlock);
