package bot.bops.remote

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Bops on your phone: the Bops page from your own Bops (on your PC over Tailscale, or on a server), in
 * a WebView. The first time, it asks for the address and the pairing code the Bops app showed
 * (Settings, Your phone); the code goes to Bops as its bops_remote cookie on every request
 * (proxy.ts), and stays on this phone only (no backups, see the manifest).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingMic: PermissionRequest? = null

    private val prefs by lazy { getSharedPreferences("bops", MODE_PRIVATE) }
    private val address get() = prefs.getString("address", null)
    private val code get() = prefs.getString("code", null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // An address kept by an older version that this one wouldn't take asks again.
        if (address == null || code == null || safeAddress(address!!) != null) showSetup(null) else open(address!!, code!!)
    }

    /** The address and pairing code, checked against the server before they're kept. */
    private fun showSetup(problem: String?) {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 3, pad, pad)
            setBackgroundColor(Color.WHITE)
        }
        fun label(text: String, size: Float = 15f) = TextView(this).apply { this.text = text; textSize = size; setTextColor(Color.BLACK); setPadding(0, pad / 2, 0, pad / 4) }
        root.addView(label("Connect to your Bops", 24f))
        root.addView(label("In the Bops app on your computer, open Settings, then Your phone, and press Pair a phone. Enter what it shows."))
        val addr = EditText(this).apply {
            hint = "Address, like http://100.101.102.103:3210"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(address ?: "")
        }
        val pass = EditText(this).apply {
            hint = "Pairing code"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val status = label(problem ?: "").apply { setTextColor(Color.rgb(176, 0, 32)) }
        val go = Button(this).apply { text = "Connect" }
        root.addView(label("Address")); root.addView(addr)
        root.addView(label("Pairing code")); root.addView(pass)
        root.addView(go); root.addView(status)
        setContentView(root)

        go.setOnClickListener {
            val a = addr.text.toString().trim().trimEnd('/').let { if (it.startsWith("http")) it else "http://$it" }
            val c = pass.text.toString().trim()
            safeAddress(a)?.let { status.text = it; return@setOnClickListener }
            if (c.length < 32) { status.text = "That pairing code is too short. Copy the whole code."; return@setOnClickListener }
            go.isEnabled = false
            status.setTextColor(Color.DKGRAY); status.text = "Checking…"
            thread {
                val result = check(a, c)
                runOnUiThread {
                    go.isEnabled = true
                    if (result == null) {
                        prefs.edit().putString("address", a).putString("code", c).apply()
                        open(a, c)
                    } else {
                        status.setTextColor(Color.rgb(176, 0, 32)); status.text = result
                    }
                }
            }
        }
    }

    /**
     * Null when the code may go to this address: https anywhere, plain http only to a Tailscale address
     * (100.64.0.0/10), which Tailscale encrypts itself. On the home wifi plain http would carry the code
     * where anyone on the network could read it.
     */
    private fun safeAddress(a: String): String? {
        val u = Uri.parse(a)
        val host = u.host ?: return "That isn't an address."
        if (u.scheme == "https") return null
        if (u.scheme != "http") return "The address starts with http:// or https://."
        val parts = host.split(".").mapNotNull { it.toIntOrNull() }
        val tailnet = parts.size == 4 && parts[0] == 100 && parts[1] in 64..127
        return if (tailnet) null else "Use your computer's Tailscale address (100.x.y.z) or an https address, so the code isn't sent unencrypted."
    }

    /** The same site as your Bops: scheme, host and port all equal (not just a matching start). */
    private fun sameSite(url: String, address: String): Boolean {
        val a = Uri.parse(address)
        val b = Uri.parse(url)
        fun port(u: Uri) = if (u.port != -1) u.port else if (u.scheme == "https") 443 else 80
        return a.scheme == b.scheme && a.host.equals(b.host, ignoreCase = true) && port(a) == port(b)
    }

    /** Null when the server answers as Bops and takes the code; otherwise what's wrong, in words. */
    private fun check(address: String, code: String): String? {
        try {
            // With the code: from another device Bops answers nothing at all without it (proxy.ts).
            val health = (URL("$address/api/health").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000; readTimeout = 8000
                setRequestProperty("Cookie", "bops_remote=$code")
            }
            if (health.responseCode == 403) return "Bops didn't take that pairing code. Pair again in the Bops app and use the new code."
            if (health.responseCode != 200 || !health.inputStream.bufferedReader().readText().contains("\"bops\"")) return "That address answers, but it isn't Bops."
            val state = (URL("$address/api/state").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000; readTimeout = 15000
                setRequestProperty("Cookie", "bops_remote=$code")
            }
            return when (state.responseCode) {
                in 200..299 -> null
                401, 403 -> "Bops didn't take that pairing code. Pair again in the Bops app and use the new code."
                else -> "Bops answered ${state.responseCode}. Try again in a moment."
            }
        } catch (e: Exception) {
            return "Can't reach $address. Is Bops open on your computer, and is Tailscale on here and there?"
        }
    }

    private fun open(address: String, code: String) {
        val secure = if (address.startsWith("https")) "; Secure" else ""
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setCookie(address, "bops_remote=$code; Path=/; HttpOnly; SameSite=Strict$secure")
            flush()
        }
        web = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                // Links away from your Bops open in the phone's browser, not inside the app.
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    if (sameSite(req.url.toString(), address)) return false
                    startActivity(Intent(Intent.ACTION_VIEW, req.url))
                    return true
                }
                // A page that ends up somewhere else (a redirect) is left, not shown in the app.
                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    if (!sameSite(url, address)) {
                        view.stopLoading()
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        if (view.canGoBack()) view.goBack() else view.loadUrl("$address/")
                    }
                }
                override fun onReceivedHttpError(view: WebView, req: WebResourceRequest, res: WebResourceResponse) {
                    // The code stopped working (unpaired, or paired again elsewhere): back to setup.
                    if (req.isForMainFrame && (res.statusCode == 401 || res.statusCode == 403)) forget("Bops didn't take the pairing code anymore. Pair again.")
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    startActivityForResult(params.createIntent(), FILES)
                    return true
                }
                override fun onPermissionRequest(request: PermissionRequest) {
                    // Only the microphone, only for your own Bops (a call with a bot).
                    if (!sameSite(request.origin.toString(), address) || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) return request.deny()
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    else { pendingMic = request; requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC) }
                }
            }
        }
        setContentView(web)
        web.loadUrl("$address/")
    }

    private fun forget(why: String) {
        prefs.edit().remove("code").apply()
        CookieManager.getInstance().removeAllCookies(null)
        runOnUiThread { showSetup(why) }
    }

    @Deprecated("Activity result API needs AndroidX; this app has no libraries")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILES) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        if (requestCode != MIC) return
        val req = pendingMic ?: return
        pendingMic = null
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else req.deny()
    }

    @Deprecated("Predictive back needs AndroidX; the WebView's own history is what back means here")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    // To forget the Bops this phone is paired with: Android's app info, Storage, Clear data.
    companion object {
        private const val FILES = 1
        private const val MIC = 2
    }
}
