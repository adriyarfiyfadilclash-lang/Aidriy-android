import { useState } from 'react';
import { Download, KeyRound, MessageSquareX, Trash2 } from 'lucide-react';
import { useApp } from '../../state';
import * as db from '../../lib/db';
import { shareFile } from '../../lib/native';
import { ConfirmDialog, Group, Row, TopBar } from '../../components/ui';

export default function PrivacyPage() {
  const { uid, setSettings, refreshConversations, showToast } = useApp();
  const [confirm, setConfirm] = useState(null);

  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Privasi</span>} />
      <main className="page-scroll">
        <p className="muted intro">
          Chat, proyek, artefak, dan memori disimpan di database pribadimu (Supabase) dan hanya bisa dibaca oleh akunmu. API key tidak pernah dikirim ke database. Gunakan chat incognito (ikon hantu) untuk percakapan yang tidak disimpan.
        </p>
        <Group>
          <Row
            icon={<Download size={24} strokeWidth={1.5} />}
            title="Ekspor data"
            subtitle="Unduh semua chat & data sebagai JSON"
            onClick={async () => {
              try {
                showToast('Menyiapkan ekspor…');
                const data = await db.exportAll();
                await shareFile(`aidriy-ekspor-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
              } catch (e) {
                if (!/cancel/i.test(e.message || '')) showToast(e.message, 'error');
              }
            }}
          />
        </Group>
        <Group>
          <Row icon={<MessageSquareX size={24} strokeWidth={1.5} />} title="Hapus semua chat" danger onClick={() => setConfirm('chats')} />
          <Row icon={<Trash2 size={24} strokeWidth={1.5} />} title="Hapus semua memori" danger onClick={() => setConfirm('memories')} />
          <Row icon={<KeyRound size={24} strokeWidth={1.5} />} title="Hapus API key dari HP ini" danger onClick={() => setConfirm('keys')} />
        </Group>
      </main>

      <ConfirmDialog
        open={confirm === 'chats'}
        onClose={() => setConfirm(null)}
        title="Hapus semua chat?"
        message="Semua chat dan pesan dihapus permanen. Proyek dan artefak tetap ada."
        onConfirm={async () => {
          try {
            await db.deleteAllConversations(uid);
            await refreshConversations();
            showToast('Semua chat dihapus');
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'memories'}
        onClose={() => setConfirm(null)}
        title="Hapus semua memori?"
        onConfirm={async () => {
          try {
            await db.deleteAllMemories(uid);
            showToast('Memori dihapus');
          } catch (e) {
            showToast(e.message, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'keys'}
        onClose={() => setConfirm(null)}
        title="Hapus semua API key?"
        message="Kamu perlu memasukkan key lagi untuk memakai AI."
        onConfirm={() => {
          setSettings((s) => ({ ...s, keys: { anthropic: '', gemini: '', openai: '', openrouter: '' } }));
          showToast('API key dihapus');
        }}
      />
    </div>
  );
}
