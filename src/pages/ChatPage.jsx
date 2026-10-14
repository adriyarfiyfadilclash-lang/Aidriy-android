import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, FolderClosed, Ghost, MoreHorizontal, Pencil, Share2, Star, Trash2, X } from 'lucide-react';
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
import { shareText, takePhoto, tap } from '../lib/native';
import { ConfirmDialog, Group, IconButton, PromptDialog, Row, Sheet, TopBar } from '../components/ui';
import { LogoMark } from '../components/Logo';
import Composer from '../components/Composer';
import Message from '../components/Message';
import AttachSheet from '../components/AttachSheet';
import ModelPicker from '../components/ModelPicker';
import CanvasView from '../components/CanvasView';
import VoiceMode from '../components/VoiceMode';

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
  const processCanvases = async (clean, convId, messageId, active, localOnly) => {
    const segs = splitSegments(clean).filter((x) => x.type === 'artifact' && x.complete && x.content.trim());
    const infos = [];
    for (const seg of segs) {
      if (localOnly) {
        const known = seg.action === 'update' && seg.id && localCanvasesRef.current.has(seg.id);
        const lid = known ? seg.id : `local-${Date.now().toString(36)}-${seg.index}`;
        localCanvasesRef.current.set(lid, { id: lid, localId: lid, title: seg.title, kind: seg.kind, language: seg.language, content: seg.content });
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

  const openCanvas = (seg, info) => {
    tap();
    if (info?.local) setCanvasOpen({ localId: info.id });
    else if (info?.id) setCanvasOpen({ id: info.id });
    else setCanvasOpen({ legacy: { id: `legacy-${seg.index}`, title: seg.title, kind: seg.kind, language: seg.language, content: seg.content } });
  };

  // ---------- Menjalankan AI ----------
  const runAssistant = async (convId, historyList, beforeSave) => {
    const provider = settings.provider;
    const model = settings.model;
    const apiKey = settings.keys[provider];
    const tempId = `ai-${Date.now()}`;
    const ai = { id: tempId, role: 'assistant', content: '', thinking: '', streaming: true, status: '', meta: {} };
    setMessages((prev) => [...prev, ai]);
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
          ? { ...m, tempId, content: clean, thinking: undefined, status: '', streaming: false, meta: { ...baseMeta, images: snapshotImages() }, error, notice }
          : m
      )
    );

    // Tunggu semua pencarian gambar selesai sebelum disimpan (layanan punya batas waktu sendiri).
    await Promise.allSettled(imageJobs);
    const meta = { ...baseMeta, images: imageBlocks.length ? snapshotImages() : undefined };
    setMessages((prev) => prev.map((m) => (m.id === tempId || m.tempId === tempId ? { ...m, meta } : m)));

    if (incognito || !convId) {
      const infos = await processCanvases(clean, null, null, canvases, true);
      if (infos.length) setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, meta: { ...m.meta, canvases: infos } } : m)));
    }

    if (!incognito && convId && (clean.trim() || imageBlocks.length)) {
      try {
        await beforeSave;
        const saved = await db.insertMessage({ conversation_id: convId, role: 'assistant', content: clean, meta });
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: saved.id } : m)));
        const infos = await processCanvases(clean, convId, saved.id, canvases, false);
        if (infos.length) {
          const withCanvas = { ...meta, canvases: infos };
          setMessages((prev) => prev.map((m) => (m.id === saved.id ? { ...m, meta: withCanvas } : m)));
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

      const history = [...messagesRef.current, userMsg];
      setMessages(history);

      let saveUser = Promise.resolve();
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
          setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, id: saved.id, attachments: metas } : m)));
        })().catch((e) => showToast(`Gagal menyimpan pesan: ${e.message}`, 'error'));
      }

      try {
        return await runAssistant(convId, history, saveUser);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, incognito, newProjectId, webSearch, profile, project, uid]
  );

  const regenerate = async () => {
    if (busyRef.current) return;
    const list = [...messagesRef.current];
    const last = list[list.length - 1];
    if (last?.role === 'assistant') {
      list.pop();
      if (last.id && !String(last.id).startsWith('ai-')) {
        try {
          await db.deleteMessage(last.id);
        } catch {
          /* abaikan */
        }
      }
    }
    if (!list.length || list[list.length - 1].role !== 'user') return;
    if (!settings.keys[settings.provider]) {
      showToast('Tambahkan API key dulu', 'error');
      navigate('/settings/keys');
      return;
    }
    setMessages(list);
    busyRef.current = true;
    setBusy(true);
    try {
      await runAssistant(convRef.current?.id, list, Promise.resolve());
    } catch {
      /* sudah ditampilkan */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

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

  const shareChat = async () => {
    const body = messages
      .map((m) => `${m.role === 'user' ? 'Saya' : 'A.I.DRIY'}:\n${m.role === 'user' ? m.content : plainText(m.content)}`)
      .join('\n\n');
    try {
      await shareText(conv?.title || 'Chat A.I.DRIY', body);
    } catch {
      /* dibatalkan */
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
        onClose: () => setCanvasOpen(null),
        onLocalChange: canvasOpen.localId
          ? (patch) => {
              const cur = localCanvasesRef.current.get(canvasOpen.localId);
              if (cur) localCanvasesRef.current.set(canvasOpen.localId, { ...cur, ...patch });
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
            {messages.map((m, i) => (
              <Message
                key={m.id}
                msg={m}
                isLast={i === messages.length - 1}
                busy={busy}
                onRegenerate={m.role === 'assistant' ? regenerate : undefined}
                onOpenCanvas={openCanvas}
                onCanvasConflict={resolveCanvasConflict}
                onRetryImages={retryImages}
                voice={settings.voice}
              />
            ))}
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
            <CanvasView key={canvasOpen.id || canvasOpen.localId || 'legacy'} docked {...canvasProps} />
          </aside>
        </>
      )}
      {canvasProps && !wide && <CanvasView key={canvasOpen.id || canvasOpen.localId || 'legacy'} {...canvasProps} />}

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
            onClick={() => {
              setSheet(null);
              shareChat();
            }}
          />
        </Group>
        <Group>
          <Row icon={<Trash2 size={22} strokeWidth={1.6} />} title="Hapus chat" danger onClick={() => setSheet('delete')} />
        </Group>
      </Sheet>

      <Sheet open={sheet === 'project'} onClose={() => setSheet(null)} title="Pilih proyek">
        <Group>
          <Row icon={<X size={22} strokeWidth={1.6} />} title="Tanpa proyek" onClick={() => chooseProject(null)} right={!project ? <Check size={20} /> : null} />
          {projects.map((p) => (
            <Row
              key={p.id}
              icon={<FolderClosed size={22} strokeWidth={1.6} />}
              title={p.name}
              subtitle={p.description}
              onClick={() => chooseProject(p.id)}
              right={project?.id === p.id ? <Check size={20} /> : null}
            />
          ))}
        </Group>
        {projects.length === 0 && <p className="muted pad">Belum ada proyek. Buat dari menu Proyek.</p>}
      </Sheet>

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
