package bot.bops.remote

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * The phone's view of the user's watches (Wear OS Data Layer), like FotMob's cross-device install:
 * which watches are connected, which already have the Bops watch app (it advertises capability "bops_watch"),
 * what version they run, and sending a verified update APK to the watch app, which installs it after the user taps OK.
 * Every call blocks: use from a background thread.
 */
object WatchLink {
    const val WATCH_CAPABILITY = "bops_watch"
    data class Watch(val id: String, val name: String, val hasApp: Boolean, val nearby: Boolean)

    fun watches(context: Context): List<Watch> = try {
        val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes, 10, TimeUnit.SECONDS)
        val withApp = Tasks.await(Wearable.getCapabilityClient(context).getCapability(WATCH_CAPABILITY, CapabilityClient.FILTER_ALL), 10, TimeUnit.SECONDS)
            .nodes.map { it.id }.toSet()
        nodes.map { Watch(it.id, it.displayName, it.id in withApp, it.isNearby) }
    } catch (_: Exception) {
        emptyList() // No Wear OS app on this phone, Play services missing, or no watch: nothing to offer.
    }

    /** The watch app's versionCode, or null if it doesn't answer. */
    fun watchVersion(context: Context, watch: Watch): Int? = try {
        val bytes = Tasks.await(Wearable.getMessageClient(context).sendRequest(watch.id, "/bops/watch-version", ByteArray(0)), 10, TimeUnit.SECONDS)
        String(bytes, Charsets.UTF_8).trim().toIntOrNull()
    } catch (_: Exception) { null }

    /**
     * Send [apk] to the watch app over the watch's own encrypted link. The path carries the version and SHA-256 so the watch
     * re-checks the file before offering to install it. Returns null on success, or what went wrong in plain words.
     */
    fun sendUpdate(context: Context, watch: Watch, apk: File, versionCode: Int, sha256: String): String? = try {
        val channels = Wearable.getChannelClient(context)
        val channel = Tasks.await(channels.openChannel(watch.id, "/bops/update-apk/$versionCode/$sha256"), 15, TimeUnit.SECONDS)
        Tasks.await(channels.sendFile(channel, Uri.fromFile(apk)), 120, TimeUnit.SECONDS)
        null
    } catch (_: Exception) {
        "Couldn't send the update to ${watch.name}. Keep the watch near the phone and try again."
    }
}
