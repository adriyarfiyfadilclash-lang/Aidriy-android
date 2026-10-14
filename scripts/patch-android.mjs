// Menambahkan izin & deklarasi yang dibutuhkan ke proyek Android hasil `npx cap add android`.
import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.MODIFY_AUDIO_SETTINGS',
];
for (const p of permissions) {
  if (!xml.includes(`"${p}"`)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}

if (!xml.includes('android.speech.RecognitionService')) {
  xml = xml.replace(
    '</manifest>',
    `    <queries>
        <intent>
            <action android:name="android.speech.RecognitionService" />
        </intent>
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
        <intent>
            <action android:name="android.media.action.IMAGE_CAPTURE" />
        </intent>
    </queries>
</manifest>`
  );
}

fs.writeFileSync(manifestPath, xml);
console.log('AndroidManifest diperbarui');

// Versi aplikasi dari nomor build CI agar update bisa dipasang di atas versi lama.
const buildGradle = 'android/app/build.gradle';
const run = Number(process.env.BUILD_NUMBER || 1);
let gradle = fs.readFileSync(buildGradle, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "1.0.${run}"`);
fs.writeFileSync(buildGradle, gradle);
console.log(`Versi diatur ke 1.0.${run} (${run})`);
