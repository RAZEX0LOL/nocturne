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
data class ScrobblePlay(val id: String, val time: Long)

object Scrobbles {
    /** Повторную отметку того же прослушивания не добавляем: сервер засчитал бы его дважды. */
    fun keep(queue: List<ScrobblePlay>, play: ScrobblePlay) = if (play in queue) queue else queue + play

    fun ordered(queue: List<ScrobblePlay>) = queue.sortedBy { it.time }

    fun remaining(queue: List<ScrobblePlay>, sent: List<ScrobblePlay>) = queue.filterNot { it in sent }
}

/** Значения по умолчанию — часть договорённости между платформами, не вкус отдельного экрана. */
val DEFAULT_WIFI_QUALITY = StreamQuality.mp3High
val DEFAULT_CELLULAR_QUALITY = StreamQuality.mp3Medium

/** Дорогая сеть — мобильная: там по умолчанию экономнее. */
fun qualityForNetwork(expensive: Boolean, wifi: StreamQuality, cellular: StreamQuality) =
    if (expensive) cellular else wifi
