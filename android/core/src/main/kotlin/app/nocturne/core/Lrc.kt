package app.nocturne.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Формат LRC: «[мм:сс.сс] строка», у одной строки может быть несколько отметок времени (припев).
 * Строки без отметок — метаданные вроде «[ar: …]» — пропускаются.
 */
object Lrc {
    private val stamp = Regex("""\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]""")

    fun parse(text: String): List<LyricLine> = text.lines().flatMap { raw ->
        val line = raw.trimEnd('\r')
        val matches = stamp.findAll(line).toList()
        if (matches.isEmpty()) return@flatMap emptyList()
        val value = line.substring(matches.last().range.last + 1).trim()
        matches.map { match ->
            val (minutes, seconds, fraction) = match.destructured
            val millis = if (fraction.isEmpty()) 0 else fraction.padEnd(3, '0').toInt()
            LyricLine((minutes.toInt() * 60 + seconds.toInt()) * 1000 + millis, value)
        }
    }.sortedBy { it.start ?: 0 }
}

/**
 * Тексты из LRCLIB (lrclib.net) — открытой базы синхронных текстов. Спрашивается, только если
 * у Navidrome текста нет и человек включил это в настройках: названия треков уходят стороннему сервису.
 */
class LrclibClient(private val http: OkHttpClient = OkHttpClient(), private val base: String = "https://lrclib.net") {
    fun url(song: Song): String? {
        if (song.title.isBlank() || song.artist.isBlank() || song.artist == "Неизвестный исполнитель") return null
        return "$base/api/get".toHttpUrl().newBuilder().apply {
            addQueryParameter("track_name", song.title)
            addQueryParameter("artist_name", song.artist)
            if (song.album.isNotBlank()) addQueryParameter("album_name", song.album)
            song.duration?.let { addQueryParameter("duration", "${Math.round(it)}") }
        }.build().toString()
    }

    suspend fun lyrics(song: Song): Lyrics? = withContext(Dispatchers.IO) {
        val address = url(song) ?: return@withContext null
        runCatching {
            http.newCall(Request.Builder().url(address).build()).execute().use { response ->
                if (!response.isSuccessful) null else decode(response.body?.string().orEmpty())
            }
        }.getOrNull()
    }

    companion object {
        fun decode(text: String): Lyrics? {
            val json = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
            val synced = (json["syncedLyrics"] as? JsonPrimitive)?.contentOrNull
            if (!synced.isNullOrBlank()) {
                val lines = Lrc.parse(synced)
                if (lines.isNotEmpty()) return Lyrics(true, lines)
            }
            val plain = (json["plainLyrics"] as? JsonPrimitive)?.contentOrNull
            if (!plain.isNullOrBlank()) return Lyrics(false, plain.split("\n").map { LyricLine(null, it) })
            return null
        }
    }
}
