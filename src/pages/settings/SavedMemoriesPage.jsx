import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../state';
import * as db from '../../lib/db';
import { ConfirmDialog, Empty, IconButton, PromptDialog, TopBar } from '../../components/ui';

export default function SavedMemoriesPage() {
  const { uid, showToast } = useApp();
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(null); // {id?, content}
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await db.listMemories());
    } catch (e) {
      showToast(e.message, 'error');
      setItems([]);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <TopBar
        back
        title={<span className="serif-title">Memori tersimpan</span>}
        right={
          <IconButton label="Tambah memori" onClick={() => setEdit({ content: '' })}>
            <Plus size={26} strokeWidth={1.6} />
          </IconButton>
        }
      />
      <main className="page-scroll">
        <p className="muted intro">Fakta yang diingat A.I.DRIY dari chat atau yang kamu tambahkan sendiri. Semua ini dipakai saat memori aktif.</p>

        {items === null && (
          <div className="center-fill">
            <span className="spinner" />
          </div>
        )}
        {items?.length === 0 && (
          <Empty title="Belum ada memori" text='Ceritakan tentang dirimu di chat, atau ketik "ingat bahwa…". Kamu juga bisa menambah manual dengan tombol +.' />
        )}
        {items?.length > 0 && (
          <>
            <div className="section-title">{items.length} memori tersimpan</div>
            <div className="memory-list">
              {items.map((m) => (
                <div key={m.id} className="memory-item">
                  <span className="memory-text">{m.content}</span>
                  <IconButton label="Edit" onClick={() => setEdit(m)}>
                    <Pencil size={18} />
                  </IconButton>
                  <IconButton
                    label="Hapus"
                    onClick={async () => {
                      try {
                        await db.deleteMemory(m.id);
                        setItems((prev) => prev.filter((x) => x.id !== m.id));
                      } catch (e) {
                        showToast(e.message, 'error');
                      }
                    }}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost danger-text btn-block" onClick={() => setConfirmAll(true)}>
              Hapus semua memori
            </button>
          </>
        )}
      </main>

      <PromptDialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit memori' : 'Tambah memori'}
        initial={edit?.content}
        placeholder="Misal: Saya punya toko Shopify bernama DESKR"
        onSubmit={async (v) => {
          try {
            if (edit?.id) await db.updateMemory(edit.id, v);
            else await db.addMemories([v]);
            load();
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Hapus semua memori?"
        message="AI akan lupa semua yang sudah diingat tentangmu."
        onConfirm={async () => {
          try {
            await db.deleteAllMemories(uid);
            setItems([]);
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
    </div>
  );
}
