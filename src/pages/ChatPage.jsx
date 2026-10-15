import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FolderClosed, Ghost, MoreHorizontal, Pencil, Share2, Star, Trash2, X } from 'lucide-react';
import { useApp } from '../state';
import * as db from '../lib/db';
import { PROVIDERS, effortLabel, shortModelName, streamChat } from '../lib/providers';
import { buildSystemPrompt } from '../lib/prompt';
import { collapseArtifacts, extractMemories, imageQueries, plainText, splitSegments } from '../lib/parse';
import * as canvasDb from '../lib/canvas';
import { toAttachment as libraryToAttachment } from '../lib/library';
import { isQuickQuestion } from '../lib/personalization';
import { addSource, applySnippetCitations, marker } from '../lib/citations';
import { searchImages } from '../lib/search/imageSearch';
import { imageQueryFromText } from '../lib/search/intent';
import { attachmentMeta, fileToAttachment, imageFromBase64 } from '../lib/files';
import { takePhoto, tap } from '../lib/native';
import { ConfirmDialog, Group, IconButton, PromptDialog, Row, Sheet, TopBar } from '../components/ui';
import { LogoMark } from '../components/Logo';
import Composer from '../components/Composer';
import Message from '../components/Message';
import AttachSheet from '../components/AttachSheet';
import ModelPicker from '../components/ModelPicker';
import CanvasView from '../components/CanvasView';
import VoiceMode from '../components/VoiceMode';
import ProjectPicker from '../components/ProjectPicker';
import ShareChatSheet, { shareOrCopy } from '../components/ShareChatSheet';
import { canvasSize } from '../components/CanvasBlock';

const groupKey = (m) => m.parent_id || m.id;

/** Pesan yang tampil: semua pesan pengguna + satu versi terpilih per kelompok jawaban AI. */
export function computeVisible(list) {
  const groups = new Map();
  for (const m of list) {
    if (m.role !== 'assistant') continue;
    const k = groupKey(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const out = [];
  const info = new Map();
  const seen = new Set();
  for (const m of list) {
    if (m.role !== 'assistant') {
      out.push(m);
      continue;
    }
    const k = groupKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    const g = groups.get(k);
    let idx = g.findIndex((x) => x._sel);
    if (idx < 0) idx = g.length - 1;
    out.push(g[idx]);
    info.set(g[idx].id, { index: idx + 1, count: g.length, key: k });
  }
  return { list: out, info };
}

function makeTitle(text, atts) {
  const line = (text || '').split('\n').find((l) => l.trim()) || '';
  const t = line.trim().replace(/\s+/g, ' ');
  if (t) return t.length > 60 ? `${t.slice(0, 57)}…` : t;
  if (atts?.length) return `Tentang ${atts[0].name}`.slice(0, 60);
  return 'Chat baru';
}

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setWide(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return wide;
}

function firstName(profile, user) {
  if (profile?.nickname) return profile.nickname;
  if (profile?.full_name) return profile.full_name.split(' ')[0];
  return user?.email?.split('@')[0] || '';
}

export default function ChatPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const app = useApp();
  const { uid, user, profile, settings, projects, showToast, refreshConversations } = app;

  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [webSearch, setWebSearch] = useState(settings.webSearch);
  const [newProjectId, setNewProjectId] = useState(searchParams.get('project'));
  const [sheet, setSheet] = useState(null); // attach | model | menu | project | rename | delete
  const [canvasOpen, setCanvasOpen] = useState(null); // { id } | { localId }
  const [canvasRefresh, setCanvasRefresh] = useState(0);
  const [paneWidth, setPaneWidth] = useState(() => Number(localStorage.getItem('aidriy.canvasPane')) || 460);
  const wide = useWide();
  const localCanvasesRef = useRef(new Map());
  const [voiceOpen, setVoiceOpen] = useState(false);
  const voiceOpenRef = useRef(false);
  voiceOpenRef.current = voiceOpen;
  const [canvasRows, setCanvasRows] = useState({});
  const [localTick, setLocalTick] = useState(0);
  const fbLock = useRef(new Set());

  const createdRef = useRef(null);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const stickRef = useRef(true);
  const cacheRef = useRef(new Map());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const busyRef = useRef(false);
  const convRef = useRef(conv);
  convRef.current = conv;
  const visible = useMemo(() => computeVisible(messages), [messages]);

  const loadCanvasRows = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const rows = await canvasDb.listConversationCanvases(convId, 200);
      setCanvasRows(Object.fromEntries(rows.map((r) => [r.id, r])));
    } catch {
      /* tampilkan isi dari pesan saja */
    }
  }, []);

  // ---------- Muat / reset percakapan ----------
  useEffect(() => {
    if (!id) {
      if (busyRef.current) abortRef.current?.abort();
      setConv(null);
      setMessages([]);
      setDraft('');
      setAttachments([]);
      setIncognito(false);
      setWebSearch(settings.webSearch);
      setNewProjectId(new URLSearchParams(location.search).get('project'));
      setCanvasOpen(null);
      setCanvasRows({});
      localCanvasesRef.current = new Map();
      createdRef.current = null;
      const fromLibrary = location.state?.attachLibrary;
      if (Array.isArray(fromLibrary) && fromLibrary.length) {
        (async () => {
          setPreparing(true);
          for (const it of fromLibrary) {
            try {
              const a = await libraryToAttachment(it);
              setAttachments((prev) => [...prev, a]);
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
          setPreparing(false);
          showToast('Lampiran dari Pustaka siap. Isinya baru dikirim ke AI saat kamu menekan Kirim.');
        })();
      }
      return;
    }
    if (createdRef.current === id) return;
    if (busyRef.current) abortRef.current?.abort();
    createdRef.current = null;
    setCanvasOpen(null);
    setCanvasRows({});
    loadCanvasRows(id);
    let cancelled = false;
    setLoading(true);
    setIncognito(false);
    (async () => {
      try {
        const [c, msgs] = await Promise.all([db.getConversation(id), db.listMessages(id)]);
        if (cancelled) return;
        if (!c) {
          showToast('Chat tidak ditemukan', 'error');
          navigate('/', { replace: true });
          return;
        }
        setConv(c);
        setMessages(msgs);
        stickRef.current = true;
      } catch (e) {
        if (!cancelled) showToast(e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location.state?.fresh]);

  // Ganti nama / pindah proyek dari riwayat (drawer) ikut terlihat di header.
  useEffect(() => {
    if (!conv) return;
    const fresh = app.conversations.find((c) => c.id === conv.id);
    if (fresh && (fresh.title !== conv.title || fresh.project_id !== conv.project_id || fresh.starred !== conv.starred)) {
      setConv((c) => (c && c.id === fresh.id ? { ...c, title: fresh.title, project_id: fresh.project_id, starred: fresh.starred } : c));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.conversations]);

  // Gulir otomatis ke bawah bila pengguna sedang di bawah.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const project = useMemo(() => {
    const pid = conv ? conv.project_id : newProjectId;
    return projects.find((p) => p.id === pid) || null;
  }, [conv, newProjectId, projects]);

  // ---------- Lampiran ----------
  const addFiles = async (files) => {
    setPreparing(true);
    for (const f of files) {
      try {
        const a = await fileToAttachment(f);
        setAttachments((prev) => [...prev, a]);
      } catch (e) {
        showToast(e.message, 'error');
      }
    }
    setPreparing(false);
  };

  const addCameraPhoto = async () => {
    try {
      const p = await takePhoto();
      if (!p) return;
      setPreparing(true);
      const a = await imageFromBase64(p);
      setAttachments((prev) => [...prev, a]);
    } catch (e) {
      if (!/cancel/i.test(e.message || '')) showToast(e.message || 'Kamera gagal dibuka', 'error');
    } finally {
      setPreparing(false);
    }
  };

  // ---------- Menyiapkan riwayat untuk AI ----------
  const toProviderHistory = (list) =>
    list
      .filter((m) => !m.error || m.content)
      .map((m) => {
        if (m.role === 'assistant') return { role: 'assistant', text: collapseArtifacts(extractMemories(m.content || '').clean) };
        const atts = (m.attachments || []).map((meta) => {
          const full = cacheRef.current.get(meta.id);
          if (full) return full;
          if (meta.kind === 'image' && meta.thumb) {
            return { ...meta, mime: 'image/jpeg', data: meta.thumb.slice(meta.thumb.indexOf(',') + 1) };
          }
          return meta;
        });
        return { role: 'user', text: m.content || '', attachments: atts };
      });

  // ---------- Canvas: simpan hasil AI (buat / perbarui revisi) ----------
  const processCanvases = async (clean, convId, messageId, active, localOnly, only = null) => {
    const segs = splitSegments(clean).filter((x) => x.type === 'artifact' && x.complete && x.content.trim() && (!only || only.has(x.index)));
    const infos = [];
    for (const seg of segs) {
      if (localOnly) {
        const known = seg.action === 'update' && seg.id && localCanvasesRef.current.has(seg.id);
        const lid = known ? seg.id : `local-${Date.now().toString(36)}-${seg.index}`;
        localCanvasesRef.current.set(lid, { id: lid, localId: lid, title: seg.title, kind: seg.kind, language: seg.language, content: seg.content });
        setLocalTick((n) => n + 1);
        infos[seg.index] = { id: lid, local: true, status: 'local', revision: 1 };
        if (known && canvasOpen?.localId === lid) setCanvasRefresh((n) => n + 1);
        continue;
      }
      let target = seg.action === 'update' && seg.id ? active.find((c) => c.id === seg.id) : null;
      if (!target && seg.action === 'update' && /^[0-9a-f-]{36}$/i.test(seg.id || '')) {
        try {
          const row = await canvasDb.getCanvas(seg.id);
          if (row && row.conversation_id === convId) target = row;
        } catch {
          /* buat baru */
        }
      }
      try {
        if (target) {
          try {
            const row = await canvasDb.saveCanvas(target.id, target.revision, seg.content, { title: seg.title, source: 'ai' });
            infos[seg.index] = { id: row.id, status: 'updated', revision: row.revision };
            setCanvasRefresh((n) => n + 1);
          } catch (e) {
            if (e instanceof canvasDb.CanvasConflictError) infos[seg.index] = { id: target.id, status: 'conflict', revision: target.revision };
            else throw e;
          }
        } else {
          const row = await canvasDb.createCanvas({
            conversation_id: convId,
            message_id: messageId,
            title: seg.title,
            kind: seg.kind,
            language: seg.language,
            content: seg.content,
          });
          infos[seg.index] = { id: row.id, status: 'created', revision: row.revision };
          active.push({ ...row, kind: canvasDb.kindOf(row) });
        }
      } catch (e) {
        infos[seg.index] = { status: 'error', error: e.message };
      }
    }
    return Array.from({ length: infos.length }, (_, i) => infos[i] || null);
  };

  const resolveCanvasConflict = async (messageId, index, action) => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const info = msg?.meta?.canvases?.[index];
    if (!info) return;
    let next = info;
    if (action === 'dismiss') {
      next = { ...info, status: 'dismissed' };
    } else {
      const seg = splitSegments(msg.content).find((x) => x.type === 'artifact' && x.index === index);
      try {
        const latest = await canvasDb.getCanvas(info.id);
        if (!latest) throw new Error('Canvas sudah dihapus');
        const row = await canvasDb.saveCanvas(info.id, latest.revision, seg.content, { title: seg.title, source: 'ai' });
        next = { id: row.id, status: 'updated', revision: row.revision };
        setCanvasRows((r) => ({ ...r, [row.id]: row }));
        setCanvasRefresh((n) => n + 1);
        showToast(`Versi AI diterapkan sebagai revisi ${row.revision}`);
      } catch (e) {
        showToast(e.message, 'error');
        return;
      }
    }
    const canvases = [...msg.meta.canvases];
    canvases[index] = next;
    const meta = { ...msg.meta, canvases };
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, meta } : m)));
    if (!String(messageId).startsWith('ai-')) db.updateMessageMeta(messageId, meta).catch(() => {});
  };

  const openCanvas = (seg, info, mode = 'preview') => {
    tap();
    if (info?.local) setCanvasOpen({ localId: info.id, mode });
    else if (info?.id && info.status !== 'error') setCanvasOpen({ id: info.id, mode });
    else setCanvasOpen({ legacy: { id: `legacy-${seg.index}`, title: seg.title, kind: seg.kind, language: seg.language, content: seg.content }, mode });
  };

  // Hasil Canvas panjang langsung dibuka setelah berhasil dibuat/diperbarui.
  const autoOpenLong = (clean, infos) => {
    if (voiceOpenRef.current || !infos?.length) return;
    const segs = splitSegments(clean).filter((x) => x.type === 'artifact' && x.complete);
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      const info = infos[seg.index];
      if (!info || !['created', 'updated', 'local'].includes(info.status)) continue;
      if (canvasSize(seg.content, seg.kind) === 'long') {
        setCanvasOpen(info.local ? { localId: info.id, mode: 'preview' } : { id: info.id, mode: 'preview' });
      }
      return;
    }
  };

  // Simpan ulang Canvas yang gagal tersimpan (hanya bagian yang gagal, tanpa duplikat).
  const retryCanvas = async (messageId) => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const convId = convRef.current?.id;
    if (!msg || !convId || String(messageId).startsWith('ai-')) return;
    const failed = new Set((msg.meta?.canvases || []).map((c, i) => (c?.status === 'error' ? i : -1)).filter((i) => i >= 0));
    if (!failed.size) return;
    let active = [];
    try {
      active = (await canvasDb.listConversationCanvases(convId, 200)).map((c) => ({ ...c, kind: canvasDb.kindOf(c) }));
    } catch {
      /* lanjut */
    }
    const infos = await processCanvases(msg.content, convId, messageId, active, false, failed);
    const canvases = (msg.meta.canvases || []).map((old, i) => (failed.has(i) ? infos[i] || old : old));
    const meta = { ...msg.meta, canvases };
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, meta } : m)));
    db.updateMessageMeta(messageId, meta).catch(() => {});
    loadCanvasRows(convId);
    if (canvases.some((c) => c?.status === 'error')) showToast('Canvas masih gagal disimpan', 'error');
  };

  // ---------- Menjalankan AI ----------
  const runAssistant = async (convId, historyList, beforeSave, opts = {}) => {
    const provider = settings.provider;
    const model = settings.model;
    const apiKey = settings.keys[provider];
    const tempId = `ai-${Date.now()}`;
    const parentId = opts.parentId || null;
    const version = opts.version || 1;
    const ai = { id: tempId, role: 'assistant', content: '', thinking: '', streaming: true, status: '', meta: {}, parent_id: parentId, version, _sel: true };
    setMessages((prev) => [
      ...prev.map((m) => (m.role === 'assistant' && parentId && groupKey(m) === parentId && m._sel ? { ...m, _sel: false } : m)),
      ai,
    ]);
    stickRef.current = true;

    let text = '';
    let thinking = '';
    let status = '';
    const sources = [];
    const snippetCites = [];
    const imageBlocks = [];
    const imageJobs = [];
    let notice = '';
    let raf = 0;
    let finished = false;
    const imagesOn = settings.imageSearch !== false;
    const snapshotImages = () => imageBlocks.map((b) => ({ ...b }));
    const flush = () => {
      raf = 0;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, content: text, thinking, status, meta: { ...m.meta, sources: [...sources], images: snapshotImages() }, notice } : m
        )
      );
    };
    const schedule = () => {
      if (!raf && !finished) raf = requestAnimationFrame(flush);
    };

    // Pencarian gambar nyata lewat backend; hasil (atau error) disimpan apa adanya.
    const startImageSearch = (query, auto = false) => {
      if (!imagesOn || imageBlocks.length >= 3) return;
      if (imageBlocks.some((b) => b.query.toLowerCase() === query.toLowerCase())) return;
      const block = { id: `img-${Date.now()}-${imageBlocks.length}`, query, status: 'loading', results: [], auto };
      imageBlocks.push(block);
      schedule();
      imageJobs.push(
        searchImages(query)
          .then((r) => {
            block.status = 'done';
            block.results = r.results;
            block.provider = r.provider;
            if (r.message) block.message = r.message;
          })
          .catch((e) => {
            block.status = 'error';
            block.error = e.message;
          })
          .finally(() => {
            schedule();
            setMessages((prev) => prev.map((m) => (m.id === tempId || m.tempId === tempId ? { ...m, meta: { ...m.meta, images: snapshotImages() } } : m)));
          })
      );
    };

    let memories = [];
    if (settings.memory && !incognito) {
      try {
        memories = await db.listMemories();
      } catch {
        /* lanjut tanpa memori */
      }
    }
    let canvases = [];
    if (incognito || !convId) {
      canvases = [...localCanvasesRef.current.values()].map((c) => ({ ...c, revision: 1 }));
    } else {
      try {
        canvases = (await canvasDb.listConversationCanvases(convId)).map((c) => ({ ...c, kind: canvasDb.kindOf(c) }));
      } catch {
        /* lanjut tanpa daftar Canvas */
      }
    }
    const system = buildSystemPrompt({ profile, memories, project, settings, incognito, canvases });
    const lastUserMsg = [...historyList].reverse().find((m) => m.role === 'user');
    const quick = settings.personalization?.quickAnswers !== false && isQuickQuestion(lastUserMsg?.content, lastUserMsg?.attachments?.length);
    const effort = quick ? 'off' : settings.effort;
    const controller = new AbortController();
    abortRef.current = controller;
    let usage = null;
    let error = '';
    let errorInfo = null;
    try {
      const out = await streamChat(
        {
          provider,
          model,
          apiKey,
          system,
          history: toProviderHistory(historyList),
          effort,
          webSearch,
          signal: controller.signal,
        },
        {
          onText: (t) => {
            text += t;
            status = '';
            if (imagesOn && t.includes('>')) imageQueries(text).forEach((q) => startImageSearch(q));
            schedule();
          },
          onThinking: (t) => {
            thinking += t;
            schedule();
          },
          onSource: (s) => {
            addSource(sources, s);
            schedule();
          },
          onCiteAppend: (list) => {
            const nums = list.map((c) => addSource(sources, c)).filter(Boolean);
            if (nums.length) text += marker(nums);
            schedule();
          },
          onCiteSnippet: (c) => {
            const n = addSource(sources, c);
            if (n) snippetCites.push({ snippet: c.snippet, n });
          },
          onStatus: (s) => {
            status = s;
            schedule();
          },
          onNotice: (n) => {
            notice = n;
            schedule();
          },
        }
      );
      usage = out?.usage || null;
    } catch (e) {
      if (e.name !== 'AbortError') {
        error = /Failed to fetch|NetworkError|Load failed/i.test(e.message)
          ? 'Tidak bisa terhubung ke penyedia AI. Periksa koneksi internet.'
          : e.message || 'Terjadi kesalahan';
        if (e.kind && e.kind !== 'other') errorInfo = { kind: e.kind, detail: e.detail || '', provider };
      }
    } finally {
      if (raf) cancelAnimationFrame(raf);
      abortRef.current = null;
    }

    finished = true;
    if (raf) cancelAnimationFrame(raf);
    text = applySnippetCitations(text, snippetCites);
    const { clean, memories: newMems } = extractMemories(text);

    // Cadangan: pengguna jelas meminta gambar tetapi model tidak menulis tag pencarian.
    if (imagesOn && !imageBlocks.length && !controller.signal.aborted) {
      const lastUser = [...historyList].reverse().find((m) => m.role === 'user');
      const q = imageQueryFromText(lastUser?.content || '');
      if (q) startImageSearch(q, true);
    }

    // Buat ulang gagal/dibatalkan tanpa isi: jawaban lama tetap dipakai.
    if (opts.regen && !clean.trim() && !imageBlocks.length) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempId).map((m) => (opts.prevSelId && m.id === opts.prevSelId ? { ...m, _sel: true } : m))
      );
      if (error) showToast(`Gagal membuat ulang: ${error}`, 'error');
      return '';
    }

    const baseMeta = {
      provider,
      model: shortModelName(provider, model, settings.modelCache),
      sources,
      usage: usage ? { ...usage, provider } : null,
      thinking: thinking ? thinking.slice(0, 20000) : undefined,
    };
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? { ...m, tempId, content: clean, thinking: undefined, status: '', streaming: false, meta: { ...baseMeta, images: snapshotImages() }, error, errorInfo, notice }
          : m
      )
    );

    // Tunggu semua pencarian gambar selesai sebelum disimpan (layanan punya batas waktu sendiri).
    await Promise.allSettled(imageJobs);
    const meta = { ...baseMeta, images: imageBlocks.length ? snapshotImages() : undefined };
    setMessages((prev) => prev.map((m) => (m.id === tempId || m.tempId === tempId ? { ...m, meta } : m)));

    if (incognito || !convId) {
      const infos = await processCanvases(clean, null, null, canvases, true);
      if (infos.length) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, meta: { ...m.meta, canvases: infos } } : m)));
        autoOpenLong(clean, infos);
      }
    }

    if (!incognito && convId && (clean.trim() || imageBlocks.length)) {
      try {
        const realParent = (await beforeSave) || parentId;
        const row = { conversation_id: convId, role: 'assistant', content: clean, meta, version };
        if (realParent && !String(realParent).startsWith('u-')) row.parent_id = realParent;
        const saved = await db.insertMessage(row);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: saved.id, parent_id: saved.parent_id || m.parent_id, created_at: saved.created_at } : m)));
        const infos = await processCanvases(clean, convId, saved.id, canvases, false);
        if (infos.length) {
          const withCanvas = { ...meta, canvases: infos };
          setMessages((prev) => prev.map((m) => (m.id === saved.id ? { ...m, meta: withCanvas } : m)));
          await loadCanvasRows(convId);
          autoOpenLong(clean, infos);
          await db.updateMessageMeta(saved.id, withCanvas);
        }
        await db.updateConversation(convId, { provider, model });
        refreshConversations();
        if (settings.memory && newMems.length) {
          await db.addMemories(newMems);
          setMessages((prev) => prev.map((m) => (m.id === saved.id ? { ...m, notice: [m.notice, 'Memori diperbarui'].filter(Boolean).join(' · ') } : m)));
        }
      } catch (e) {
        showToast(`Gagal menyimpan: ${e.message}`, 'error');
      }
    }
    if (error) throw Object.assign(new Error(error), { shown: true });
    return clean;
  };

  // ---------- Kirim ----------
  const send = useCallback(
    async (rawText) => {
      const text = (rawText || '').trim();
      const atts = attachmentsRef.current;
      if ((!text && !atts.length) || busyRef.current) return '';
      const provider = settings.provider;
      if (!settings.keys[provider]) {
        showToast(`Tambahkan API key ${PROVIDERS[provider].short} dulu`, 'error');
        navigate('/settings/keys');
        return '';
      }
      busyRef.current = true;
      setBusy(true);
      setDraft('');
      setAttachments([]);
      atts.forEach((a) => cacheRef.current.set(a.id, a));

      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        attachments: atts.map((a) => attachmentMeta(a)),
      };
      let convId = convRef.current?.id;
      try {
        if (!incognito && !convId) {
          const c = await db.createConversation({
            title: makeTitle(text, atts),
            project_id: newProjectId || null,
            provider,
            model: settings.model,
          });
          convId = c.id;
          createdRef.current = c.id;
          setConv(c);
          navigate(`/c/${c.id}`, { replace: true });
          refreshConversations();
        }
      } catch (e) {
        showToast(`Gagal membuat chat: ${e.message}`, 'error');
        busyRef.current = false;
        setBusy(false);
        setDraft(text);
        setAttachments(atts);
        return '';
      }

      const history = [...computeVisible(messagesRef.current).list, userMsg];
      setMessages((prev) => [...prev, userMsg]);

      let saveUser = Promise.resolve(null);
      if (!incognito && convId) {
        saveUser = (async () => {
          const metas = [];
          for (const a of atts) {
            let path = null;
            if (a.data) {
              try {
                path = await db.uploadAttachment(uid, convId, a);
              } catch {
                /* tetap simpan tanpa berkas asli */
              }
            }
            metas.push(attachmentMeta(a, path));
          }
          const saved = await db.insertMessage({ conversation_id: convId, role: 'user', content: text, attachments: metas });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userMsg.id ? { ...m, id: saved.id, attachments: metas } : m.parent_id === userMsg.id ? { ...m, parent_id: saved.id } : m
            )
          );
          return saved.id;
        })().catch((e) => {
          showToast(`Gagal menyimpan pesan: ${e.message}`, 'error');
          return null;
        });
      }

      try {
        return await runAssistant(convId, history, saveUser, { parentId: userMsg.id });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, incognito, newProjectId, webSearch, profile, project, uid]
  );

  // Buat ulang: jawaban lama disimpan sebagai versi, jawaban baru jadi versi berikutnya.
  const regenerate = async () => {
    if (busyRef.current) return;
    if (!settings.keys[settings.provider]) {
      showToast('Tambahkan API key dulu', 'error');
      navigate('/settings/keys');
      return;
    }
    let all = [...messagesRef.current];
    let vis = computeVisible(all).list;
    const tail = vis[vis.length - 1];
    // Jawaban gagal yang tidak tersimpan dibuang (bukan versi).
    if (tail?.role === 'assistant' && String(tail.id).startsWith('ai-') && !tail.content) {
      all = all.filter((m) => m.id !== tail.id);
      vis = computeVisible(all).list;
    }
    const lastA = vis[vis.length - 1]?.role === 'assistant' ? vis[vis.length - 1] : null;
    const history = lastA ? vis.slice(0, -1) : vis;
    const userM = history[history.length - 1];
    if (!userM || userM.role !== 'user') return;
    if (lastA && !lastA.parent_id) {
      all = all.map((m) => (m.id === lastA.id ? { ...m, parent_id: userM.id } : m));
      if (!String(lastA.id).startsWith('ai-') && !String(userM.id).startsWith('u-')) db.updateMessage(lastA.id, { parent_id: userM.id }).catch(() => {});
    }
    const siblings = all.filter((m) => m.role === 'assistant' && groupKey(m) === userM.id);
    const version = siblings.reduce((mx, m) => Math.max(mx, m.version || 1), 0) + 1;
    messagesRef.current = all;
    setMessages(all);
    tap();
    busyRef.current = true;
    setBusy(true);
    try {
      await runAssistant(convRef.current?.id, history, Promise.resolve(null), {
        parentId: userM.id,
        version,
        regen: !!lastA,
        prevSelId: lastA?.id,
      });
    } catch {
      /* sudah ditampilkan */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const selectVersion = useCallback((key, delta) => {
    tap();
    setMessages((prev) => {
      const g = prev.filter((m) => m.role === 'assistant' && groupKey(m) === key);
      let cur = g.findIndex((m) => m._sel);
      if (cur < 0) cur = g.length - 1;
      const next = Math.min(Math.max(cur + delta, 0), g.length - 1);
      const target = g[next]?.id;
      return prev.map((m) => (m.role === 'assistant' && groupKey(m) === key ? { ...m, _sel: m.id === target } : m));
    });
  }, []);

  // Suka / tidak suka: optimistis, satu permintaan per pesan, dikembalikan bila gagal.
  const setFeedback = useCallback(
    async (msg, value, reason) => {
      if (fbLock.current.has(msg.id)) return;
      const prev = { feedback: msg.feedback ?? null, feedback_reason: msg.feedback_reason ?? null };
      const next = {
        feedback: value || null,
        feedback_reason: value === -1 ? (reason !== undefined ? reason : msg.feedback === -1 ? msg.feedback_reason : null) : null,
      };
      const patch = (p) => setMessages((list) => list.map((m) => (m.id === msg.id ? { ...m, ...p } : m)));
      patch(next);
      if (incognito || String(msg.id).startsWith('ai-')) return;
      fbLock.current.add(msg.id);
      try {
        await db.setMessageFeedback(msg.id, next.feedback, next.feedback_reason);
      } catch (e) {
        patch(prev);
        showToast(`Masukan gagal disimpan: ${e.message}`, 'error');
      } finally {
        fbLock.current.delete(msg.id);
      }
    },
    [incognito, showToast]
  );

  const openModelPicker = useCallback(() => {
    tap();
    setSheet('model');
  }, []);

  const shareMessage = useCallback((msg) => shareOrCopy('Jawaban A.I.DRIY', plainText(msg.content || ''), showToast), [showToast]);

  // Ulangi pencarian gambar yang gagal pada pesan tertentu.
  const retryImages = useCallback(
    async (messageId, blockId) => {
      const patchBlock = (patch) => {
        const msg = messagesRef.current.find((m) => m.id === messageId);
        if (!msg?.meta?.images) return null;
        const meta = { ...msg.meta, images: msg.meta.images.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) };
        messagesRef.current = messagesRef.current.map((m) => (m.id === messageId ? { ...m, meta } : m));
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, meta } : m)));
        return meta;
      };
      const block = messagesRef.current.find((m) => m.id === messageId)?.meta?.images?.find((b) => b.id === blockId);
      if (!block) return;
      patchBlock({ status: 'loading', error: undefined });
      let meta;
      try {
        const r = await searchImages(block.query);
        meta = patchBlock({ status: 'done', results: r.results, provider: r.provider, message: r.message });
      } catch (e) {
        meta = patchBlock({ status: 'error', error: e.message });
      }
      if (meta && !incognito && !String(messageId).startsWith('ai-')) {
        db.updateMessageMeta(messageId, meta).catch(() => {});
      }
    },
    [incognito]
  );

  const stop = () => {
    tap();
    abortRef.current?.abort();
  };

  // ---------- Menu percakapan ----------
  const toggleStar = async () => {
    try {
      const c = await db.updateConversation(conv.id, { starred: !conv.starred });
      setConv(c);
      refreshConversations();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const chooseProject = async (pid) => {
    setSheet(null);
    if (conv) {
      try {
        const c = await db.updateConversation(conv.id, { project_id: pid });
        setConv(c);
        showToast(pid ? 'Dipindahkan ke proyek' : 'Dikeluarkan dari proyek');
      } catch (e) {
        showToast(e.message, 'error');
      }
    } else {
      setNewProjectId(pid);
    }
  };

  // ---------- Tampilan ----------
  const empty = messages.length === 0 && !loading;
  const latestCanvas = useMemo(() => {
    const map = {};
    for (const m of visible.list) {
      (m.meta?.canvases || []).forEach((c, i) => {
        if (c?.id && c.status !== 'error') map[c.id] = `${m.id}:${i}`;
      });
    }
    return map;
  }, [visible]);
  const rowsForRender = useMemo(() => {
    if (!incognito && conv) return canvasRows;
    return Object.fromEntries([...localCanvasesRef.current.entries()].map(([k, v]) => [k, { ...v, revision: 1 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRows, incognito, conv, localTick]);
  const lastAiId = visible.list.length && visible.list[visible.list.length - 1].role === 'assistant' ? visible.list[visible.list.length - 1].id : null;
  const modelLabel = `${shortModelName(settings.provider, settings.model, settings.modelCache)} ${effortLabel(settings.effort)}`;

  let header;
  if (incognito) {
    header = (
      <TopBar
        title={<span className="muted-title">Chat incognito</span>}
        right={
          <IconButton
            label="Keluar dari incognito"
            onClick={() => {
              tap();
              setIncognito(false);
              setMessages([]);
            }}
          >
            <X size={26} strokeWidth={1.6} />
          </IconButton>
        }
      />
    );
  } else if (conv) {
    header = (
      <TopBar
        title={<span className="truncate">{conv.title}</span>}
        onTitleClick={() => setSheet('menu')}
        right={
          <IconButton label="Opsi chat" onClick={() => setSheet('menu')}>
            <MoreHorizontal size={24} />
          </IconButton>
        }
      />
    );
  } else {
    header = (
      <TopBar
        title=""
        right={
          <IconButton
            label="Chat incognito"
            onClick={() => {
              tap();
              setIncognito(true);
            }}
          >
            <Ghost size={28} strokeWidth={1.5} />
          </IconButton>
        }
      />
    );
  }

  const canvasProps = canvasOpen
    ? {
        canvasId: canvasOpen.id,
        local: canvasOpen.localId ? localCanvasesRef.current.get(canvasOpen.localId) : canvasOpen.legacy,
        refreshKey: canvasRefresh,
        initialMode: canvasOpen.mode,
        onClose: () => setCanvasOpen(null),
        onSaved: (row) => setCanvasRows((r) => (r[row.id] && r[row.id].revision === row.revision && r[row.id].content === row.content ? r : { ...r, [row.id]: row })),
        onLocalChange: canvasOpen.localId
          ? (patch) => {
              const cur = localCanvasesRef.current.get(canvasOpen.localId);
              if (cur) localCanvasesRef.current.set(canvasOpen.localId, { ...cur, ...patch });
              setLocalTick((n) => n + 1);
            }
          : undefined,
      }
    : null;
  const docked = !!canvasProps && wide;

  const startResize = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = Math.min(Math.max(window.innerWidth - ev.clientX, 320), window.innerWidth - 360);
      setPaneWidth(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPaneWidth((w) => {
        try {
          localStorage.setItem('aidriy.canvasPane', String(Math.round(w)));
        } catch {
          /* abaikan */
        }
        return w;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={`page chat-page ${docked ? 'with-canvas' : ''}`}>
      <div className="chat-col">
      {header}

      <main className="chat-scroll" ref={listRef} onScroll={onScroll}>
        {loading && (
          <div className="center-fill">
            <span className="spinner" />
          </div>
        )}
        {empty && incognito && (
          <div className="hero">
            <Ghost size={64} strokeWidth={1.4} className="hero-ghost" />
            <p className="hero-text">Chat incognito tidak disimpan ke riwayat dan memori, dan hilang begitu kamu menutupnya.</p>
          </div>
        )}
        {empty && !incognito && (
          <div className="hero">
            <LogoMark size={52} />
            <h1 className="greeting">{firstName(profile, user) ? `Halo, ${firstName(profile, user)}` : 'Halo'}</h1>
            {project && (
              <button type="button" className="project-pill" onClick={() => setSheet('project')}>
                <FolderClosed size={16} /> {project.name}
              </button>
            )}
          </div>
        )}
        {!empty && (
          <div className="messages">
            {visible.list.map((m) => {
              const v = visible.info.get(m.id);
              return (
                <Message
                  key={m.id}
                  msg={m}
                  isLast={m.id === lastAiId}
                  busy={busy}
                  versions={v && v.count > 1 ? { index: v.index, count: v.count, onPrev: () => selectVersion(v.key, -1), onNext: () => selectVersion(v.key, 1) } : null}
                  onRegenerate={m.role === 'assistant' ? regenerate : undefined}
                  onOpenCanvas={openCanvas}
                  onCanvasConflict={resolveCanvasConflict}
                  onRetryCanvas={retryCanvas}
                  onRetryImages={retryImages}
                  onFeedback={m.role === 'assistant' ? setFeedback : undefined}
                  onShare={m.role === 'assistant' ? shareMessage : undefined}
                  onPickModel={openModelPicker}
                  canvasRows={rowsForRender}
                  latestCanvas={latestCanvas}
                  voice={settings.voice}
                />
              );
            })}
          </div>
        )}
      </main>

      <div className="composer-wrap">
        <Composer
          value={draft}
          setValue={setDraft}
          attachments={attachments}
          onRemoveAttachment={(aid) => setAttachments((prev) => prev.filter((a) => a.id !== aid))}
          onSend={(t) => send(t).catch(() => {})}
          onStop={stop}
          busy={busy}
          preparing={preparing}
          incognito={incognito}
          onPlus={() => {
            tap();
            setSheet('attach');
          }}
          modelLabel={modelLabel}
          onModel={() => {
            tap();
            setSheet('model');
          }}
          onVoiceMode={() => {
            tap('medium');
            if (!settings.keys[settings.provider]) {
              showToast('Tambahkan API key dulu', 'error');
              navigate('/settings/keys');
              return;
            }
            setVoiceOpen(true);
          }}
          placeholder={incognito ? 'Chat rahasia dengan A.I.DRIY…' : 'Chat dengan A.I.DRIY…'}
        />
      </div>
      </div>

      {docked && (
        <>
          <div className="canvas-resizer" onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Ubah lebar Canvas" />
          <aside className="canvas-pane" style={{ width: paneWidth }}>
            <CanvasView key={`${canvasOpen.id || canvasOpen.localId || 'legacy'}:${canvasOpen.mode || ''}`} docked {...canvasProps} />
          </aside>
        </>
      )}
      {canvasProps && !wide && <CanvasView key={`${canvasOpen.id || canvasOpen.localId || 'legacy'}:${canvasOpen.mode || ''}`} {...canvasProps} />}

      <AttachSheet
        open={sheet === 'attach'}
        onClose={() => setSheet(null)}
        onFiles={addFiles}
        onCamera={addCameraPhoto}
        webSearch={webSearch}
        onWebSearch={setWebSearch}
        projectName={project?.name}
        onPickProject={incognito ? undefined : () => setSheet('project')}
      />
      <ModelPicker open={sheet === 'model'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={conv?.title || 'Chat'}>
        <Group>
          <Row icon={<Pencil size={22} strokeWidth={1.6} />} title="Ganti nama" onClick={() => setSheet('rename')} />
          <Row
            icon={<Star size={22} strokeWidth={1.6} />}
            title={conv?.starred ? 'Lepas bintang' : 'Beri bintang'}
            onClick={() => {
              setSheet(null);
              toggleStar();
            }}
          />
          <Row icon={<FolderClosed size={22} strokeWidth={1.6} />} title="Pindahkan ke proyek" subtitle={project?.name || 'Tanpa proyek'} onClick={() => setSheet('project')} />
          <Row
            icon={<Share2 size={22} strokeWidth={1.6} />}
            title="Bagikan isi chat"
            onClick={() => setSheet('share')}
          />
        </Group>
        <Group>
          <Row icon={<Trash2 size={22} strokeWidth={1.6} />} title="Hapus chat" danger onClick={() => setSheet('delete')} />
        </Group>
      </Sheet>

      <ProjectPicker open={sheet === 'project'} onClose={() => setSheet(null)} currentId={project?.id || null} onPick={chooseProject} title="Pilih proyek" />
      <ShareChatSheet open={sheet === 'share'} onClose={() => setSheet(null)} title={conv?.title} messages={visible.list} />

      <PromptDialog
        open={sheet === 'rename'}
        onClose={() => setSheet(null)}
        title="Ganti nama chat"
        initial={conv?.title}
        onSubmit={async (v) => {
          try {
            const c = await db.updateConversation(conv.id, { title: v });
            setConv(c);
            refreshConversations();
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title="Hapus chat ini?"
        message="Chat dan semua pesannya akan dihapus permanen."
        onConfirm={async () => {
          try {
            await db.deleteConversation(conv.id);
            refreshConversations();
            navigate('/', { replace: true, state: { fresh: Date.now() } });
            showToast('Chat dihapus');
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />


      <VoiceMode
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onAbort={() => abortRef.current?.abort()}
        onUtterance={async (t) => {
          try {
            return await send(t);
          } catch (e) {
            if (e.shown) return 'Maaf, terjadi kesalahan.';
            throw e;
          }
        }}
      />
    </div>
  );
}
