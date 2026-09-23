package app.nocturne.music

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.documentfile.provider.DocumentFile
import app.nocturne.core.LOCAL_ID_PREFIX
import app.nocturne.core.Song
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Музыка, которая лежит на самом телефоне (shared/spec/offline.md).
 *
 * Файлы живут в папке приложения `Music`: она видна файловому менеджеру и не требует разрешений
 * на чужие файлы. Добавить туда музыку можно системным выбором файлов или папки — что выбрали,
 * копируется внутрь, чтобы трек не пропал вместе с отозванным доступом.
 */
class LocalLibrary(private val context: Context) {
    private val folder: File = File(context.getExternalFilesDir(null) ?: context.filesDir, "Music").apply { mkdirs() }
    private val covers: File = File(context.cacheDir, "covers").apply { mkdirs() }

    val folderPath: String get() = folder.absolutePath

    /** Путь к файлу по идентификатору трека — по нему плеер играет без сети. */
    @Volatile private var paths: Map<String, String> = emptyMap()

    fun pathOf(id: String) = paths[id]

    suspend fun scan(): List<Song> = withContext(Dispatchers.IO) {
        val found = mutableMapOf<String, String>()
        val songs = folder.walkTopDown()
            .filter { it.isFile && it.extension.lowercase() in AUDIO_EXTENSIONS }
            .sortedBy { it.path }
            .map { file -> read(file).also { found[it.id] = file.absolutePath } }
            .toList()
        paths = found
        songs.sortedWith(compareBy({ it.album }, { it.track ?: 0 }, { it.title }))
    }

    /** Копирует выбранные файлы или целую папку внутрь; возвращает, сколько треков добавилось. */
    suspend fun import(uris: List<Uri>): Int = withContext(Dispatchers.IO) {
        var added = 0
        for (uri in uris) {
            val tree = runCatching { DocumentsContract.getTreeDocumentId(uri) }.isSuccess
            added += if (tree) copyTree(uri) else copyFile(uri, folder)
        }
        added
    }

    private fun copyTree(uri: Uri): Int {
        val root = DocumentFile.fromTreeUri(context, uri) ?: return 0
        val target = unique(File(folder, root.name ?: "Папка"))
        target.mkdirs()
        return copyChildren(root, target)
    }

    private fun copyChildren(directory: DocumentFile, target: File): Int {
        var added = 0
        for (child in directory.listFiles()) {
            if (child.isDirectory) {
                val nested = File(target, child.name ?: continue).apply { mkdirs() }
                added += copyChildren(child, nested)
            } else if ((child.name ?: "").substringAfterLast('.', "").lowercase() in AUDIO_EXTENSIONS) {
                added += copyFile(child.uri, target, child.name)
            }
        }
        return added
    }

    private fun copyFile(uri: Uri, target: File, knownName: String? = null): Int {
        val name = knownName ?: displayName(uri) ?: return 0
        if (name.substringAfterLast('.', "").lowercase() !in AUDIO_EXTENSIONS) return 0
        return runCatching {
            context.contentResolver.openInputStream(uri)?.use { input ->
                unique(File(target, name)).outputStream().use(input::copyTo)
            }
            1
        }.getOrDefault(0)
    }

    private fun displayName(uri: Uri): String? =
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }

    fun remove(song: Song): Boolean {
        val path = paths[song.id] ?: return false
        return File(path).delete()
    }

    private fun unique(file: File): File {
        if (!file.exists()) return file
        val base = file.nameWithoutExtension
        val extension = if (file.extension.isEmpty()) "" else ".${file.extension}"
        return generateSequence(2) { it + 1 }.map { File(file.parentFile, "$base $it$extension") }.first { !it.exists() }
    }

    /** Читает теги; чего нет в тегах — берём из имени файла и папки, как на iPhone. */
    private fun read(file: File): Song {
        val relative = file.relativeTo(folder).path
        val id = LOCAL_ID_PREFIX + stableHash(relative)
        val (numberFromName, titleFromName) = splitTrackNumber(file.nameWithoutExtension)
        val folderName = file.parentFile?.takeIf { it != folder }?.name

        var title = titleFromName
        var artist: String? = null
        var album = folderName
        var track = numberFromName
        var duration: Double? = null
        var cover: String? = null

        runCatching {
            MediaMetadataRetriever().use { reader ->
                reader.setDataSource(file.absolutePath)
                reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.trim()?.takeIf { it.isNotEmpty() }?.let { title = it }
                artist = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.trim()?.takeIf { it.isNotEmpty() }
                reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.trim()?.takeIf { it.isNotEmpty() }?.let { album = it }
                reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)
                    ?.substringBefore('/')?.trim()?.toIntOrNull()?.let { track = it }
                reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                    ?.takeIf { it > 0 }?.let { duration = it / 1000.0 }
                reader.embeddedPicture?.let { picture ->
                    val target = File(covers, "${stableHash(relative)}.img")
                    if (target.exists() || runCatching { target.writeBytes(picture) }.isSuccess) cover = target.absolutePath
                }
            }
        }

        return Song(
            id = id,
            title = title,
            artist = artist ?: "Неизвестный исполнитель",
            album = album.orEmpty(),
            coverArt = cover?.let { FILE_COVER_PREFIX + it },
            duration = duration,
            track = track,
        )
    }

    companion object {
        val AUDIO_EXTENSIONS = setOf("mp3", "m4a", "m4b", "aac", "flac", "wav", "ogg", "opus", "aif", "aiff")
        /** Обложка своего файла: путь на диске, а не идентификатор на сервере. */
        const val FILE_COVER_PREFIX = "file:"

        /** FNV-1a: одинаковый идентификатор при каждом запуске, в отличие от hashCode. */
        fun stableHash(text: String): String {
            var hash = -0x340d631b7bdddcdbL
            for (byte in text.toByteArray()) {
                hash = hash xor (byte.toLong() and 0xff)
                hash *= 0x100000001b3L
            }
            return java.lang.Long.toHexString(hash).padStart(16, '0')
        }

        /** «03 - Название» → (3, «Название»): ведущее число в имени файла — номер трека. */
        fun splitTrackNumber(name: String): Pair<Int?, String> {
            val digits = name.takeWhile { it.isDigit() }
            if (digits.length !in 1..3) return null to name
            val rest = name.drop(digits.length).trimStart(' ', '.', '-', '_')
            return if (rest.isEmpty()) null to name else digits.toIntOrNull() to rest
        }
    }
}
