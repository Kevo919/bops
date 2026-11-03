package bot.bops.remote

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Tells you when your bots need you, while the app is closed: every minute it asks your Bops what's
 * worth a notification (GET /api/pings, the same list the Bops window chimes for: a bot waiting for your
 * OK, a finished task you're waiting on, news that can't wait) and shows the new ones. Android only lets
 * an app keep doing that with a notification of its own on show ("Bops is keeping watch"), kept quiet.
 *
 * Nothing goes through Google or anyone else: the phone asks your own Bops, with its pairing code, over
 * Tailscale or https. Turn it off from that notification, or in the app's notification settings.
 */
class PingService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("bops", MODE_PRIVATE) }

    private val tick = object : Runnable {
        override fun run() {
            thread { check() }
            handler.postDelayed(this, EVERY_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            prefs.edit().putBoolean("notify", false).apply()
            stopSelf()
            return START_NOT_STICKY
        }
        channels()
        val watching = Notification.Builder(this, QUIET)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Bops is keeping watch")
            .setContentText("You'll hear when a bot needs you.")
            .setContentIntent(openApp())
            .addAction(Notification.Action.Builder(null, "Stop", PendingIntent.getService(this, 1, Intent(this, PingService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)).build())
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(WATCHING_ID, watching, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(WATCHING_ID, watching)
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    /** One look: new pings become notifications; the ones seen before are remembered (by key), not shown again. */
    private fun check() {
        val address = prefs.getString("address", null) ?: return
        val code = prefs.getString("code", null) ?: return
        try {
            val c = (URL("$address/api/pings").openConnection() as HttpURLConnection).apply {
                connectTimeout = 10000; readTimeout = 15000
                setRequestProperty("Cookie", "bops_remote=$code")
            }
            if (c.responseCode != 200) return
            val list = JSONObject(c.inputStream.bufferedReader().readText()).getJSONArray("pings")
            val seen = prefs.getStringSet("seen", null)
            val now = (0 until list.length()).map { list.getJSONObject(it) }
            // The first look only learns what's already there: nothing old buzzes the phone.
            if (seen != null) {
                val nm = getSystemService(NotificationManager::class.java)
                for (p in now) {
                    val key = p.getString("key")
                    if (key in seen) continue
                    nm.notify(key.hashCode(), Notification.Builder(this, ALERTS)
                        .setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentTitle(p.optString("title", "Bops"))
                        .setContentText(p.optString("body"))
                        .setStyle(Notification.BigTextStyle().bigText(p.optString("body")))
                        .setContentIntent(openApp())
                        .setAutoCancel(true)
                        .build())
                }
            }
            // Kept to what's still listed, so the set doesn't grow for ever.
            prefs.edit().putStringSet("seen", now.map { it.getString("key") }.toSet()).apply()
        } catch (_: Exception) {
            // Out of reach for now (no Tailscale, PC asleep): try again next minute.
        }
    }

    private fun openApp() = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)

    private fun channels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(ALERTS, "When a bot needs you", NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(QUIET, "Keeping watch", NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
    }

    companion object {
        private const val EVERY_MS = 60_000L
        private const val WATCHING_ID = 1
        private const val ALERTS = "alerts"
        private const val QUIET = "watching"
        private const val STOP = "bot.bops.remote.STOP"

        /** Start it when the phone is paired and notifications are on (the default). */
        fun startIfWanted(context: Context) {
            val p = context.getSharedPreferences("bops", Context.MODE_PRIVATE)
            if (p.getString("code", null) == null || !p.getBoolean("notify", true)) return
            context.startForegroundService(Intent(context, PingService::class.java))
        }
    }
}

/** After the phone restarts, keep watch again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) PingService.startIfWanted(context)
    }
}
