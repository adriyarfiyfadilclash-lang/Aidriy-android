import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { useApp } from '../state';
import * as db from '../lib/db';
import { ConfirmDialog, Group, IconButton, Row, Sheet, TopBar } from '../components/ui';
import ArtifactViewer from '../components/ArtifactViewer';

export default function ArtifactPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [art, setArt] = useState(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    db.getArtifact(id)
      .then((a) => {
        if (!a) navigate('/artifacts', { replace: true });
        else setArt(a);
      })
      .catch((e) => showToast(e.message, 'error'));
  }, [id, navigate, showToast]);

  return (
    <div className="page">
      <TopBar
        back
        title={<span className="truncate">{art?.title || ''}</span>}
        right={
          <IconButton label="Opsi" onClick={() => setMenu(true)}>
            <MoreHorizontal size={24} />
          </IconButton>
        }
      />
      {art ? (
        <ArtifactViewer artifact={art} inline onClose={() => navigate(-1)} />
      ) : (
        <div className="center-fill">
          <span className="spinner" />
        </div>
      )}
      <Sheet open={menu} onClose={() => setMenu(false)} title={art?.title}>
        <Group>
          {art?.conversation_id && (
            <Row
              icon={<MessageCircle size={22} strokeWidth={1.6} />}
              title="Buka chat asal"
              onClick={() => {
                setMenu(false);
                navigate(`/c/${art.conversation_id}`);
              }}
            />
          )}
          <Row
            icon={<Trash2 size={22} strokeWidth={1.6} />}
            title="Hapus artefak"
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
        title="Hapus artefak?"
        message="Artefak dihapus dari daftar. Pesan di chat asal tetap ada."
        onConfirm={async () => {
          try {
            await db.deleteArtifact(id);
            navigate('/artifacts', { replace: true });
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
    </div>
  );
}
