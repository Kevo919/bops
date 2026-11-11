package bot.bops.remote

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.File
import kotlin.concurrent.thread

/**
 * Watch & updates (opened from the bar above Bops, or from the "Get Bops on your watch" prompt).
 * - Phone app: shows this version and the latest; Update installs it with Android's own installer.
 * - Each connected watch: whether it has Bops and which version; Install puts it on (Play Store once listed, or
 *   directly over the watch's Wireless debugging); Send update hands a newer watch app to the watch app.
 * Phone and watch must come from the same release (same signing key), so a watch install always uses the phone's own release.
 */
class WatchSetupActivity : Activity() {
    private lateinit var root: LinearLayout
    private var latest: UpdateFeed.Release? = null
    private val pad by lazy { (16 * resources.displayMetrics.density).toInt() }
    private val updates by lazy { File(cacheDir, "updates") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }
        setContentView(ScrollView(this).apply { fitsSystemWindows = true; addView(root) })
        load()
    }

    private fun load() {
        root.removeAllViews()
        root.addView(label("Watch & updates", 24f))
        root.addView(label("Checking for watches and updates…"))
        thread {
            val release = UpdateFeed.latest(BuildConfig.RELEASE_TAG)
            val watches = WatchLink.watches(this).map { it to (if (it.hasApp) WatchLink.watchVersion(this, it) else null) }
            runOnUiThread { if (!isDestroyed) { latest = release; render(release, watches) } }
        }
    }

    private fun render(release: UpdateFeed.Release?, watches: List<Pair<WatchLink.Watch, Int?>>) {
        root.removeAllViews()
        root.addView(label("Watch & updates", 24f))

        // This phone app
        root.addView(label("This phone", 20f))
        val mine = BuildConfig.VERSION_CODE
        root.addView(label("Bops ${BuildConfig.VERSION_NAME} (build $mine)" + if (release == null) ". Can't check for updates right now." else ". Latest: build ${release.versionCode}."))
        if (release != null && release.versionCode > mine) {
            root.addView(button("Update this phone app to build ${release.versionCode}") { updatePhone(release) })
        }

        // Watches
        root.addView(label("Your watch", 20f))
        if (watches.isEmpty()) {
            root.addView(label("No watch connected. Pair your Galaxy Watch with this phone first (Galaxy Wearable app), then come back here."))
        }
        val sameRelease = release != null && release.versionCode == mine
        for ((watch, version) in watches) {
            root.addView(label("${watch.name}" + if (!watch.nearby) " (not nearby)" else "", 17f))
            when {
                !watch.hasApp -> {
                    root.addView(label("Bops isn't on this watch yet."))
                    root.addView(notSetUp(button("Install from Play Store") { playInstall(watch) }, BuildConfig.PLAY_LISTED,
                        "Not set up yet (0%): Bops needs a Play Store listing (internal test) first."))
                    if (!sameRelease) root.addView(label("Update this phone app first, so the watch gets the matching version.", color = RED))
                    else root.addView(button("Install directly (Wireless debugging)") { directForm(release!!) })
                }
                version == null -> root.addView(label("Bops is installed. Open it on the watch once so it can report its version."))
                release != null && release.watch != null && version < release.versionCode && sameRelease ->
                    root.addView(button("Send update to watch (build $version → ${release.versionCode})") { sendWatchUpdate(watch, release) })
                else -> root.addView(label("Bops build $version is installed. Up to date."))
            }
        }
        root.addView(button("Check again") { load() })
        root.addView(button("Back to Bops") { finish() })
    }

    private fun updatePhone(release: UpdateFeed.Release) {
        if (!SelfInstaller.canInstall(this)) {
            say("First, let Bops install updates", "Android will open a settings page. Turn on \"Allow from this source\", then come back and tap Update again.") {
                SelfInstaller.openPermissionScreen(this)
            }
            return
        }
        busy("Downloading build ${release.versionCode}…")
        thread {
            val apk = UpdateFeed.download(BuildConfig.RELEASE_TAG, release.phone, updates)
            runOnUiThread {
                if (apk == null) { say("Download failed", "Couldn't download or verify the update. Try again on Wi-Fi."); load(); return@runOnUiThread }
                SelfInstaller.install(this, apk)
                load()
            }
        }
    }

    private fun playInstall(watch: WatchLink.Watch) {
        // FotMob's route: open the Play Store listing on the watch itself (androidx.wear RemoteActivityHelper).
        val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("market://details?id=$packageName")).addCategory(Intent.CATEGORY_BROWSABLE)
        try {
            androidx.wear.remote.interactions.RemoteActivityHelper(this).startRemoteActivity(intent, watch.id)
            say("Check your watch", "The Play Store opened on ${watch.name}. Tap Install there.")
        } catch (_: Exception) {
            say("Couldn't open the Play Store on the watch", "Use Install directly instead.")
        }
    }

    private fun directForm(release: UpdateFeed.Release) {
        val watchAsset = release.watch ?: return say("Not available", "This release has no watch app.")
        root.removeAllViews()
        root.addView(label("Install Bops on your watch", 24f))
        root.addView(label("""
            Once, on the watch:
            1. Settings → About watch → Software information → tap Software version 5 times.
            2. Settings → Developer options → turn on ADB debugging and Wireless debugging (watch and phone on the same Wi-Fi).
            3. Tap Wireless debugging. Note the IP address & port.
            4. Tap Pair new device. Note the 6-digit code and the port after the colon.
            Then type them below and tap Install. Turn Wireless debugging off again when it's done.
        """.trimIndent()))
        val host = field("Watch IP address (like 192.168.1.40)", InputType.TYPE_CLASS_TEXT)
        val port = field("Port under IP address & port", InputType.TYPE_CLASS_NUMBER)
        val code = field("6-digit pairing code (leave empty if paired before)", InputType.TYPE_CLASS_NUMBER)
        val pairPort = field("Pairing port (from Pair new device)", InputType.TYPE_CLASS_NUMBER)
        listOf(host, port, code, pairPort).forEach { root.addView(it) }
        val status = label("")
        root.addView(button("Install") {
            val t = WatchSideload.Target(host.text.toString().trim(), pairPort.text.toString().trim().toIntOrNull(),
                code.text.toString().trim().ifEmpty { null }, port.text.toString().trim().toIntOrNull() ?: -1)
            WatchSideload.problem(t)?.let { status.text = it; status.setTextColor(RED); return@button }
            status.setTextColor(Color.DKGRAY); status.text = "Downloading the watch app and checking it…"
            thread {
                val apk = UpdateFeed.download(BuildConfig.RELEASE_TAG, watchAsset, updates)
                val err = if (apk == null) "Couldn't download or verify the watch app. Try again on Wi-Fi."
                          else { runOnUiThread { status.text = "Installing on the watch… (keep it awake)" }; WatchSideload.install(this, t, apk) }
                runOnUiThread {
                    if (err != null) { status.setTextColor(RED); status.text = err }
                    else say("Bops is on your watch", "Open it from the watch's app list. Now turn off Wireless debugging on the watch (Settings → Developer options).") { load() }
                }
            }
        })
        root.addView(status)
        root.addView(button("Back") { load() })
    }

    private fun sendWatchUpdate(watch: WatchLink.Watch, release: UpdateFeed.Release) {
        val asset = release.watch ?: return
        busy("Downloading the watch update…")
        thread {
            val apk = UpdateFeed.download(BuildConfig.RELEASE_TAG, asset, updates)
            val err = if (apk == null) "Couldn't download or verify the watch update." else WatchLink.sendUpdate(this, watch, apk, release.versionCode, asset.sha256)
            runOnUiThread {
                if (err != null) say("Update not sent", err) { load() }
                else say("Update sent", "Open Bops on ${watch.name} and tap Install update. The first time, the watch asks you to allow Bops to install apps.") { load() }
            }
        }
    }

    private fun busy(text: String) { root.removeAllViews(); root.addView(label("Watch & updates", 24f)); root.addView(label(text)) }
    private fun say(title: String, body: String, then: (() -> Unit)? = null) {
        AlertDialog.Builder(this).setTitle(title).setMessage(body).setPositiveButton("OK") { _, _ -> then?.invoke() }.setCancelable(false).show()
    }
    private fun label(text: String, size: Float = 15f, color: Int = Color.BLACK) = TextView(this).apply {
        this.text = text; textSize = size; setTextColor(color); setPadding(0, pad / 2, 0, pad / 4)
    }
    private fun button(text: String, onClick: () -> Unit) = Button(this).apply { this.text = text; isAllCaps = false; setOnClickListener { onClick() } }
    private fun field(hint: String, type: Int) = EditText(this).apply { this.hint = hint; inputType = type; isSingleLine = true }

    /** The build rule for unfinished features: visible, greyed, red "not set up yet" with a percent. */
    private fun notSetUp(view: Button, ready: Boolean, why: String): android.view.View {
        if (ready) return view
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            view.isEnabled = false; view.alpha = 0.45f
            addView(view); addView(label(why, 13f, RED))
        }
    }

    companion object {
        private const val RED = 0xFFC62828.toInt()
        private const val PREFS = "watch-prompt"

        /**
         * FotMob-style prompt, at most once per app start and never again after "Don't ask again": a connected watch
         * without Bops, or a newer phone build. Call from the Bops page; it does the checking in the background.
         */
        fun promptIfUseful(activity: Activity) {
            val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            thread {
                val noApp = WatchLink.watches(activity).firstOrNull { !it.hasApp }
                val release = UpdateFeed.latest(BuildConfig.RELEASE_TAG)
                val newer = release != null && release.versionCode > BuildConfig.VERSION_CODE &&
                    prefs.getInt("skippedUpdate", 0) < release.versionCode
                activity.runOnUiThread {
                    if (activity.isDestroyed || activity.isFinishing) return@runOnUiThread
                    val open = { activity.startActivity(Intent(activity, WatchSetupActivity::class.java)) }
                    when {
                        noApp != null && !prefs.getBoolean("noWatchPrompt", false) -> AlertDialog.Builder(activity)
                            .setTitle("Get Bops on ${noApp.name}")
                            .setMessage("See what's waiting for your OK, tap Allow or Deny, and ask Boppy by voice, right from your wrist.")
                            .setPositiveButton("Set up") { _, _ -> open() }
                            .setNegativeButton("Not now", null)
                            .setNeutralButton("Don't ask again") { _, _ -> prefs.edit().putBoolean("noWatchPrompt", true).apply() }
                            .show()
                        newer -> AlertDialog.Builder(activity)
                            .setTitle("Bops update ready")
                            .setMessage("Build ${release!!.versionCode} is out (you have ${BuildConfig.VERSION_CODE}). Update the phone app and your watch?")
                            .setPositiveButton("Update") { _, _ -> open() }
                            .setNegativeButton("Later", null)
                            .setNeutralButton("Skip this one") { _, _ -> prefs.edit().putInt("skippedUpdate", release.versionCode).apply() }
                            .show()
                    }
                }
            }
        }
    }
}
