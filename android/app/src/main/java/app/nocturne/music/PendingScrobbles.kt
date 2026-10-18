package app.nocturne.music

import android.content.Context
import app.nocturne.core.ScrobblePlay
import app.nocturne.core.Scrobbles
import kotlinx.serialization.json.*

/** Старые записи без владельца остаются в прежнем ключе: угадывать сервер для них нельзя. */
class PendingScrobbles(context: Context) {
    private val store = context.getSharedPreferences("scrobbles", Context.MODE_PRIVATE)

    @Synchronized fun keep(play: ScrobblePlay): Boolean = write(Scrobbles.keep(stored(), play))
    @Synchronized fun all(account: String): List<ScrobblePlay> = Scrobbles.ordered(stored().filter { it.account == account })
    @Synchronized fun remove(sent: List<ScrobblePlay>) = write(Scrobbles.remaining(stored(), sent))

    private fun stored(): List<ScrobblePlay> = runCatching {
        Json.parseToJsonElement(store.getString("owned.v2", "[]")!!).jsonArray.map { raw ->
            val item = raw.jsonObject
            ScrobblePlay(item.getValue("id").jsonPrimitive.content, item.getValue("time").jsonPrimitive.long,
                item.getValue("account").jsonPrimitive.content, item["playId"]?.jsonPrimitive?.contentOrNull)
        }
    }.getOrDefault(emptyList())

    private fun write(items: List<ScrobblePlay>): Boolean = store.edit().putString("owned.v2", buildJsonArray {
        items.forEach { play -> add(buildJsonObject {
            put("id", play.id); put("time", play.time); put("account", play.account)
            play.playId?.let { put("playId", it) }
        }) }
    }.toString()).commit()
}
