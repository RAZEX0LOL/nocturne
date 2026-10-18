package app.nocturne.music

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File
import org.junit.Rule
import org.junit.Test

class NavigationTest {
    @get:Rule(order = 0) val notifications = object : org.junit.rules.ExternalResource() {
        override fun before() {
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                val instrumentation = InstrumentationRegistry.getInstrumentation()
                instrumentation.uiAutomation.executeShellCommand("pm grant ${instrumentation.targetContext.packageName} android.permission.POST_NOTIFICATIONS").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            }
        }
    }
    @get:Rule(order = 1) val compose = createAndroidComposeRule<MainActivity>()

    @Test fun demoLibraryAlbumAndSearch() {
        compose.waitUntil(15_000) { compose.onAllNodesWithText(tr("Подключиться")).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
        compose.onNodeWithText(tr("Подключиться")).assertIsNotEnabled()
        compose.onNodeWithText(tr("Посмотреть демоверсию")).performScrollTo().performClick()
        compose.onNodeWithText(tr("Недавно добавлено")).assertIsDisplayed()
        compose.onNodeWithTag("tab_1").performClick()
        compose.onNodeWithText(tr("Альбомы")).assertIsDisplayed().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Параллели").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Параллели").performClick()
        compose.onNodeWithText(tr("Слушать")).performClick()
        compose.onNodeWithText(tr("Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку.")).assertIsDisplayed()
        compose.onNodeWithText(tr("Понятно")).performClick()
        compose.onNodeWithTag("tab_2").performClick()
        compose.onNode(hasSetTextAction()).performTextInput("Afterglow")
        compose.waitUntil(10_000) { compose.onAllNodesWithText(tr("Треки")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(tr("Треки")).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("tab_0").performClick()
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val destination = File(instrumentation.targetContext.getExternalFilesDir(null), "home-android.png")
        destination.outputStream().use { stream ->
            instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
        compose.onNodeWithContentDescription(tr("Настройки")).performClick()
        // Сначала раскрываем шторку жестом: ScrollTo прокручивает содержимое, но не раскрывает её.
        compose.onNodeWithText(tr("Настройки")).performTouchInput {
            swipe(center, center - androidx.compose.ui.geometry.Offset(0f, 600f), 500)
        }
        compose.waitForIdle()
        compose.onNodeWithText(tr("Готовить очередь для офлайна")).performScrollTo().assertIsDisplayed()
        val preparation = compose.onNodeWithTag("offline-preparation")
        preparation.assertIsOff().performClick().assertIsOn()
        org.junit.Assert.assertTrue(Settings(instrumentation.targetContext).prepareQueue)
        val settingsScreenshot = File(instrumentation.targetContext.getExternalFilesDir(null), "offline-settings-android.png")
        settingsScreenshot.outputStream().use { stream ->
            instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
        instrumentation.uiAutomation.executeShellCommand("cp ${settingsScreenshot.absolutePath} /sdcard/Download/nocturne-offline-settings.png").use { descriptor ->
            java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
        }
        preparation.performClick().assertIsOff()
    }
}
