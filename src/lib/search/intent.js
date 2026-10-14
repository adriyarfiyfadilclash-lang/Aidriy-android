// Mengenali permintaan gambar langsung dari pesan pengguna,
// sebagai cadangan bila model tidak menulis tag <image_search>.

const TRIGGER =
  /\b(tampilkan|tunjukkan|tunjukin|carikan|cariin|cari|kirimkan|kirim|lihatkan|perlihatkan|kasih|berikan|minta)\b[^.?!\n]{0,20}?\b(gambar|foto|image|images|picture|pictures|photo|photos)\b|\b(gambar|foto)\s+(dari|tentang|soal|si|sebuah|seekor)\b|\bshow\s+(me\s+)?(some\s+|a\s+few\s+)?(images?|pictures?|photos?)\b|\b(images?|pictures?|photos?)\s+of\b/i;

export function isImageRequest(text) {
  return TRIGGER.test(text || '');
}

/** Mengambil topik dari "Tampilkan gambar kucing persia" -> "kucing persia". */
export function imageQueryFromText(text) {
  if (!isImageRequest(text)) return null;
  let q = String(text)
    .split('\n')[0]
    .replace(/^(tolong|coba|dong|please|hei|hai|halo)[,\s]+/i, '')
    .replace(
      /^.*?\b(gambar|foto|images?|pictures?|photos?)\b\s*(dari|tentang|soal|mengenai|of|about|untuk|si|sebuah|seekor|beberapa)?\s*/i,
      ''
    )
    .replace(/\b(dong|ya|yuk|please|pls|plis|aja|saja)\b/gi, '')
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (q.length < 2) return null;
  return q.slice(0, 120);
}
