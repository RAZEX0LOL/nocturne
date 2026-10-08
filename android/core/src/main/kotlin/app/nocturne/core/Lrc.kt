package app.nocturne.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
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

/** Разбор названий для поиска в LRCLIB — так же, как на iPhone и на компьютере. */
object LyricsQuery {
    private val noise = Regex("""feat\.?|ft\.|prod\.|sped|slowed|reverb|remaster|version|edit|bonus|explicit|official|audio|video|lyrics""", RegexOption.IGNORE_CASE)
    private val group = Regex("""\s*[(\[][^)\]]*[)\]]""")
    private val suffix = Regex("""\s+-\s+(?:bonus track|single version|radio edit|remaster(?:ed)?(?: \d{4})?)$""", RegexOption.IGNORE_CASE)
    private val featTail = Regex("""\s+(?:feat\.?|ft\.)\s.*$""", RegexOption.IGNORE_CASE)
    private val separators = Regex("""\s*(?:,|/|;|\s&\s|\sx\s|\sfeat\.?\s|\sft\.\s|\sи\s)\s*""", RegexOption.IGNORE_CASE)
    private val unknown = Regex("""^(?:неизвестен|неизвестный исполнитель|unknown(?: artist)?|various artists|\[unknown])$""", RegexOption.IGNORE_CASE)
    private val altered = Regex("""sped\s*up|slowed|nightcore|speed\s*up""", RegexOption.IGNORE_CASE)

    /** Без «(feat. …)», «(Sped Up)», «[Remastered 2020]», « - Bonus Track». */
    fun cleanTitle(title: String): String = title
        .replace(group) { if (noise.containsMatchIn(it.value)) "" else it.value }
        .replace(suffix, "").replace(featTail, "").replace(Regex("""\s{2,}"""), " ").trim()

    /** «Lil Wayne, Ty Dolla ${'$'}ign» → «Lil Wayne». */
    fun primaryArtist(artist: String): String = artist.split(separators).first().trim()

    fun knownArtist(artist: String): String = artist.trim().takeUnless { it.isEmpty() || unknown.matches(it) }.orEmpty()

    fun isAltered(title: String) = altered.containsMatchIn(title)
}

/**
 * Тексты из LRCLIB (lrclib.net) — открытой базы синхронных текстов. Спрашивается, только если
 * у Navidrome текста нет и человек включил это в настройках: названия треков уходят стороннему сервису.
 *
 * Альбом в запрос не идёт: LRCLIB сверяет его буквально, а у треков из ВК и сборников он «VK»
 * или название плейлиста — точный запрос всегда давал 404. Не нашлось — поиск по очищенному
 * названию и первому исполнителю.
 */
class LrclibClient(private val http: OkHttpClient = OkHttpClient(), private val base: String = "https://lrclib.net") {
    /** Точный запрос; без исполнителя его не бывает. */
    fun url(song: Song): String? {
        val artist = LyricsQuery.knownArtist(song.artist)
        if (song.title.isBlank() || artist.isEmpty()) return null
        return "$base/api/get".toHttpUrl().newBuilder().apply {
            addQueryParameter("track_name", song.title)
            addQueryParameter("artist_name", artist)
            song.duration?.let { addQueryParameter("duration", "${Math.round(it)}") }
        }.build().toString()
    }

    /** Поиски по порядку, если точного нет. */
    fun searchUrls(song: Song): List<String> {
        if (song.title.isBlank()) return emptyList()
        val artist = LyricsQuery.knownArtist(song.artist)
        val title = LyricsQuery.cleanTitle(song.title).ifEmpty { song.title }
        val queries = if (artist.isEmpty()) listOf(mapOf("q" to title)) else buildList {
            val first = LyricsQuery.primaryArtist(artist)
            add(mapOf("track_name" to title, "artist_name" to first))
            add(mapOf("q" to "$first $title"))
            // Ускоренная или замедленная версия — обычно чужой песни: текст оригинала по одному названию.
            if (LyricsQuery.isAltered(song.title)) add(mapOf("track_name" to title))
        }
        return queries.map { params ->
            "$base/api/search".toHttpUrl().newBuilder().apply { params.forEach { (key, value) -> addQueryParameter(key, value) } }.build().toString()
        }
    }

    suspend fun lyrics(song: Song): Lyrics? = withContext(Dispatchers.IO) {
        url(song)?.let { address -> fetch(address)?.let { pick(listOfNotNull(it as? JsonObject), song.duration) } }?.let { return@withContext it }
        for (address in searchUrls(song)) {
            val found = (fetch(address) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: continue
            pick(found, song.duration)?.let { return@withContext it }
        }
        null
    }

    private fun fetch(address: String): JsonElement? = runCatching {
        http.newCall(Request.Builder().url(address).build()).execute().use { response ->
            if (!response.isSuccessful) null else Json.parseToJsonElement(response.body?.string().orEmpty())
        }
    }.getOrNull()

    companion object {
        private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

        fun decode(text: String): Lyrics? {
            val json = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
            return fromRecord(json, synced = true)
        }

        private fun fromRecord(json: JsonObject, synced: Boolean): Lyrics? {
            val lrc = json.text("syncedLyrics")
            if (synced && lrc != null) {
                val lines = Lrc.parse(lrc)
                if (lines.isNotEmpty()) return Lyrics(true, lines)
            }
            val plain = json.text("plainLyrics") ?: lrc?.let { text -> Lrc.parse(text).joinToString("\n") { it.value } }?.takeIf { it.isNotBlank() }
            return plain?.let { Lyrics(false, it.split("\n").map { line -> LyricLine(null, line) }) }
        }

        /**
         * Лучший из найденных: длительность в пределах 5 секунд, синхронный важнее. Длительность
         * не совпала ни у кого (ускоренная версия) — только простой текст: чужие тайминги разъедутся со звуком.
         */
        fun pick(records: List<JsonObject>, duration: Double?): Lyrics? {
            val usable = records.filter {
                (it["instrumental"] as? JsonPrimitive)?.booleanOrNull != true && (it.text("syncedLyrics") != null || it.text("plainLyrics") != null)
            }
            if (usable.isEmpty()) return null
            fun distance(record: JsonObject): Double {
                val own = (record["duration"] as? JsonPrimitive)?.doubleOrNull
                return if (duration == null || own == null) 0.0 else kotlin.math.abs(own - duration)
            }
            val close = usable.filter { distance(it) <= 5 }
            if (close.isNotEmpty()) {
                val best = close.sortedWith(compareBy<JsonObject>({ if (it.text("syncedLyrics") != null) 0 else 1 }, { distance(it) })).first()
                return fromRecord(best, synced = true)
            }
            return fromRecord(usable.minBy(::distance), synced = false)
        }
    }
}
