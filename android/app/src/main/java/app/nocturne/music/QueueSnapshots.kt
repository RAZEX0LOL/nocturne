package app.nocturne.music

import android.content.Context
import app.nocturne.core.NavidromeClient
import app.nocturne.core.PlaybackQueue
import app.nocturne.core.Song
import kotlinx.serialization.json.*

/**
 * Очередь, пережившая перезапуск (shared/spec/playback.md): возвращается на паузе и с того же места.
 * Вместе с ней сохраняется текущее прослушивание, чтобы отметка о нём не ушла на сервер второй раз.
 */
class QueueSnapshots(context: Context) {
    private val store = context.getSharedPreferences("queue", Context.MODE_PRIVATE)

    data class Snapshot(
        val account: String,
        val natural: List<Song>,
        val currentId: String?,
        val shuffle: Boolean,
        val repeat: PlaybackQueue.Repeat,
        val positionMillis: Long,
        val startedAt: Long,
        val scrobbled: Boolean,
    )

    fun save(snapshot: Snapshot) {
        val payload = buildJsonObject {
            put("account", snapshot.account)
            put("natural", buildJsonArray { snapshot.natural.forEach { add(NavidromeClient.describe(it)) } })
            snapshot.currentId?.let { put("currentId", it) }
            put("shuffle", snapshot.shuffle)
            put("repeat", snapshot.repeat.name)
            put("position", snapshot.positionMillis)
            put("startedAt", snapshot.startedAt)
            put("scrobbled", snapshot.scrobbled)
        }
        store.edit().putString(KEY, payload.toString()).apply()
    }

    fun load(): Snapshot? = runCatching {
        val payload = Json.parseToJsonElement(store.getString(KEY, null) ?: return null).jsonObject
        val natural = payload["natural"]!!.jsonArray.map { NavidromeClient.song(it.jsonObject) }
        if (natural.isEmpty()) return null
        Snapshot(
            account = payload["account"]!!.jsonPrimitive.content,
            natural = natural,
            currentId = payload["currentId"]?.jsonPrimitive?.contentOrNull,
            shuffle = payload["shuffle"]?.jsonPrimitive?.booleanOrNull ?: false,
            repeat = runCatching { PlaybackQueue.Repeat.valueOf(payload["repeat"]!!.jsonPrimitive.content) }
                .getOrDefault(PlaybackQueue.Repeat.off),
            positionMillis = payload["position"]?.jsonPrimitive?.longOrNull ?: 0,
            startedAt = payload["startedAt"]?.jsonPrimitive?.longOrNull ?: 0,
            scrobbled = payload["scrobbled"]?.jsonPrimitive?.booleanOrNull ?: false,
        )
    }.getOrNull()

    fun clear() = store.edit().remove(KEY).apply()

    private companion object { const val KEY = "snapshot" }
}
