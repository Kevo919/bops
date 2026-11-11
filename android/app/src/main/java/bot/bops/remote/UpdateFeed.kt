package bot.bops.remote

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Where new Bops APKs come from: the GitHub release this build was published to (BuildConfig.RELEASE_TAG,
 * android-latest or android-latest-test). CI writes android-version.json next to the APKs:
 *   {"versionCode": 12, "phone": {"asset": "bops-remote.apk", "sha256": "…"}, "watch": {"asset": "bops-watch.apk", "sha256": "…"}}
 * Every download is checked against that SHA-256 before anything is installed, and Android itself refuses an update
 * signed with a different key, so a swapped file can't be installed.
 */
object UpdateFeed {
    const val REPO = "Kevo919/bops"
    private const val MAX_APK = 60L * 1024 * 1024

    data class Asset(val name: String, val sha256: String)
    data class Release(val versionCode: Int, val phone: Asset, val watch: Asset?)

    fun feedUrl(tag: String) = "https://github.com/$REPO/releases/download/$tag/android-version.json"
    fun assetUrl(tag: String, name: String) = "https://github.com/$REPO/releases/download/$tag/$name"

    /** Only GitHub's own hosts; release downloads redirect from github.com to its asset CDN. */
    fun allowedHost(url: String): Boolean {
        val u = try { URL(url) } catch (_: Exception) { return false }
        if (u.protocol != "https") return false
        val h = u.host.lowercase()
        return h == "github.com" || h == "objects.githubusercontent.com" || h == "release-assets.githubusercontent.com"
    }

    private val SHA = Regex("^[0-9a-f]{64}$")
    private val NAME = Regex("^[A-Za-z0-9._-]{1,80}\\.apk$")

    fun parse(raw: String): Release? = try {
        val o = JSONObject(raw)
        fun asset(key: String): Asset? = o.optJSONObject(key)?.let { a ->
            val name = a.optString("asset"); val sha = a.optString("sha256").lowercase()
            if (NAME.matches(name) && SHA.matches(sha)) Asset(name, sha) else null
        }
        val code = o.optInt("versionCode", -1)
        val phone = asset("phone")
        if (code <= 0 || phone == null) null else Release(code, phone, asset("watch"))
    } catch (_: Exception) { null }

    /** Fetch the release description; null when unreachable or not valid. Runs on a background thread. */
    fun latest(tag: String): Release? = fetch(feedUrl(tag), 64 * 1024)?.let { parse(String(it, Charsets.UTF_8)) }

    /** Download an APK into [dir] and keep it only if its SHA-256 matches. Runs on a background thread. */
    fun download(tag: String, asset: Asset, dir: File): File? {
        val bytes = fetch(assetUrl(tag, asset.name), MAX_APK) ?: return null
        if (sha256(bytes) != asset.sha256) return null
        dir.mkdirs()
        return File(dir, asset.name).apply { writeBytes(bytes) }
    }

    fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    /** GET following at most 5 redirects, each to an allowed GitHub host, reading at most [cap] bytes. */
    private fun fetch(start: String, cap: Long): ByteArray? {
        var url = start
        repeat(5) {
            if (!allowedHost(url)) return null
            var c: HttpURLConnection? = null
            try {
                c = (URL(url).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false; connectTimeout = 15000; readTimeout = 30000
                    setRequestProperty("Accept", "application/octet-stream")
                }
                when (c.responseCode) {
                    in 300..399 -> { url = c.getHeaderField("Location") ?: return null; return@repeat }
                    200 -> {
                        val len = c.contentLengthLong
                        if (len > cap) return null
                        return c.inputStream.use { s ->
                            val out = java.io.ByteArrayOutputStream()
                            val buf = ByteArray(64 * 1024); var total = 0L
                            while (true) {
                                val n = s.read(buf); if (n < 0) break
                                total += n; if (total > cap) return null
                                out.write(buf, 0, n)
                            }
                            out.toByteArray()
                        }
                    }
                    else -> return null
                }
            } catch (_: Exception) { return null } finally { c?.disconnect() }
        }
        return null
    }
}
