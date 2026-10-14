import { Languages, Repeat, Volume2 } from 'lucide-react';
import { useApp } from '../../state';
import { speak, tap } from '../../lib/native';
import { Group, Row, Toggle, TopBar } from '../../components/ui';

const LANGS = [
  { id: 'id-ID', label: 'Bahasa Indonesia' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'jv-ID', label: 'Basa Jawa' },
  { id: 'ms-MY', label: 'Bahasa Melayu' },
];
const RATES = [
  { v: 0.8, label: 'Lambat' },
  { v: 1, label: 'Normal' },
  { v: 1.2, label: 'Cepat' },
];

export default function VoicePage() {
  const { settings, setSettings, showToast } = useApp();
  const v = settings.voice;
  const setVoice = (patch) => setSettings((s) => ({ ...s, voice: { ...s.voice, ...patch } }));

  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Suara</span>} />
      <main className="page-scroll">
        <div className="section-title">
          <Languages size={16} /> Bahasa dikte & suara
        </div>
        <div className="segmented wrap">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={v.lang === l.id ? 'on' : ''}
              onClick={() => {
                tap();
                setVoice({ lang: l.id });
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="section-title">
          <Volume2 size={16} /> Kecepatan bicara
        </div>
        <div className="segmented">
          {RATES.map((r) => (
            <button
              key={r.v}
              type="button"
              className={v.rate === r.v ? 'on' : ''}
              onClick={() => {
                tap();
                setVoice({ rate: r.v });
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Group>
          <Row
            icon={<Repeat size={24} strokeWidth={1.5} />}
            title="Dengar lagi otomatis"
            subtitle="Di mode suara, mikrofon menyala lagi setelah AI selesai bicara"
            right={<Toggle checked={v.autoListen} onChange={(x) => setVoice({ autoListen: x })} label="Dengar lagi otomatis" />}
            onClick={() => setVoice({ autoListen: !v.autoListen })}
          />
          <Row
            icon={<Volume2 size={24} strokeWidth={1.5} />}
            title="Tes suara"
            subtitle="Dengarkan contoh suara A.I.DRIY"
            onClick={async () => {
              try {
                await speak(v.lang.startsWith('en') ? 'Hi, I am A.I.DRIY, your personal assistant.' : 'Halo, saya A.I.DRIY, asisten pribadimu.', v);
              } catch (e) {
                showToast(e.message, 'error');
              }
            }}
          />
        </Group>
      </main>
    </div>
  );
}
