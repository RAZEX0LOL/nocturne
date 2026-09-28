package app.nocturne.music

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.nocturne.core.DEFAULT_CELLULAR_QUALITY
import app.nocturne.core.DEFAULT_WIFI_QUALITY
import app.nocturne.core.ReplayGainMode
import app.nocturne.core.StreamQuality
import app.nocturne.core.qualityForNetwork

/** Оформление: тёмная база одна, меняется акцент — как на iPhone. */
enum class AccentTheme(val title: String, val color: Long) {
    violet("Фиолетовый", 0xFFA78BFA),
    mint("Мятный", 0xFF5EEAD4),
    dawn("Рассвет", 0xFFFDA4AF),
    mono("Серый", 0xFFD4D4D8),
}

/**
 * Настройки приложения в SharedPreferences: их читают и плеер, и интерфейс.
 * Значения простые, поэтому хранилище тоже простое — базы данных здесь не нужно.
 */
class Settings(context: Context) {
    private val store = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var wifiQuality by mutableStateOf(enum(store.getString("quality.wifi", null), DEFAULT_WIFI_QUALITY))
        private set
    var cellularQuality by mutableStateOf(enum(store.getString("quality.cellular", null), DEFAULT_CELLULAR_QUALITY))
        private set
    var replayGain by mutableStateOf(enum(store.getString("replayGain", null), ReplayGainMode.off))
        private set
    var accent by mutableStateOf(enum(store.getString("accent", null), AccentTheme.violet))
        private set
    var equalizerEnabled by mutableStateOf(store.getBoolean("eq.enabled", false))
        private set
    var equalizerGains by mutableStateOf(readGains())
        private set
    var downloadOverWifiOnly by mutableStateOf(store.getBoolean("downloads.wifiOnly", false))
        private set
    var downloadFavorites by mutableStateOf(store.getBoolean("downloads.favorites", false))
        private set

    fun chooseWifiQuality(value: StreamQuality) { wifiQuality = value; store.edit().putString("quality.wifi", value.name).apply() }
    fun chooseCellularQuality(value: StreamQuality) { cellularQuality = value; store.edit().putString("quality.cellular", value.name).apply() }
    fun chooseReplayGain(value: ReplayGainMode) { replayGain = value; store.edit().putString("replayGain", value.name).apply() }
    fun chooseAccent(value: AccentTheme) { accent = value; store.edit().putString("accent", value.name).apply() }
    fun enableEqualizer(value: Boolean) { equalizerEnabled = value; store.edit().putBoolean("eq.enabled", value).apply() }
    fun limitDownloadsToWifi(value: Boolean) { downloadOverWifiOnly = value; store.edit().putBoolean("downloads.wifiOnly", value).apply() }
    fun autoDownloadFavorites(value: Boolean) { downloadFavorites = value; store.edit().putBoolean("downloads.favorites", value).apply() }

    fun saveEqualizerGains(value: List<Float>) {
        equalizerGains = value
        store.edit().putString("eq.gains", value.joinToString(",")).apply()
    }

    /** Качество зависит от сети: правило общее для всех платформ (shared/cases/quality.json). */
    fun quality(onWifi: Boolean) = qualityForNetwork(expensive = !onWifi, wifi = wifiQuality, cellular = cellularQuality)

    private fun readGains(): List<Float> {
        val saved = store.getString("eq.gains", null)?.split(",")?.mapNotNull { it.toFloatOrNull() }
        return if (saved?.size == EQ_BANDS.size) saved else List(EQ_BANDS.size) { 0f }
    }

    private inline fun <reified T : Enum<T>> enum(name: String?, fallback: T) =
        name?.let { runCatching { enumValueOf<T>(it) }.getOrNull() } ?: fallback

    companion object {
        /** Те же полосы, что на iPhone и десктопе, чтобы пресеты звучали одинаково. */
        val EQ_BANDS = listOf(60, 150, 400, 1000, 2400, 6000, 15000)

        val EQ_PRESETS = linkedMapOf(
            "Ровно" to listOf(0f, 0f, 0f, 0f, 0f, 0f, 0f),
            "Бас" to listOf(6f, 4f, 1.5f, 0f, 0f, 0f, 0f),
            "Верх" to listOf(0f, 0f, 0f, 0f, 2f, 4f, 6f),
            "Вокал" to listOf(-2f, -1f, 1f, 3f, 3f, 1f, 0f),
            "Громко" to listOf(5f, 3f, 0f, -1f, 0f, 3f, 5f),
        )
    }
}
