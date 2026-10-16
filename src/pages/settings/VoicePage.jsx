import { useState } from 'react';
import { Cpu, Languages, Mic, Repeat, Volume2 } from 'lucide-react';
import { useApp } from '../../state';
import { tap } from '../../lib/native';
import { listVoices } from '../../lib/nvidiaTools';
import { NVIDIA_VOICE_DEFAULT, nvidiaVoiceFor, speakText } from '../../lib/voice';
import { ChoiceDialog, Group, Row, Toggle, TopBar } from '../../components/ui';

const VOICE_LANG_LABEL = { 'ms-MY': 'Melayu', 'en-US': 'Inggris (US)', 'ar-SA': 'Arab', 'ja-JP': 'Jepang', 'ko-KR': 'Korea', 'zh-CN': 'Mandarin', 'hi-IN': 'Hindi', 'es-ES': 'Spanyol', 'es-US': 'Spanyol (US)', 'fr-FR': 'Prancis', 'de-DE': 'Jerman', 'it-IT': 'Italia', 'pt-BR': 'Portugis', 'ru-RU': 'Rusia', 'tr-TR': 'Turki', 'vi-VN': 'Vietnam', 'nl-NL': 'Belanda' };

function voiceLabel(name) {
  // Magpie-Multilingual.EN-US.Aria.Calm / Chatterbox-Multilingual.ms-MY.Male
  const [engine, lang, ...rest] = name.split('.');
  const l = VOICE_LANG_LABEL[lang] || VOICE_LANG_LABEL[`${lang.slice(0, 2).toLowerCase()}-${lang.slice(3).toUpperCase()}`] || lang;
  return `${l} · ${rest.join(' ') || 'Default'} (${engine.startsWith('Magpie') ? 'Magpie' : 'Chatterbox'})`;
}

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
  const hasNvidia = !!settings.keys.nvidia;
  const engine = v.engine === 'nvidia' && hasNvidia ? 'nvidia' : 'device';
  const [voices, setVoices] = useState(null);
  const [pickVoice, setPickVoice] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const current = nvidiaVoiceFor(v);

  const openVoices = async () => {
    tap();
    if (voices) {
      setPickVoice(true);
      return;
    }
    setLoadingVoices(true);
    try {
      const [mag, chat] = await Promise.all([listVoices(settings.keys.nvidia, 'magpie'), listVoices(settings.keys.nvidia, 'chatterbox')]);
      // Satu baris per suara utama (tanpa variasi emosi) supaya daftar tidak terlalu panjang.
      const base = (list, eng) =>
        list
          .filter((x) => x.name.split('.').length <= 3)
          .map((x) => ({ engine: eng, voice: x.name, language: x.name.split('.')[1].replace(/^([A-Z]{2})-([A-Z]{2})$/, (_, a, b) => `${a.toLowerCase()}-${b}`) }));
      setVoices([...base(chat, 'chatterbox'), ...base(mag, 'magpie')]);
      setPickVoice(true);
    } catch (e) {
      showToast(`Gagal memuat suara NVIDIA: ${e.message}`, 'error');
    } finally {
      setLoadingVoices(false);
    }
  };

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

        <div className="section-title">
          <Cpu size={16} /> Mesin suara
        </div>
        <div className="segmented">
          <button
            type="button"
            className={engine === 'device' ? 'on' : ''}
            onClick={() => {
              tap();
              setVoice({ engine: 'device' });
            }}
          >
            Bawaan HP
          </button>
          <button
            type="button"
            className={engine === 'nvidia' ? 'on' : ''}
            onClick={() => {
              tap();
              if (!hasNvidia) {
                showToast('Tambahkan API key NVIDIA dulu di Kunci API', 'error');
                return;
              }
              setVoice({ engine: 'nvidia' });
            }}
          >
            NVIDIA
          </button>
        </div>
        <p className="muted small intro">
          {engine === 'nvidia'
            ? 'Dikte memakai NVIDIA Whisper (rekaman dikirim lewat relay A.I.DRIY ke NVIDIA, tidak disimpan). Suara bacaan memakai NVIDIA. NVIDIA belum punya suara Bahasa Indonesia; bawaan untuk Indonesia adalah suara Melayu yang pelafalannya paling mirip.'
            : 'Dikte dan suara bacaan memakai layanan suara di HP. Tidak perlu internet untuk sebagian HP.'}
        </p>

        <Group>
          {engine === 'nvidia' && (
            <Row
              icon={<Mic size={24} strokeWidth={1.5} />}
              title="Suara NVIDIA"
              subtitle={loadingVoices ? 'Memuat daftar suara…' : voiceLabel(current.voice) + (v.nvidiaVoice ? '' : ' · otomatis')}
              chevron
              onClick={openVoices}
            />
          )}
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
                await speakText(v.lang.startsWith('en') ? 'Hi, I am A.I.DRIY, your personal assistant.' : 'Halo, saya A.I.DRIY, asisten pribadimu.', settings);
              } catch (e) {
                showToast(e.message, 'error');
              }
            }}
          />
        </Group>
      </main>
      <ChoiceDialog
        open={pickVoice}
        onClose={() => setPickVoice(false)}
        title="Suara NVIDIA"
        value={v.nvidiaVoice?.voice || '__auto'}
        options={[{ value: '__auto', label: `Otomatis sesuai bahasa (${voiceLabel((NVIDIA_VOICE_DEFAULT[v.lang] || NVIDIA_VOICE_DEFAULT['en-US']).voice)})` }].concat(
          (voices || []).map((x) => ({ value: x.voice, label: voiceLabel(x.voice) }))
        )}
        onChange={(val) => setVoice({ nvidiaVoice: val === '__auto' ? null : (voices || []).find((x) => x.voice === val) || null })}
      />
    </div>
  );
}
