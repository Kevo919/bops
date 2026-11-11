package bot.bops.remote

import android.content.Context
import com.flyfishxu.kadb.Kadb
import com.flyfishxu.kadb.cert.KadbCert
import com.flyfishxu.kadb.cert.OkioFilePrivateKeyStore
import kotlinx.coroutines.runBlocking
import okio.Path.Companion.toOkioPath
import java.io.File

/**
 * First install of the watch app without the Play Store: the phone does what `adb install` on a PC does, using the
 * watch's own Wireless debugging (Kadb, Apache-2.0, pure Kotlin ADB). The user turns Wireless debugging on, reads
 * the pairing code off the watch and types it here; after install we tell them to turn it off again.
 * The phone's ADB key stays in its private no-backup folder. Blocks: use from a background thread.
 */
object WatchSideload {
    data class Target(val host: String, val pairPort: Int?, val pairCode: String?, val connectPort: Int)

    private val HOST = Regex("^(?:\\d{1,3}\\.){3}\\d{1,3}$|^[0-9a-fA-F:]+$")

    /** Plain-words problem with what was typed, or null when it's usable. Pure, so it's unit-tested. */
    fun problem(t: Target): String? = when {
        !HOST.matches(t.host) -> "Type the watch's IP address as shown under Wireless debugging (like 192.168.1.40)."
        t.connectPort !in 1..65535 -> "Type the port shown under Wireless debugging → IP address & port."
        (t.pairCode == null) != (t.pairPort == null) -> "To pair, type both the pairing code and its port (from Pair new device)."
        t.pairCode != null && !Regex("^\\d{6}$").matches(t.pairCode) -> "The pairing code is the 6 digits shown on the watch."
        t.pairPort != null && t.pairPort !in 1..65535 -> "The pairing port is the number after the colon under Pair new device."
        else -> null
    }

    private fun keys(context: Context) {
        KadbCert.configure(OkioFilePrivateKeyStore(File(context.noBackupFilesDir, "adb/adbkey.pem").also { it.parentFile?.mkdirs() }.toOkioPath()))
    }

    /** Pair (when a code is given), connect, install [apk]. Returns null on success, or what went wrong in plain words. */
    fun install(context: Context, t: Target, apk: File): String? {
        problem(t)?.let { return it }
        keys(context)
        if (t.pairCode != null && t.pairPort != null) {
            try { runBlocking { Kadb.pair(t.host, t.pairPort, t.pairCode, "Bops phone") } }
            catch (_: Exception) { return "Pairing didn't work. On the watch, tap Pair new device again and type the new code and port." }
        }
        return try {
            Kadb.create(t.host, t.connectPort, connectTimeout = 15000, socketTimeout = 120000).use { adb ->
                adb.install(apk, "-r") // -r: replace, so the same flow also updates
            }
            null
        } catch (e: Exception) {
            val msg = e.message.orEmpty()
            when {
                "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in msg || "signatures do not match" in msg ->
                    "The watch has an older Bops signed with a different key. Uninstall Bops from the watch, then try again."
                "INSTALL_FAILED_VERSION_DOWNGRADE" in msg -> "The watch already has a newer Bops."
                else -> "Couldn't reach the watch. Check it's on the same Wi-Fi, Wireless debugging is on, and the port is the one under IP address & port."
            }
        }
    }
}
