package bot.bops.watch

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognizerIntent
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

/**
 * Bops on the wrist: what needs you (approvals first, with Allow / Deny), and a mic to ask Boppy.
 * Everything goes through the Bops app on the phone (WatchBridge there), which holds the pairing code and
 * reaches Bops over Tailscale. No libraries beyond Wear's Data Layer; plain Android views sized for a watch.
 */
class WatchActivity : Activity() {
    private lateinit var column: LinearLayout
    private lateinit var headline: TextView
    private val main = Handler(Looper.getMainLooper())
    private val refresher = object : Runnable {
        override fun run() { refresh(); main.postDelayed(this, 30_000) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = dp(18)
        column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            // Round screens: generous side padding so nothing is cut off at the edges.
            setPadding(pad, dp(24), pad, dp(36))
        }
        setContentView(ScrollView(this).apply { isFillViewport = true; addView(column) })
        render(Glance("Bops", emptyList(), null), loading = true)
    }

    override fun onResume() { super.onResume(); main.post(refresher) }
    override fun onPause() { super.onPause(); main.removeCallbacks(refresher) }

    private fun render(g: Glance, loading: Boolean = false) {
        column.removeAllViews()
        column.addView(text("Bops", 18f, bold = true))
        headline = text(if (loading) "Checking…" else g.headline, 13f, color = if (g.error != null) 0xFFFF8A80.toInt() else 0xFFB0BEC5.toInt())
        column.addView(headline)
        UpdateReceiver.readyVersion(this)?.let { v ->
            column.addView(button("Install update (build $v)") { installUpdate() })
        }
        column.addView(button("🎤  Ask Boppy") { listen() })
        for (item in g.items.take(12)) {
            column.addView(space(10))
            column.addView(text(item.title, 14f, bold = true))
            if (item.body.isNotBlank()) column.addView(text(item.body, 12f, color = 0xFFCFD8DC.toInt()))
            if (item.isApproval) {
                val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
                row.addView(button("Allow", weight = true) { reply(item, "once") })
                row.addView(button("Deny", weight = true) { reply(item, "reject") })
                column.addView(row)
            }
        }
        column.addView(space(8))
        column.addView(button("Refresh") { refresh() })
    }

    /** The phone sent a newer watch app (UpdateReceiver checked it). Android asks for OK; the first time it asks to allow Bops to install apps. */
    private fun installUpdate() {
        if (!packageManager.canRequestPackageInstalls()) {
            headline.text = "Allow Bops to install updates, then tap Install update again."
            try { startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:$packageName"))) } catch (_: Exception) {}
            return
        }
        headline.text = "Installing…"
        try { WatchInstaller.install(this, UpdateReceiver.readyFile(this)) } catch (_: Exception) { headline.text = "Couldn't start the update. Send it again from the phone." }
    }

    private fun refresh() = ask("/bops/pings", JSONObject()) { raw -> render(Glance.parse(raw)) }

    private fun reply(item: Item, reply: String) {
        headline.text = if (reply == "once") "Allowing…" else "Denying…"
        ask("/bops/approve", JSONObject().put("id", item.key).put("reply", reply)) { raw ->
            val err = raw?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }.orEmpty()
            if (err.isNotEmpty()) headline.text = err else refresh()
        }
    }

    private fun listen() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask Boppy")
        try {
            @Suppress("DEPRECATION") startActivityForResult(i, SPEAK)
        } catch (_: Exception) {
            headline.text = "No voice input on this watch."
        }
    }

    @Deprecated("Plain Activity result API; fine for one voice request")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != SPEAK || resultCode != RESULT_OK) return
        val said = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim().orEmpty()
        if (said.isEmpty()) return
        headline.text = "Sending: “${said.take(40)}”"
        ask("/bops/say", JSONObject().put("text", said)) { raw ->
            val err = raw?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }.orEmpty()
            headline.text = err.ifEmpty { "Sent to Boppy. The reply comes to your phone." }
        }
    }

    /** Finds the phone running Bops (capability "bops_phone") and asks it; the answer comes back on the main thread. */
    private fun ask(path: String, body: JSONObject, done: (String?) -> Unit) {
        Wearable.getCapabilityClient(this).getCapability("bops_phone", CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener { cap ->
                val node = cap.nodes.firstOrNull { it.isNearby } ?: cap.nodes.firstOrNull()
                if (node == null) { done("""{"error":"Phone not connected, or the Bops phone app isn't installed."}"""); return@addOnSuccessListener }
                Wearable.getMessageClient(this).sendRequest(node.id, path, body.toString().toByteArray(Charsets.UTF_8))
                    .addOnSuccessListener { bytes -> main.post { done(String(bytes, Charsets.UTF_8)) } }
                    .addOnFailureListener { main.post { done("""{"error":"The phone didn't answer. Open Bops on the phone once."}""") } }
            }
            .addOnFailureListener { main.post { done("""{"error":"Can't find the phone right now."}""") } }
    }

    private fun text(s: String, sp: Float, bold: Boolean = false, color: Int = Color.WHITE) = TextView(this).apply {
        text = s; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); gravity = Gravity.CENTER
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun button(label: String, weight: Boolean = false, onClick: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; setOnClickListener { onClick() }
        minHeight = dp(48) // touch targets a finger can hit on a watch
        layoutParams = if (weight) LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        else LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    }

    private fun space(h: Int) = View(this).apply { layoutParams = LinearLayout.LayoutParams(1, dp(h)) }
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object { private const val SPEAK = 7 }
}
