import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../state';
import * as db from '../lib/db';
import { ConfirmDialog, Empty, Group, IconButton, Row, Sheet, TopBar, timeAgo } from '../components/ui';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { conversations, refreshConversations, refreshProjects, showToast } = useApp();
  const [project, setProject] = useState(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    db.getProject(id)
      .then((p) => {
        if (!p) navigate('/projects', { replace: true });
        else setProject(p);
      })
      .catch((e) => showToast(e.message, 'error'));
    refreshConversations();
  }, [id, navigate, showToast, refreshConversations]);

  const chats = useMemo(() => conversations.filter((c) => c.project_id === id), [conversations, id]);

  if (!project) {
    return (
      <div className="page">
        <TopBar back title="" />
        <div className="center-fill">
          <span className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar
        back
        title={<span className="truncate">{project.name}</span>}
        right={
          <IconButton label="Opsi proyek" onClick={() => setMenu(true)}>
            <MoreHorizontal size={24} />
          </IconButton>
        }
      />
      <main className="page-scroll">
        {project.description && <p className="project-desc">{project.description}</p>}
        {project.instructions && (
          <div className="card">
            <div className="label">Instruksi</div>
            <div className="card-text clamp-4 pre-wrap">{project.instructions}</div>
          </div>
        )}
        <button type="button" className="btn btn-dark btn-block" onClick={() => navigate(`/?project=${project.id}`)}>
          <Plus size={20} /> Chat baru di proyek ini
        </button>
        <div className="section-title">Chat ({chats.length})</div>
        {chats.length === 0 ? (
          <Empty title="Belum ada chat" text="Chat yang dimulai di proyek ini akan muncul di sini." />
        ) : (
          <Group>
            {chats.map((c) => (
              <Row key={c.id} icon={<MessageCircle size={20} strokeWidth={1.5} />} title={c.title} subtitle={timeAgo(c.updated_at)} onClick={() => navigate(`/c/${c.id}`)} />
            ))}
          </Group>
        )}
      </main>

      <Sheet open={menu} onClose={() => setMenu(false)} title={project.name}>
        <Group>
          <Row
            icon={<Pencil size={22} strokeWidth={1.6} />}
            title="Edit proyek"
            onClick={() => {
              setMenu(false);
              navigate(`/projects/${project.id}/edit`);
            }}
          />
          <Row
            icon={<Trash2 size={22} strokeWidth={1.6} />}
            title="Hapus proyek"
            danger
            onClick={() => {
              setMenu(false);
              setConfirm(true);
            }}
          />
        </Group>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Hapus proyek?"
        message="Proyek dihapus. Chat di dalamnya tetap ada di riwayat."
        onConfirm={async () => {
          try {
            await db.deleteProject(project.id);
            await refreshProjects();
            navigate('/projects', { replace: true });
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
    </div>
  );
}
