package bot.bops.remote

import java.net.URI
import java.net.URLDecoder
import java.util.Locale

/**
 * The pairing link in the QR code from Bops' Settings: bops://pair?a=<address>&c=<code>. It reaches the
 * app two ways, the phone's camera app (an intent) and the app's own Scan QR code button, and both go
 * through [parse] so they're checked the same way. Any web page or QR code could carry such a link, so
 * an Ok result is only an offer: the app shows the server and asks before it connects.
 *
 * Plain JVM (java.net.URI, no android.net.Uri) so it runs in unit tests (src/test).
 */
sealed class PairLink {
    data class Ok(val address: String, val code: String) : PairLink()
    data class Bad(val why: String) : PairLink()

    companion object {
        const val NOT_BOPS = "That QR code isn't a Bops pairing code. In Bops on your computer, open Settings, then Your phone, and press Pair a phone."
        const val NO_CODE = "That QR code has no pairing code in it. Press Pair a phone in Bops again and scan the new code."
        const val NO_ADDRESS = "That QR code has no address in it. Turn on Tailscale on your computer, then press Pair a phone in Bops again."
        const val UNSAFE = "That QR code points to an address that would send your code unencrypted. Use your computer's Tailscale address (100.x.y.z) or an https address."

        fun parse(raw: String?): PairLink {
            val text = raw?.trim().orEmpty()
            val uri = try { URI(text) } catch (_: Exception) { return Bad(NOT_BOPS) }
            if (uri.scheme?.lowercase(Locale.ROOT) != "bops" || uri.host?.lowercase(Locale.ROOT) != "pair") return Bad(NOT_BOPS)
            val params = mutableMapOf<String, MutableList<String>>()
            for (part in uri.rawQuery.orEmpty().split('&')) {
                if (part.isEmpty()) continue
                val i = part.indexOf('=')
                val key = decode(if (i < 0) part else part.substring(0, i)) ?: return Bad(NOT_BOPS)
                val value = decode(if (i < 0) "" else part.substring(i + 1)) ?: return Bad(NOT_BOPS)
                params.getOrPut(key) { mutableListOf() }.add(value)
            }
            // One of each, never two: no guessing which address or code was meant.
            if ((params["a"]?.size ?: 0) > 1 || (params["c"]?.size ?: 0) > 1) return Bad(NOT_BOPS)
            val address = params["a"]?.single()?.trim()?.trimEnd('/').orEmpty()
            val code = params["c"]?.single()?.trim().orEmpty()
            if (address.isEmpty()) return Bad(NO_ADDRESS)
            if (code.isEmpty()) return Bad(NO_CODE)
            if (!Regex("^[A-Za-z0-9_-]{32,256}$").matches(code)) return Bad(NO_CODE)
            if (!safe(address)) return Bad(UNSAFE)
            return Ok(address, code)
        }

        private fun decode(s: String): String? = try { URLDecoder.decode(s, "UTF-8") } catch (_: Exception) { null }

        /** https anywhere; plain http only to a Tailscale address (100.64.0.0/10), as ServerSafety.safeAddress. */
        fun safe(address: String): Boolean {
            val u = try { URI(address) } catch (_: Exception) { return false }
            if (u.rawUserInfo != null || u.rawQuery != null || u.rawFragment != null) return false
            val host = u.host ?: return false
            return when (u.scheme?.lowercase(Locale.ROOT)) {
                "https" -> true
                "http" -> {
                    val octets = host.split(".")
                    val decimal = Regex("^(0|[1-9]\\d{0,2})$")
                    if (octets.size != 4 || !octets.all { decimal.matches(it) }) return false
                    val p = octets.map { it.toInt() }
                    p[0] == 100 && p[1] in 64..127 && p.all { it in 0..255 }
                }
                else -> false
            }
        }
    }
}
