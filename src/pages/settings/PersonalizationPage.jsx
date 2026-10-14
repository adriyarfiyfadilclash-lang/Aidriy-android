import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { useApp } from '../../state';
import * as db from '../../lib/db';
import {
  DEFAULT_PERSONALIZATION,
  LEVEL_FIELDS,
  STYLE_OPTIONS,
  VISUAL_OPTIONS,
  labelOf,
  normalizePersonalization,
} from '../../lib/personalization';
import { tap } from '../../lib/native';
import { ConfirmDialog, IconButton, Toggle } from '../../components/ui';
import Popover from '../../components/Popover';

function SelectRow({ label, value, options, open, onOpen }) {
  return (
    <button type="button" className={`p-row ${open ? 'open' : ''}`} onClick={(e) => onOpen(e.currentTarget)}>
      <span className="p-row-label">{label}</span>
      <span className="p-row-value">{labelOf(options, value)}</span>
      <ChevronDown size={18} className="p-row-chevron" />
    </button>
  );
}

export default function PersonalizationPage() {
  const navigate = useNavigate();
  const { uid, profile, setProfile, settings, setSettings, showToast } = useApp();
  const saved = useMemo(() => normalizePersonalization(settings.personalization), [settings.personalization]);
  const [form, setForm] = useState(saved);
  const [menu, setMenu] = useState(null); // { key, anchor, options }
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);

  useEffect(() => setForm(saved), [saved]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!dirty || busy) return;
    tap('medium');
    setBusy(true);
    const p = normalizePersonalization(form);
    try {
      const next = await db.updateProfile(uid, { settings: { ...(profile?.settings || {}), personalization: p } });
      setProfile(next);
      setSettings({ personalization: p });
      showToast('Personalisasi disimpan');
      navigate(-1);
    } catch (e) {
      showToast(`Gagal menyimpan: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const back = () => (dirty ? setLeaveAsk(true) : navigate(-1));
  const openMenu = (key, options) => (anchor) => setMenu({ key, anchor, options });

  return (
    <div className="page p-page">
      <header className="p-head">
        <IconButton label="Kembali" onClick={back} className="p-round">
          <ArrowLeft size={24} strokeWidth={1.75} />
        </IconButton>
        <div className="p-head-title">Personalisasi</div>
        <IconButton label="Simpan" onClick={save} className={`p-round ${dirty ? 'active' : ''}`} disabled={!dirty || busy}>
          {busy ? <span className="spinner small" /> : <Check size={24} strokeWidth={2} />}
        </IconButton>
      </header>

      <main className="page-scroll p-scroll">
        <div className="p-card">
          <SelectRow label="Gaya dan nada dasar" value={form.style} options={STYLE_OPTIONS} open={menu?.key === 'style'} onOpen={openMenu('style', STYLE_OPTIONS)} />
        </div>
        <p className="p-note">Mengatur cara A.I.DRIY berbicara. Isi dan ketelitian jawaban tetap sama.</p>

        <div className="p-card">
          {LEVEL_FIELDS.map((f) => (
            <SelectRow key={f.key} label={f.label} value={form[f.key]} options={f.options} open={menu?.key === f.key} onOpen={openMenu(f.key, f.options)} />
          ))}
        </div>

        <div className="p-card">
          <div className="p-row static">
            <span className="p-row-label">Jawaban cepat</span>
            <Toggle checked={form.quickAnswers} onChange={(v) => set('quickAnswers', v)} label="Jawaban cepat" />
          </div>
        </div>
        <p className="p-note">Pertanyaan pendek dan sederhana dijawab tanpa mode berpikir supaya lebih cepat dan hemat. Permintaan panjang, kode, atau dokumen tetap memakai tingkat berpikir pilihanmu.</p>

        <div className="p-card">
          <SelectRow label="Jawaban visual" value={form.visual} options={VISUAL_OPTIONS} open={menu?.key === 'visual'} onOpen={openMenu('visual', VISUAL_OPTIONS)} />
        </div>
        <p className="p-note">Izinkan A.I.DRIY membuat Canvas dan menampilkan galeri gambar bila bermanfaat. "Sederhana" hanya memakainya saat kamu memintanya.</p>

        <div className="p-section">Instruksi khusus</div>
        <div className="p-card">
          <textarea
            className="p-textarea"
            rows={6}
            maxLength={3000}
            value={form.customInstructions}
            onChange={(e) => set('customInstructions', e.target.value)}
            placeholder={'Contoh: Jangan cuma menyetujui pendapat saya. Jadilah teman diskusi yang kritis: tunjukkan asumsi yang lemah dan beri sudut pandang lain.'}
          />
        </div>
        <p className="p-note right">{form.customInstructions.length}/3000</p>

        <button type="button" className="p-section p-toggle" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
          Tingkat lanjut <ChevronDown size={18} className={advanced ? 'rot' : ''} />
        </button>
        {advanced && (
          <>
            <div className="p-card">
              <div className="p-row static">
                <span className="p-row-label">
                  Memori
                  <span className="p-row-sub">AI mengingat fakta penting tentangmu antar chat</span>
                </span>
                <Toggle checked={settings.memory} onChange={(v) => setSettings({ memory: v })} label="Memori" />
              </div>
              <button
                type="button"
                className="p-row"
                onClick={() => {
                  setForm({ ...DEFAULT_PERSONALIZATION });
                  showToast('Dikembalikan ke bawaan. Tekan ✓ untuk menyimpan.');
                }}
              >
                <span className="p-row-label danger-text">Kembalikan semua ke bawaan</span>
              </button>
            </div>
          </>
        )}
      </main>

      {menu && (
        <Popover
          anchor={menu.anchor}
          options={menu.options}
          value={form[menu.key]}
          onSelect={(v) => set(menu.key, v)}
          onClose={() => setMenu(null)}
        />
      )}
      <ConfirmDialog
        open={leaveAsk}
        onClose={() => setLeaveAsk(false)}
        title="Buang perubahan?"
        message="Perubahan personalisasi belum disimpan."
        confirmLabel="Buang"
        onConfirm={() => navigate(-1)}
      />
    </div>
  );
}
