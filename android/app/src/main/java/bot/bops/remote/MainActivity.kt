package bot.bops.remote

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
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
    private var web: WebView? = null
    private var screen = 0
    private var showingServers = false
    private var current: Server? = null
    private var llmCatalog = LlmCatalog()
    private var settingsPage: android.view.View? = null
    private val servers by lazy { ServerStore(this) }
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingMic: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (pairFrom(intent)) return
        val server = servers.all().find { it.id == intent.getStringExtra("serverId") } ?: servers.active()
        if (server?.code != null && safeAddress(server.address) == null) open(server) else showServers()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (!pairFrom(intent)) {
            val server = servers.all().find { it.id == intent.getStringExtra("serverId") }
            if (server != null) choose(server)
        }
    }

    private fun showContent(content: android.view.View) {
        setContentView(android.widget.FrameLayout(this).apply {
            fitsSystemWindows = true
            addView(content)
        })
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.setSystemBarsAppearance(
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
    }

    private fun leavePage() {
        screen++
        showingServers = false
        settingsPage = null
        pendingMic?.deny(); pendingMic = null
        fileCallback?.onReceiveValue(null); fileCallback = null
        current = null
        web?.apply { (parent as? ViewGroup)?.removeView(this); stopLoading(); destroy() }; web = null
    }

    private fun choose(server: Server) {
        if (web != null && current?.id == server.id && current?.code == server.code) return
        if (server.code == null || safeAddress(server.address) != null) showSetup("Pair this server again.", server.address)
        else open(server)
    }

    private fun showServers() {
        leavePage()
        showingServers = true
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }
        root.addView(TextView(this).apply { text = "Your Bops servers"; textSize = 24f })
        for (server in servers.all()) {
            root.addView(Button(this).apply {
                text = "${server.name} — ${server.address}" + if (server.code == null) " (pair again)" else ""
                setOnClickListener { choose(server) }
            })
            root.addView(Button(this).apply {
                text = "Rename or remove ${server.name}"
                setOnClickListener {
                    AlertDialog.Builder(this@MainActivity).setTitle(server.name)
                        .setItems(arrayOf("Rename", "Remove")) { _, action ->
                            if (action == 0) {
                                val name = EditText(this@MainActivity).apply { setText(server.name) }
                                AlertDialog.Builder(this@MainActivity).setTitle("Server name").setView(name)
                                    .setPositiveButton("Save") { _, _ ->
                                        name.text.toString().trim().takeIf { it.isNotEmpty() }?.let { servers.rename(server.id, it) }
                                        showServers()
                                    }.setNegativeButton("Cancel", null).show()
                            } else AlertDialog.Builder(this@MainActivity).setMessage("Remove ${server.name} from this phone?")
                                .setPositiveButton("Remove") { _, _ -> servers.remove(server.id); showServers() }
                                .setNegativeButton("Cancel", null).show()
                        }.show()
                }
            })
        }
        root.addView(Button(this).apply { text = "Add server"; setOnClickListener { showSetup(null) } })
        showContent(android.widget.ScrollView(this).apply { addView(root) })
        PingService.startIfWanted(this)
    }

    /**
     * The QR code from Bops' Settings (bops://pair?a=…&c=…). Any web page could send such a link, so the
     * app never just follows it: it shows the address and asks, and the code is checked against that
     * server before anything is kept.
     */
    private fun pairFrom(intent: Intent?): Boolean {
        val data = intent?.data ?: return false
        if (data.scheme != "bops" || data.host != "pair") return false
        val a = data.getQueryParameter("a")?.trim()?.trimEnd('/') ?: return false
        val c = data.getQueryParameter("c")?.trim() ?: return false
        showSetup(null, a, c)
        return true
    }

    /** The address and pairing code, checked against the server before they're kept. */
    private fun showSetup(problem: String?, offeredAddress: String? = null, offeredCode: String? = null) {
        leavePage()
        val generation = screen
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 3, pad, pad)
            setBackgroundColor(Color.WHITE)
        }
        fun label(text: String, size: Float = 15f) = TextView(this).apply { this.text = text; textSize = size; setTextColor(Color.BLACK); setPadding(0, pad / 2, 0, pad / 4) }
        root.addView(label("Connect to your Bops", 24f))
        root.addView(label(if (offeredCode != null) "Connect this phone to the Bops at the address below? Only do this if you just scanned the code from your own Bops." else if (offeredAddress != null) "Pair this saved server again using a new code from its Bops Settings. Confirm the server below before connecting." else "In the Bops app on your computer, open Settings, then Your phone, and press Pair a phone. Scan its QR code with your camera, or enter what it shows."))
        val addr = EditText(this).apply {
            hint = "Address, like http://100.101.102.103:3210"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(offeredAddress ?: "")
        }
        val existing = servers.all().find { ServerSafety.normalizeAddress(it.address) == offeredAddress?.let { a -> ServerSafety.normalizeAddress(a) } }
        val name = EditText(this).apply { hint = "Name, like My PC"; setText(existing?.name ?: "") }
        root.addView(label("Server name")); root.addView(name)
        val pass = EditText(this).apply {
            hint = "Pairing code"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            if (offeredCode != null) setText(offeredCode)
        }
        val status = label(problem ?: "").apply { setTextColor(Color.rgb(176, 0, 32)) }
        val go = Button(this).apply { text = "Connect" }
        val target = label("", 24f)
        fun updateTarget() {
            val uri = Uri.parse(enteredAddress(addr.text.toString()))
            target.text = "Target server: " + (uri.host?.let { host -> "$host:${if (uri.port != -1) uri.port else if (uri.scheme == "https") 443 else 80}" } ?: "Invalid address")
        }
        addr.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { updateTarget() }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
        updateTarget()
        root.addView(target)
        root.addView(label("Address")); root.addView(addr)
        root.addView(label("Pairing code")); root.addView(pass)
        root.addView(go); root.addView(status)
        root.addView(Button(this).apply { text = "Saved servers"; setOnClickListener { showServers() } })
        showContent(android.widget.ScrollView(this).apply { addView(root) })

        go.setOnClickListener {
            val a = enteredAddress(addr.text.toString())
            val c = pass.text.toString().trim()
            safeAddress(a)?.let { status.text = it; return@setOnClickListener }
            if (c.length < 32) { status.text = "That pairing code is too short. Copy the whole code."; return@setOnClickListener }
            go.isEnabled = false
            status.setTextColor(Color.DKGRAY); status.text = "Checking…"
            val match = servers.all().find { ServerSafety.normalizeAddress(it.address) == a }
            val serverName = name.text.toString().trim().ifEmpty { match?.name ?: Uri.parse(a).host ?: "My Bops" }
            thread {
                val result = check(a, c)
                runOnUiThread {
                    if (generation != screen || isDestroyed) return@runOnUiThread
                    go.isEnabled = true
                    if (result == null) {
                        open(servers.save(serverName, a, c))
                    } else {
                        status.setTextColor(Color.rgb(176, 0, 32)); status.text = result
                    }
                }
            }
        }
    }

    private fun enteredAddress(value: String): String {
        val raw = value.trim()
        return ServerSafety.normalizeAddress(if (raw.startsWith("http://", true) || raw.startsWith("https://", true)) raw else "http://$raw")
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        catch (_: ActivityNotFoundException) {
            android.widget.Toast.makeText(this, "No app can open this link.", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Null when the code may go to this address: https anywhere, plain http only to a Tailscale address
     * (100.64.0.0/10), which Tailscale encrypts itself. On the home wifi plain http would carry the code
     * where anyone on the network could read it.
     */
    private fun safeAddress(a: String) = ServerSafety.safeAddress(a)

    /** The same site as your Bops: scheme, host and port all equal (not just a matching start). */
    private fun sameSite(url: String, address: String) = ServerSafety.sameSite(url, address)

    /** Null when the server answers as Bops and takes the code; otherwise what's wrong, in words. */
    private fun check(address: String, code: String): String? {
        var health: HttpURLConnection? = null
        var state: HttpURLConnection? = null
        try {
            // With the code: from another device Bops answers nothing at all without it (proxy.ts).
            health = (URL("$address/api/health").openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 8000; readTimeout = 8000
                setRequestProperty("Cookie", "bops_remote=$code")
            }
            if (health.responseCode == 401 || health.responseCode == 403) return "Bops didn't take that pairing code. Pair again in the Bops app and use the new code."
            if (health.responseCode != 200 || !health.inputStream.bufferedReader().use { it.readText() }.contains("\"bops\"")) return "That address answers, but it isn't Bops."
            state = (URL("$address/api/state").openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
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
        } finally { health?.disconnect(); state?.disconnect() }
    }

    private fun open(server: Server) {
        leavePage()
        val generation = screen
        val address = server.address
        val code = server.code ?: return showSetup("Pair this server again.", address)
        servers.select(server.id)
        val cookies = CookieManager.getInstance()
        cookies.removeAllCookies {
            if (generation != screen || isDestroyed) return@removeAllCookies
            val secure = if (address.startsWith("https")) "; Secure" else ""
            cookies.setAcceptCookie(true)
            cookies.setCookie(address, "bops_remote=$code; Path=/; HttpOnly; SameSite=Strict$secure") {
                if (generation != screen || isDestroyed) return@setCookie
                cookies.flush()
                showWeb(server)
            }
        }
    }

    private fun showWeb(server: Server) {
        val address = server.address
        current = server
        web = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                // Links away from your Bops open in the phone's browser, not inside the app.
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    if (sameSite(req.url.toString(), address)) return false
                    openExternal(req.url)
                    return true
                }
                // A page that ends up somewhere else (a redirect) is left, not shown in the app.
                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    if (!sameSite(url, address)) {
                        view.stopLoading()
                        openExternal(Uri.parse(url))
                        if (view.canGoBack()) view.goBack() else view.loadUrl("$address/")
                    }
                }
                override fun onReceivedHttpError(view: WebView, req: WebResourceRequest, res: WebResourceResponse) {
                    // The code stopped working (unpaired, or paired again elsewhere): back to setup.
                    if (req.isForMainFrame && sameSite(req.url.toString(), address) && (res.statusCode == 401 || res.statusCode == 403)) {
                        // Destroying a WebView inside its own callback is unsafe. A queued rejection
                        // must also not replace a newly selected page or a refreshed pairing.
                        view.post {
                            if (web === view && current?.id == server.id && current?.code == server.code)
                                forget(server, "Bops didn't take the pairing code anymore. Pair again.")
                        }
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    startActivityForResult(params.createIntent(), FILES)
                    return true
                }
                override fun onPermissionRequestCanceled(request: PermissionRequest) {
                    if (pendingMic === request) pendingMic = null
                }
                override fun onPermissionRequest(request: PermissionRequest) {
                    // Only the microphone, only for your own Bops (a call with a bot).
                    if (settingsPage != null || current?.id != server.id || !sameSite(web?.url ?: "", address) || !sameSite(request.origin.toString(), address) || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) return request.deny()
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    else { pendingMic = request; requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC) }
                }
            }
        }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(Button(this).apply { text = "Servers · ${server.name}"; setOnClickListener { showServers() } })
        root.addView(Button(this).apply { text = "Settings"; setOnClickListener { showSettings(server) } })
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        showContent(root)
        web?.loadUrl("$address/")
        // Notifications while the app is closed: Android 13+ asks first; the service starts either way
        // (without the OK it shows nothing, and the app's notification settings can allow it later).
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFY)
        PingService.startIfWanted(this)
    }

    private fun showSettings(server: Server) {
        // Keep this WebView and its draft/navigation intact while native settings are visible.
        screen++
        pendingMic?.deny(); pendingMic = null
        settingsPage = findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        val generation = screen
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        fun label(value: String, size: Float = 16f) = TextView(this).apply {
            text = value; textSize = size; setPadding(0, pad / 2, 0, pad / 2)
        }
        root.addView(label("Settings · ${server.name}", 24f))
        root.addView(label(server.address))
        root.addView(label("Configured models", 20f))
        root.addView(label("Read-only list from this server. To change it, edit config/llms.yaml on that server and restart Bops."))
        root.addView(Button(this).apply {
            text = "Back to Bops"
            setOnClickListener { returnFromSettings() }
        })
        root.addView(Button(this).apply { text = "Saved servers"; setOnClickListener { showServers() } })
        val refresh = Button(this).apply { text = "Refresh" }
        root.addView(refresh)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(list)
        showContent(android.widget.ScrollView(this).apply { addView(root) })
        fun load() {
            list.removeAllViews()
            list.addView(label("Loading configured models…"))
            refresh.isEnabled = false
            thread {
                val result = llmCatalog.load(server)
                runOnUiThread {
                    if (generation != screen || isDestroyed) return@runOnUiThread
                    // The watcher can revoke a code while this request is in flight.
                    val saved = servers.all().find { it.id == server.id }
                    if (saved == null || saved.code != server.code) { showServers(); return@runOnUiThread }
                    refresh.isEnabled = true
                    list.removeAllViews()
                    when (result) {
                        CatalogResult.Unpaired -> forget(server, "Bops didn't take the pairing code anymore. Pair again.")
                        is CatalogResult.Error -> list.addView(label(result.message))
                        is CatalogResult.Loaded -> {
                            if (result.models.isEmpty()) list.addView(label("No models configured on this server."))
                            for (model in result.models) {
                                list.addView(label(model.name, 20f))
                                list.addView(label("Provider: ${model.provider}\nModel: ${model.model}"))
                                if (model.starter) list.addView(label("Default for new bots"))
                                list.addView(label("Use for: " + model.jobs.joinToString(", ").ifEmpty { "No jobs assigned" }))
                            }
                        }
                    }
                }
            }
        }
        refresh.setOnClickListener { load() }
        load()
    }

    private fun returnFromSettings() {
        val page = settingsPage ?: return
        val server = current
        if (server == null || servers.all().find { it.id == server.id }?.code != server.code) {
            showServers()
            return
        }
        screen++
        settingsPage = null
        setContentView(page)
    }

    private fun forget(server: Server, why: String) {
        servers.forget(server)
        CookieManager.getInstance().removeAllCookies(null)
        showSetup(why, server.address)
    }

    override fun onDestroy() {
        leavePage()
        super.onDestroy()
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
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED && current?.let { sameSite(req.origin.toString(), it.address) && sameSite(web?.url ?: "", it.address) } == true) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else req.deny()
    }

    @Deprecated("Predictive back needs AndroidX; the WebView's own history is what back means here")
    override fun onBackPressed() {
        if (settingsPage != null) returnFromSettings()
        else if (web?.canGoBack() == true) web?.goBack() else if (showingServers) super.onBackPressed() else showServers()
    }

    companion object {
        private const val FILES = 1
        private const val MIC = 2
        private const val NOTIFY = 3
    }
}
