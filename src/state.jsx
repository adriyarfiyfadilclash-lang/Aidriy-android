import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { loadSettings, saveSettings } from './lib/settings';
import * as db from './lib/db';
import { applyStatusBar, setHapticsEnabled } from './lib/native';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// Tumpukan "penutup" untuk tombol kembali Android: sheet/dialog terbuka didaftarkan di sini.
const closers = [];
export function useBackClose(open, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const fn = () => ref.current();
    closers.push(fn);
    return () => {
      const i = closers.lastIndexOf(fn);
      if (i >= 0) closers.splice(i, 1);
    };
  }, [open]);
}
export function popCloser() {
  const fn = closers[closers.length - 1];
  if (!fn) return false;
  fn();
  return true;
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [settings, setSettingsState] = useState(loadSettings);
  const [conversations, setConversations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const uid = session?.user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);

  const showToast = useCallback((text, kind = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!uid) return;
    try {
      setConversations(await db.listConversations());
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [uid, showToast]);

  const refreshProjects = useCallback(async () => {
    if (!uid) return;
    try {
      setProjects(await db.listProjects());
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [uid, showToast]);

  const refreshProfile = useCallback(async () => {
    if (!uid) return;
    try {
      const p = await db.getProfile(uid);
      setProfile(p);
      // Personalisasi tersimpan di cloud agar sama di semua perangkat
      if (p?.settings?.personalization) {
        setSettingsState((prev) => {
          const next = { ...prev, personalization: p.settings.personalization };
          saveSettings(next);
          return next;
        });
      }
    } catch {
      /* jaringan */
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setConversations([]);
      setProjects([]);
      setProfile(null);
      return;
    }
    refreshProfile();
    refreshConversations();
    refreshProjects();
  }, [uid, refreshConversations, refreshProjects, refreshProfile]);

  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Tema & font
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.font = settings.font;
      document.documentElement.dataset.accent = settings.accent || 'terracotta';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1C1A17' : '#F7F4EE');
      applyStatusBar(dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.font, settings.accent]);

  useEffect(() => setHapticsEnabled(settings.haptics), [settings.haptics]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      uid,
      profile,
      setProfile,
      refreshProfile,
      settings,
      setSettings,
      conversations,
      setConversations,
      refreshConversations,
      projects,
      refreshProjects,
      drawerOpen,
      setDrawerOpen,
      toast,
      showToast,
    }),
    [session, uid, profile, refreshProfile, settings, setSettings, conversations, refreshConversations, projects, refreshProjects, drawerOpen, toast, showToast]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
