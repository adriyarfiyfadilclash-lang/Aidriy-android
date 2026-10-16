import { useCallback, useEffect, useRef, useState } from 'react';

const HAS_HIGHLIGHT = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof window !== 'undefined' && 'Highlight' in window;
// Bagian yang bukan isi pesan (tombol aksi, label model, dsb.) tidak ikut dicari.
const SKIP = '.msg-actions, .fb-reasons, .cb-actions, .gen-image-bar, .thinking-toggle, .src-num, .cite, button.cb-btn, .msg-model';

function collectRanges(root, query) {
  const q = query.toLowerCase();
  const ranges = [];
  if (!root || !q) return ranges;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.toLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + q.length);
      ranges.push(r);
      i = text.indexOf(q, i + q.length);
    }
  }
  return ranges;
}

/**
 * Cari teks di dalam percakapan yang sedang dibuka (pesan pengguna & jawaban AI).
 * Sorotan memakai CSS Custom Highlight API (tanpa mengubah DOM), dengan cadangan seleksi teks.
 */
export default function useChatSearch({ rootRef, scrollRef, active, query, version, onNavigate }) {
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const rangesRef = useRef([]);
  const indexRef = useRef(0);
  const lastQueryRef = useRef('');

  const clear = useCallback(() => {
    if (HAS_HIGHLIGHT) {
      CSS.highlights.delete('chat-search');
      CSS.highlights.delete('chat-search-current');
    }
    rangesRef.current = [];
  }, []);

  const reveal = useCallback(
    (i) => {
      const r = rangesRef.current[i];
      const scroller = scrollRef.current;
      if (!r || !scroller) return;
      if (HAS_HIGHLIGHT) CSS.highlights.set('chat-search-current', new Highlight(r));
      else {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      const rect = r.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      if (rect.top < box.top + 60 || rect.bottom > box.bottom - 60) {
        onNavigate?.();
        scroller.scrollTo({ top: scroller.scrollTop + rect.top - box.top - box.height / 3, behavior: 'smooth' });
      }
    },
    [scrollRef, onNavigate]
  );

  // Hitung ulang saat kata kunci atau isi percakapan berubah
  useEffect(() => {
    if (!active) {
      lastQueryRef.current = '';
      clear();
      setCount(0);
      setIndex(0);
      return undefined;
    }
    const t = setTimeout(() => {
      const q = query.trim();
      const ranges = q.length >= 1 ? collectRanges(rootRef.current, q) : [];
      rangesRef.current = ranges;
      if (HAS_HIGHLIGHT) {
        if (ranges.length) CSS.highlights.set('chat-search', new Highlight(...ranges));
        else CSS.highlights.delete('chat-search');
        CSS.highlights.delete('chat-search-current');
      }
      setCount(ranges.length);
      const sameQuery = lastQueryRef.current === q;
      lastQueryRef.current = q;
      if (sameQuery && ranges.length) {
        // Isi chat berubah (mis. streaming): pertahankan posisi tanpa menggulir.
        const keep = Math.min(indexRef.current, ranges.length - 1);
        indexRef.current = keep;
        setIndex(keep);
        if (HAS_HIGHLIGHT) CSS.highlights.set('chat-search-current', new Highlight(ranges[keep]));
        return;
      }
      // Kata kunci baru: mulai dari hasil terbaru (paling bawah).
      const start = ranges.length ? ranges.length - 1 : 0;
      indexRef.current = start;
      setIndex(start);
      if (ranges.length) reveal(start);
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, query, version]);

  useEffect(() => clear, [clear]);

  const go = useCallback(
    (delta) => {
      const n = rangesRef.current.length;
      if (!n) return;
      const next = (indexRef.current + delta + n) % n;
      indexRef.current = next;
      setIndex(next);
      reveal(next);
    },
    [reveal]
  );

  return { count, index, next: () => go(1), prev: () => go(-1), supported: HAS_HIGHLIGHT };
}
