package bot.bops.remote

import android.app.Activity
import android.app.Instrumentation
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

internal object LlmCatalogChecks {
    private const val body = """{"llms":[{"name":"Planner","provider":"openai","model":"example-model","starter":true,"useFor":["planning","thinking"]},{"name":"Writer","provider":"anthropic","model":"other-model"}]}"""
    private class Response(url: URL, private val status: Int, private val body: String,
                           private val gate: CountDownLatch? = null,
                           private val declaredLength: Int = -1) : HttpURLConnection(url) {
        var closed = false
        var streamClosed = false
        var bytesRead = 0
        var largestRead = 0
        private val stream by lazy {
            object : java.io.ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)) {
                override fun read(): Int = super.read().also { if (it != -1) bytesRead++ }
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                    largestRead = maxOf(largestRead, length)
                    return super.read(buffer, offset, length).also { if (it > 0) bytesRead += it }
                }
                override fun close() { streamClosed = true; super.close() }
            }
        }
        override fun connect() {}
        override fun disconnect() { closed = true }
        override fun usingProxy() = false
        override fun getResponseCode(): Int {
            check(gate?.await(5, TimeUnit.SECONDS) != false)
            return status
        }
        override fun getContentLength() = declaredLength
        override fun getContentLengthLong() = declaredLength.toLong()
        override fun getHeaderField(name: String?) =
            if (name.equals("Content-Length", true) && declaredLength >= 0) declaredLength.toString() else null
        override fun getInputStream() = stream
    }

    fun clientChecks() {
        val server = Server("one", "My PC", "https://pc.example.invalid", "a".repeat(32))
        var last: Response? = null
        val catalog = LlmCatalog { url -> Response(url, 200, body).also { last = it } }
        val result = catalog.load(server) as CatalogResult.Loaded
        check(result.models.size == 2 && result.models[0].starter && result.models[0].jobs == listOf("planning", "thinking"))
        check(result.models[1].jobs.isEmpty() && !result.models[1].starter)
        check(last!!.url.toString() == "${server.address}/api/llms")
        check(last!!.getRequestProperty("Cookie") == "bops_remote=${server.code}")
        check(last!!.requestMethod == "GET" && !last!!.instanceFollowRedirects && last!!.closed && last!!.streamClosed)
        check(last!!.connectTimeout == 8000 && last!!.readTimeout == 15000)
        check((catalog.parse("""{"llms":[]}""") as CatalogResult.Loaded).models.isEmpty())
        for (invalid in listOf("not JSON", "{}", """{"state":{}}""", """{"llms":[{}]}"""))
            check(catalog.parse(invalid) is CatalogResult.Error)
        for (status in listOf(401, 403)) check(LlmCatalog { Response(it, status, "") }.load(server) === CatalogResult.Unpaired)
        for (status in listOf(302, 500)) check(LlmCatalog { Response(it, status, "") }.load(server) is CatalogResult.Error)
        check(LlmCatalog { throw java.io.IOException("fixture") }.load(server) is CatalogResult.Error)
        check(LlmCatalog { error("must not connect") }.load(server.copy(code = null)) === CatalogResult.Unpaired)
        check(LlmCatalog { error("must not connect") }.load(server.copy(address = "http://192.168.1.1")) is CatalogResult.Error)
        fallbackChecks(server)
        responseLimitChecks(server)
    }

    private fun fallbackChecks(server: Server) {
        val calls = mutableListOf<Response>()
        val legacyBody = "{\"state\":$body}"
        val result = LlmCatalog { url ->
            Response(url, if (calls.isEmpty()) 404 else 200, legacyBody).also { calls.add(it) }
        }.load(server)
        check(result is CatalogResult.Loaded && result.models.size == 2)
        check(calls.map { it.url.path } == listOf("/api/llms", "/api/state"))
        check(calls.all { it.closed && !it.instanceFollowRedirects && it.requestMethod == "GET" &&
            it.getRequestProperty("Cookie") == "bops_remote=${server.code}" })
        // Auth failures, redirects, server errors, malformed 200 and connection errors never fall back.
        for (status in listOf(200, 301, 302, 401, 403, 429, 500)) {
            var count = 0
            val rejected = LlmCatalog { url -> count++; Response(url, status, "not JSON") }.load(server)
            check(count == 1)
            check(if (status == 401 || status == 403) rejected === CatalogResult.Unpaired else rejected is CatalogResult.Error)
        }
        for (status in listOf(401, 403, 404, 500)) {
            var count = 0
            val rejected = LlmCatalog { url -> Response(url, if (count++ == 0) 404 else status, "") }.load(server)
            check(count == 2)
            check(if (status == 401 || status == 403) rejected === CatalogResult.Unpaired else rejected is CatalogResult.Error)
        }
        var count = 0
        check(LlmCatalog { count++; throw java.io.IOException("fixture") }.load(server) is CatalogResult.Error)
        check(count == 1)
        // Legacy responses retain the same actual-byte limit, even without Content-Length.
        calls.clear()
        val oversized = LlmCatalog { url ->
            Response(url, if (calls.isEmpty()) 404 else 200, " ".repeat(5 * 1024 * 1024 + 1))
                .also { calls.add(it) }
        }.load(server)
        check(oversized is CatalogResult.Error && oversized.message.contains("5 MiB"))
        check(calls.size == 2 && calls.last().bytesRead == 5 * 1024 * 1024 + 1 && calls.all { it.closed })
        check(calls.last().streamClosed)
    }

    private fun responseLimitChecks(server: Server) {
        val limit = 5 * 1024 * 1024
        // A multibyte value ensures the boundary measures UTF-8 bytes, not String length.
        val json = """{"llms":[],"note":"é"}"""
        val exact = json + " ".repeat(limit - json.toByteArray(Charsets.UTF_8).size)
        var reply: Response? = null
        val exactResult = LlmCatalog { Response(it, 200, exact).also { response -> reply = response } }.load(server)
        check(exactResult is CatalogResult.Loaded && exactResult.models.isEmpty())
        check(reply!!.bytesRead == limit && reply!!.closed && reply!!.streamClosed)
        check(reply!!.largestRead <= 8192)
        // Both unknown and deliberately understated Content-Length must still hit the byte cap.
        for (declaredLength in listOf(-1, 1)) {
            val result = LlmCatalog {
                Response(it, 200, exact + " ".repeat(100_000), declaredLength = declaredLength)
                    .also { response -> reply = response }
            }.load(server)
            check(result is CatalogResult.Error && result.message.contains("exceeds the 5 MiB limit"))
            check(reply!!.bytesRead == limit + 1) { "Must stop after the single overflow probe byte" }
            check(reply!!.largestRead <= 8192 && reply!!.closed && reply!!.streamClosed)
        }
        // Under the character limit but over the byte limit must also fail.
        val multibyte = """{"llms":[],"note":"""" + "é".repeat(limit / 2) + "\"}"
        check(multibyte.length < limit && multibyte.toByteArray(Charsets.UTF_8).size > limit)
        val result = LlmCatalog { Response(it, 200, multibyte).also { response -> reply = response } }.load(server)
        check(result is CatalogResult.Error && result.message.contains("exceeds the 5 MiB limit"))
        check(reply!!.bytesRead == limit + 1 && reply!!.streamClosed && reply!!.closed)
        var streamClosed = false
        var disconnected = false
        val failed = LlmCatalog { url ->
            object : HttpURLConnection(url) {
                override fun connect() {}
                override fun disconnect() { disconnected = true }
                override fun usingProxy() = false
                override fun getResponseCode() = 200
                override fun getInputStream() = object : java.io.InputStream() {
                    override fun read(): Int = throw java.io.IOException("Interrupted fixture")
                    override fun close() { streamClosed = true }
                }
            }
        }.load(server)
        check(failed is CatalogResult.Error && streamClosed && disconnected)
    }

    fun uiChecks(test: Instrumentation, activity: Activity, a: Server, b: Server) {
        fun views(view: View): List<View> = listOf(view) + if (view is ViewGroup)
            (0 until view.childCount).flatMap { views(view.getChildAt(it)) } else emptyList()
        fun click(prefix: String) = test.runOnMainSync {
            views(activity.window.decorView).filterIsInstance<Button>().first { it.text.startsWith(prefix) }.performClick()
        }
        fun awaitText(text: String) {
            repeat(100) {
                var found = false
                test.runOnMainSync { found = views(activity.window.decorView).filterIsInstance<TextView>().any { it.text.toString().contains(text) } }
                if (found) return
                Thread.sleep(50)
            }
            error("Missing UI text: $text")
        }
        fun inject(status: Int, payload: String, gate: CountDownLatch? = null) {
            test.runOnMainSync {
                MainActivity::class.java.getDeclaredField("llmCatalog").apply { isAccessible = true }
                    .set(activity, LlmCatalog { Response(it, status, payload, gate) })
            }
        }
        click("My PC")
        awaitText("Settings")
        val webField = MainActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
        var originalWeb: Any? = null
        test.runOnMainSync { originalWeb = webField.get(activity) }
        val gate = CountDownLatch(1)
        inject(200, body, gate)
        click("Settings")
        awaitText("Loading configured models")
        gate.countDown()
        awaitText("Planner")
        awaitText("Default for new bots")
        awaitText("planning, thinking")
        awaitText("No jobs assigned")
        test.waitForIdleSync()
        test.uiAutomation.takeScreenshot()?.let { bitmap ->
            java.io.File(test.targetContext.getExternalFilesDir(null), "llm-settings.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        }
        click("Back to Bops")
        test.runOnMainSync { check(webField.get(activity) === originalWeb) }
        click("Settings"); awaitText("Planner")
        inject(200, """{"llms":[]}""")
        click("Refresh"); awaitText("No models configured")
        inject(500, "")
        click("Refresh"); awaitText("answered 500")
        inject(200, "not JSON")
        click("Refresh"); awaitText("unreadable model list")
        // A result for a screen the user left must not replace the server switcher.
        val staleGate = CountDownLatch(1)
        inject(200, body, staleGate)
        click("Refresh"); awaitText("Loading configured models")
        click("Saved servers")
        staleGate.countDown()
        Thread.sleep(200)
        awaitText("Your Bops servers")
        click("My PC"); awaitText("Settings")
        inject(401, "")
        click("Settings"); awaitText("Pair again")
        val store = ServerStore(test.targetContext)
        check(store.all().find { it.id == a.id }?.code == null)
        check(store.all().find { it.id == b.id }?.code == b.code)
    }
}
