package bot.bops.remote

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * The Bops watch app (android/wear) asks the phone, and the phone asks Bops: the watch has no Tailscale and
 * never holds the pairing code. Requests arrive over Wear OS's Data Layer, which only connects the same app
 * (same package name AND same signing key) on the user's own paired watch.
 *
 * Paths (request body and answer are small JSON):
 *   /bops/pings    {}                         -> {server, pings:[{key,title,body}]}  (GET /api/pings)
 *   /bops/approve  {id:"a:<id>", reply}       -> {ok} or {error}   reply: once | reject  (POST /api/apps/approvals)
 *   /bops/say      {text}                     -> {ok} or {error}   to Boppy's chat (POST /api/chats/bot:boppy/messages)
 * Errors come back as {error:"..."} in plain words for the watch to show.
 */
class WatchBridge : WearableListenerService() {

    override fun onRequest(nodeId: String, path: String, request: ByteArray): Task<ByteArray> =
        Tasks.forResult(answer(path, request).toString().toByteArray(Charsets.UTF_8))

    internal fun answer(path: String, request: ByteArray): JSONObject {
        val server = ServerStore(this).let { it.active() ?: it.all().firstOrNull { s -> s.code != null } }
            ?: return err("Pair this phone with Bops first (open the Bops app on the phone).")
        val code = server.code ?: return err("${server.name} needs pairing again on the phone.")
        if (ServerSafety.safeAddress(server.address) != null) return err("The phone's Bops address isn't safe to use.")
        val body = try {
            if (request.isEmpty()) JSONObject() else JSONObject(String(request, Charsets.UTF_8).take(4000))
        } catch (_: Exception) { return err("Bad request from the watch.") }
        return when (path) {
            "/bops/pings" -> call(server, code, "GET", "/api/pings", null).let { r ->
                if (r.optString("error").isNotEmpty()) r
                else JSONObject().put("server", server.name).put("pings", r.optJSONArray("pings") ?: JSONArray())
            }
            "/bops/approve" -> {
                val id = body.optString("id").removePrefix("a:")
                val reply = body.optString("reply")
                if (id.isBlank() || id.length > 200) err("Which request?")
                else if (reply != "once" && reply != "reject") err("Only Allow once or Deny from the watch.")
                else call(server, code, "POST", "/api/apps/approvals", JSONObject().put("id", id).put("reply", reply))
            }
            "/bops/say" -> {
                val text = body.optString("text").trim().take(1000)
                if (text.isEmpty()) err("Nothing to send.")
                else call(server, code, "POST", "/api/chats/${URLEncoder.encode("bot:boppy", "UTF-8")}/messages", JSONObject().put("text", text))
            }
            else -> err("Unknown watch request.")
        }
    }

    private fun call(server: Server, code: String, method: String, path: String, json: JSONObject?): JSONObject {
        var c: HttpURLConnection? = null
        return try {
            c = (URL(server.address.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                instanceFollowRedirects = false
                connectTimeout = 10000; readTimeout = 15000
                setRequestProperty("Cookie", "bops_remote=$code")
                if (json != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    outputStream.use { it.write(json.toString().toByteArray(Charsets.UTF_8)) }
                }
            }
            val status = c.responseCode
            if (status == 401 || status == 403) {
                val msg = readLimited(c, error = true)
                return err(JSONObject(msg.ifBlank { "{}" }).optString("error").ifBlank { "Bops said no. Pair the phone again if this keeps happening." })
            }
            val text = readLimited(c, error = status >= 400)
            val parsed = try { JSONObject(text.ifBlank { "{}" }) } catch (_: Exception) { JSONObject() }
            if (status >= 400) err(parsed.optString("error").ifBlank { "Bops answered $status." }) else parsed
        } catch (_: Exception) {
            err("Can't reach ${server.name}. Is Tailscale on and Bops running?")
        } finally { c?.disconnect() }
    }

    private fun readLimited(c: HttpURLConnection, error: Boolean): String {
        val stream = (if (error) c.errorStream else c.inputStream) ?: return ""
        return stream.use { s ->
            val buf = ByteArray(256 * 1024)
            var n = 0
            while (n < buf.size) { val r = s.read(buf, n, buf.size - n); if (r < 0) break; n += r }
            String(buf, 0, n, Charsets.UTF_8)
        }
    }

    private fun err(message: String) = JSONObject().put("error", message)
}
