package bot.bops.remote

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle

/** Platform-only regression checks; run on a disposable emulator (clears this app's preferences). */
class MultiServerTests : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

    override fun onStart() {
        val result = Bundle()
        try {
            val prefs = targetContext.getSharedPreferences("bops", 0)
            prefs.edit().clear().putString("address", "https://old.example")
                .putString("code", "old-code").putStringSet("seen", setOf("old-ping")).commit()
            val store = ServerStore(targetContext)
            val old = store.active()!!
            check(old.name == "My Bops" && old.code == "old-code")
            check(store.seen(old) == setOf("old-ping"))
            check(!prefs.contains("code") && !prefs.contains("address") && !prefs.contains("seen"))
            check(ServerStore(targetContext).all().size == 1)

            val pc = store.save("My PC", "http://100.64.0.1:3210", "pc-code")
            val host = store.save("Hostinger", "https://bops.example.com", "host-code")
            check(store.seen(pc) == null && store.seen(host) == null)
            store.remember(pc, setOf("same-key"))
            check(store.seen(host) == null)
            store.select(pc.id)
            store.rename(pc.id, "Work PC")
            check(store.active()?.name == "Work PC")
            val updated = store.save("Hostinger", host.address, "replacement")
            check(updated.id == host.id && store.all().size == 3)
            store.forget(host) // Stale 401 cannot revoke the new code.
            check(store.all().find { it.id == host.id }?.code == "replacement")
            store.forget(updated)
            check(store.all().find { it.id == host.id }?.code == null)
            check(store.all().find { it.id == pc.id }?.code == "pc-code")
            store.remove(pc.id)
            check(store.active() == null && store.seen(pc) == null)
            check(store.all().size == 2)
            check(ServerSafety.safeAddress("https://bops.example.com") == null)
            check(ServerSafety.safeAddress("http://100.64.0.0:3210") == null)
            check(ServerSafety.safeAddress("http://100.127.255.255") == null)
            for (address in listOf("http://100.63.255.255", "http://100.128.0.0", "http://192.168.1.1", "http://100.64.999.1", "http://0100.64.0.1", "http://100.064.0.1", "http://100.64.00.1", "http://100.64.0.01", "file:///tmp/a"))
                check(ServerSafety.safeAddress(address) != null) { address }
            check(ServerSafety.sameSite("https://bops.example.com/path", "https://bops.example.com:443"))
            for (other in listOf("http://bops.example.com", "https://bops.example.com:444", "https://bops.example.com.evil.test"))
                check(!ServerSafety.sameSite(other, "https://bops.example.com"))
            prefs.edit().clear().commit()
            storageRecoveryChecks()
            pollingChecks()
            LlmCatalogChecks.clientChecks()
            uiChecks()
            result.putString("stream", "PASS: migration, idempotence, independent seen keys, add/update/rename/remove/select, stale revocation, isolated revocation, address/origin policy, HTTP polling, UI switcher, QR confirmation, cookie isolation, LLM catalog settings/client\n")
            finish(Activity.RESULT_OK, result)
        } catch (failure: Throwable) {
            result.putString("stream", "FAIL: ${failure.stackTraceToString()}\n")
            finish(Activity.RESULT_CANCELED, result)
        }
    }

    private fun storageRecoveryChecks() {
        val prefs = targetContext.getSharedPreferences("bops", 0)
        prefs.edit().clear().commit()
        val store = ServerStore(targetContext)
        check(ServerSafety.normalizeAddress(" HTTPS://BOPS.Example.COM:443/ ") == "https://bops.example.com")
        check(ServerSafety.normalizeAddress("HTTP://100.64.0.1:80/") == "http://100.64.0.1")
        check(ServerSafety.normalizeAddress("https://BOPS.Example.COM:8443/base/") == "https://bops.example.com:8443/base")
        for (address in listOf("https://user@host.example", "https://host.example?", "https://host.example#", "https://host.example/?x=1", "http://100.64.0.1/#x")) {
            check(ServerSafety.normalizeAddress(address) == address)
            check(ServerSafety.safeAddress(ServerSafety.normalizeAddress(address)) != null)
        }
        check(ServerSafety.normalizeAddress("https://bops%2eexample.com/") == "https://bops%2eexample.com/")
        check(ServerSafety.normalizeAddress("https://[2001:DB8::1]:443/") == "https://[2001:db8::1]")
        val first = store.save("Initial", "https://BOPS.Example.COM:443/", "old-code")
        store.select(first.id)
        val updated = store.save("Renamed", "https://bops.example.com", "new-code")
        check(updated.id == first.id && updated.address == "https://bops.example.com" && store.all().size == 1)
        store.forget(first)
        check(store.active()?.code == "new-code") // An older rejection cannot erase the replacement.
        // Existing rows written before normalization must match too, without changing their identity.
        val legacy = org.json.JSONArray().put(org.json.JSONObject().put("id", "legacy-id").put("name", "Legacy")
            .put("address", "HTTPS://LEGACY.Example:443/").put("code", "legacy-code"))
        prefs.edit().putString("servers", legacy.toString()).putString("activeServer", "legacy-id").commit()
        val migrated = store.save("Legacy updated", "https://legacy.example", "updated-code")
        check(migrated.id == "legacy-id" && store.all().size == 1 && store.active()?.code == "updated-code")
        check(store.save("Other path", "https://legacy.example/other", "other-code").id != migrated.id)
        val broken = "[{\"id\":\"broken\",\"code\":\"private-test-code\""
        prefs.edit().putString("servers", broken).putString("activeServer", "legacy-id").commit()
        check(store.all().isEmpty() && store.active() == null)
        check(prefs.getString("servers", null) == "[]" && !prefs.contains("activeServer"))
        check(prefs.getString("servers.corrupt.latest", null) == broken)
        val savedAt = prefs.getLong("servers.corrupt.savedAt", 0)
        check(savedAt > 0 && ServerStore(targetContext).all().isEmpty())
        check(prefs.getLong("servers.corrupt.savedAt", 0) == savedAt)
        // New corruption replaces the previous private backup rather than retaining old codes.
        prefs.edit().putString("servers", "[{}]").putString("activeServer", "bad").commit()
        check(store.all().isEmpty() && store.active() == null)
        check(prefs.getString("servers.corrupt.latest", null) == "[{}]")
        prefs.edit().putInt("servers", 42).putString("activeServer", "bad").commit()
        check(store.all().isEmpty() && store.active() == null)
        check(prefs.getString("servers", null) == "[]")
        check(prefs.getString("servers.corrupt.latest", null) == "42")
        check(prefs.all.keys.count { it.startsWith("servers.corrupt.") } == 2)
        prefs.edit().putLong("servers.corrupt.savedAt", System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000)
            .putString("servers.corrupt.legacy", "old-private-code").commit()
        ServerStore(targetContext)
        check(prefs.all.keys.none { it.startsWith("servers.corrupt.") })
        val seenServer = store.save("Seen", "https://seen.example", "seen-code")
        prefs.edit().putInt("seen:${seenServer.id}", 42).commit()
        check(store.seen(seenServer) == null && !prefs.contains("seen:${seenServer.id}"))
        store.remember(seenServer, setOf("learned"))
        check(store.seen(seenServer) == setOf("learned"))
        check(store.save("Recovered", "https://recovered.example", "new-code").code == "new-code")
        prefs.edit().clear().commit()
    }

    private fun pollingChecks() {
        val prefs = targetContext.getSharedPreferences("bops", 0)
        val store = ServerStore(targetContext)
        val service = PingService()
        android.content.ContextWrapper::class.java.getDeclaredMethod("attachBaseContext", android.content.Context::class.java)
            .apply { isAccessible = true }.invoke(service, targetContext)
        PingService::class.java.getDeclaredMethod("channels").apply { isAccessible = true }.invoke(service)
        val poll = PingService::class.java.getDeclaredMethod("check", Server::class.java).apply { isAccessible = true }
        val nm = targetContext.getSystemService(android.app.NotificationManager::class.java)
        nm.cancelAll()
        // Exercise the HTTP polling method against loopback fixtures. Production tick still enforces
        // safeAddress; loopback is deliberately not admitted by that policy (tested separately).
        fun response(server: Server?, name: String, status: Int, key: String): Server {
            val socket = java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))
            socket.soTimeout = 5000
            val entry = if (server == null) store.save(name, "http://127.0.0.1:${socket.localPort}", name.repeat(32)) else server
            var cookie = ""
            val worker = kotlin.concurrent.thread {
                socket.use {
                    it.accept().use { client ->
                        client.soTimeout = 5000
                        val input = client.getInputStream().bufferedReader()
                        var line = input.readLine()
                        while (!line.isNullOrEmpty()) {
                            if (line.startsWith("Cookie:", true)) cookie = line.substringAfter(':').trim()
                            line = input.readLine()
                        }
                        val body = "{\"pings\":[{\"key\":\"$key\",\"title\":\"Task ready\",\"body\":\"Done\"}]}"
                        client.getOutputStream().write(("HTTP/1.1 $status Test\r\nContent-Length: ${body.toByteArray().size}\r\nConnection: close\r\n\r\n$body").toByteArray())
                    }
                }
            }
            // Preserve the stored identity/code but route this one request to the fixture's port.
            poll.invoke(service, entry.copy(address = "http://127.0.0.1:${socket.localPort}"))
            worker.join(6000)
            check(!worker.isAlive && cookie == "bops_remote=${entry.code}")
            return entry
        }
        val a = response(null, "PC", 200, "old")
        val b = response(null, "Hostinger", 200, "old")
        check(store.seen(a) == setOf("old") && store.seen(b) == setOf("old"))
        check(nm.activeNotifications.isEmpty())
        response(a, a.name, 200, "new")
        response(b, b.name, 200, "new")
        Thread.sleep(300)
        val alerts = nm.activeNotifications.filter { it.tag == "${a.id}:new" || it.tag == "${b.id}:new" }
        check(alerts.size == 2) { "Expected 2 alerts, got ${nm.activeNotifications.map { it.tag }}" }
        check(alerts.map { it.notification.extras.getString("android.title") }.toSet() ==
            setOf("PC: Task ready", "Hostinger: Task ready"))
        response(a, a.name, 500, "ignored")
        response(b, b.name, 200, "next")
        check(store.seen(a) == setOf("new") && store.seen(b) == setOf("next"))
        response(a, a.name, 401, "ignored")
        check(store.all().find { it.id == a.id }?.code == null)
        check(store.all().find { it.id == b.id }?.code == b.code)
        response(b, b.name, 403, "ignored")
        check(store.all().all { it.code == null })
        nm.cancelAll()
        prefs.edit().clear().commit()
    }

    private fun uiChecks() {
        val prefs = targetContext.getSharedPreferences("bops", 0)
        prefs.edit().putBoolean("notify", false).commit()
        val store = ServerStore(targetContext)
        val a = store.save("My PC", "https://pc.example.invalid", "a".repeat(32))
        val b = store.save("Hostinger", "https://host.example.invalid", "b".repeat(32))
        val activity = startActivitySync(android.content.Intent(targetContext, MainActivity::class.java)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        fun views(view: android.view.View): List<android.view.View> = listOf(view) +
            if (view is android.view.ViewGroup) (0 until view.childCount).flatMap { views(view.getChildAt(it)) } else emptyList()
        fun click(prefix: String) = runOnMainSync {
            val button = views(activity.window.decorView).filterIsInstance<android.widget.Button>()
                .first { it.text.toString().startsWith(prefix) }
            button.performClick()
        }
        fun awaitCookie(address: String, expected: String?) {
            repeat(100) {
                var value: String? = null
                runOnMainSync { value = android.webkit.CookieManager.getInstance().getCookie(address) }
                if (value == expected) return
                Thread.sleep(50)
            }
            error("Cookie mismatch for $address")
        }
        click("My PC")
        awaitCookie(a.address, "bops_remote=${a.code}")
        waitForIdleSync()
        runOnMainSync {
            val field = MainActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
            val originalWeb = field.get(activity)
            check(originalWeb != null)
            MainActivity::class.java.getDeclaredMethod("onNewIntent", android.content.Intent::class.java)
                .apply { isAccessible = true }
                .invoke(activity, android.content.Intent(activity, MainActivity::class.java).putExtra("serverId", a.id))
            check(field.get(activity) === originalWeb) // Tapping this server's ping must not reload its draft.
        }
        fun reject(view: android.webkit.WebView, address: String) {
            val request = object : android.webkit.WebResourceRequest {
                override fun getUrl() = android.net.Uri.parse(address)
                override fun isForMainFrame() = true
                override fun isRedirect() = false
                override fun hasGesture() = false
                override fun getMethod() = "GET"
                override fun getRequestHeaders() = emptyMap<String, String>()
            }
            view.webViewClient.onReceivedHttpError(view, request,
                android.webkit.WebResourceResponse("text/html", "UTF-8", 401, "Unauthorized", emptyMap(),
                    java.io.ByteArrayInputStream(byteArrayOf())))
        }
        val webField = MainActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
        runOnMainSync {
            val view = webField.get(activity) as android.webkit.WebView
            reject(view, a.address)
            check(webField.get(activity) === view) // Destruction must wait until this callback returns.
            // Leave before the rejection runs: the queued callback must not erase this pairing.
            views(activity.window.decorView).filterIsInstance<android.widget.Button>()
                .first { it.text.toString().startsWith("Servers") }.performClick()
        }
        waitForIdleSync()
        check(store.all().first { it.id == a.id }.code == a.code)
        click("My PC")
        awaitCookie(a.address, "bops_remote=${a.code}")
        waitForIdleSync()
        runOnMainSync {
            val view = webField.get(activity) as android.webkit.WebView
            reject(view, a.address)
            check(webField.get(activity) === view)
        }
        waitForIdleSync()
        check(store.all().first { it.id == a.id }.code == null)
        runOnMainSync { check(webField.get(activity) == null) }
        store.save(a.name, a.address, a.code!!)
        click("Saved servers")
        click("My PC")
        awaitCookie(a.address, "bops_remote=${a.code}")
        click("Servers")
        click("Hostinger")
        awaitCookie(b.address, "bops_remote=${b.code}")
        awaitCookie(a.address, null)
        waitForIdleSync()
        click("Servers")
        // An external pairing link shows its address but cannot save anything without Connect.
        val qr = android.net.Uri.Builder().scheme("bops").authority("pair")
            .appendQueryParameter("a", "https://my-pc.ts.net@evil.example.invalid")
            .appendQueryParameter("c", "q".repeat(32)).build()
        targetContext.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, qr, targetContext, MainActivity::class.java)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        waitForIdleSync()
        Thread.sleep(500)
        runOnMainSync {
            check(views(activity.window.decorView).filterIsInstance<android.widget.EditText>()
                .any { it.text.toString() == "https://my-pc.ts.net@evil.example.invalid" })
            check(views(activity.window.decorView).filterIsInstance<android.widget.TextView>()
                .any { it.text.toString() == "Target server: evil.example.invalid:443" })
        }
        click("Connect")
        runOnMainSync {
            check(views(activity.window.decorView).filterIsInstance<android.widget.TextView>()
                .any { it.text.toString() == "Use an address without user information, a query, or a fragment." })
        }
        check(store.all().size == 2)
        click("Saved servers")
        waitForIdleSync()
        uiAutomation.takeScreenshot()?.let { bitmap ->
            java.io.File(targetContext.getExternalFilesDir(null), "multi-server-switcher.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        }
        LlmCatalogChecks.uiChecks(this, activity, a, b)
        runOnMainSync { activity.finish() }
        prefs.edit().clear().commit()
    }

}
