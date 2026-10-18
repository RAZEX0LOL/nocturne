package app.nocturne.music

import android.content.Context
import app.nocturne.core.NavidromeClient
import app.nocturne.core.PlaybackQueue
import app.nocturne.core.Song
import app.nocturne.core.ListeningSession
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
        val listening: ListeningSession? = null,
        val queueState: PlaybackQueue.State? = null,
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
            snapshot.queueState?.let { state -> put("queueState", buildJsonObject {
                put("natural", buildJsonArray { state.natural.forEach { entry -> add(buildJsonObject { put("id", entry.id); put("song", NavidromeClient.describe(entry.song)) }) } })
                put("order", buildJsonArray { state.order.forEach { add(it) } }); state.current?.let { put("current", it) }
                put("shuffle", state.shuffle); put("repeat", state.repeat.name); put("history", buildJsonArray { state.history.forEach { add(it) } })
            }) }
            snapshot.listening?.let { session -> put("listening", buildJsonObject {
                put("account", session.account); put("songId", session.songId); put("playId", session.playId)
                put("startedAt", session.startedAt); put("submitted", session.submitted)
            }) }
        }
        store.edit().putString(KEY, payload.toString()).commit()
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
            queueState = payload["queueState"]?.jsonObject?.let { state -> PlaybackQueue.State(
                state.getValue("natural").jsonArray.map { raw -> val entry = raw.jsonObject; PlaybackQueue.Entry(entry.getValue("id").jsonPrimitive.content, NavidromeClient.song(entry.getValue("song").jsonObject)) },
                state.getValue("order").jsonArray.map { it.jsonPrimitive.content }, state["current"]?.jsonPrimitive?.contentOrNull,
                state.getValue("shuffle").jsonPrimitive.boolean, PlaybackQueue.Repeat.valueOf(state.getValue("repeat").jsonPrimitive.content),
                state.getValue("history").jsonArray.map { it.jsonPrimitive.content }) },
            listening = payload["listening"]?.jsonObject?.let { session -> ListeningSession(
                session.getValue("account").jsonPrimitive.content, session.getValue("songId").jsonPrimitive.content,
                session.getValue("playId").jsonPrimitive.content, session.getValue("startedAt").jsonPrimitive.long,
                session.getValue("submitted").jsonPrimitive.boolean) },
        )
    }.getOrNull()

    fun clear() = store.edit().remove(KEY).apply()

    private companion object { const val KEY = "snapshot" }
}
