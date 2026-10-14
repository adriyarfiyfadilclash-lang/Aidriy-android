import { useMemo, useState } from 'react';
import { Check, Copy, Download, RotateCw, X } from 'lucide-react';
import { useBackClose, useApp } from '../state';
import { copyText, shareFile, tap } from '../lib/native';
import { IconButton } from './ui';
import Markdown from './Markdown';

const EXT = { html: 'html', svg: 'svg', markdown: 'md' };
const LANG_EXT = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', kotlin: 'kt', java: 'java',
  css: 'css', json: 'json', jsx: 'jsx', tsx: 'tsx', sql: 'sql', bash: 'sh', shell: 'sh', dart: 'dart', go: 'go',
  rust: 'rs', php: 'php', c: 'c', cpp: 'cpp', csharp: 'cs', swift: 'swift', ruby: 'rb', yaml: 'yml', xml: 'xml',
};

export function canPreview(a) {
  return a.kind === 'html' || a.kind === 'svg' || a.kind === 'markdown';
}

export function artifactFilename(a) {
  const ext = EXT[a.kind] || LANG_EXT[a.language] || 'txt';
  const base = (a.title || 'artefak').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'artefak';
  return `${base}.${ext}`;
}

function srcDoc(a) {
  if (a.kind === 'svg') {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:100%;max-height:100vh;height:auto}</style></head><body>${a.content}</body></html>`;
  }
  const c = a.content;
  if (/<html[\s>]/i.test(c) || /<!doctype/i.test(c)) return c;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${c}</body></html>`;
}

export default function ArtifactViewer({ artifact, onClose, inline = false }) {
  const { showToast } = useApp();
  const previewable = canPreview(artifact);
  const [tab, setTab] = useState(previewable ? 'preview' : 'code');
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);
  useBackClose(!inline, onClose);
  const doc = useMemo(() => (artifact.kind === 'html' || artifact.kind === 'svg' ? srcDoc(artifact) : ''), [artifact]);

  return (
    <div className={inline ? 'artifact-page' : 'artifact-viewer'}>
      <header className="artifact-head">
        {!inline && (
          <IconButton label="Tutup" onClick={onClose}>
            <X size={24} strokeWidth={1.75} />
          </IconButton>
        )}
        <div className="artifact-head-title">
          {!inline && <div className="truncate">{artifact.title}</div>}
          <div className="artifact-head-sub">{artifact.kind === 'code' ? artifact.language : artifact.kind.toUpperCase()}</div>
        </div>
        <IconButton
          label="Salin"
          onClick={async () => {
            tap();
            await copyText(artifact.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={22} /> : <Copy size={22} strokeWidth={1.75} />}
        </IconButton>
        <IconButton
          label="Simpan / bagikan"
          onClick={async () => {
            tap();
            try {
              await shareFile(artifactFilename(artifact), artifact.content);
            } catch (e) {
              if (!/cancel/i.test(e.message)) showToast(e.message, 'error');
            }
          }}
        >
          <Download size={22} strokeWidth={1.75} />
        </IconButton>
      </header>

      {previewable && (
        <div className="segmented artifact-tabs">
          <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
            Pratinjau
          </button>
          <button type="button" className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')}>
            Kode
          </button>
          {tab === 'preview' && artifact.kind === 'html' && (
            <button type="button" className="segmented-icon" onClick={() => setReload((r) => r + 1)} aria-label="Muat ulang">
              <RotateCw size={16} />
            </button>
          )}
        </div>
      )}

      <div className="artifact-body">
        {tab === 'preview' && (artifact.kind === 'html' || artifact.kind === 'svg') && (
          <iframe
            key={reload}
            title={artifact.title}
            className="artifact-frame"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"
            srcDoc={doc}
          />
        )}
        {tab === 'preview' && artifact.kind === 'markdown' && (
          <div className="artifact-md">
            <Markdown text={artifact.content} />
          </div>
        )}
        {tab === 'code' && (
          <pre className="artifact-code">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
