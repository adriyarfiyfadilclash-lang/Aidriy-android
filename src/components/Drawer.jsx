import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderClosed, LibraryBig, MessageCircle, Plus, Search, Star, X } from 'lucide-react';
import { useApp } from '../state';
import { searchChats } from '../lib/db';
import { tap } from '../lib/native';
import { IconButton } from './ui';

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function Drawer() {
  const { drawerOpen, setDrawerOpen, conversations, refreshConversations, profile, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const timer = useRef();

  useEffect(() => {
    if (drawerOpen) refreshConversations();
    else {
      setSearching(false);
      setQ('');
      setResults(null);
    }
  }, [drawerOpen, refreshConversations]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) {
      setResults(null);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      try {
        setResults(await searchChats(q.trim()));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const go = (path) => {
    tap();
    setDrawerOpen(false);
    if (location.pathname !== path) navigate(path);
  };

  const starred = useMemo(() => conversations.filter((c) => c.starred), [conversations]);
  const recent = useMemo(() => conversations.filter((c) => !c.starred), [conversations]);
  const activeId = location.pathname.startsWith('/c/') ? location.pathname.slice(3) : null;

  return (
    <div className={`drawer-root ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
      <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />
      <aside className="drawer">
        {searching ? (
          <div className="drawer-search">
            <IconButton label="Tutup pencarian" onClick={() => setSearching(false)}>
              <ArrowLeft size={22} strokeWidth={1.75} />
            </IconButton>
            <input className="drawer-search-input" placeholder="Cari chat…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {q && (
              <IconButton label="Hapus" onClick={() => setQ('')}>
                <X size={20} />
              </IconButton>
            )}
          </div>
        ) : (
          <div className="drawer-head">
            <span className="drawer-brand">A.I.DRIY</span>
            <IconButton label="Cari chat" onClick={() => setSearching(true)}>
              <Search size={26} strokeWidth={1.6} />
            </IconButton>
          </div>
        )}

        <div className="drawer-scroll">
          {searching ? (
            <div className="drawer-list">
              {results === null && <p className="muted pad">Ketik untuk mencari judul atau isi chat.</p>}
              {results?.length === 0 && <p className="muted pad">Tidak ada chat yang cocok.</p>}
              {results?.map((r) => (
                <button key={r.id} type="button" className="drawer-item chat" onClick={() => go(`/c/${r.id}`)}>
                  <MessageCircle size={20} strokeWidth={1.5} />
                  <span className="drawer-item-text">
                    <span className="truncate">{r.title}</span>
                    {r.snippet && <span className="drawer-snippet truncate">{r.snippet}</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <nav className="drawer-nav">
                <button type="button" className="drawer-item big" onClick={() => go('/projects')}>
                  <FolderClosed size={26} strokeWidth={1.5} />
                  <span>Proyek</span>
                </button>
                <button type="button" className="drawer-item big" onClick={() => go('/library')}>
                  <LibraryBig size={26} strokeWidth={1.5} />
                  <span>Pustaka</span>
                </button>
              </nav>
              <div className="drawer-divider" />
              {starred.length > 0 && (
                <>
                  <div className="drawer-section">Berbintang</div>
                  <div className="drawer-list">
                    {starred.map((c) => (
                      <button key={c.id} type="button" className={`drawer-item chat ${c.id === activeId ? 'active' : ''}`} onClick={() => go(`/c/${c.id}`)}>
                        <Star size={20} strokeWidth={1.5} />
                        <span className="truncate">{c.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="drawer-section">Terbaru</div>
              <div className="drawer-list">
                {recent.length === 0 && <p className="muted pad">Belum ada chat. Mulai sesi baru di bawah.</p>}
                {recent.map((c) => (
                  <button key={c.id} type="button" className={`drawer-item chat ${c.id === activeId ? 'active' : ''}`} onClick={() => go(`/c/${c.id}`)}>
                    <MessageCircle size={20} strokeWidth={1.5} />
                    <span className="truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="drawer-foot">
          <button type="button" className="avatar" onClick={() => go('/settings')} aria-label="Pengaturan">
            {initials(profile?.full_name || profile?.nickname, user?.email)}
          </button>
          <button
            type="button"
            className="new-chat-btn"
            onClick={() => {
              tap();
              setDrawerOpen(false);
              navigate('/', { state: { fresh: Date.now() } });
            }}
          >
            <Plus size={22} strokeWidth={2} />
            <span>Chat baru</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
