import { useState } from 'react';
import { Brain, Globe, Images, Lightbulb, Shapes, Sparkles } from 'lucide-react';
import { IMAGE_MODELS } from '../../lib/nvidiaTools';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../state';
import { EFFORTS } from '../../lib/providers';
import { tap } from '../../lib/native';
import { ChoiceDialog, Group, Row, Toggle, TopBar } from '../../components/ui';

export default function CapabilitiesPage() {
  const { settings, setSettings } = useApp();
  const navigate = useNavigate();
  const [pickImage, setPickImage] = useState(false);
  const imageModel = IMAGE_MODELS.find((m) => m.id === settings.imageModel) || IMAGE_MODELS[0];
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
            icon={<Images size={24} strokeWidth={1.5} />}
            title="Pencarian gambar"
            subtitle="Tampilkan foto nyata dari internet beserta sumbernya"
            right={<Toggle checked={settings.imageSearch !== false} onChange={(v) => setSettings({ imageSearch: v })} label="Pencarian gambar" />}
            onClick={() => setSettings({ imageSearch: settings.imageSearch === false })}
          />
          <Row
            icon={<Shapes size={24} strokeWidth={1.5} />}
            title="Canvas"
            subtitle="Hasil siap pakai (email, dokumen, kode, halaman web) dibuat terpisah, bisa disunting & disalin"
            right={<Toggle checked={settings.artifacts} onChange={(v) => setSettings({ artifacts: v })} label="Canvas" />}
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
        <Group>
          <Row
            icon={<Sparkles size={24} strokeWidth={1.5} />}
            title="Model pembuat gambar (NVIDIA)"
            subtitle={settings.keys.nvidia ? imageModel.label : `${imageModel.label} · butuh API key NVIDIA`}
            chevron
            onClick={() => {
              tap();
              setPickImage(true);
            }}
          />
        </Group>
      </main>
      <ChoiceDialog
        open={pickImage}
        onClose={() => setPickImage(false)}
        title="Model pembuat gambar"
        value={imageModel.id}
        options={IMAGE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
        onChange={(v) => setSettings({ imageModel: v })}
      />
    </div>
  );
}
