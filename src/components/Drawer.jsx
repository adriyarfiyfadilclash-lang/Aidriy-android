import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckSquare,
  FolderClosed,
  FolderPlus,
  LibraryBig,
  MessageCircle,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp, useBackClose } from '../state';
import * as db from '../lib/db';
import { tap } from '../lib/native';
import { ConfirmDialog, Group, IconButton, PromptDialog, Row, Sheet } from './ui';
import ProjectPicker from './ProjectPicker';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/** Tekan lama (500 ms) membuka menu; geser > 10 px membatalkan supaya gulir & swipe tetap normal. */
function useLongPress(onLong) {
  const st = useRef({});
  const clear = () => {
    clearTimeout(st.current.timer);
    st.current.timer = null;
  };
  return {
    fired: () => st.current.fired,
    handlers: {
      onPointerDown: (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        st.current = { x: e.clientX, y: e.clientY, fired: false };
        st.current.timer = setTimeout(() => {
          st.current.fired = true;
          st.current.timer = null;
          tap('medium');
          onLong();
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        if (!st.current.timer) return;
        if (Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > MOVE_TOLERANCE) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e) => {
        e.preventDefault();
        if (st.current.fired || st.current.timer) {
          // Sudah/akan ditangani timer (Android memicu contextmenu saat tekan lama).
          return;
        }
        st.current.fired = true;
        tap('medium');
        onLong();
      },
    },
  };
}

function ChatRow({ c, icon, active, selecting, selected, onOpen, onMenu, onToggle }) {
  const lp = useLongPress(() => (selecting ? onToggle(c) : onMenu(c)));
  return (
    <div className={`drawer-row ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}>
      <button
        type="button"
        className="drawer-item chat no-select"
        {...lp.handlers}
        onClick={(e) => {
          if (lp.fired()) {
            e.preventDefault();
            return;
          }
          if (selecting) onToggle(c);
          else onOpen(c);
        }}
        aria-pressed={selecting ? selected : undefined}
      >
        {selecting ? (
          <span className={`share-check ${selected ? 'on' : ''}`}>{selected && <Check size={15} strokeWidth={3} />}</span>
        ) : (
          icon
        )}
        <span className="truncate">{c.title}</span>
      </button>
      {!selecting && (
        <button type="button" className="drawer-more" aria-label={`Opsi untuk ${c.title}`} onClick={() => { tap(); onMenu(c); }}>
          <MoreVertical size={18} />
        </button>
      )}
    </div>
  );
}

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function Drawer() {
  const { drawerOpen, setDrawerOpen, conversations, refreshConversations, profile, user, showToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const timer = useRef();
  const [menuFor, setMenuFor] = useState(null); // percakapan yang menunya terbuka
  const [dialog, setDialog] = useState(null); // rename | project | delete | bulk-project | bulk-delete
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());

  useBackClose(selecting && drawerOpen && !dialog && !menuFor, () => {
    setSelecting(false);
    setPicked(new Set());
  });

  useEffect(() => {
    if (drawerOpen) refreshConversations();
    else {
      setSearching(false);
      setQ('');
      setResults(null);
      setSelecting(false);
      setPicked(new Set());
      setMenuFor(null);
      setDialog(null);
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
        setResults(await db.searchChats(q.trim()));
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

  const toggle = (c) => {
    tap();
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(c.id)) n.delete(c.id);
      else n.add(c.id);
      return n;
    });
  };
  const exitSelect = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const afterDelete = (ids) => {
    refreshConversations();
    if (activeId && ids.includes(activeId)) navigate('/', { replace: true, state: { fresh: Date.now() } });
  };
  const doDelete = async (ids) => {
    try {
      if (ids.length === 1) await db.deleteConversation(ids[0]);
      else await db.deleteConversations(ids);
      showToast(ids.length === 1 ? 'Chat dihapus' : `${ids.length} chat dihapus`);
      exitSelect();
      afterDelete(ids);
    } catch (e) {
      showToast(`Gagal menghapus: ${e.message}`, 'error');
    }
  };
  const doMove = async (ids, pid) => {
    try {
      await db.moveConversations(ids, pid);
      showToast(pid ? (ids.length === 1 ? 'Ditambahkan ke proyek' : `${ids.length} chat ditambahkan ke proyek`) : 'Dikeluarkan dari proyek');
      setDialog(null);
      setMenuFor(null);
      exitSelect();
      refreshConversations();
    } catch (e) {
      showToast(`Gagal memindahkan: ${e.message}`, 'error');
    }
  };
  const target = menuFor;
  const pickedIds = [...picked].filter((id) => conversations.some((c) => c.id === id));

  const starred = useMemo(() => conversations.filter((c) => c.starred), [conversations]);
  const recent = useMemo(() => conversations.filter((c) => !c.starred), [conversations]);
  const activeId = location.pathname.startsWith('/c/') ? location.pathname.slice(3) : null;
  const rowProps = {
    selecting,
    onOpen: (c) => go(`/c/${c.id}`),
    onMenu: (c) => setMenuFor(c),
    onToggle: toggle,
  };

  return (
    <div className={`drawer-root ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
      <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />
      <aside className="drawer">
        {selecting ? (
          <div className="drawer-search">
            <IconButton label="Batal memilih" onClick={exitSelect}>
              <X size={22} strokeWidth={1.75} />
            </IconButton>
            <span className="drawer-select-count">{pickedIds.length} dipilih</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => setPicked(pickedIds.length === conversations.length ? new Set() : new Set(conversations.map((c) => c.id)))}
            >
              {pickedIds.length === conversations.length ? 'Kosongkan' : 'Pilih semua'}
            </button>
          </div>
        ) : searching ? (
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
          {searching && !selecting ? (
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
              {!selecting && (
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
              )}
              {!selecting && <div className="drawer-divider" />}
              {starred.length > 0 && (
                <>
                  <div className="drawer-section">Tersimpan</div>
                  <div className="drawer-list">
                    {starred.map((c) => (
                      <ChatRow key={c.id} c={c} icon={<Bookmark size={20} strokeWidth={1.5} />} active={c.id === activeId} selected={picked.has(c.id)} {...rowProps} />
                    ))}
                  </div>
                </>
              )}
              <div className="drawer-section">Terbaru</div>
              <div className="drawer-list">
                {recent.length === 0 && <p className="muted pad">Belum ada chat. Mulai sesi baru di bawah.</p>}
                {recent.map((c) => (
                  <ChatRow key={c.id} c={c} icon={<MessageCircle size={20} strokeWidth={1.5} />} active={c.id === activeId} selected={picked.has(c.id)} {...rowProps} />
                ))}
              </div>
            </>
          )}
        </div>

        {selecting ? (
          <div className="drawer-foot drawer-bulk">
            <button type="button" className="btn btn-ghost" disabled={!pickedIds.length} onClick={() => setDialog('bulk-project')}>
              <FolderPlus size={20} /> Tambah ke proyek
            </button>
            <button type="button" className="btn btn-danger" disabled={!pickedIds.length} onClick={() => setDialog('bulk-delete')}>
              <Trash2 size={20} /> Hapus
            </button>
          </div>
        ) : (
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
        )}
      </aside>

      {createPortal(
        <>
          <Sheet open={!!target && !dialog} onClose={() => setMenuFor(null)} title={target?.title || 'Chat'}>
            <Group>
              <Row
                icon={<CheckSquare size={22} strokeWidth={1.6} />}
                title="Pilih"
                onClick={() => {
                  tap();
                  setPicked(new Set([target.id]));
                  setSelecting(true);
                  setSearching(false);
                  setMenuFor(null);
                }}
              />
              <Row icon={<Pencil size={22} strokeWidth={1.6} />} title="Ganti nama" onClick={() => setDialog('rename')} />
              <Row icon={<FolderPlus size={22} strokeWidth={1.6} />} title="Tambah ke proyek" onClick={() => setDialog('project')} />
            </Group>
            <Group>
              <Row icon={<Trash2 size={22} strokeWidth={1.6} />} title="Hapus" danger onClick={() => setDialog('delete')} />
            </Group>
          </Sheet>
          <PromptDialog
            open={dialog === 'rename'}
            onClose={() => {
              setDialog(null);
              setMenuFor(null);
            }}
            title="Ganti nama chat"
            initial={target?.title}
            onSubmit={async (v) => {
              const name = v.trim();
              if (!name || !target) return;
              try {
                await db.updateConversation(target.id, { title: name });
                refreshConversations();
                showToast('Nama chat diganti');
              } catch (e) {
                showToast(`Gagal mengganti nama: ${e.message}`, 'error');
              }
            }}
          />
          <ProjectPicker
            open={dialog === 'project' || dialog === 'bulk-project'}
            onClose={() => {
              setDialog(null);
              setMenuFor(null);
            }}
            currentId={dialog === 'project' ? target?.project_id || null : undefined}
            allowNone={dialog === 'project'}
            onPick={(pid) => doMove(dialog === 'project' ? [target.id] : pickedIds, pid)}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            onClose={() => {
              setDialog(null);
              setMenuFor(null);
            }}
            title="Hapus chat ini?"
            message={`"${target?.title || ''}" dan semua pesannya akan dihapus permanen.`}
            confirmLabel="Hapus"
            onConfirm={() => doDelete([target.id])}
          />
          <ConfirmDialog
            open={dialog === 'bulk-delete'}
            onClose={() => setDialog(null)}
            title={`Hapus ${pickedIds.length} chat?`}
            message="Chat yang dipilih dan semua pesannya akan dihapus permanen."
            confirmLabel="Hapus"
            onConfirm={() => doDelete(pickedIds)}
          />
        </>,
        document.body
      )}
    </div>
  );
}
