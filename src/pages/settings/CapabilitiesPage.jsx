import { useEffect, useRef, useState } from 'react';
import { Brain, DatabaseZap, Globe, Images, Lightbulb, RefreshCw, Shapes, Sparkles, Trash2 } from 'lucide-react';
import { chunkCount, clearIndex, reindexAll } from '../../lib/semantic';
import { IMAGE_MODELS } from '../../lib/nvidiaTools';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../state';
import { EFFORTS } from '../../lib/providers';
import { tap } from '../../lib/native';
import { ChoiceDialog, ConfirmDialog, Group, Row, Toggle, TopBar } from '../../components/ui';

export default function CapabilitiesPage() {
  const { settings, setSettings, showToast } = useApp();
  const navigate = useNavigate();
  const [pickImage, setPickImage] = useState(false);
  const hasNvidia = !!settings.keys.nvidia;
  const [count, setCount] = useState(null);
  const [progress, setProgress] = useState(null); // { phase, done, total }
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (hasNvidia) chunkCount().then(setCount).catch(() => setCount(null));
    return () => abortRef.current?.abort();
  }, [hasNvidia]);

  const runIndex = async () => {
    if (progress) {
      abortRef.current?.abort();
      return;
    }
    tap('medium');
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ phase: 'Menyiapkan', done: 0, total: 1 });
    try {
      const r = await reindexAll(settings.keys.nvidia, { onProgress: setProgress, signal: controller.signal });
      showToast(`Selesai: ${r.messages} pesan, ${r.library} berkas, ${r.canvas} Canvas${r.failed ? ` · ${r.failed} gagal` : ''}`, r.failed ? 'error' : 'info');
    } catch (e) {
      if (e.name !== 'AbortError') showToast(`Pengindeksan gagal: ${e.message}`, 'error');
      else showToast('Pengindeksan dihentikan');
    } finally {
      setProgress(null);
      chunkCount().then(setCount).catch(() => {});
    }
  };
  const imageModel = IMAGE_MODELS.find((m) => m.id === settings.imageModel) || IMAGE_MODELS[0];
  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Kemampuan</span>} />
      <main className="page-scroll">
        <Group>
          <Row
            icon={<Globe size={24} strokeWidth={1.5} />}
            title="Pencarian web"
            subtitle="Bawaan untuk chat baru. Bisa diubah per chat lewat tombol +"
            right={<Toggle checked={settings.webSearch} onChange={(v) => setSettings({ webSearch: v })} label="Pencarian web" />}
            onClick={() => setSettings({ webSearch: !settings.webSearch })}
          />
          <Row
            icon={<Images size={24} strokeWidth={1.5} />}
            title="Pencarian gambar"
            subtitle="Tampilkan foto nyata dari internet beserta sumbernya"
            right={<Toggle checked={settings.imageSearch !== false} onChange={(v) => setSettings({ imageSearch: v })} label="Pencarian gambar" />}
            onClick={() => setSettings({ imageSearch: settings.imageSearch === false })}
          />
          <Row
            icon={<Shapes size={24} strokeWidth={1.5} />}
            title="Canvas"
            subtitle="Hasil siap pakai (email, dokumen, kode, halaman web) dibuat terpisah, bisa disunting & disalin"
            right={<Toggle checked={settings.artifacts} onChange={(v) => setSettings({ artifacts: v })} label="Canvas" />}
            onClick={() => setSettings({ artifacts: !settings.artifacts })}
          />
          <Row
            icon={<Brain size={24} strokeWidth={1.5} />}
            title="Memori"
            subtitle="AI mengingat fakta penting tentangmu antar chat"
            right={<Toggle checked={settings.memory} onChange={(v) => setSettings({ memory: v })} label="Memori" />}
            onClick={() => navigate('/settings/memory')}
          />
        </Group>

        <div className="section-title">
          <Lightbulb size={16} /> Tingkat berpikir bawaan
        </div>
        <div className="segmented">
          {EFFORTS.map((e) => (
            <button
              key={e.id}
              type="button"
              className={settings.effort === e.id ? 'on' : ''}
              onClick={() => {
                tap();
                setSettings({ effort: e.id });
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p className="muted small pad-x">
          "Sedang" dan "Tinggi" membuat AI berpikir dulu sebelum menjawab: lebih teliti tetapi lebih lambat dan lebih mahal. Jika model tidak mendukung, A.I.DRIY otomatis menjawab tanpa mode berpikir.
        </p>
        <div className="section-title">
          <DatabaseZap size={16} /> Pencarian makna & Pustaka pintar (NVIDIA)
        </div>
        <Group>
          <Row
            icon={<DatabaseZap size={24} strokeWidth={1.5} />}
            title="Pencarian berdasarkan makna"
            subtitle={hasNvidia ? 'Cari chat & Pustaka dari maksudnya, dan jawab pertanyaan dari isi dokumen' : 'Butuh API key NVIDIA'}
            right={<Toggle checked={hasNvidia && settings.semantic !== false} onChange={(v) => setSettings({ semantic: v })} label="Pencarian berdasarkan makna" />}
            onClick={() => hasNvidia && setSettings({ semantic: settings.semantic === false })}
          />
          {hasNvidia && settings.semantic !== false && (
            <>
              <Row
                icon={<RefreshCw size={24} strokeWidth={1.5} className={progress ? 'spin' : ''} />}
                title={progress ? `Mengindeks ${progress.phase}… ${progress.total > 1 ? `${progress.done}/${progress.total}` : ''}` : 'Indeks semua chat & Pustaka'}
                subtitle={progress ? 'Ketuk untuk menghentikan' : count === null ? 'Chat baru diindeks otomatis' : `${count.toLocaleString('id-ID')} potongan terindeks · chat baru diindeks otomatis`}
                onClick={runIndex}
              />
              {progress && progress.total > 1 && (
                <div className="index-progress" aria-hidden="true">
                  <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                </div>
              )}
              <Row icon={<Trash2 size={24} strokeWidth={1.5} />} title="Hapus indeks" subtitle="Chat dan berkasmu tetap aman" danger onClick={() => setConfirmClear(true)} />
            </>
          )}
        </Group>
        <p className="muted small intro">
          Untuk membuat indeks, teks chat, berkas Pustaka, dan Canvas dikirim ke NVIDIA (lewat relay A.I.DRIY) untuk diubah jadi vektor makna. Indeks disimpan di akunmu dan hanya
          bisa dibaca olehmu. PDF hasil scan dibaca dengan Nemotron Parse.
        </p>

        <Group>
          <Row
            icon={<Sparkles size={24} strokeWidth={1.5} />}
            title="Model pembuat gambar (NVIDIA)"
            subtitle={settings.keys.nvidia ? imageModel.label : `${imageModel.label} · butuh API key NVIDIA`}
            chevron
            onClick={() => {
              tap();
              setPickImage(true);
            }}
          />
        </Group>
      </main>
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Hapus indeks makna?"
        message="Pencarian makna dan jawaban dari Pustaka tidak akan menemukan apa pun sampai kamu mengindeks ulang. Chat dan berkas tidak ikut terhapus."
        confirmLabel="Hapus"
        onConfirm={async () => {
          try {
            await clearIndex();
            setCount(0);
            showToast('Indeks dihapus');
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
      <ChoiceDialog
        open={pickImage}
        onClose={() => setPickImage(false)}
        title="Model pembuat gambar"
        value={imageModel.id}
        options={IMAGE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
        onChange={(v) => setSettings({ imageModel: v })}
      />
    </div>
  );
}
