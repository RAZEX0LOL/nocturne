package app.nocturne.core

import java.io.IOException
import java.security.MessageDigest
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

class Credentials(server: String, username: String, val password: String) {
    val username = username.trim()
    val server: HttpUrl = server.trim().toHttpUrlOrNull()?.takeIf {
        (it.isHttps || isLocalNetworkHost(it.host)) &&
            it.username.isEmpty() && it.password.isEmpty() && it.query == null && it.fragment == null
    } ?: throw MusicException("Укажи адрес сервера по HTTPS без логина и параметров.")
    init { if (this.username.isEmpty() || password.isEmpty()) throw MusicException("Введи логин и пароль.") }

    val isInsecure: Boolean get() = !server.isHttps
    /** Устойчивое имя пары «сервер и пользователь», без секретов. */
    val account: String get() = "$username@${server.toString().trimEnd('/')}"
    override fun toString() = "Credentials(redacted)"

    companion object {
        /** Обычный HTTP разрешён только в домашней сети: пароль там не уходит в интернет. */
        fun isLocalNetworkHost(rawHost: String): Boolean {
            val host = rawHost.lowercase().trim('[', ']')
            if (host == "localhost" || host.endsWith(".local") || host.endsWith(".home.arpa")) return true
            if (host.contains(":")) return host == "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")
            val labels = host.split(".")
            if (labels.size == 1) return true
            val octets = labels.mapNotNull { it.toIntOrNull()?.takeIf { value -> value in 0..255 } }
            if (labels.size != 4 || octets.size != 4) return false
            return when {
                octets[0] == 10 || octets[0] == 127 -> true
                octets[0] == 192 && octets[1] == 168 -> true
                octets[0] == 169 && octets[1] == 254 -> true
                octets[0] == 172 && octets[1] in 16..31 -> true
                octets[0] == 100 && octets[1] in 64..127 -> true
                else -> false
            }
        }
    }
}

class NavidromeClient(
    val credentials: Credentials,
    private val http: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(java.time.Duration.ofSeconds(25)).followRedirects(false).followSslRedirects(false).build(),
) {
    /** `repeated` — параметры, которые встречаются несколько раз, например songId в createPlaylist. */
    fun url(
        endpoint: String,
        parameters: Map<String, String> = emptyMap(),
        repeated: List<Pair<String, String>> = emptyList(),
        salt: String = UUID.randomUUID().toString(),
    ): String {
        val hash = MessageDigest.getInstance("MD5").digest((credentials.password + salt).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return credentials.server.newBuilder().apply {
            addPathSegment("rest").addPathSegment("$endpoint.view")
            addQueryParameter("u", credentials.username)
            addQueryParameter("t", hash)
            addQueryParameter("s", salt)
            addQueryParameter("v", "1.16.1")
            addQueryParameter("c", "NocturneAndroid")
            addQueryParameter("f", "json")
            parameters.toSortedMap().forEach { (key, value) -> addQueryParameter(key, value) }
            repeated.forEach { (key, value) -> addQueryParameter(key, value) }
        }.build().toString()
    }

    suspend fun request(endpoint: String, parameters: Map<String, String> = emptyMap()): JsonObject = suspendCancellableCoroutine { continuation ->
        val call = http.newCall(Request.Builder().url(url(endpoint, parameters)).build())
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (!continuation.isCancelled) continuation.resumeWithException(MusicException("Не удалось связаться с сервером. Проверь сеть и адрес Navidrome."))
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    try {
                        if (!it.isSuccessful) throw MusicException("Сервер вернул HTTP ${it.code}.")
                        val parsed = decode(it.body?.string() ?: "")
                        continuation.resume(parsed)
                    } catch (error: Exception) {
                        continuation.resumeWithException(if (error is MusicException) error else MusicException("Сервер вернул неожиданный ответ."))
                    }
                }
            }
        })
    }
    suspend fun albums(type: String = "newest", offset: Int = 0): List<Album> =
        request("getAlbumList2", mapOf("type" to type, "size" to "40", "offset" to "$offset"))
            .obj("albumList2").objects("album").map(::album)
    suspend fun songs(albumId: String) = request("getAlbum", mapOf("id" to albumId)).obj("album").objects("song").map(::song)
    suspend fun artists() = request("getArtists").obj("artists").objects("index").flatMap { it.objects("artist") }.map(::artist)
    suspend fun artistAlbums(id: String) = request("getArtist", mapOf("id" to id)).obj("artist").objects("album").map(::album)
    suspend fun playlists() = request("getPlaylists").obj("playlists").objects("playlist").map {
        Playlist(it.text("id"), it.text("name"), it.number("songCount"), it.optional("coverArt"))
    }
    suspend fun playlistSongs(id: String) = request("getPlaylist", mapOf("id" to id)).obj("playlist").objects("entry").map(::song)
    suspend fun search(query: String): SearchResult {
        val data = request("search3", mapOf("query" to query, "songCount" to "50", "albumCount" to "30", "artistCount" to "20")).obj("searchResult3")
        return SearchResult(data.objects("album").map(::album), data.objects("song").map(::song), data.objects("artist").map(::artist))
    }
    suspend fun favorite(id: String, starred: Boolean, isAlbum: Boolean = false) {
        request(if (starred) "star" else "unstar", mapOf((if (isAlbum) "albumId" else "id") to id))
    }
    fun cover(id: String?) = id?.let { url("getCoverArt", mapOf("id" to it, "size" to "600")) }
    fun stream(id: String, quality: StreamQuality = StreamQuality.mp3High) =
        url("stream", mapOf("id" to id) + quality.parameters)

    companion object {
        fun decode(text: String): JsonObject {
            try {
                val response = Json.parseToJsonElement(text).jsonObject["subsonic-response"]?.jsonObject
                    ?: throw MusicException("Сервер вернул неожиданный ответ.")
                if (response.text("status") != "ok") {
                    val code = response.obj("error").number("code")
                    throw MusicException(if (code == 40) "Неверный логин или пароль." else "Ошибка Navidrome ($code).")
                }
                return response
            } catch (error: Exception) {
                throw if (error is MusicException) error else MusicException("Сервер вернул неожиданный ответ.")
            }
        }
        private fun album(o: JsonObject) = Album(o.text("id"), o.text("name"), o.optional("artist") ?: "Неизвестный исполнитель", o.optional("coverArt"), o.number("songCount"), o["year"]?.jsonPrimitive?.intOrNull, o.optional("starred") != null)
        fun song(o: JsonObject) = Song(
            o.text("id"), o.text("title"), o.optional("artist") ?: "Неизвестный исполнитель", o.text("album"),
            o.optional("coverArt"), o["duration"]?.jsonPrimitive?.doubleOrNull,
            o["track"]?.jsonPrimitive?.intOrNull, o.optional("starred") != null,
            o["userRating"]?.jsonPrimitive?.intOrNull, replayGain(o["replayGain"] as? JsonObject),
        )

        private fun replayGain(o: JsonObject?) = o?.let {
            ReplayGain(it.decimal("trackGain"), it.decimal("albumGain"), it.decimal("trackPeak"), it.decimal("albumPeak"))
        }
        private fun artist(o: JsonObject) = Artist(o.text("id"), o.text("name"), o.number("albumCount"), o.optional("coverArt"))
    }
}
private fun JsonObject.obj(key: String) = this[key] as? JsonObject ?: JsonObject(emptyMap())
private fun JsonObject.objects(key: String) = (this[key] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
private fun JsonObject.optional(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull
private fun JsonObject.text(key: String) = optional(key) ?: ""
private fun JsonObject.number(key: String) = (this[key] as? JsonPrimitive)?.intOrNull ?: 0
internal fun JsonObject.decimal(key: String) = (this[key] as? JsonPrimitive)?.doubleOrNull
