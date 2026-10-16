import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Code2,
  ExternalLink,
  File as FileIcon,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Search,
  ScanText,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp, useBackClose } from '../state';
import * as lib from '../lib/library';
import * as canvasDb from '../lib/canvas';
import { formatSize } from '../lib/files';
import { openExternal, shareBlob, shareFile, tap } from '../lib/native';
import { ChoiceDialog, ConfirmDialog, Group, IconButton, PromptDialog, Row, Sheet, TopBar, timeAgo } from '../components/ui';
import { indexLibraryItem, searchLibraryByMeaning, semanticReady } from '../lib/semantic';
import { isPdf, isTextLike } from '../lib/docText';

const INDEX_LABEL = { indexed: 'Isi terindeks', empty: 'Tidak ada teks terbaca', unsupported: '' };

function ItemIcon({ it }) {
  if (it.source === 'file' && it.item_type === 'image' && it.thumb) return <img className="lib-thumb" src={it.thumb} alt="" loading="lazy" />;
  let Icon = FileIcon;
  if (it.source === 'canvas') Icon = it.kind === 'code' || it.kind === 'html' || it.kind === 'svg' ? Code2 : FileText;
  else if (it.item_type === 'image') Icon = ImageIcon;
  else if (it.item_type === 'document') Icon = FileText;
  return (
    <span className={`lib-icon t-${it.source === 'canvas' ? 'canvas' : it.item_type}`}>
      <Icon size={22} strokeWidth={1.6} />
    </span>
  );
}

function subtitle(it, indexing) {
  const parts = [];
  if (indexing) return indexing;
  if (it.source === 'canvas') {
    parts.push(`Canvas · ${canvasDb.KIND_LABEL[it.kind] || 'Dokumen'}`);
    parts.push(`Rev ${it.revision}`);
  } else {
    parts.push(it.extension ? it.extension.toUpperCase() : lib.TYPE_LABEL[it.item_type]);
    if (it.size_bytes) parts.push(formatSize(it.size_bytes));
  }
  parts.push(timeAgo(it.updated_at || it.created_at));
  if (it.source === 'file' && INDEX_LABEL[it.index_status]) parts.push(INDEX_LABEL[it.index_status]);
  return parts.join(' · ');
}

const TEXT_PREVIEW = /^(text\/|application\/json)|\.(txt|md|markdown|csv|tsv|json|log|xml|yaml|yml)$/i;

function FileViewer({ item, onClose }) {
  const [state, setState] = useState({ loading: true });
  useBackClose(true, onClose);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (item.item_type === 'image') {
          const url = await lib.signedUrl(item);
          if (alive) setState({ url });
        } else {
          const blob = await lib.downloadBlob(item);
          const text = await blob.text();
          if (alive) setState({ text: text.length > 200000 ? `${text.slice(0, 200000)}\n…[dipotong untuk pratinjau]` : text });
        }
      } catch (e) {
        if (alive) setState({ error: e.message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [item]);

  return (
    <div className="lib-viewer">
      <header className="canvas-head">
        <IconButton label="Tutup" onClick={onClose}>
          <X size={24} />
        </IconButton>
        <div className="canvas-title-wrap">
          <div className="canvas-title truncate">{item.title}</div>
          <div className="canvas-sub">{subtitle(item)}</div>
        </div>
      </header>
      <div className="lib-viewer-body">
        {state.loading && !state.url && !state.text && !state.error && <span className="spinner" />}
        {state.error && <p className="error-box">{state.error}</p>}
        {state.url && <img src={state.url} alt={item.title} className="lib-viewer-img" onError={() => setState({ error: 'Gambar tidak dapat dimuat' })} />}
        {state.text !== undefined && <pre className="lib-viewer-text">{state.text}</pre>}
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { uid, showToast, settings } = useApp();
  const meaningOn = semanticReady(settings);
  const [indexing, setIndexing] = useState({}); // id -> teks status
  const [meaning, setMeaning] = useState(null); // null | 'loading' | [] | pesan error
  const [items, setItems] = useState(null);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const filter = params.get('filter') || 'all';
  const [sort, setSort] = useState(() => localStorage.getItem('aidriy.library.sort') || 'created');
  const [sortOpen, setSortOpen] = useState(false);
  const [active, setActive] = useState(null); // item untuk menu aksi
  const [dialog, setDialog] = useState(null); // rename | delete | attach
  const [viewer, setViewer] = useState(null);
  const [upload, setUpload] = useState(null); // { done, total, current, errors[] }
  const inputRef = useRef();

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setItems(await lib.loadLibrary());
      setOffline(false);
    } catch (e) {
      const cached = lib.cachedLibrary();
      if (cached) {
        setItems(cached.items);
        setOffline(true);
      } else {
        setItems([]);
        setLoadError(e.message);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Pencarian berdasarkan makna di isi berkas & Canvas
  useEffect(() => {
    const term = debounced.trim();
    if (!meaningOn || term.length < 3) {
      setMeaning(null);
      return undefined;
    }
    const ctl = new AbortController();
    setMeaning('loading');
    const t = setTimeout(async () => {
      try {
        const r = await searchLibraryByMeaning(settings.keys.nvidia, term, { signal: ctl.signal });
        if (!ctl.signal.aborted) setMeaning(r);
      } catch (e) {
        if (e.name !== 'AbortError') setMeaning(e.message || 'Pencarian makna gagal');
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, meaningOn]);

  // Baca isi berkas (PDF lewat Nemotron Parse bila perlu) lalu indeks untuk pencarian & jawaban.
  const indexItem = useCallback(
    async (it, data) => {
      if (!meaningOn) return;
      const setStatus = (txt) => setIndexing((m) => ({ ...m, [it.id]: txt }));
      setStatus('Membaca isi…');
      try {
        const r = await indexLibraryItem(settings.keys.nvidia, it, {
          data,
          onProgress: (p) => setStatus(p.mode === 'parse' ? `NVIDIA Parse membaca halaman ${p.page}/${p.pages}…` : `Membaca halaman ${p.page}/${p.pages}…`),
        });
        setItems((prev) => prev?.map((x) => (x.id === it.id ? { ...x, index_status: r.status } : x)));
        return r;
      } catch (e) {
        showToast(`"${it.title}" gagal diindeks: ${e.message}`, 'error');
        return null;
      } finally {
        setIndexing((m) => {
          const n = { ...m };
          delete n[it.id];
          return n;
        });
      }
    },
    [meaningOn, settings.keys.nvidia, showToast]
  );

  const visible = useMemo(() => (items ? lib.filterSort(items, { filter, query: debounced, sort }) : []), [items, filter, debounced, sort]);
  const counts = useMemo(() => {
    const c = { all: 0, document: 0, image: 0, file: 0, canvas: 0, favorite: 0 };
    for (const it of items || []) {
      c.all += 1;
      if (it.source === 'canvas') c.canvas += 1;
      else c[it.item_type] += 1;
      if (it.is_favorite) c.favorite += 1;
    }
    return c;
  }, [items]);

  // ---------- Impor ----------
  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const errors = [];
    let added = 0;
    let dup = 0;
    setUpload({ done: 0, total: files.length, current: files[0].name, errors });
    const toIndex = [];
    for (let i = 0; i < files.length; i++) {
      setUpload({ done: i, total: files.length, current: files[i].name, errors: [...errors] });
      try {
        const { duplicate, item } = await lib.importFile(uid, files[i]);
        if (duplicate) dup += 1;
        else {
          added += 1;
          if (meaningOn && item && (isPdf(item.title, item.mime_type) || isTextLike(item.title, item.mime_type))) toIndex.push({ item, file: files[i] });
        }
      } catch (err) {
        errors.push(err.message || `${files[i].name} gagal diimpor`);
      }
    }
    setUpload({ done: files.length, total: files.length, current: '', errors });
    await load();
    const msg = [added && `${added} berkas ditambahkan`, dup && `${dup} sudah ada (tidak diduplikasi)`, errors.length && `${errors.length} gagal`].filter(Boolean).join(' · ');
    showToast(msg || 'Tidak ada berkas yang diimpor', errors.length ? 'error' : 'info');
    if (!errors.length) setTimeout(() => setUpload(null), 1500);
    // Indeks isi di latar belakang, satu per satu.
    for (const { item, file } of toIndex) {
      const data = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => resolve('');
        r.readAsDataURL(file);
      });
      await indexItem({ ...item, source: 'file' }, data || undefined);
    }
  };

  // ---------- Aksi ----------
  const openItem = async (it) => {
    tap();
    if (it.source === 'canvas') return navigate(`/canvas/${it.id}`);
    if (it.item_type === 'image' || TEXT_PREVIEW.test(it.mime_type || '') || TEXT_PREVIEW.test(it.title)) return setViewer(it);
    try {
      await openExternal(await lib.signedUrl(it));
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const toggleFav = async (it) => {
    setActive(null);
    try {
      await lib.setFavorite(it, !it.is_favorite);
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_favorite: !it.is_favorite } : x)));
    } catch (e) {
      showToast(`Gagal mengubah Favorit: ${e.message}`, 'error');
    }
  };

  const share = async (it) => {
    setActive(null);
    try {
      if (it.source === 'canvas') {
        const c = await canvasDb.getCanvas(it.id);
        if (!c) throw new Error('Canvas tidak ditemukan');
        await shareFile(canvasDb.canvasFilename(c), c.content);
      } else {
        showToast('Menyiapkan berkas…');
        await shareBlob(it.title, await lib.downloadBlob(it));
      }
    } catch (e) {
      if (!/cancel/i.test(e.message || '')) showToast(e.message, 'error');
    }
  };

  const setFilter = (id) => {
    tap();
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('filter');
    else next.set('filter', id);
    setParams(next, { replace: true });
  };

  const emptyText = {
    all: 'Unggah dokumen, gambar, atau berkas lain dengan tombol +. Canvas yang dibuat AI juga otomatis muncul di sini.',
    document: 'Belum ada dokumen. Unggah PDF, Word, teks, atau spreadsheet dengan tombol +.',
    image: 'Belum ada gambar. Unggah foto dari galeri dengan tombol +.',
    file: 'Belum ada berkas lain (kode, arsip, dan sebagainya).',
    canvas: 'Belum ada Canvas. Minta A.I.DRIY membuat email, dokumen, atau kode di chat.',
    favorite: 'Tandai item sebagai Favorit lewat menu ⋮ agar mudah ditemukan.',
  }[filter];

  return (
    <div className="page">
      <TopBar
        title={<span className="serif-title">Pustaka</span>}
        right={
          <IconButton label="Unggah berkas" onClick={() => inputRef.current?.click()}>
            <Plus size={26} strokeWidth={1.6} />
          </IconButton>
        }
      />
      <input ref={inputRef} type="file" multiple hidden onChange={onFiles} />
      <main className="page-scroll lib-scroll">
        <p className="muted intro">
          {meaningOn
            ? 'Berkas dan Canvas milikmu. Isi dokumen dibaca dan diindeks lewat NVIDIA supaya bisa dicari dari maknanya dan dipakai saat kamu memilih "Jawab dari Pustaka" di chat.'
            : 'Berkas dan Canvas milikmu. Isinya tidak dikirim ke AI kecuali kamu memilih "Lampirkan ke chat".'}
        </p>

        <label className="lib-search">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={meaningOn ? 'Cari nama atau isi dokumen…' : 'Cari nama berkas atau judul Canvas'} />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian">
              <X size={16} />
            </button>
          )}
        </label>

        <div className="lib-toolbar">
          <div className="chips-row lib-chips">
            {lib.FILTERS.map((f) => (
              <button key={f.id} type="button" className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
                {items && counts[f.id] > 0 ? ` ${counts[f.id]}` : ''}
              </button>
            ))}
          </div>
          <button type="button" className="lib-sort" onClick={() => setSortOpen(true)}>
            <ArrowUpDown size={15} /> {lib.SORTS.find((s) => s.value === sort)?.label}
          </button>
        </div>

        {offline && (
          <div className="lib-banner">
            <WifiOff size={16} /> Offline: menampilkan daftar terakhir. Membuka atau mengubah berkas butuh internet.
            <button type="button" className="link-btn" onClick={load}>
              Muat ulang
            </button>
          </div>
        )}

        {upload && (
          <div className="lib-upload">
            <div className="lib-upload-top">
              <Upload size={16} />
              <span className="truncate">
                {upload.done < upload.total ? `Mengimpor ${upload.done + 1} dari ${upload.total}: ${upload.current}` : `Selesai mengimpor ${upload.total} berkas`}
              </span>
              {upload.done >= upload.total && (
                <button type="button" className="icon-btn small" onClick={() => setUpload(null)} aria-label="Tutup">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="lib-progress">
              <span style={{ width: `${Math.round(((upload.done + (upload.done < upload.total ? 0.5 : 0)) / upload.total) * 100)}%` }} />
            </div>
            {upload.errors.map((er, i) => (
              <div key={i} className="lib-upload-err">
                {er}
              </div>
            ))}
          </div>
        )}

        {items === null && (
          <div className="lib-list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="lib-row skeleton">
                <span className="lib-icon shimmer" />
                <span className="lib-row-text">
                  <span className="sk-line" />
                  <span className="sk-line short" />
                </span>
              </div>
            ))}
          </div>
        )}

        {loadError && (
          <div className="error-box">
            <div>
              Pustaka gagal dimuat: {loadError}
              <br />
              <button type="button" className="link-btn" onClick={load}>
                Coba lagi
              </button>
            </div>
          </div>
        )}

        {meaningOn && meaning !== null && (
          <section className="meaning-results" aria-label="Hasil berdasarkan makna">
            <div className="meaning-head">
              <span className="meaning-label">
                <Sparkles size={14} /> Mirip maknanya
              </span>
              {meaning === 'loading' && <span className="spinner small" />}
            </div>
            {typeof meaning === 'string' && meaning !== 'loading' && <p className="muted small">{meaning}</p>}
            {Array.isArray(meaning) && meaning.length === 0 && <p className="muted small">Belum ada isi dokumen yang mirip. Unggah dokumen atau indeks lewat Pengaturan → Kemampuan.</p>}
            {Array.isArray(meaning) &&
              meaning.map((r) => {
                const it = items?.find((x) => x.id === r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="meaning-card"
                    onClick={() => (r.sourceType === 'canvas' ? navigate(`/canvas/${r.id}`) : it ? openItem(it) : showToast('Berkas sudah tidak ada', 'error'))}
                  >
                    {it ? <ItemIcon it={it} /> : <span className="lib-icon t-document"><FileText size={22} strokeWidth={1.6} /></span>}
                    <span className="meaning-card-text">
                      <span className="meaning-card-title truncate">{it?.title || r.title}</span>
                      <span className="meaning-card-snippet">{r.snippet}</span>
                    </span>
                  </button>
                );
              })}
          </section>
        )}

        {items && !loadError && visible.length === 0 && !(Array.isArray(meaning) && meaning.length) && (
          <div className="empty">
            <div className="empty-icon">
              <FolderOpen size={40} strokeWidth={1.4} />
            </div>
            <div className="empty-title">{debounced ? 'Tidak ada yang cocok' : 'Masih kosong'}</div>
            <p className="empty-text">{debounced ? `Tidak ada item untuk “${debounced}”.` : emptyText}</p>
            {!debounced && filter !== 'canvas' && filter !== 'favorite' && (
              <button type="button" className="btn btn-dark" onClick={() => inputRef.current?.click()}>
                <Upload size={18} /> Unggah berkas
              </button>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <div className="lib-list">
            {visible.map((it) => (
              <div key={`${it.source}-${it.id}`} className="lib-row">
                <button type="button" className="lib-row-main" onClick={() => openItem(it)}>
                  <ItemIcon it={it} />
                  <span className="lib-row-text">
                    <span className="lib-row-title">
                      {it.is_favorite && <Star size={13} className="lib-fav" fill="currentColor" />}
                      {it.title}
                    </span>
                    <span className={`lib-row-sub truncate ${indexing[it.id] ? 'indexing' : ''}`}>{subtitle(it, indexing[it.id])}</span>
                  </span>
                </button>
                <IconButton label={`Aksi untuk ${it.title}`} onClick={() => setActive(it)}>
                  <MoreVertical size={20} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </main>

      <Sheet open={!!active} onClose={() => setActive(null)} title={active?.title}>
        {active && (
          <Group>
            <Row
              icon={active.source === 'canvas' ? <FileText size={22} strokeWidth={1.6} /> : <ExternalLink size={22} strokeWidth={1.6} />}
              title={active.source === 'canvas' ? 'Buka Canvas' : 'Buka'}
              onClick={() => {
                const it = active;
                setActive(null);
                openItem(it);
              }}
            />
            {active.source === 'canvas' && active.conversation_id && (
              <Row
                icon={<MessageCircle size={22} strokeWidth={1.6} />}
                title="Buka percakapan"
                onClick={() => {
                  setActive(null);
                  navigate(`/c/${active.conversation_id}`);
                }}
              />
            )}
            {meaningOn && active.source === 'file' && (isPdf(active.title, active.mime_type) || isTextLike(active.title, active.mime_type)) && (
              <Row
                icon={<ScanText size={22} strokeWidth={1.6} />}
                title={active.index_status === 'indexed' ? 'Baca ulang isi' : 'Baca & indeks isi'}
                subtitle="Supaya bisa dicari dan dipakai untuk menjawab"
                onClick={async () => {
                  const it = active;
                  setActive(null);
                  const r = await indexItem({ ...it, extracted_text: null }, undefined);
                  if (r) showToast(r.status === 'indexed' ? `"${it.title}" siap dipakai (${r.chunks} bagian)` : 'Tidak ada teks yang bisa dibaca dari berkas ini');
                }}
              />
            )}
            <Row icon={<Paperclip size={22} strokeWidth={1.6} />} title="Lampirkan ke chat" subtitle="Ke chat baru, dengan konfirmasi" onClick={() => setDialog('attach')} />
            <Row icon={<Pencil size={22} strokeWidth={1.6} />} title="Ubah nama" onClick={() => setDialog('rename')} />
            <Row icon={<Star size={22} strokeWidth={1.6} />} title={active.is_favorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'} onClick={() => toggleFav(active)} />
            <Row icon={<Share2 size={22} strokeWidth={1.6} />} title="Bagikan / ekspor" onClick={() => share(active)} />
            <Row icon={<Trash2 size={22} strokeWidth={1.6} />} title="Hapus" danger onClick={() => setDialog('delete')} />
          </Group>
        )}
      </Sheet>

      <PromptDialog
        open={dialog === 'rename'}
        onClose={() => {
          setDialog(null);
          setActive(null);
        }}
        title="Ubah nama"
        initial={active?.title}
        onSubmit={async (v) => {
          const it = active;
          try {
            await lib.renameItem(it, v);
            setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, title: v.trim(), updated_at: new Date().toISOString(), revision: x.source === 'canvas' ? x.revision + 1 : x.revision } : x)));
          } catch (e) {
            showToast(`Gagal mengubah nama: ${e.message}`, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => {
          setDialog(null);
          setActive(null);
        }}
        title={`Hapus "${active?.title}"?`}
        message={
          active?.source === 'canvas'
            ? 'Canvas dan riwayat revisinya dihapus. Chat asal dan berkas lain tidak ikut terhapus.'
            : 'Berkas dihapus permanen dari Pustaka dan penyimpanan. Chat dan item lain tidak ikut terhapus.'
        }
        onConfirm={async () => {
          const it = active;
          try {
            await lib.deleteItem(it);
            setItems((prev) => prev.filter((x) => !(x.id === it.id && x.source === it.source)));
            showToast('Dihapus');
          } catch (e) {
            showToast(`Gagal menghapus: ${e.message}`, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={dialog === 'attach'}
        onClose={() => {
          setDialog(null);
          setActive(null);
        }}
        title="Lampirkan ke chat baru?"
        message={`"${active?.title}" akan ditambahkan ke kolom pesan chat baru. Isinya baru dikirim ke penyedia AI saat kamu menekan Kirim, dan masih bisa kamu hapus dari lampiran sebelumnya.`}
        confirmLabel="Lampirkan"
        danger={false}
        onConfirm={() => {
          const it = active;
          navigate('/', { state: { fresh: Date.now(), attachLibrary: [it] } });
        }}
      />
      <ChoiceDialog
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Urutkan"
        value={sort}
        onChange={(v) => {
          setSort(v);
          try {
            localStorage.setItem('aidriy.library.sort', v);
          } catch {
            /* abaikan */
          }
        }}
        options={lib.SORTS.map((s) => ({ ...s, icon: <ArrowUpDown size={20} strokeWidth={1.5} /> }))}
      />
      {viewer && <FileViewer item={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
