import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Perilaku gulir chat seperti ChatGPT:
 * - Mengikuti pesan terbaru (streaming, gambar dimuat, tinggi konten berubah) selama pengguna di bawah.
 * - Berhenti mengikuti begitu pengguna menggulir ke atas.
 * - `showButton` true bila posisi cukup jauh dari bawah (dideteksi IntersectionObserver pada penanda di ujung daftar).
 *
 * Deteksi efisien: IntersectionObserver untuk "dekat bawah", ResizeObserver untuk perubahan tinggi,
 * dan satu listener scroll pasif yang hanya membaca scrollTop untuk mengenali gulir ke atas.
 */
export default function useStickToBottom({ threshold = 160, enabled = true } = {}) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const sentinelRef = useRef(null);
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);
  const [showButton, setShowButton] = useState(false);
  const [nodes, setNodes] = useState({ scroll: null, content: null, sentinel: null });

  // Callback ref supaya observer dipasang ulang saat elemen berganti (chat kosong ↔ berisi).
  const setScroll = useCallback((el) => {
    scrollRef.current = el;
    setNodes((n) => (n.scroll === el ? n : { ...n, scroll: el }));
  }, []);
  const setContent = useCallback((el) => {
    contentRef.current = el;
    setNodes((n) => (n.content === el ? n : { ...n, content: el }));
  }, []);
  const setSentinel = useCallback((el) => {
    sentinelRef.current = el;
    setNodes((n) => (n.sentinel === el ? n : { ...n, sentinel: el }));
  }, []);

  const jump = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Dekat bawah atau tidak
  useEffect(() => {
    const { scroll, sentinel } = nodes;
    if (!enabled || !scroll || !sentinel || typeof IntersectionObserver === 'undefined') {
      setShowButton(false);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        const near = entry.isIntersecting;
        if (near) stickRef.current = true;
        setShowButton(!near);
      },
      { root: scroll, rootMargin: `0px 0px ${threshold}px 0px`, threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [nodes, threshold, enabled]);

  // Tinggi konten / ukuran layar berubah → tetap di bawah bila sedang mengikuti
  useEffect(() => {
    const { scroll, content } = nodes;
    if (!scroll || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) jump();
    });
    ro.observe(scroll);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [nodes, jump]);

  // Pengguna menggulir ke atas → berhenti mengikuti (pasif, tanpa kerja berat)
  useEffect(() => {
    const el = nodes.scroll;
    if (!el) return undefined;
    lastTopRef.current = el.scrollTop;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const top = el.scrollTop;
        if (top < lastTopRef.current - 2 && el.scrollHeight - top - el.clientHeight > threshold / 2) stickRef.current = false;
        lastTopRef.current = top;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [nodes.scroll, threshold]);

  /** Turun ke pesan paling bawah dengan animasi halus, lalu ikuti lagi pesan baru. */
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  /** Mulai ulang mengikuti (mis. setelah mengirim pesan atau membuka chat). */
  const stick = useCallback(() => {
    stickRef.current = true;
    requestAnimationFrame(jump);
  }, [jump]);

  /** Dipanggil setelah isi berubah (useLayoutEffect) supaya tetap di bawah sebelum layar digambar. */
  const follow = useCallback(() => {
    if (stickRef.current) jump();
  }, [jump]);

  /** Berhenti mengikuti (mis. saat melompat ke hasil pencarian). */
  const unstick = useCallback(() => {
    stickRef.current = false;
  }, []);

  return { setScroll, setContent, setSentinel, scrollRef, contentRef, stickRef, showButton, scrollToBottom, stick, unstick, follow };
}
