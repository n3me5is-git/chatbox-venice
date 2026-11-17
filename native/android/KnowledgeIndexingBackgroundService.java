package io.github.n3me5is.chatboxvenice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** User-enabled knowledge indexing service. Never restarts a sharing session. */
public class KnowledgeIndexingBackgroundService extends Service {
    private static final String CHANNEL = "chatbox_knowledge_indexing";
    private PowerManager.WakeLock wakeLock;
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String title = intent.getStringExtra("title"), text = intent.getStringExtra("text");
        if (title == null) title = "Knowledge indexing is active";
        if (text == null) text = "Open the app to view or stop indexing.";
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW));
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification notification = builder.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle(title).setContentText(text).setContentIntent(open).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
        startForeground(13502, notification);
        if (wakeLock == null) {
            wakeLock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":knowledge-indexing");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) wakeLock.acquire(6 * 60 * 60 * 1000L);
        KnowledgeIndexingBackgroundPlugin.active = true;
        return START_NOT_STICKY;
    }
    @Override public void onTimeout(int startId, int fgsType) { stopSelf(); }
    @Override public void onTaskRemoved(Intent rootIntent) { stopSelf(); }
    @Override public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        KnowledgeIndexingBackgroundPlugin.active = false;
        KnowledgeIndexingBackgroundPlugin.ended();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
