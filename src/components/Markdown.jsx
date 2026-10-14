import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { copyText, tap } from '../lib/native';

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
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
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
