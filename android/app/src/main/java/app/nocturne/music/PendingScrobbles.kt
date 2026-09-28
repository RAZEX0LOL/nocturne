package app.nocturne.music

import android.content.Context
import app.nocturne.core.ScrobblePlay
import app.nocturne.core.Scrobbles

/**
 * Отметки о прослушивании, которые не удалось отправить: без сети они ждут на диске и уходят,
 * когда сервер снова доступен (shared/spec/api.md).
 */
class PendingScrobbles(context: Context) {
    private val store = context.getSharedPreferences("scrobbles", Context.MODE_PRIVATE)

    fun keep(id: String, startedAt: Long) = write(Scrobbles.keep(stored(), ScrobblePlay(id, startedAt)))

    /** По возрастанию времени: сервер строит историю прослушиваний по нему. */
    fun all(): List<ScrobblePlay> = Scrobbles.ordered(stored())

    /** Оставляет те, что не дошли. */
    fun keepOnly(sent: List<ScrobblePlay>) = write(Scrobbles.remaining(stored(), sent))

    private fun stored(): List<ScrobblePlay> = store.getStringSet(KEY, emptySet()).orEmpty()
        .mapNotNull { line ->
            val time = line.substringAfterLast('|').toLongOrNull() ?: return@mapNotNull null
            ScrobblePlay(line.substringBeforeLast('|'), time)
        }

    private fun write(items: List<ScrobblePlay>) {
        store.edit().putStringSet(KEY, items.map { "${it.id}|${it.time}" }.toSet()).apply()
    }

    private companion object { const val KEY = "pending" }
}
