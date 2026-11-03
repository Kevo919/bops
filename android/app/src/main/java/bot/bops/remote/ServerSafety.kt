package bot.bops.remote

import android.net.Uri
import java.net.URI
import java.util.Locale

object ServerSafety {
    /** Canonical identity only: leave ambiguous/invalid authorities untouched, never reinterpret them. */
    fun normalizeAddress(address: String): String {
        val input = address.trim()
        return try {
            val uri = URI(input)
            val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return input
            if (scheme != "http" && scheme != "https") return input
            val host = uri.host?.lowercase(Locale.ROOT) ?: return input
            val userInfo = uri.rawUserInfo?.let { "$it@" } ?: ""
            val port = if (uri.port == -1 || (scheme == "http" && uri.port == 80) || (scheme == "https" && uri.port == 443)) "" else ":${uri.port}"
            val path = (uri.rawPath ?: "").trimEnd('/')
            val query = uri.rawQuery?.let { "?$it" } ?: ""
            val fragment = uri.rawFragment?.let { "#$it" } ?: ""
            "$scheme://$userInfo$host$port$path$query$fragment"
        } catch (_: Exception) { input }
    }

    fun safeAddress(a: String): String? {
        val u = Uri.parse(a)
        val host = u.host ?: return "That isn't an address."
        if (u.scheme == "https") return null
        if (u.scheme != "http") return "The address starts with http:// or https://."
        val octets = host.split(".")
        val decimalOctet = Regex("^(0|[1-9]\\d{0,2})$")
        val parts = if (octets.size == 4 && octets.all { decimalOctet.matches(it) }) octets.map { it.toInt() } else emptyList()
        val tailnet = parts.size == 4 && parts[0] == 100 && parts[1] in 64..127 && parts.all { it in 0..255 }
        return if (tailnet) null else "Use your computer's Tailscale address (100.x.y.z) or an https address, so the code isn't sent unencrypted."
    }

    fun sameSite(url: String, address: String): Boolean {
        val a = Uri.parse(address)
        val b = Uri.parse(url)
        fun port(u: Uri) = if (u.port != -1) u.port else if (u.scheme == "https") 443 else 80
        return a.scheme == b.scheme && a.host.equals(b.host, ignoreCase = true) && port(a) == port(b)
    }

}
