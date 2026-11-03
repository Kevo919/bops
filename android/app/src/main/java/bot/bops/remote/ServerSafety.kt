package bot.bops.remote

import android.net.Uri

object ServerSafety {
    fun safeAddress(a: String): String? {
        val u = Uri.parse(a)
        val host = u.host ?: return "That isn't an address."
        if (u.scheme == "https") return null
        if (u.scheme != "http") return "The address starts with http:// or https://."
        val parts = host.split(".").mapNotNull { it.toIntOrNull() }
        val tailnet = parts.size == 4 && parts[0] == 100 && parts[1] in 64..127 && parts.all { it in 0..255 } && host.split(".").size == 4
        return if (tailnet) null else "Use your computer's Tailscale address (100.x.y.z) or an https address, so the code isn't sent unencrypted."
    }

    fun sameSite(url: String, address: String): Boolean {
        val a = Uri.parse(address)
        val b = Uri.parse(url)
        fun port(u: Uri) = if (u.port != -1) u.port else if (u.scheme == "https") 443 else 80
        return a.scheme == b.scheme && a.host.equals(b.host, ignoreCase = true) && port(a) == port(b)
    }

}
