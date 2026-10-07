package app.nocturne.core

data class Album(
    val id: String, val name: String, val artist: String = "Неизвестный исполнитель",
    val coverArt: String? = null, val songCount: Int = 0, val year: Int? = null, val starred: Boolean = false,
)
data class Song(
    val id: String, val title: String, val artist: String = "Неизвестный исполнитель",
    val album: String = "", val coverArt: String? = null,
    /** Дробная: сервер отдаёт длительность с долями секунды. */
    val duration: Double? = null,
    val track: Int? = null, val starred: Boolean = false, val userRating: Int? = null,
    val replayGain: ReplayGain? = null,
)

/** Теги громкости OpenSubsonic, в децибелах. */
data class ReplayGain(
    val trackGain: Double? = null, val albumGain: Double? = null,
    val trackPeak: Double? = null, val albumPeak: Double? = null,
)
data class Artist(val id: String, val name: String, val albumCount: Int = 0, val coverArt: String? = null)
data class Playlist(val id: String, val name: String, val songCount: Int = 0, val coverArt: String? = null)
data class SearchResult(val albums: List<Album> = emptyList(), val songs: List<Song> = emptyList(), val artists: List<Artist> = emptyList())

/**
 * Очередь, сохранённая на сервере каким-то из устройств: начал на компьютере — продолжил на телефоне.
 * changedBy — имя клиента (параметр `c`): NocturneAndroid, Nocturne (iPhone), NocturneDesktop.
 */
data class RemoteQueue(
    val songs: List<Song>, val currentId: String?, val positionMillis: Long,
    /** Когда сохранена, мс с 1970 года. */
    val changedAt: Long, val changedBy: String,
)

/** Строка текста песни; start в миллисекундах, если текст синхронный. */
data class LyricLine(val start: Int?, val value: String)

/** Текст песни целиком: у синхронного подсвечивается строка и по ней можно перематывать. */
data class Lyrics(val synced: Boolean, val lines: List<LyricLine>)

/**
 * Ошибка, которую не стыдно показать человеку. Вид ошибки — отдельным полем, а не по тексту
 * сообщения: по нему приложение решает, это неверный пароль или просто нет связи.
 */
class MusicException(
    message: String,
    val kind: Kind = Kind.server,
    /** Подстановки для сообщения: число из ответа сервера подставляется там, где текст переводят. */
    val values: Map<String, String> = emptyMap(),
) : Exception(message) {
    enum class Kind { auth, server, network, address }
}

object DemoLibrary {
    val albums = listOf(
        Album("demo-0", "Параллели", "Свет внутри", "demo-0", 8, 2025),
        Album("demo-1", "Тихие дни", "Корали", "demo-1", 10, 2024),
        Album("demo-2", "Где-то дальше", "Монолит", "demo-2", 6, 2025),
        Album("demo-3", "Поздний июль", "Небо рядом", "demo-3", 9, 2024),
        Album("demo-4", "Afterglow", "North Coast", "demo-4", 7, 2025),
        Album("demo-5", "Сны на повторе", "Каменные реки", "demo-5", 12, 2023),
    )
    fun songs(album: Album) = listOf("Первый свет", "Между нами", "Тишина", "Afterglow", "Остаться").mapIndexed { index, title ->
        Song("${album.id}-$index", title, album.artist, album.name, album.coverArt, 210.0 + index * 17)
    }
}
