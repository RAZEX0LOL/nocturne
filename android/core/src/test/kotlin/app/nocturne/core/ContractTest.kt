package app.nocturne.core

import java.io.File
import kotlin.math.abs
import kotlin.test.*
import kotlinx.serialization.json.*
import okhttp3.HttpUrl.Companion.toHttpUrl

/**
 * Прогоняет общий контракт из shared/cases через это ядро.
 * Те же файлы исполняют iOS и десктоп, поэтому расхождение видно как одинаково названный провал.
 */
class ContractTest {
    private val casesFolder = generateSequence(File(".").absoluteFile) { it.parentFile }
        .map { File(it, "shared/cases") }.first { it.isDirectory }

    private fun load(file: String) = Json.parseToJsonElement(File(casesFolder, file).readText()).jsonObject
    private fun cases(file: String, key: String = "cases") = load(file)[key]!!.jsonArray.map { it.jsonObject }
    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull
    private fun JsonObject.bool(key: String) = this[key]?.jsonPrimitive?.booleanOrNull
    private fun JsonObject.int(key: String) = this[key]?.jsonPrimitive?.intOrNull
    private fun JsonObject.map(key: String) = (this[key] as? JsonObject)?.mapValues { it.value.jsonPrimitive.content } ?: emptyMap()

    @Test fun credentials() {
        for (case in cases("credentials.json")) {
            val name = case.str("name") ?: "?"
            val server = case.str("server") ?: ""
            val username = case.str("username") ?: ""
            val password = case.str("password") ?: ""
            if (case.bool("valid") != true) {
                assertFailsWith<MusicException>(name) { Credentials(server, username, password) }
                continue
            }
            val credentials = Credentials(server, username, password)
            case.bool("insecure")?.let { assertEquals(it, credentials.isInsecure, name) }
            case.str("account")?.let { assertEquals(it, credentials.account, name) }
        }
    }

    @Test fun requests() {
        for (case in cases("requests.json")) {
            val name = case.str("name") ?: "?"
            val client = NavidromeClient(Credentials(case.str("server")!!, case.str("username")!!, case.str("password")!!))
            val repeated = (case["repeated"] as? JsonArray)?.map { it.jsonObject }
                ?.map { it.str("name")!! to it.str("value")!! } ?: emptyList()
            val url = client.url(case.str("endpoint")!!, case.map("parameters"), repeated, case.str("salt") ?: "salt").toHttpUrl()
            val expect = case["expect"]!!.jsonObject

            expect.str("path")?.let { assertEquals(it, url.encodedPath, name) }
            expect.map("query").forEach { (key, value) -> assertEquals(value, url.queryParameter(key), "$name: $key") }
            expect.str("clientNameStartsWith")?.let {
                assertTrue(url.queryParameter("c")?.startsWith(it) == true, "$name: имя клиента ${url.queryParameter("c")}")
            }
            (expect["absentParameters"] as? JsonArray)?.forEach {
                assertNull(url.queryParameter(it.jsonPrimitive.content), "$name: ${it.jsonPrimitive.content} не должен отправляться")
            }
            (expect["absentSubstrings"] as? JsonArray)?.forEach {
                assertFalse(url.toString().contains(it.jsonPrimitive.content), "$name: в адресе не должно быть ${it.jsonPrimitive.content}")
            }
            (expect["repeated"] as? JsonObject)?.forEach { (key, values) ->
                assertEquals(values.jsonArray.map { it.jsonPrimitive.content }, url.queryParameterValues(key), "$name: $key")
            }
        }
    }

    @Test fun streamQuality() {
        for (case in cases("requests.json", "streamQuality")) {
            val name = case.str("name") ?: "?"
            assertEquals(case.map("parameters"), StreamQuality.valueOf(case.str("quality")!!).parameters, name)
        }
    }

    @Test fun freshSalt() {
        val case = load("requests.json")["freshSalt"]!!.jsonObject
        val client = NavidromeClient(Credentials(case.str("server")!!, case.str("username")!!, case.str("password")!!))
        val endpoint = case.str("endpoint")!!
        assertNotEquals(client.url(endpoint), client.url(endpoint), case.str("name") ?: "?")
    }

    @Test fun decode() {
        for (case in cases("decode.json")) {
            val name = case.str("name") ?: "?"
            val text = case.str("json") ?: ""
            if (case.bool("accept") != true) {
                val error = assertFailsWith<MusicException>(name) { NavidromeClient.decode(text) }
                (case["errorMustNotContain"] as? JsonArray)?.forEach {
                    assertFalse(error.message?.contains(it.jsonPrimitive.content) == true, "$name: наружу утекли подробности сервера")
                }
                continue
            }
            val response = NavidromeClient.decode(text)
            val albums = (response["albumList2"] as? JsonObject)?.get("album") as? JsonArray
            val songs = (response["album"] as? JsonObject)?.get("song") as? JsonArray
            for ((key, raw) in case["expect"]?.jsonObject ?: JsonObject(emptyMap())) {
                val value = raw.jsonPrimitive
                when (key) {
                    "firstAlbumName" -> assertEquals(value.content, albums?.first()?.jsonObject?.str("name"), name)
                    "firstAlbumArtist" -> assertNull(albums?.first()?.jsonObject?.str("artist"), name)
                    "albumCount" -> assertEquals(value.int, albums?.size ?: 0, name)
                    "firstSongDuration" -> assertEquals(value.double, NavidromeClient.song(songs!!.first().jsonObject).duration, name)
                    "firstStarredSongId" ->
                        assertEquals(value.content, ((response["starred2"] as JsonObject)["song"] as JsonArray).first().jsonObject.str("id"), name)
                    "firstGenreValue" ->
                        assertEquals(value.content, ((response["genres"] as JsonObject)["genre"] as JsonArray).first().jsonObject.str("value"), name)
                    "firstLyricStart" -> {
                        val lyrics = ((response["lyricsList"] as JsonObject)["structuredLyrics"] as JsonArray).first().jsonObject
                        assertEquals(value.int, ((lyrics["line"] as JsonArray).first().jsonObject).int("start"), name)
                    }
                    "firstRadioStreamUrl" -> {
                        val stations = (response["internetRadioStations"] as JsonObject)["internetRadioStation"] as JsonArray
                        assertEquals(value.content, stations.first().jsonObject.str("streamUrl"), name)
                    }
                    "firstShareUrl" ->
                        assertEquals(value.content, ((response["shares"] as JsonObject)["share"] as JsonArray).first().jsonObject.str("url"), name)
                    "firstSongTrackGain" ->
                        assertEquals(value.double, NavidromeClient.song(songs!!.first().jsonObject).replayGain?.trackGain, name)
                    "firstSongRating" -> assertEquals(value.int, NavidromeClient.song(songs!!.first().jsonObject).userRating, name)
                    else -> fail("$name: неизвестная проверка $key")
                }
            }
        }
    }

    @Test fun replayGain() {
        val tolerance = load("replaygain.json")["tolerance"]!!.jsonPrimitive.double
        for (case in cases("replaygain.json")) {
            val name = case.str("name") ?: "?"
            val gain = (case["replayGain"] as? JsonObject)?.let {
                ReplayGain(it.decimal("trackGain"), it.decimal("albumGain"), it.decimal("trackPeak"), it.decimal("albumPeak"))
            }
            val volume = ReplayGainMode.valueOf(case.str("mode")!!).volume(Song("s", "S", replayGain = gain))
            val expected = case["expected"]!!.jsonPrimitive.double
            assertTrue(abs(volume - expected) <= tolerance, "$name: получили $volume вместо $expected")
        }
    }

    @Test fun retries() {
        val file = load("retries.json")
        val delays = file["delaysSeconds"]!!.jsonArray.map { 0.0 }  // в тесте ждать по-настоящему незачем
        for (case in cases("retries.json")) {
            val name = case.str("name") ?: "?"
            val server = okhttp3.mockwebserver.MockWebServer()
            repeat(minOf(case.int("failures") ?: 0, 10)) {
                server.enqueue(failure(case.str("failure") ?: "network"))
            }
            server.enqueue(okhttp3.mockwebserver.MockResponse().setBody("""{"subsonic-response":{"status":"ok"}}"""))
            server.start()
            try {
                val client = NavidromeClient(
                    Credentials(server.url("/").toString(), "test", "test-only"),
                    retryDelaysSeconds = delays,
                )
                val outcome = runCatching { kotlinx.coroutines.runBlocking { client.request(case.str("endpoint") ?: "ping") } }
                assertEquals(case.bool("succeeds"), outcome.isSuccess, "$name: исход")
                assertEquals(case.int("attempts"), server.requestCount, "$name: число попыток")
                if (outcome.isFailure) assertTrue(outcome.exceptionOrNull() is MusicException, "$name: ошибка понятна человеку")
            } finally {
                server.shutdown()
            }
        }
    }

    /** Что именно «ломается»: обрыв связи, отказ сервера внутри HTTP 200 или ошибка HTTP. */
    private fun failure(kind: String) = when (kind) {
        "network" -> okhttp3.mockwebserver.MockResponse().apply { socketPolicy = okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AT_START }
        "auth" -> okhttp3.mockwebserver.MockResponse().setBody("""{"subsonic-response":{"status":"failed","error":{"code":40}}}""")
        else -> okhttp3.mockwebserver.MockResponse().setResponseCode(500)
    }

    @Test fun source() {
        for (case in cases("source.json")) {
            val name = case.str("name") ?: "?"
            val availability = Availability(
                local = case["local"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet(),
                downloaded = case["downloaded"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet(),
                online = case.bool("online") ?: true,
            )
            assertEquals(SourceKind.valueOf(case.str("expected")!!), chooseSource(case.str("id")!!, availability), name)
        }
    }

    @Test fun qualityByNetwork() {
        for (case in cases("quality.json")) {
            val name = case.str("name") ?: "?"
            val chosen = qualityForNetwork(
                case.bool("expensive") ?: false,
                StreamQuality.valueOf(case.str("wifi")!!),
                StreamQuality.valueOf(case.str("cellular")!!),
            )
            assertEquals(StreamQuality.valueOf(case.str("expected")!!), chosen, name)
        }
        val defaults = load("quality.json")["defaults"]!!.jsonObject
        assertEquals(defaults.str("wifi"), DEFAULT_WIFI_QUALITY.name)
        assertEquals(defaults.str("cellular"), DEFAULT_CELLULAR_QUALITY.name)
    }

    @Test fun scrobbleQueue() {
        for (case in cases("scrobbles.json")) {
            val name = case.str("name") ?: "?"
            val queue = case["keep"]!!.jsonArray.map { play(it.jsonObject) }
                .fold(emptyList<ScrobblePlay>()) { kept, play -> Scrobbles.keep(kept, play) }
            assertEquals(case["expected"]!!.jsonArray.map { play(it.jsonObject) }, Scrobbles.ordered(queue), name)
        }
        for (case in cases("scrobbles.json", "afterSending")) {
            val name = case.str("name") ?: "?"
            val kept = case["kept"]!!.jsonArray.map { play(it.jsonObject) }
            val sent = case["sent"]!!.jsonArray.map { play(it.jsonObject) }
            assertEquals(case["remaining"]!!.jsonArray.map { play(it.jsonObject) }, Scrobbles.remaining(kept, sent), name)
        }
    }

    private fun play(raw: JsonObject) = ScrobblePlay(raw.str("id")!!, raw["time"]!!.jsonPrimitive.long, raw.str("account"), raw.str("playId"))

    @Test fun queue() {
        for (case in cases("queue.json")) {
            val name = case.str("name") ?: "?"
            val songs = case["songs"]!!.jsonArray.map { Song(it.jsonPrimitive.content, it.jsonPrimitive.content) }
            var queue = PlaybackQueue(songs, case.int("startAt") ?: 0, case.bool("shuffle") ?: false)
            val remembered = mutableMapOf<String, String?>()

            for (step in case["steps"]!!.jsonArray.map { it.jsonObject }) {
                when (step.str("op")) {
                    "roundTrip" -> queue = PlaybackQueue.restore(queue.snapshot())
                    "jump" -> queue.jump(step.int("pos") ?: 0)
                    "jumpNext" -> queue.jump(assertNotNull(queue.nextPosition(false), "$name: нет следующей позиции"))
                    "jumpPrevious" -> queue.jump(assertNotNull(queue.previousPosition(), "$name: нет предыдущей позиции"))
                    "setShuffle" -> queue.setShuffle(step.bool("enabled") ?: false)
                    "setRepeat" -> queue.repeatMode = PlaybackQueue.Repeat.valueOf(step.str("mode")!!)
                    "insertNext" -> queue.insertNext(step["songs"]!!.jsonArray.map { Song(it.jsonPrimitive.content, it.jsonPrimitive.content) })
                    "append" -> queue.append(step["songs"]!!.jsonArray.map { Song(it.jsonPrimitive.content, it.jsonPrimitive.content) })
                    "removeAt" -> queue.remove(queue.items[step.int("pos") ?: 0].id)
                    "removeCurrent" -> queue.remove(queue.current!!.id)
                    "moveUpcoming" -> queue.moveUpcoming(step["from"]!!.jsonArray.map { it.jsonPrimitive.int }, step.int("to") ?: 0)
                    "remember" -> remembered[step.str("as")!!] =
                        if (step.bool("atCurrent") == true) queue.current?.song?.id else queue.items[step.int("atPosition") ?: 0].song.id
                    null -> Unit
                    else -> fail("$name: неизвестная операция ${step.str("op")}")
                }

                for ((key, raw) in step["expect"]?.jsonObject ?: JsonObject(emptyMap())) {
                    when (key) {
                        "comment" -> Unit
                        "currentId" -> assertEquals(raw.jsonPrimitive.content, queue.current?.song?.id, name)
                        "position" -> assertEquals(raw.jsonPrimitive.int, queue.position, name)
                        "count" -> assertEquals(raw.jsonPrimitive.int, queue.items.size, name)
                        "itemIds" -> assertEquals(raw.jsonArray.map { it.jsonPrimitive.content }, queue.items.map { it.song.id }, name)
                        "upcomingIds" -> assertEquals(raw.jsonArray.map { it.jsonPrimitive.content }, queue.upcoming.map { it.song.id }, name)
                        "nextPositionAutomatic" -> assertEquals(raw.jsonPrimitive.intOrNull, queue.nextPosition(true), name)
                        "nextPositionManual" -> assertEquals(raw.jsonPrimitive.intOrNull, queue.nextPosition(false), name)
                        "isPermutationOfNatural" ->
                            assertEquals(queue.natural.map { it.song.id }.toSet(), queue.items.map { it.song.id }.toSet(), name)
                        "currentIsFirst" -> assertEquals(0, queue.position, name)
                        "currentIdIsRemembered" -> assertEquals(remembered[raw.jsonPrimitive.content], queue.current?.song?.id, name)
                        else -> fail("$name: неизвестная проверка $key")
                    }
                }
            }
        }
    }
    @Test fun listeningLifecycle() {
        for (case in cases("lifecycle.json")) {
            var session: ListeningSession? = null
            val marks = mutableListOf<String>()
            val pending = mutableListOf<ScrobblePlay>()
            for (raw in case["events"]!!.jsonArray) {
                val event = raw.jsonObject
                when (event.str("op")) {
                    "start" -> session = ListeningSession(event.str("account")!!, event.str("songId")!!, event.str("playId")!!, event["startedAt"]!!.jsonPrimitive.long)
                    "restart" -> {
                        val old = session!!
                        val json = Json.parseToJsonElement(buildJsonObject {
                            put("account", old.account); put("songId", old.songId); put("playId", old.playId)
                            put("startedAt", old.startedAt); put("submitted", old.submitted)
                        }.toString()).jsonObject
                        session = ListeningSession(json.str("account")!!, json.str("songId")!!, json.str("playId")!!, json["startedAt"]!!.jsonPrimitive.long, json.bool("submitted")!!)
                        session.recover(pending)
                    }
                    "check", "queueOnly" -> {
                        val working = if (event.str("op") == "queueOnly") session?.copy() else session
                        working?.claim(event.str("account")!!, event["duration"]!!.jsonPrimitive.double, event["position"]!!.jsonPrimitive.double)?.let {
                            pending += it
                            marks += "${it.account}:${it.playId}:${it.time}"
                        }
                    }
                }
            }
            assertEquals(case["expected"]!!.jsonArray.map { it.jsonPrimitive.content }, marks, case.str("name"))
        }
    }

    @Test fun offlinePreparation() {
        for (case in cases("preparation.json")) {
            val songs = case["songs"]!!.jsonArray.map { raw -> val song = raw.jsonObject; Song(song.str("id")!!, song.str("id")!!, duration = song["duration"]?.jsonPrimitive?.doubleOrNull) }
            assertEquals(case["expected"]!!.jsonArray.map { it.jsonPrimitive.content }, OfflinePreparation.songs(songs, case.bool("enabled")!!, case.bool("online")!!, case.bool("unmetered")!!).map { it.id }, case.str("name"))
        }
    }

}
