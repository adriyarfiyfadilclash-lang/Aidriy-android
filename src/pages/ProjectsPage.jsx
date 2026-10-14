import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderClosed, Plus } from 'lucide-react';
import { useApp } from '../state';
import { Empty, IconButton, TopBar, timeAgo } from '../components/ui';

export default function ProjectsPage() {
  const { projects, refreshProjects } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return (
    <div className="page">
      <TopBar
        title={<span className="serif-title">Proyek</span>}
        right={
          <IconButton label="Proyek baru" onClick={() => navigate('/projects/new')}>
            <Plus size={26} strokeWidth={1.6} />
          </IconButton>
        }
      />
      <main className="page-scroll">
        {projects.length === 0 ? (
          <Empty
            icon={<FolderClosed size={40} strokeWidth={1.4} />}
            title="Belum ada proyek"
            text="Proyek mengelompokkan chat dengan instruksi khusus, misalnya gaya menulis atau konteks pekerjaan."
            action={
              <button type="button" className="btn btn-dark" onClick={() => navigate('/projects/new')}>
                Buat proyek
              </button>
            }
          />
        ) : (
          <div className="cards">
            {projects.map((p) => (
              <button key={p.id} type="button" className="card card-btn" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="card-title">{p.name}</div>
                {p.description && <div className="card-text clamp-2">{p.description}</div>}
                <div className="card-meta">Diperbarui {timeAgo(p.updated_at)}</div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
