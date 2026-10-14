import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { openExternal } from '../lib/native';
import { sourceDomain, sourceTitle } from '../lib/citations';

function Badge({ s }) {
  const d = sourceDomain(s);
  return <span className="src-badge">{(d[0] || '?').toUpperCase()}</span>;
}

export default function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  const n = sources.length;

  return (
    <section className={`sources2 ${open ? 'open' : ''}`}>
      <button type="button" className="sources-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="src-stack">
          {sources.slice(0, 3).map((s, i) => (
            <Badge key={i} s={s} />
          ))}
        </span>
        <span>Sumber ({n})</span>
        <ChevronDown size={18} className={open ? 'rot' : ''} />
      </button>

      {!open && (
        <div className="src-carousel">
          {sources.map((s, i) => (
            <button key={s.url} type="button" className="src-card" onClick={() => openExternal(s.url)}>
              <span className="src-card-title">{sourceTitle(s)}</span>
              <span className="src-card-foot">
                <span className="src-num">{i + 1}</span>
                <span className="truncate">{sourceDomain(s)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <ol className="src-list">
          {sources.map((s, i) => (
            <li key={s.url}>
              <button type="button" className="src-row" onClick={() => openExternal(s.url)}>
                <span className="src-num">{i + 1}</span>
                <span className="src-row-text">
                  <span className="src-row-title">{sourceTitle(s)}</span>
                  <span className="src-row-domain truncate">{sourceDomain(s)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
