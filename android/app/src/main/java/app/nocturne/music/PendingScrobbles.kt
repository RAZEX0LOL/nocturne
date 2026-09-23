package app.nocturne.music

import android.content.Context

/**
 * Отметки о прослушивании, которые не удалось отправить: без сети они ждут на диске и уходят,
 * когда сервер снова доступен (shared/spec/api.md).
 */
class PendingScrobbles(context: Context) {
    private val store = context.getSharedPreferences("scrobbles", Context.MODE_PRIVATE)

    fun keep(id: String, startedAt: Long) {
        val line = "$id|$startedAt"
        val kept = store.getStringSet(KEY, emptySet()).orEmpty()
        if (line in kept) return
        store.edit().putStringSet(KEY, kept + line).apply()
    }

    /** По возрастанию времени: сервер строит историю прослушиваний по нему. */
    fun all(): List<Pair<String, Long>> = store.getStringSet(KEY, emptySet()).orEmpty()
        .mapNotNull { line ->
            val id = line.substringBeforeLast('|')
            val time = line.substringAfterLast('|').toLongOrNull() ?: return@mapNotNull null
            id to time
        }
        .sortedBy { it.second }

    fun replace(items: List<Pair<String, Long>>) {
        store.edit().putStringSet(KEY, items.map { "${it.first}|${it.second}" }.toSet()).apply()
    }

    private companion object { const val KEY = "pending" }
}
