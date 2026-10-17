package com.aidriy.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;

/** Foreground service ringan: menjaga proses & jaringan tetap hidup selama AI bekerja. */
public class KeepAliveService extends Service {

    static final String ACTION_START = "com.aidriy.app.KEEPALIVE_START";
    static final String ACTION_UPDATE = "com.aidriy.app.KEEPALIVE_UPDATE";
    static final int NOTIFICATION_ID = 1001;
    static volatile boolean running = false;

    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        KeepAlivePlugin.createChannels(this);
        String title = intent != null ? intent.getStringExtra("title") : null;
        String text = intent != null ? intent.getStringExtra("text") : null;
        Notification n = build(title != null ? title : "A.I.DRIY sedang bekerja", text != null ? text : "");
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aidriy:work");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null) wakeLock.acquire(30 * 60 * 1000L); // batas aman 30 menit
        return START_NOT_STICKY;
    }

    /** Perbarui teks notifikasi yang sedang tampil tanpa memulai ulang service (aman saat di latar belakang). */
    static void updateNotification(Context ctx, String title, String text) {
        if (!running) return;
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, build(ctx, title, text));
        } catch (SecurityException ignored) {
        }
    }

    private Notification build(String title, String text) {
        return build(this, title, text);
    }

    private static Notification build(Context ctx, String title, String text) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(ctx, KeepAlivePlugin.CHANNEL_WORK)
            .setSmallIcon(R.drawable.ic_stat_aidriy)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(0, 0, true)
            .setContentIntent(pi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .build();
    }

    // Android 15: batas waktu foreground service tercapai → berhenti dengan rapi. (tanpa @Override agar tetap
    // bisa dikompilasi dengan SDK lama)
    public void onTimeout(int startId, int fgsType) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
