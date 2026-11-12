package bot.bops.watch

import org.json.JSONObject

/** One thing on the watch: a bot waiting for your OK (approval) or something worth knowing (news, a finished task). */
data class Item(val key: String, val title: String, val body: String) {
    val isApproval get() = key.startsWith("a:")
}

/** What the phone answered for /bops/pings, made ready for the watch. Pure, so it's unit-tested (GlanceTest). */
data class Glance(val server: String, val items: List<Item>, val error: String?) {
    val waiting get() = items.count { it.isApproval }
    /** The one line under the title: what needs you first. */
    val headline get() = when {
        error != null -> error
        items.isEmpty() -> "All clear on $server"
        waiting > 0 -> "$waiting waiting for your OK"
        else -> "${items.size} new on $server"
    }

    companion object {
        fun parse(raw: String?): Glance {
            if (raw.isNullOrBlank()) return Glance("Bops", emptyList(), "No answer from the phone.")
            val o = try { JSONObject(raw) } catch (_: Exception) { return Glance("Bops", emptyList(), "The phone sent something odd.") }
            o.optString("error").takeIf { it.isNotBlank() }?.let { return Glance("Bops", emptyList(), it) }
            val list = o.optJSONArray("pings")
            val items = (0 until (list?.length() ?: 0)).mapNotNull { i ->
                val p = list!!.optJSONObject(i) ?: return@mapNotNull null
                val key = p.optString("key").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                Item(key, p.optString("title", "Bops").take(60), p.optString("body").take(200))
            }
            // Approvals first: they're the ones the watch can act on.
            return Glance(o.optString("server", "Bops"), items.sortedByDescending { it.isApproval }, null)
        }
    }
}
