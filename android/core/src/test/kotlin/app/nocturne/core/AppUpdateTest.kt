package app.nocturne.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class AppUpdateTest {
    private val sha = "a".repeat(64)
    private fun manifest(code: Int, url: String = "https://example.com/n.apk", sum: String = sha) =
        """{"versionCode":$code,"versionName":"1.1.$code","url":"$url","sha256":"$sum"}"""

    @Test fun newerBuildIsAnUpdate() {
        val update = assertNotNull(AppUpdate.newer(manifest(120), installed = 110))
        assertEquals("1.1.120", update.versionName)
        assertEquals(sha, update.sha256)
    }

    @Test fun sameOrOlderBuildIsNot() {
        assertNull(AppUpdate.newer(manifest(110), installed = 110))
        assertNull(AppUpdate.newer(manifest(90), installed = 110))
    }

    @Test fun insecureOrUncheckedFilesAreRejected() {
        assertNull(AppUpdate.parse(manifest(120, url = "http://example.com/n.apk")))
        assertNull(AppUpdate.parse(manifest(120, sum = "abc")))
        assertNull(AppUpdate.parse("not json"))
        assertNull(AppUpdate.parse("""{"versionName":"1.1"}"""))
    }
}
