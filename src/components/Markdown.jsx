import { createContext, memo, useContext, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { copyText, openExternal, tap } from '../lib/native';
import { sourceDomain, sourceTitle } from '../lib/citations';

// Daftar sumber pesan aktif, dipakai penanda sitasi [n].
export const SourcesContext = createContext([]);

function Cite({ n }) {
  const sources = useContext(SourcesContext);
  const s = sources[n - 1];
  if (!s) return <sup className="cite missing">{n}</sup>;
  return (
    <button
      type="button"
      className="cite"
      title={`${sourceTitle(s)} — ${sourceDomain(s)}`}
      aria-label={`Sumber ${n}: ${sourceDomain(s)}`}
      onClick={() => openExternal(s.url)}
    >
      {n}
    </button>
  );
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{language || 'kode'}</span>
        <button
          type="button"
          className="codeblock-copy"
          onClick={async () => {
            tap();
            await copyText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const cls = child?.props?.className || '';
    const language = (cls.match(/language-([\w+-]+)/) || [])[1] || '';
    const code = textOf(child?.props?.children).replace(/\n$/, '');
    return <CodeBlock language={language} code={code} />;
  },
  a({ href, children }) {
    const m = /^#cite-(\d+)$/.exec(href || '');
    if (m) return <Cite n={Number(m[1])} />;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (/^https?:/i.test(href || '')) {
            e.preventDefault();
            openExternal(href);
          }
        }}
      >
        {children}
      </a>
    );
  },
  // URL gambar yang ditulis model tidak terverifikasi, jadi tidak ditampilkan sebagai gambar.
  img({ src, alt }) {
    if (!/^https?:/i.test(src || '')) return null;
    return (
      <button type="button" className="md-img-link" onClick={() => openExternal(src)}>
        Tautan gambar dari AI{alt ? `: ${alt}` : ''} (belum diverifikasi)
      </button>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
