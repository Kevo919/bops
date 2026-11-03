package bot.bops.remote

import org.json.JSONObject
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
        var request: HttpURLConnection? = null
        return try {
            request = connection(URL("${server.address}/api/state"))
            request.apply {
                requestMethod = "GET"
                instanceFollowRedirects = false
                connectTimeout = 8000
                readTimeout = 15000
                setRequestProperty("Cookie", "bops_remote=$code")
            }
            when (val status = request.responseCode) {
                401, 403 -> CatalogResult.Unpaired
                200 -> parse(request.inputStream.bufferedReader().use { it.readText() })
                else -> CatalogResult.Error("${server.name} answered $status. Try Refresh in a moment.")
            }
        } catch (_: Exception) {
            CatalogResult.Error("Couldn't load models from ${server.name}. Check the connection and try Refresh.")
        } finally { request?.disconnect() }
    }

    internal fun parse(body: String): CatalogResult = try {
        val state = JSONObject(body).getJSONObject("state")
        val rows = state.optJSONArray("llms")
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
}
