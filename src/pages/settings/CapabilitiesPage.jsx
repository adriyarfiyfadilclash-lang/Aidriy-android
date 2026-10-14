import { Brain, Globe, Lightbulb, Shapes } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../state';
import { EFFORTS } from '../../lib/providers';
import { tap } from '../../lib/native';
import { Group, Row, Toggle, TopBar } from '../../components/ui';

export default function CapabilitiesPage() {
  const { settings, setSettings } = useApp();
  const navigate = useNavigate();
  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Kemampuan</span>} />
      <main className="page-scroll">
        <Group>
          <Row
            icon={<Globe size={24} strokeWidth={1.5} />}
            title="Pencarian web"
            subtitle="Bawaan untuk chat baru. Bisa diubah per chat lewat tombol +"
            right={<Toggle checked={settings.webSearch} onChange={(v) => setSettings({ webSearch: v })} label="Pencarian web" />}
            onClick={() => setSettings({ webSearch: !settings.webSearch })}
          />
          <Row
            icon={<Shapes size={24} strokeWidth={1.5} />}
            title="Artefak"
            subtitle="AI membuat halaman, game, diagram, dan dokumen yang bisa dibuka & disimpan"
            right={<Toggle checked={settings.artifacts} onChange={(v) => setSettings({ artifacts: v })} label="Artefak" />}
            onClick={() => setSettings({ artifacts: !settings.artifacts })}
          />
          <Row
            icon={<Brain size={24} strokeWidth={1.5} />}
            title="Memori"
            subtitle="AI mengingat fakta penting tentangmu antar chat"
            right={<Toggle checked={settings.memory} onChange={(v) => setSettings({ memory: v })} label="Memori" />}
            onClick={() => navigate('/settings/memory')}
          />
        </Group>

        <div className="section-title">
          <Lightbulb size={16} /> Tingkat berpikir bawaan
        </div>
        <div className="segmented">
          {EFFORTS.map((e) => (
            <button
              key={e.id}
              type="button"
              className={settings.effort === e.id ? 'on' : ''}
              onClick={() => {
                tap();
                setSettings({ effort: e.id });
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p className="muted small pad-x">
          "Sedang" dan "Tinggi" membuat AI berpikir dulu sebelum menjawab: lebih teliti tetapi lebih lambat dan lebih mahal. Jika model tidak mendukung, A.I.DRIY otomatis menjawab tanpa mode berpikir.
        </p>
      </main>
    </div>
  );
}
