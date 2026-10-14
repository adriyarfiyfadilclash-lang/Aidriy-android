import { useNavigate, useParams } from 'react-router-dom';
import CanvasView from '../components/CanvasView';

// Canvas yang dibuka dari Pustaka sebagai halaman penuh.
export default function CanvasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="page">
      <CanvasView
        canvasId={id}
        onClose={() => (window.history.length > 1 ? navigate(-1) : navigate('/library?filter=canvas'))}
        onOpenConversation={(cid) => navigate(`/c/${cid}`)}
      />
    </div>
  );
}
