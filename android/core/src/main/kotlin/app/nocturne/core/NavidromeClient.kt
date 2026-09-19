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
        it.isHttps && it.username.isEmpty() && it.password.isEmpty() && it.query == null && it.fragment == null
    } ?: throw MusicException("Укажи HTTPS-адрес сервера без логина и параметров.")
    init { if (this.username.isEmpty() || password.isEmpty()) throw MusicException("Введи логин и пароль.") }
    override fun toString() = "Credentials(redacted)"
}

class NavidromeClient(
    val credentials: Credentials,
    private val http: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(java.time.Duration.ofSeconds(25)).followRedirects(false).followSslRedirects(false).build(),
) {
    fun url(endpoint: String, parameters: Map<String, String> = emptyMap(), salt: String = UUID.randomUUID().toString()): String {
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
            parameters.forEach { (key, value) -> addQueryParameter(key, value) }
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
    fun stream(id: String) = url("stream", mapOf("id" to id, "format" to "mp3", "maxBitRate" to "320"))

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
        private fun song(o: JsonObject) = Song(o.text("id"), o.text("title"), o.optional("artist") ?: "Неизвестный исполнитель", o.text("album"), o.optional("coverArt"), o["duration"]?.jsonPrimitive?.doubleOrNull?.toLong() ?: 0, o.optional("starred") != null)
        private fun artist(o: JsonObject) = Artist(o.text("id"), o.text("name"), o.number("albumCount"), o.optional("coverArt"))
    }
}
private fun JsonObject.obj(key: String) = this[key] as? JsonObject ?: JsonObject(emptyMap())
private fun JsonObject.objects(key: String) = (this[key] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
private fun JsonObject.optional(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull
private fun JsonObject.text(key: String) = optional(key) ?: ""
private fun JsonObject.number(key: String) = (this[key] as? JsonPrimitive)?.intOrNull ?: 0
