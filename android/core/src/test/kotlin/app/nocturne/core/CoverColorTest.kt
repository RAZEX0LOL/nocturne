package app.nocturne.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CoverColorTest {
    @Test fun dominantVividHueWins() {
        val red = 0xFFE53935.toInt()
        val blue = 0xFF1E88E5.toInt()
        val (hue, saturation) = assertNotNull(CoverColor.vibrant(IntArray(400) { if (it < 300) red else blue }))
        assertEquals(0.0f, hue, 0.02f)
        assertEquals(0.75f, saturation, 0.05f)
    }

    @Test fun greyCoverHasNoAccent() {
        assertNull(CoverColor.vibrant(IntArray(576) { 0xFF808080.toInt() }))
        assertNull(CoverColor.vibrant(IntArray(576) { 0xFF000000.toInt() }))
    }
}
