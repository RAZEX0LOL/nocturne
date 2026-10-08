package app.nocturne.core

import kotlin.test.*
import okhttp3.HttpUrl.Companion.toHttpUrl

class SyncAndLyricsTest {
    private fun client() = NavidromeClient(Credentials("https://music.example.com", "test", "test-only"))

    @Test fun clientNameTellsDevicesApart() {
        assertEquals("NocturneAndroid", client().url("ping").toHttpUrl().queryParameter("c"))
    }

    @Test fun playQueueRequestKeepsEveryId() {
        val url = client().url("savePlayQueue", mapOf("current" to "s2", "position" to "83456"), listOf("s1", "s2", "s3").map { "id" to it }).toHttpUrl()
        assertEquals(listOf("s1", "s2", "s3"), url.queryParameterValues("id"))
        assertEquals("83456", url.queryParameter("position"))
    }

    @Test fun playQueueDecodesPositionTimeAndAuthor() {
        val response = NavidromeClient.decode(
            """{"subsonic-response":{"status":"ok","playQueue":{"entry":[{"id":"s1","title":"Один"},{"id":"s2","title":"Два"}],
               "current":"s2","position":61500,"changed":"2026-10-07T20:15:00Z","changedBy":"NocturneDesktop"}}}""",
        )
        val queue = assertNotNull(NavidromeClient.parsePlayQueue(response))
        assertEquals(listOf("s1", "s2"), queue.songs.map { it.id })
        assertEquals("s2", queue.currentId)
        assertEquals(61_500L, queue.positionMillis)
        assertEquals(java.time.Instant.parse("2026-10-07T20:15:00Z").toEpochMilli(), queue.changedAt)
        assertEquals("NocturneDesktop", queue.changedBy)
    }

    @Test fun emptyQueueOffersNothing() {
        assertNull(NavidromeClient.parsePlayQueue(NavidromeClient.decode("""{"subsonic-response":{"status":"ok","playQueue":{}}}""")))
        assertNull(NavidromeClient.parsePlayQueue(NavidromeClient.decode("""{"subsonic-response":{"status":"ok"}}""")))
    }

    @Test fun lrcTimestampsMetadataAndChorus() {
        val lines = Lrc.parse("[ar: Кино]\n[00:12.34] Белый снег\n[01:02.5]Серый лёд\n[00:40.00][00:10.00] Припев")
        assertEquals(listOf(10000, 12340, 40000, 62500), lines.map { it.start })
        assertEquals(listOf("Припев", "Белый снег", "Припев", "Серый лёд"), lines.map { it.value })
    }

    @Test fun lrclibAsksWithDurationAndPrefersSynced() {
        val url = assertNotNull(LrclibClient().url(Song("s", "Кукушка", "Кино", "Чёрный альбом", duration = 397.4))).toHttpUrl()
        assertEquals("397", url.queryParameter("duration"))
        assertNull(url.queryParameter("album_name"))
        val synced = assertNotNull(LrclibClient.decode("""{"syncedLyrics":"[00:01.00] Песен ещё ненаписанных","plainLyrics":"x"}"""))
        assertTrue(synced.synced)
        assertEquals(1000, synced.lines.first().start)
        assertEquals(listOf("раз", "два"), LrclibClient.decode("""{"plainLyrics":"раз\nдва"}""")?.lines?.map { it.value })
        assertNull(LrclibClient.decode("{}"))
        assertNull(LrclibClient().url(Song("s", "Без исполнителя")))
    }

    @Test fun lrclibFallsBackToSearchWithCleanedTitle() {
        val server = okhttp3.mockwebserver.MockWebServer()
        server.enqueue(okhttp3.mockwebserver.MockResponse().setResponseCode(404).setBody("{}"))
        server.enqueue(okhttp3.mockwebserver.MockResponse().setBody("""[
            {"trackName":"Scars","duration":140,"syncedLyrics":"[00:01.00] чужая версия"},
            {"trackName":"Scars (feat. Mishaal)","duration":96,"syncedLyrics":"[00:02.00] та самая"}]"""))
        server.start()
        val lyrics = kotlinx.coroutines.runBlocking {
            LrclibClient(base = server.url("/").toString().trimEnd('/')).lyrics(Song("v", "Scars (feat. mishaal)", "Ondi vil & Mishaal", "VK", duration = 96.0))
        }
        server.takeRequest()
        val search = assertNotNull(server.takeRequest().requestUrl)
        assertEquals("Scars", search.queryParameter("track_name"))
        assertEquals("Ondi vil", search.queryParameter("artist_name"))
        assertEquals(listOf(2000), lyrics?.lines?.map { it.start })
        server.shutdown()
    }

    @Test fun lyricsQueryCleansTitlesAndArtists() {
        assertEquals("Another Love", LyricsQuery.cleanTitle("Another Love (Sped Up)"))
        assertEquals("Experience", LyricsQuery.cleanTitle("Experience (Starkey Remix / Remastered 2020) (Slowed)"))
        assertEquals("Arcade", LyricsQuery.cleanTitle("Arcade - Bonus Track"))
        assertEquals("Кукушка (Live)", LyricsQuery.cleanTitle("Кукушка (Live)"))
        assertEquals("Lil Wayne", LyricsQuery.primaryArtist("Lil Wayne, Ty Dolla \$ign, XXXTentacion"))
        assertEquals("Duncan Laurence", LyricsQuery.primaryArtist("Duncan Laurence feat. FLETCHER"))
        assertEquals("", LyricsQuery.knownArtist("Неизвестен"))
        val searches = LrclibClient().searchUrls(Song("u", "ALL TIME LOW - Jon Bellion (Version SAD)", "Неизвестен"))
        assertEquals(listOf("ALL TIME LOW - Jon Bellion"), searches.map { it.toHttpUrl().queryParameter("q") })
        val sped = kotlinx.serialization.json.Json.parseToJsonElement("""{"duration":244,"syncedLyrics":"[00:01.00] раз\n[00:02.00] два"}""") as kotlinx.serialization.json.JsonObject
        val plain = assertNotNull(LrclibClient.pick(listOf(sped), 203.0))
        assertEquals(false, plain.synced)
        assertEquals(listOf("раз", "два"), plain.lines.map { it.value })
    }

    @Test fun autoReplayGainFollowsTheAlbumOnlyInOrder() {
        fun song(id: String, album: String?) = Song(id, id, albumId = album)
        val album = listOf(song("a1", "A"), song("a2", "A"), song("a3", "A"))
        assertEquals(ReplayGainMode.album, ReplayGainMode.auto.resolved(album, 1, shuffled = false))
        assertEquals(ReplayGainMode.track, ReplayGainMode.auto.resolved(album, 1, shuffled = true))
        assertEquals(ReplayGainMode.track, ReplayGainMode.auto.resolved(listOf(song("x", "A"), song("y", "B")), 1, shuffled = false))
        assertEquals(ReplayGainMode.album, ReplayGainMode.album.resolved(album, 0, shuffled = true))
    }

    @Test fun shareLinkAndSimilarSongsComeFromTheServer() {
        val server = okhttp3.mockwebserver.MockWebServer()
        server.enqueue(okhttp3.mockwebserver.MockResponse().setBody("""{"subsonic-response":{"status":"ok","shares":{"share":[{"id":"sh1","url":"https://music.example.com/share/abc"}]}}}"""))
        server.enqueue(okhttp3.mockwebserver.MockResponse().setBody("""{"subsonic-response":{"status":"ok","similarSongs2":{"song":[{"id":"s9","title":"Похожий","albumId":"al-9"}]}}}"""))
        server.start()
        try {
            val api = NavidromeClient(Credentials(server.url("/").toString(), "test", "test-only"), retryDelaysSeconds = emptyList())
            assertEquals("https://music.example.com/share/abc", kotlinx.coroutines.runBlocking { api.createShare("s1") })
            assertEquals("s1", server.takeRequest().requestUrl?.queryParameter("id"))
            val similar = kotlinx.coroutines.runBlocking { api.similarSongs("s1") }
            assertEquals(listOf("s9"), similar.map { it.id })
            assertEquals("al-9", similar.first().albumId)
        } finally { server.shutdown() }
    }

    @Test fun albumIdSurvivesTheSnapshot() {
        val song = NavidromeClient.song(kotlinx.serialization.json.Json.parseToJsonElement("""{"id":"s","title":"T","albumId":"al-9"}""") as kotlinx.serialization.json.JsonObject)
        assertEquals("al-9", song.albumId)
        assertEquals("al-9", NavidromeClient.describe(song)["albumId"].toString().trim('"'))
    }
}
