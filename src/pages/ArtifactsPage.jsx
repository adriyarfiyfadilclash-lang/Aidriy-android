import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2, FileText, Globe, Image as ImageIcon, Shapes } from 'lucide-react';
import { useApp } from '../state';
import * as db from '../lib/db';
import { Empty, TopBar, timeAgo } from '../components/ui';

const ICON = { html: Globe, svg: ImageIcon, markdown: FileText, code: Code2 };

export default function ArtifactsPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [items, setItems] = useState(null);

  useEffect(() => {
    db.listArtifacts()
      .then(setItems)
      .catch((e) => {
        showToast(e.message, 'error');
        setItems([]);
      });
  }, [showToast]);

  return (
    <div className="page">
      <TopBar title={<span className="serif-title">Artefak</span>} />
      <main className="page-scroll">
        {items === null && (
          <div className="center-fill">
            <span className="spinner" />
          </div>
        )}
        {items?.length === 0 && (
          <Empty
            icon={<Shapes size={40} strokeWidth={1.4} />}
            title="Belum ada artefak"
            text="Minta A.I.DRIY membuat halaman web, game, diagram, atau dokumen. Hasilnya tersimpan di sini."
          />
        )}
        {items?.length > 0 && (
          <div className="cards">
            {items.map((a) => {
              const Icon = ICON[a.kind] || Code2;
              return (
                <button key={a.id} type="button" className="card card-btn card-row" onClick={() => navigate(`/artifacts/${a.id}`)}>
                  <span className="artifact-card-icon">
                    <Icon size={22} />
                  </span>
                  <span className="card-col">
                    <span className="card-title truncate">{a.title}</span>
                    <span className="card-meta">
                      {a.kind === 'code' ? a.language : a.kind.toUpperCase()} · {timeAgo(a.updated_at)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
