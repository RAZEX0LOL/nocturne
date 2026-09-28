package app.nocturne.music

import android.content.Context
import app.nocturne.core.Song
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import app.nocturne.core.NavidromeClient
import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Копии серверных треков для прослушивания без сети (shared/spec/offline.md).
 *
 * Рядом с каждым файлом лежат его метаданные, поэтому после перезапуска список собирается
 * с диска, без обращения к серверу. Файл переносится на место только целиком: оборванная
 * загрузка не должна выглядеть готовой.
 */
class DownloadStore(context: Context) {
    private val folder = File(context.filesDir, "downloads").apply { mkdirs() }
    private val http = OkHttpClient.Builder().callTimeout(java.time.Duration.ofMinutes(10)).build()

    @Volatile private var paths: Map<String, String> = emptyMap()
    @Volatile private var covers: Map<String, String> = emptyMap()

    fun pathOf(id: String) = paths[id]

    /** Обложки, скачанные вместе с треками: id обложки → файл. Ищутся по id, поэтому хватает одной на альбом. */
    fun coverFiles() = covers

    fun isDownloaded(id: String) = paths.containsKey(id)

    suspend fun load(): List<Song> = withContext(Dispatchers.IO) {
        // Приложение могли закрыть посреди загрузки: такой огрызок никому не нужен и место занимает.
        folder.listFiles().orEmpty().filter { it.extension == "part" }.forEach { it.delete() }
        val files = folder.listFiles().orEmpty()
        val audio = files.filter { it.extension !in setOf("json", "part", "cover") }.associateBy { it.nameWithoutExtension }
        val art = files.filter { it.extension == "cover" }.associateBy { it.nameWithoutExtension }
        val found = mutableMapOf<String, String>()
        val foundCovers = mutableMapOf<String, String>()
        val songs = files.filter { it.extension == "json" }.mapNotNull { meta ->
            // Метаданные храним в том же виде, в каком их отдаёт сервер, и читаем тем же разбором.
            val song = runCatching { NavidromeClient.song(Json.parseToJsonElement(meta.readText()).jsonObject) }
                .getOrNull()?.takeIf { it.id.isNotEmpty() } ?: return@mapNotNull null
            val file = audio[meta.nameWithoutExtension] ?: return@mapNotNull null
            found[song.id] = file.absolutePath
            song.coverArt?.let { cover -> art[meta.nameWithoutExtension]?.let { foundCovers[cover] = it.absolutePath } }
            song
        }
        paths = found
        covers = foundCovers
        songs.sortedWith(compareBy({ it.album }, { it.track ?: 0 }, { it.title }))
    }

    /** Скачивает трек; возвращает false, если сервер отказал или файл не дошёл целиком. */
    suspend fun download(url: String, song: Song, coverUrl: String? = null): Boolean = withContext(Dispatchers.IO) {
        val stem = safeName(song.id)
        val partial = File(folder, "$stem.part")
        try {
            http.newCall(Request.Builder().url(url).build()).execute().use { response ->
                if (!response.isSuccessful) return@withContext false
                val body = response.body ?: return@withContext false
                partial.outputStream().use { output -> body.byteStream().copyTo(output) }
                val target = File(folder, "$stem.${extensionFor(response.header("Content-Type"))}")
                if (!partial.renameTo(target)) return@withContext false
                File(folder, "$stem.json").writeText(NavidromeClient.describe(song).toString())
                paths = paths + (song.id to target.absolutePath)
                // Обложку кладём рядом: без сети серверный адрес уже не откроется, а файл откроется.
                val coverId = song.coverArt
                if (coverUrl != null && coverId != null) {
                    val cover = File(folder, "$stem.cover")
                    if (saveCover(coverUrl, cover)) covers = covers + (coverId to cover.absolutePath)
                }
            }
            true
        } catch (_: Exception) {
            partial.delete()
            false
        }
    }

    suspend fun remove(song: Song) = withContext(Dispatchers.IO) {
        val stem = safeName(song.id)
        folder.listFiles().orEmpty().filter { it.nameWithoutExtension == stem }.forEach { it.delete() }
        paths = paths - song.id
        // Список обложек пересобирается ближайшим load(): обложка альбома могла остаться от других треков.
    }

    /** Обложка — украшение: не дошла, и ничего страшного, трек всё равно скачан. */
    private fun saveCover(url: String, target: File): Boolean = try {
        http.newCall(Request.Builder().url(url).build()).execute().use { response ->
            val body = response.body
            if (!response.isSuccessful || body == null) false
            else { target.outputStream().use { output -> body.byteStream().copyTo(output) }; true }
        }
    } catch (_: Exception) {
        false
    }

    suspend fun totalBytes(): Long = withContext(Dispatchers.IO) {
        folder.listFiles().orEmpty().filter { it.extension != "json" }.sumOf { it.length() }
    }

    private companion object {
        /** Идентификатор с сервера может содержать что угодно, имя файла — нет. */
        fun safeName(id: String) = id.map { if (it.isLetterOrDigit() || it == '-' || it == '_') it else '_' }.joinToString("")

        fun extensionFor(contentType: String?) = when (contentType?.substringBefore(';')?.trim()) {
            "audio/mpeg", "audio/mp3" -> "mp3"
            "audio/flac", "audio/x-flac" -> "flac"
            "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac" -> "m4a"
            "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave" -> "wav"
            "audio/ogg", "application/ogg" -> "ogg"
            "audio/opus" -> "opus"
            else -> "audio"
        }
    }
}
