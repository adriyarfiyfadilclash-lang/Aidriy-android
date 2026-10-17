package com.aidriy.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Menjaga proses A.I.DRIY tetap hidup selama AI bekerja (foreground service + notifikasi),
 * dan memberi notifikasi saat hasil selesai ketika aplikasi sedang di latar belakang.
 */
@CapacitorPlugin(
    name = "KeepAlive",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class KeepAlivePlugin extends Plugin {

    static final String CHANNEL_WORK = "aidriy_work";
    static final String CHANNEL_DONE = "aidriy_done";
    static final String EXTRA_CONVERSATION = "aidriy_conversation";

    @Override
    public void load() {
        createChannels(getContext());
        handleIntent(getActivity() != null ? getActivity().getIntent() : null);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String id = intent.getStringExtra(EXTRA_CONVERSATION);
        if (id == null) return;
        intent.removeExtra(EXTRA_CONVERSATION);
        JSObject data = new JSObject();
        data.put("conversationId", id);
        notifyListeners("open", data, true);
    }

    static void createChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel work = new NotificationChannel(CHANNEL_WORK, "Proses yang sedang berjalan", NotificationManager.IMPORTANCE_LOW);
        work.setDescription("Ditampilkan selama A.I.DRIY menulis jawaban atau membuat sesuatu di latar belakang");
        work.setShowBadge(false);
        nm.createNotificationChannel(work);
        NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Hasil selesai", NotificationManager.IMPORTANCE_DEFAULT);
        done.setDescription("Memberi tahu saat jawaban atau hasil selesai dibuat");
        nm.createNotificationChannel(done);
    }

    private Intent serviceIntent(String action, PluginCall call) {
        Intent it = new Intent(getContext(), KeepAliveService.class);
        it.setAction(action);
        it.putExtra("title", call.getString("title", "A.I.DRIY sedang bekerja"));
        it.putExtra("text", call.getString("text", "Proses tetap berjalan walau aplikasi ditinggal"));
        it.putExtra(EXTRA_CONVERSATION, call.getString("conversationId"));
        return it;
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            ContextCompat.startForegroundService(getContext(), serviceIntent(KeepAliveService.ACTION_START, call));
            call.resolve();
        } catch (Exception e) {
            call.reject("Tidak bisa menjalankan proses latar belakang: " + e.getMessage());
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        if (!KeepAliveService.running) {
            call.resolve();
            return;
        }
        KeepAliveService.updateNotification(getContext(), call.getString("title", "A.I.DRIY sedang bekerja"), call.getString("text", ""));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), KeepAliveService.class));
        call.resolve();
    }

    @PluginMethod
    public void notifyDone(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.resolve();
            return;
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String conv = call.getString("conversationId");
        if (conv != null) open.putExtra(EXTRA_CONVERSATION, conv);
        int reqCode = conv != null ? conv.hashCode() : 2;
        PendingIntent pi = PendingIntent.getActivity(ctx, reqCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_DONE)
            .setSmallIcon(R.drawable.ic_stat_aidriy)
            .setContentTitle(call.getString("title", "Selesai"))
            .setContentText(call.getString("text", ""))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(call.getString("text", "")))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try {
            NotificationManagerCompat.from(ctx).notify(2000 + Math.abs(reqCode % 1000), b.build());
        } catch (SecurityException ignored) {
        }
        call.resolve();
    }
}
