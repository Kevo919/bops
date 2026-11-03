package bot.bops.remote

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

data class ConfiguredLlm(val name: String, val provider: String, val model: String, val starter: Boolean, val jobs: List<String>)

sealed class CatalogResult {
    data class Loaded(val models: List<ConfiguredLlm>) : CatalogResult()
    data class Error(val message: String) : CatalogResult()
    object Unpaired : CatalogResult()
}

/** Read-only snapshot of this server's configuration. Never reads or writes a local YAML file. */
internal class LlmCatalog(private val connection: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection }) {
    fun load(server: Server): CatalogResult {
        val code = server.code ?: return CatalogResult.Unpaired
        ServerSafety.safeAddress(server.address)?.let { return CatalogResult.Error(it) }
        return fetch(server, code, legacy = false)
    }

    private fun fetch(server: Server, code: String, legacy: Boolean): CatalogResult {
        var request: HttpURLConnection? = null
        return try {
            val path = if (legacy) "/api/state" else "/api/llms"
            request = connection(URL("${server.address}$path"))
            request.apply {
                requestMethod = "GET"
                instanceFollowRedirects = false
                connectTimeout = 8000
                readTimeout = 15000
                setRequestProperty("Cookie", "bops_remote=$code")
            }
            when (val status = request.responseCode) {
                401, 403 -> CatalogResult.Unpaired
                200 -> request.inputStream.use { readResponse(it, legacy) }
                404 -> if (!legacy) {
                    request.disconnect()
                    fetch(server, code, legacy = true)
                } else CatalogResult.Error("${server.name} answered 404. Update Bops on the server and try Refresh.")
                else -> CatalogResult.Error("${server.name} answered $status. Try Refresh in a moment.")
            }
        } catch (_: Exception) {
            CatalogResult.Error("Couldn't load models from ${server.name}. Check the connection and try Refresh.")
        } finally { request?.disconnect() }
    }

    /** Count actual bytes, including when Content-Length is absent or incorrect. */
    private fun readResponse(input: InputStream, legacy: Boolean): CatalogResult {
        val bytes = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (bytes.size() < MAX_RESPONSE_BYTES) {
            val count = input.read(buffer, 0, minOf(buffer.size, MAX_RESPONSE_BYTES - bytes.size()))
            if (count == -1) return parse(bytes.toString("UTF-8"), legacy)
            bytes.write(buffer, 0, count)
        }
        // One extra byte distinguishes an exactly-at-limit response from an oversized stream.
        if (input.read() != -1)
            return CatalogResult.Error("This server's response exceeds the 5 MiB limit. The model list couldn't be loaded.")
        return parse(bytes.toString("UTF-8"), legacy)
    }

    internal fun parse(body: String, legacy: Boolean = false): CatalogResult = try {
        val root = JSONObject(body)
        val rows = (if (legacy) root.getJSONObject("state") else root).optJSONArray("llms")
        if (rows == null) CatalogResult.Error("This server didn't provide its configured models. Update Bops on the server and try Refresh.")
        else CatalogResult.Loaded((0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index)
            val jobs = row.optJSONArray("useFor")
            ConfiguredLlm(row.getString("name"), row.getString("provider"), row.getString("model"),
                row.optBoolean("starter", false), if (jobs == null) emptyList() else (0 until jobs.length()).map { jobs.getString(it) })
        })
    } catch (_: Exception) {
        CatalogResult.Error("This server returned an unreadable model list. Try Refresh or update Bops on the server.")
    }

    private companion object { const val MAX_RESPONSE_BYTES = 5 * 1024 * 1024 }
}
