package bot.bops.watch

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.io.File
import java.security.MessageDigest

/**
 * Receives watch-app updates the Bops phone app sends (ChannelClient path /bops/update-apk/<versionCode>/<sha256>),
 * re-checks the SHA-256 here, and keeps the file for WatchActivity's "Install update" button. Also answers the
 * phone's "/bops/watch-version" question. Only the same app, signed with the same key, on the user's own phone
 * can reach this (Wear OS Data Layer rule), and Android refuses an update signed with a different key anyway.
 */
class UpdateReceiver : WearableListenerService() {

    override fun onRequest(nodeId: String, path: String, request: ByteArray): Task<ByteArray>? =
        if (path == "/bops/watch-version") Tasks.forResult(versionCode(this).toString().toByteArray()) else null

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        val m = PATH.matchEntire(channel.path) ?: return
        val version = m.groupValues[1].toInt()
        if (version <= versionCode(this)) return // nothing newer to offer
        val part = File(filesDir, "update.part").apply { delete() }
        pending[channel.path] = Incoming(version, m.groupValues[2], part)
        Wearable.getChannelClient(this).receiveFile(channel, Uri.fromFile(part), false)
    }

    override fun onInputClosed(channel: ChannelClient.Channel, closeReason: Int, appSpecificErrorCode: Int) {
        val got = pending.remove(channel.path) ?: return
        if (closeReason != ChannelClient.ChannelCallback.CLOSE_REASON_NORMAL || !got.file.isFile || got.file.length() > MAX) { got.file.delete(); return }
        val sha = MessageDigest.getInstance("SHA-256").digest(got.file.readBytes()).joinToString("") { "%02x".format(it) }
        if (sha != got.sha256) { got.file.delete(); return }
        val ready = readyFile(this)
        ready.delete()
        if (got.file.renameTo(ready)) getSharedPreferences("update", MODE_PRIVATE).edit().putInt("version", got.version).apply()
    }

    private data class Incoming(val version: Int, val sha256: String, val file: File)

    companion object {
        private val PATH = Regex("^/bops/update-apk/(\\d{1,9})/([0-9a-f]{64})$")
        private const val MAX = 60L * 1024 * 1024
        private val pending = java.util.concurrent.ConcurrentHashMap<String, Incoming>()

        fun readyFile(context: Context) = File(context.filesDir, "update.apk")
        /** The version waiting to be installed, or null. */
        fun readyVersion(context: Context): Int? {
            val v = context.getSharedPreferences("update", MODE_PRIVATE).getInt("version", 0)
            return if (v > versionCode(context) && readyFile(context).isFile) v else null
        }
        fun versionCode(context: Context): Long =
            context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
    }
}
