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
        assertEquals("Чёрный альбом", url.queryParameter("album_name"))
        val synced = assertNotNull(LrclibClient.decode("""{"syncedLyrics":"[00:01.00] Песен ещё ненаписанных","plainLyrics":"x"}"""))
        assertTrue(synced.synced)
        assertEquals(1000, synced.lines.first().start)
        assertEquals(listOf("раз", "два"), LrclibClient.decode("""{"plainLyrics":"раз\nдва"}""")?.lines?.map { it.value })
        assertNull(LrclibClient.decode("{}"))
        assertNull(LrclibClient().url(Song("s", "Без исполнителя")))
    }
}
