# A.I.DRIY

Asisten AI pribadi untuk Android: chat dengan riwayat, Proyek, Artefak (halaman/game/diagram yang bisa dibuka & disimpan), unggah foto/kamera/berkas, pencarian web, dikte & mode suara, memori, serta pengaturan lengkap.

## Memasang di HP

1. Buka halaman **Releases** repo ini dari HP Android.
2. Unduh berkas `AIDRIY-v1.0.x.apk` terbaru dan buka.
3. Izinkan "Pasang aplikasi tidak dikenal" bila diminta.

Setiap perubahan yang di-push ke `main` otomatis membangun APK baru (GitHub Actions → Releases). Versi baru bisa dipasang langsung di atas versi lama.

## Teknologi

- React + Vite, dibungkus Capacitor 7 menjadi aplikasi Android
- Supabase (proyek `aidriy-chat`) untuk login dan penyimpanan chat, proyek, artefak, memori, lampiran
- Penyedia AI (API key milik pengguna, disimpan hanya di HP): Anthropic, Google Gemini, OpenAI, OpenRouter

## Pengembangan

```bash
npm install --legacy-peer-deps
npm run dev
```
