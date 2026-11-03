package bot.bops.remote

import android.content.Context
import org.json.JSONArray
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
        val rows = JSONArray(prefs.getString("servers", "[]"))
        (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            Server(row.getString("id"), row.getString("name"), row.getString("address"),
                if (row.isNull("code")) null else row.getString("code"))
        }
    }

    fun active() = all().find { it.id == prefs.getString("activeServer", null) }
    fun select(id: String) = synchronized(lock) { prefs.edit().putString("activeServer", id).apply() }

    fun save(name: String, address: String, code: String): Server = synchronized(lock) {
        val rows = all().toMutableList()
        val previous = rows.find { it.address == address }
        val server = Server(previous?.id ?: UUID.randomUUID().toString(), name, address, code)
        rows.removeAll { it.id == server.id }; rows.add(server)
        val edit = prefs.edit().putString("servers", encode(rows))
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
