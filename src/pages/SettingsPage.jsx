import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AudioLines,
  Brain,
  ChartLine,
  ChevronRight,
  Info,
  KeyRound,
  LogOut,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Type,
  Upload,
  UserRound,
  Vibrate,
} from 'lucide-react';
import { useApp, useBackClose } from '../state';
import { supabase } from '../lib/supabase';
import { shareText } from '../lib/native';
import { ChoiceDialog, ConfirmDialog, Group, IconButton, Row, Toggle, TopBar } from '../components/ui';
import { LogoMark } from '../components/Logo';

const THEME_LABEL = { system: 'Sistem', light: 'Terang', dark: 'Gelap' };
const FONT_LABEL = { default: 'Bawaan', system: 'Sistem' };
export const APP_VERSION = '1.0.0';
export const RELEASES_URL = 'https://github.com/adriyarfiyfadilclash-lang/Aidriy-android/releases/latest';

function AboutDialog({ open, onClose }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <div className="dialog center" onClick={(e) => e.stopPropagation()}>
        <LogoMark size={48} />
        <div className="dialog-title">A.I.DRIY</div>
        <p className="dialog-message">
          Versi {APP_VERSION}. Asisten AI pribadi dengan chat, proyek, artefak, memori, dan suara. API key tersimpan hanya di HP ini.
        </p>
        <button type="button" className="btn btn-dark" onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, settings, setSettings, showToast } = useApp();
  const [dialog, setDialog] = useState(null);

  const keyCount = Object.values(settings.keys).filter(Boolean).length;
  const capCount = [settings.webSearch, settings.artifacts, settings.memory, settings.effort !== 'off'].filter(Boolean).length;

  return (
    <div className="page settings-page">
      <TopBar
        title={<span className="serif-title">Pengaturan</span>}
        right={
          <IconButton label="Tentang" onClick={() => setDialog('about')}>
            <Info size={26} strokeWidth={1.6} />
          </IconButton>
        }
      />
      <main className="page-scroll">
        <button type="button" className="account-card" onClick={() => navigate('/settings/profile')}>
          <span className="account-text">
            <span className="account-email truncate">{user?.email}</span>
            {profile?.full_name && <span className="account-name truncate">{profile.full_name}</span>}
          </span>
          <ChevronRight size={22} className="muted" />
        </button>

        {keyCount === 0 && (
          <div className="promo-card">
            <div className="promo-title">Hubungkan otak AI-nya</div>
            <p>Tambahkan API key Anthropic, Gemini, OpenAI, atau OpenRouter supaya A.I.DRIY bisa menjawab.</p>
            <button type="button" className="btn btn-dark" onClick={() => navigate('/settings/keys')}>
              Tambah API key
            </button>
          </div>
        )}

        <Group>
          <Row icon={<UserRound size={24} strokeWidth={1.5} />} title="Profil" onClick={() => navigate('/settings/profile')} />
          <Row
            icon={<KeyRound size={24} strokeWidth={1.5} />}
            title="Kunci API"
            subtitle={keyCount ? `${keyCount} tersambung` : 'Belum ada'}
            onClick={() => navigate('/settings/keys')}
          />
          <Row icon={<ChartLine size={24} strokeWidth={1.5} />} title="Penggunaan" onClick={() => navigate('/settings/usage')} />
        </Group>

        <Group>
          <Row
            icon={<SlidersHorizontal size={24} strokeWidth={1.5} />}
            title="Kemampuan"
            subtitle={`${capCount} diaktifkan`}
            onClick={() => navigate('/settings/capabilities')}
          />
          <Row
            icon={<Brain size={24} strokeWidth={1.5} />}
            title="Memori"
            subtitle={settings.memory ? 'Aktif' : 'Nonaktif'}
            onClick={() => navigate('/settings/memory')}
          />
        </Group>

        <Group>
          <Row
            icon={<Moon size={24} strokeWidth={1.5} />}
            title="Mode warna"
            subtitle={THEME_LABEL[settings.theme]}
            onClick={() => setDialog('theme')}
          />
          <Row icon={<Type size={24} strokeWidth={1.5} />} title="Gaya font" subtitle={FONT_LABEL[settings.font]} onClick={() => setDialog('font')} />
          <Row icon={<AudioLines size={24} strokeWidth={1.5} />} title="Suara" onClick={() => navigate('/settings/voice')} />
        </Group>

        <Group>
          <Row
            icon={<Vibrate size={24} strokeWidth={1.5} />}
            title="Umpan balik haptik"
            right={<Toggle checked={settings.haptics} onChange={(v) => setSettings({ haptics: v })} label="Umpan balik haptik" />}
            onClick={() => setSettings({ haptics: !settings.haptics })}
          />
          <Row icon={<ShieldCheck size={24} strokeWidth={1.5} />} title="Privasi" onClick={() => navigate('/settings/privacy')} />
          <Row
            icon={<Upload size={24} strokeWidth={1.5} />}
            title="Berbagi"
            onClick={async () => {
              try {
                await shareText('A.I.DRIY', 'Coba A.I.DRIY, asisten AI pribadi di Android:', RELEASES_URL);
              } catch (e) {
                if (!/cancel/i.test(e.message || '')) showToast(e.message, 'error');
              }
            }}
          />
        </Group>

        <Group>
          <Row icon={<LogOut size={24} strokeWidth={1.5} />} title="Keluar" danger onClick={() => setDialog('logout')} />
        </Group>
        <p className="version">A.I.DRIY {APP_VERSION}</p>
      </main>

      <ChoiceDialog
        open={dialog === 'theme'}
        onClose={() => setDialog(null)}
        title="Mode warna"
        value={settings.theme}
        onChange={(v) => setSettings({ theme: v })}
        options={[
          { value: 'system', label: 'Sistem', icon: <Smartphone size={24} strokeWidth={1.5} /> },
          { value: 'light', label: 'Terang', icon: <Sun size={24} strokeWidth={1.5} /> },
          { value: 'dark', label: 'Gelap', icon: <Moon size={24} strokeWidth={1.5} /> },
        ]}
      />
      <ChoiceDialog
        open={dialog === 'font'}
        onClose={() => setDialog(null)}
        title="Gaya font"
        value={settings.font}
        onChange={(v) => setSettings({ font: v })}
        options={[
          { value: 'default', label: 'Bawaan', icon: <span className="font-sample serif">Aa</span> },
          { value: 'system', label: 'Sistem', icon: <Smartphone size={24} strokeWidth={1.5} /> },
        ]}
      />
      <ConfirmDialog
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title="Keluar dari akun?"
        message="Chat tetap tersimpan di akunmu. API key di HP ini tidak dihapus."
        confirmLabel="Keluar"
        onConfirm={async () => {
          await supabase.auth.signOut();
          navigate('/', { replace: true });
        }}
      />
      <AboutDialog open={dialog === 'about'} onClose={() => setDialog(null)} />
    </div>
  );
}
