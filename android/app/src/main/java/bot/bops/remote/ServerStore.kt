package bot.bops.remote

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.UUID

data class Server(val id: String, val name: String, val address: String, val code: String?)

/** All read/modify/write operations share a lock across the activity and polling threads. */
class ServerStore(context: Context) {
    private val prefs = context.getSharedPreferences("bops", Context.MODE_PRIVATE)

    init {
        synchronized(lock) {
            if (!prefs.contains("servers")) {
                val address = prefs.getString("address", null)
                val old = address?.let { Server(UUID.randomUUID().toString(), "My Bops", it, prefs.getString("code", null)) }
                val edit = prefs.edit().putString("servers", encode(listOfNotNull(old)))
                if (old != null) {
                    edit.putString("activeServer", old.id)
                    prefs.getStringSet("seen", null)?.let { edit.putStringSet("seen:${old.id}", it.toSet()) }
                }
                edit.remove("address").remove("code").remove("seen").apply()
            }
        }
    }

    fun all(): List<Server> = synchronized(lock) {
        val stored = prefs.all["servers"]
        val raw = stored?.toString() ?: "[]"
        try {
            if (stored != null && stored !is String) throw JSONException("Server list has the wrong preference type")
            val rows = JSONArray(raw)
            (0 until rows.length()).map { i ->
                val row = rows.getJSONObject(i)
                Server(row.getString("id"), row.getString("name"), row.getString("address"),
                    if (row.isNull("code")) null else row.getString("code"))
            }
        } catch (_: JSONException) {
            // Keep the original (including credentials) only in the same private, non-backed-up prefs.
            // Recover once so the activity, watcher and boot receiver cannot repeatedly crash on it.
            prefs.edit().putString("servers.corrupt.${UUID.randomUUID()}", raw)
                .putString("servers", "[]").remove("activeServer").apply()
            emptyList()
        }
    }

    fun active() = all().find { it.id == prefs.getString("activeServer", null) }
    fun select(id: String) = synchronized(lock) { prefs.edit().putString("activeServer", id).apply() }

    fun save(name: String, address: String, code: String): Server = synchronized(lock) {
        val rows = all().toMutableList()
        val canonical = ServerSafety.normalizeAddress(address)
        val matches = rows.filter { ServerSafety.normalizeAddress(it.address) == canonical }
        val activeId = prefs.getString("activeServer", null)
        val previous = matches.find { it.id == activeId } ?: matches.firstOrNull()
        val server = Server(previous?.id ?: UUID.randomUUID().toString(), name, canonical, code)
        rows.removeAll { it in matches }; rows.add(server)
        val edit = prefs.edit().putString("servers", encode(rows))
        for (duplicate in matches.filter { it.id != server.id }) edit.remove("seen:${duplicate.id}")
        if (previous?.code != code) edit.remove("seen:${server.id}")
        edit.apply()
        server
    }

    fun rename(id: String, name: String) = synchronized(lock) {
        prefs.edit().putString("servers", encode(all().map { if (it.id == id) it.copy(name = name) else it })).apply()
    }

    fun remove(id: String) = synchronized(lock) {
        val edit = prefs.edit().putString("servers", encode(all().filterNot { it.id == id })).remove("seen:$id")
        if (active()?.id == id) edit.remove("activeServer")
        edit.apply()
    }

    // A stale failed request must not erase a freshly replaced pairing code.
    fun forget(server: Server) = synchronized(lock) {
        if (all().find { it.id == server.id }?.code == server.code) {
            prefs.edit().putString("servers", encode(all().map { if (it.id == server.id) it.copy(code = null) else it }))
                .remove("seen:${server.id}").apply()
        }
    }

    fun seen(server: Server): Set<String>? = synchronized(lock) { prefs.getStringSet("seen:${server.id}", null)?.toSet() }
    fun remember(server: Server, keys: Set<String>) = synchronized(lock) {
        if (all().find { it.id == server.id }?.code == server.code)
            prefs.edit().putStringSet("seen:${server.id}", keys).apply()
    }

    private fun encode(rows: List<Server>) = JSONArray().apply {
        rows.forEach { put(JSONObject().put("id", it.id).put("name", it.name).put("address", it.address).put("code", it.code ?: JSONObject.NULL)) }
    }.toString()

    companion object { private val lock = Any() }
}
