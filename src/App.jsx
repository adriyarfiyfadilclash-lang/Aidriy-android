import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { useApp, popCloser } from './state';
import { isNative } from './lib/native';
import Drawer from './components/Drawer';
import Toast from './components/Toast';
import { LogoMark } from './components/Logo';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectEditPage from './pages/ProjectEditPage';
import LibraryPage from './pages/LibraryPage';
import CanvasPage from './pages/CanvasPage';
import PersonalizationPage from './pages/settings/PersonalizationPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/settings/ProfilePage';
import KeysPage from './pages/settings/KeysPage';
import CapabilitiesPage from './pages/settings/CapabilitiesPage';
import MemoryPage from './pages/settings/MemoryPage';
import MemorySummaryPage from './pages/settings/MemorySummaryPage';
import SavedMemoriesPage from './pages/settings/SavedMemoriesPage';
import VoicePage from './pages/settings/VoicePage';
import UsagePage from './pages/settings/UsagePage';
import PrivacyPage from './pages/settings/PrivacyPage';

function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { drawerOpen, setDrawerOpen } = useApp();
  useEffect(() => {
    if (!isNative) return undefined;
    const h = CapApp.addListener('backButton', () => {
      if (popCloser()) return;
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      if (location.pathname !== '/') {
        if (window.history.length > 1) navigate(-1);
        else navigate('/', { replace: true });
      } else {
        CapApp.minimizeApp().catch(() => CapApp.exitApp());
      }
    });
    return () => {
      h.then((x) => x.remove());
    };
  }, [navigate, location.pathname, drawerOpen, setDrawerOpen]);
  return null;
}

export default function App() {
  const { session } = useApp();

  if (session === undefined) {
    return (
      <div className="splash">
        <LogoMark size={56} />
      </div>
    );
  }
  if (!session) {
    return (
      <>
        <AuthPage />
        <Toast />
      </>
    );
  }

  return (
    <>
      <BackButton />
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/c/:id" element={<ChatPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<ProjectEditPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/canvas/:id" element={<CanvasPage />} />
        <Route path="/artifacts" element={<Navigate to="/library?filter=canvas" replace />} />
        <Route path="/artifacts/:id" element={<CanvasPage />} />
        <Route path="/settings/personalization" element={<PersonalizationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/profile" element={<ProfilePage />} />
        <Route path="/settings/keys" element={<KeysPage />} />
        <Route path="/settings/capabilities" element={<CapabilitiesPage />} />
        <Route path="/settings/memory" element={<MemoryPage />} />
        <Route path="/settings/memory/summary" element={<MemorySummaryPage />} />
        <Route path="/settings/memory/saved" element={<SavedMemoriesPage />} />
        <Route path="/settings/voice" element={<VoicePage />} />
        <Route path="/settings/usage" element={<UsagePage />} />
        <Route path="/settings/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<ChatPage />} />
      </Routes>
      <Drawer />
      <Toast />
    </>
  );
}
