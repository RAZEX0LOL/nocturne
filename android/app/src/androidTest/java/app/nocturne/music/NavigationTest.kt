package app.nocturne.music

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File
import org.junit.Rule
import org.junit.Test

class NavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun demoLibraryAlbumAndSearch() {
        compose.onNodeWithText("Подключиться").assertIsNotEnabled()
        compose.onNodeWithText("Посмотреть демоверсию").performScrollTo().performClick()
        compose.onNodeWithText("Недавно добавлено").assertIsDisplayed()
        compose.onNodeWithTag("tab_1").performClick()
        compose.onNodeWithText("Альбомы").assertIsDisplayed()
        compose.onNodeWithText("Параллели").performClick()
        compose.onNodeWithText("Слушать").performClick()
        compose.onNodeWithText("Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку.").assertIsDisplayed()
        compose.onNodeWithText("Понятно").performClick()
        compose.onNodeWithTag("tab_2").performClick()
        compose.onNode(hasSetTextAction()).performTextInput("Afterglow")
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Треки").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Треки").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("tab_0").performClick()
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val destination = File(instrumentation.targetContext.getExternalFilesDir(null), "home-android.png")
        destination.outputStream().use { stream ->
            instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
    }
}
