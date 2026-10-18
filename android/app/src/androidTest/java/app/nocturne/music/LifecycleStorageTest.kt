package app.nocturne.music

import androidx.test.platform.app.InstrumentationRegistry
import app.nocturne.core.*
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class LifecycleStorageTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun queuedDownloadsAreDurableAndOwned() = runBlocking {
        val owner = "test-${UUID.randomUUID()}@https://a"
        val other = "test-${UUID.randomUUID()}@https://b"
        val store = DownloadStore.get(context)
        try {
            store.use(owner)
            store.enqueue(owner, listOf(Song("same", "A")), StreamQuality.mp3High)
            store.use(other)
            store.enqueue(other, listOf(Song("same", "B")), StreamQuality.original)
            assertEquals("B", store.jobs().single().song.title)
            store.use(owner)
            assertEquals("A", store.jobs().single().song.title)
            val payload = File(context.filesDir, "downloads/${accountHash(owner)}/queue.json").readText()
            assertFalse(payload.contains("password"))
            assertFalse(payload.contains("?t="))
            store.remove(Song("same", "A"))
            assertTrue(store.jobs(owner).isEmpty())
            assertEquals("B", store.jobs(other).single().song.title)
        } finally {
            store.use(null)
            File(context.filesDir, "downloads/${accountHash(owner)}").deleteRecursively()
            File(context.filesDir, "downloads/${accountHash(other)}").deleteRecursively()
        }
    }

    @Test fun sameIdsInCachedCatalogsRemainIndependent() {
        val a = "cache-${UUID.randomUUID()}@https://a"
        val b = "cache-${UUID.randomUUID()}@https://b"
        try {
            CatalogCache(context, a).write("getAlbum", buildJsonObject { put("title", "A") })
            CatalogCache(context, b).write("getAlbum", buildJsonObject { put("title", "B") })
            assertEquals("A", CatalogCache(context, a).read("getAlbum")?.get("title")?.jsonPrimitive?.content)
            assertEquals("B", CatalogCache(context, b).read("getAlbum")?.get("title")?.jsonPrimitive?.content)
        } finally {
            File(context.filesDir, "catalog/${accountHash(a)}").deleteRecursively()
            File(context.filesDir, "catalog/${accountHash(b)}").deleteRecursively()
        }
    }

    @Test fun restoredQueueKeepsDuplicateEntryAndSubmittedSession() {
        val snapshots = QueueSnapshots(context)
        val queue = PlaybackQueue(listOf(Song("same", "First"), Song("other", "Other"), Song("same", "Third")), 2, false)
        val session = ListeningSession("a", "same", "play", 1000, true)
        snapshots.save(QueueSnapshots.Snapshot("a", queue.natural.map { it.song }, "same", false, PlaybackQueue.Repeat.off, 151000, 1000, true, session, queue.snapshot()))
        val restored = requireNotNull(QueueSnapshots(context).load())
        val restoredQueue = PlaybackQueue.restore(requireNotNull(restored.queueState))
        assertEquals(2, restoredQueue.position)
        assertEquals("Third", restoredQueue.current?.song?.title)
        assertEquals(session, restored.listening)
        assertNull(restored.listening?.claim("a", 300.0, 151.0))
        snapshots.clear()
    }
}
