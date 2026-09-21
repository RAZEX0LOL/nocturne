package app.nocturne.core

import kotlin.test.*
import okhttp3.HttpUrl.Companion.toHttpUrl

class NavidromeClientTest {
    private fun client() = NavidromeClient(Credentials("https://music.example.com/navidrome/", "joe", "sesame"))

    @Test fun officialAuthenticationVector() {
        val url = client().url("ping", salt = "c19b2d").toHttpUrl()
        assertEquals("26719a1196d2a940705a59634eb18eab", url.queryParameter("t"))
        assertNull(url.queryParameter("p"))
        assertFalse(url.toString().contains("sesame"))
    }
    @Test fun preservesSubpathAndSpecialCharacters() {
        val url = client().url("search3", mapOf("query" to "a&b + ночь")).toHttpUrl()
        assertEquals("/navidrome/rest/search3.view", url.encodedPath)
        assertEquals("a&b + ночь", url.queryParameter("query"))
        assertFalse(url.toString().contains("+"))
    }
    @Test fun rootServerDoesNotAddDoubleSlashes() {
        val client = NavidromeClient(Credentials("https://music.example.com", "test", "test-only"))
        assertEquals("/rest/ping.view", client.url("ping").toHttpUrl().encodedPath)
    }
    // Адреса и учётные данные целиком проверяет общий контракт: shared/cases/credentials.json.
    @Test fun saltsAreUnique() { assertNotEquals(client().url("ping"), client().url("ping")) }
    @Test fun rejectsApiFailureWithoutLeakingMessage() {
        val error = assertFailsWith<MusicException> {
            NavidromeClient.decode("""{"subsonic-response":{"status":"failed","error":{"code":40,"message":"private detail"}}}""")
        }
        assertEquals("Неверный логин или пароль.", error.message)
    }
    @Test fun rejectsProxyHtmlAndMissingEnvelope() {
        assertFailsWith<MusicException> { NavidromeClient.decode("<html>Sign in</html>") }
        assertFailsWith<MusicException> { NavidromeClient.decode("{}") }
    }
    @Test fun optionalPayloadsMayBeAbsent() {
        assertEquals("ok", NavidromeClient.decode("""{"subsonic-response":{"status":"ok"}}""")["status"].toString().trim('"'))
    }
    @Test fun credentialStringIsRedacted() {
        assertEquals("Credentials(redacted)", Credentials("https://host", "test", "test-only").toString())
    }
}
