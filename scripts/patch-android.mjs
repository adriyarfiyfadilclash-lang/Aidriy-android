// Menambahkan izin & deklarasi yang dibutuhkan ke proyek Android hasil `npx cap add android`.
import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  // Proses tetap berjalan saat aplikasi ditinggal (foreground service + notifikasi)
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
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

if (!xml.includes('.KeepAliveService')) {
  xml = xml.replace(
    '</application>',
    `        <service
            android:name=".KeepAliveService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />
    </application>`
  );
}

fs.writeFileSync(manifestPath, xml);
console.log('AndroidManifest diperbarui');

// Plugin native buatan sendiri (KeepAlive) + MainActivity yang mendaftarkannya.
const javaDir = 'android/app/src/main/java/com/aidriy/app';
fs.mkdirSync(javaDir, { recursive: true });
for (const f of fs.readdirSync('native/android/java')) {
  fs.copyFileSync(`native/android/java/${f}`, `${javaDir}/${f}`);
}
const resDir = 'android/app/src/main/res/drawable';
fs.mkdirSync(resDir, { recursive: true });
for (const f of fs.readdirSync('native/android/res/drawable')) {
  fs.copyFileSync(`native/android/res/drawable/${f}`, `${resDir}/${f}`);
}
console.log('Plugin KeepAlive ditambahkan');

// Versi aplikasi dari nomor build CI agar update bisa dipasang di atas versi lama.
const buildGradle = 'android/app/build.gradle';
const run = Number(process.env.BUILD_NUMBER || 1);
let gradle = fs.readFileSync(buildGradle, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "1.0.${run}"`);
fs.writeFileSync(buildGradle, gradle);
console.log(`Versi diatur ke 1.0.${run} (${run})`);
