package app.nocturne.core

/** Откуда играть трек — правило из shared/spec/offline.md, проверяется shared/cases/source.json. */

enum class SourceKind { local, download, stream, unavailable }

data class Availability(
    val local: Set<String> = emptySet(),
    val downloaded: Set<String> = emptySet(),
    val online: Boolean = true,
)

const val LOCAL_ID_PREFIX = "local:"

fun isLocalId(id: String) = id.startsWith(LOCAL_ID_PREFIX)

fun chooseSource(id: String, availability: Availability): SourceKind = when {
    isLocalId(id) -> if (id in availability.local) SourceKind.local else SourceKind.unavailable
    id in availability.downloaded -> SourceKind.download
    availability.online -> SourceKind.stream
    else -> SourceKind.unavailable
}

/** Одно прослушивание — одна отметка. Правила проверяются shared/cases/scrobbles.json. */
data class ScrobblePlay(val id: String, val time: Long, val account: String? = null, val playId: String? = null)

object Scrobbles {
    private fun same(a: ScrobblePlay, b: ScrobblePlay) = a.account == b.account &&
        if (a.playId != null && b.playId != null) a.playId == b.playId else a.id == b.id && a.time == b.time

    /** Повторную отметку того же прослушивания не добавляем: сервер засчитал бы его дважды. */
    fun keep(queue: List<ScrobblePlay>, play: ScrobblePlay) = if (queue.any { same(it, play) }) queue else queue + play

    fun ordered(queue: List<ScrobblePlay>) = queue.sortedBy { it.time }

    fun remaining(queue: List<ScrobblePlay>, sent: List<ScrobblePlay>) = queue.filterNot { play -> sent.any { same(it, play) } }
}

/** Значения по умолчанию — часть договорённости между платформами, не вкус отдельного экрана. */
val DEFAULT_WIFI_QUALITY = StreamQuality.mp3High
val DEFAULT_CELLULAR_QUALITY = StreamQuality.mp3Medium

/** Дорогая сеть — мобильная: там по умолчанию экономнее. */
fun qualityForNetwork(expensive: Boolean, wifi: StreamQuality, cellular: StreamQuality) =
    if (expensive) cellular else wifi

data class ListeningSession(
    val account: String, val songId: String, val playId: String = java.util.UUID.randomUUID().toString(),
    val startedAt: Long = System.currentTimeMillis(), var submitted: Boolean = false,
) {
    fun recover(pending: List<ScrobblePlay>) {
        submitted = submitted || pending.any { it.account == account && it.playId == playId }
    }
    fun claim(account: String, duration: Double, position: Double): ScrobblePlay? {
        if (this.account != account || submitted || !duration.isFinite() || duration <= 30 || position < minOf(duration / 2, 240.0)) return null
        submitted = true
        return ScrobblePlay(songId, startedAt, account, playId)
    }
}

object OfflinePreparation {
    fun songs(songs: List<Song>, enabled: Boolean, online: Boolean, unmetered: Boolean): List<Song> {
        if (!enabled || !online || !unmetered) return emptyList()
        val wanted = mutableListOf<Song>()
        var seconds = 0.0
        for (song in songs) {
            if (isLocalId(song.id) || song.id.startsWith("radio:") || song.id.startsWith("radio-")) continue
            val duration = song.duration?.takeIf { it.isFinite() && it > 0 } ?: 300.0
            if (wanted.size >= 3 || seconds + duration > 900) break
            wanted += song; seconds += duration
        }
        return wanted
    }
}
