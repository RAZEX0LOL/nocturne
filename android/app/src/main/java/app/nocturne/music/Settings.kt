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

/**
 * Оформление: тёмная база одна, меняется акцент — как на iPhone.
 * Название хранится по-русски: это ключ перевода, английский берётся при показе.
 */
enum class AccentTheme(val title: String, val color: Long) {
    /** Цвет играющей обложки; пока её нет — фиолетовый. */
    cover("Из обложки", 0xFFA78BFA),
    violet("Фиолетовый", 0xFFA78BFA),
    mint("Мятный", 0xFF5EEAD4),
    dawn("Рассвет", 0xFFFDA4AF),
    amber("Янтарь", 0xFFFCD34D),
    sky("Небо", 0xFF7DD3FC),
    lime("Лайм", 0xFFBEF264),
    mono("Серый", 0xFFD4D4D8),
}

/** Углы карточек, обложек и кнопок: множитель к радиусам интерфейса. */
enum class Corners(val title: String, val scale: Float) {
    sharp("Острые", 0.3f),
    normal("Обычные", 1f),
    round("Круглые", 1.6f),
}

/** Фон полноэкранного плеера. */
enum class PlayerBackground(val title: String) {
    gradient("Градиент"),
    cover("Размытая обложка"),
    solid("Однотонный"),
}

/** Тема: тёмная, OLED-чёрная (пиксели OLED-экрана не светятся), светлая или как в системе. */
enum class ThemeMode(val title: String) {
    dark("Тёмная"),
    oled("OLED-чёрная"),
    light("Светлая"),
    system("Как в системе"),
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
    var theme by mutableStateOf(enum(store.getString("theme", null), ThemeMode.dark))
        private set
    /** Скорость воспроизведения, 0,5–2×. */
    var speed by mutableStateOf(store.getFloat("playback.speed", 1f))
        private set
    /** Очередь кончилась — дальше похожая музыка. */
    var endless by mutableStateOf(store.getBoolean("playback.endless", true))
        private set
    var equalizerEnabled by mutableStateOf(store.getBoolean("eq.enabled", false))
        private set
    var equalizerGains by mutableStateOf(readGains())
        private set
    var fadeSeconds by mutableStateOf(store.getFloat("playback.fade", 0f))
        private set
    var prepareQueue by mutableStateOf(store.getBoolean("downloads.prepareQueue", false))
        private set
    var downloadLimitMB by mutableStateOf(store.getInt("downloads.limitMB", 0))
        private set
    var downloadOverWifiOnly by mutableStateOf(store.getBoolean("downloads.wifiOnly", false))
        private set
    var downloadFavorites by mutableStateOf(store.getBoolean("downloads.favorites", false))
        private set
    /** Искать текст в LRCLIB, если у Navidrome его нет: названия треков уходят стороннему сервису. */
    var lrclib by mutableStateOf(store.getBoolean("lyrics.lrclib", false))
        private set
    var language by mutableStateOf(enum(store.getString("appearance.language", null), AppLanguage.system))
        private set

    init {
        // Выбранный язык должен действовать с первой же отрисовки, а не после первого захода в настройки.
        appLanguage = language
    }
    var corners by mutableStateOf(enum(store.getString("appearance.corners", null), Corners.normal))
        private set
    var playerBackground by mutableStateOf(enum(store.getString("appearance.playerBackground", null), PlayerBackground.gradient))
        private set
    /** Текст песни: размер (1 — обычный) и строки по центру. */
    var lyricsScale by mutableStateOf(store.getFloat("lyrics.scale", 1f))
        private set
    var lyricsCenter by mutableStateOf(store.getBoolean("lyrics.center", false))
        private set

    fun chooseWifiQuality(value: StreamQuality) { wifiQuality = value; store.edit().putString("quality.wifi", value.name).apply() }
    fun chooseCellularQuality(value: StreamQuality) { cellularQuality = value; store.edit().putString("quality.cellular", value.name).apply() }
    fun chooseReplayGain(value: ReplayGainMode) { replayGain = value; store.edit().putString("replayGain", value.name).apply() }
    fun chooseTheme(value: ThemeMode) { theme = value; store.edit().putString("theme", value.name).apply() }
    fun chooseSpeed(value: Float) { speed = value; store.edit().putFloat("playback.speed", value).apply() }
    fun useEndless(value: Boolean) { endless = value; store.edit().putBoolean("playback.endless", value).apply() }
    fun chooseAccent(value: AccentTheme) { accent = value; store.edit().putString("accent", value.name).apply() }
    fun chooseFadeSeconds(value: Float) { fadeSeconds = value; store.edit().putFloat("playback.fade", value).apply() }
    fun enableEqualizer(value: Boolean) { equalizerEnabled = value; store.edit().putBoolean("eq.enabled", value).apply() }
    fun prepareQueue(value: Boolean) { prepareQueue = value; store.edit().putBoolean("downloads.prepareQueue", value).apply() }
    fun limitDownloadSpace(value: Int) { downloadLimitMB = value; store.edit().putInt("downloads.limitMB", value).apply() }
    fun limitDownloadsToWifi(value: Boolean) { downloadOverWifiOnly = value; store.edit().putBoolean("downloads.wifiOnly", value).apply() }
    fun chooseLanguage(value: AppLanguage) {
        language = value
        appLanguage = value
        store.edit().putString("appearance.language", value.name).apply()
    }

    fun chooseCorners(value: Corners) { corners = value; store.edit().putString("appearance.corners", value.name).apply() }
    fun choosePlayerBackground(value: PlayerBackground) { playerBackground = value; store.edit().putString("appearance.playerBackground", value.name).apply() }
    fun chooseLyricsScale(value: Float) { lyricsScale = value; store.edit().putFloat("lyrics.scale", value).apply() }
    fun useLyricsCenter(value: Boolean) { lyricsCenter = value; store.edit().putBoolean("lyrics.center", value).apply() }
    fun useLrclib(value: Boolean) { lrclib = value; store.edit().putBoolean("lyrics.lrclib", value).apply() }
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

        /** Названия — ключи перевода, как и у акцентов: переводятся на показе. */
        val EQ_PRESETS = linkedMapOf(
            "Ровно" to listOf(0f, 0f, 0f, 0f, 0f, 0f, 0f),
            "Бас" to listOf(6f, 4f, 1.5f, 0f, 0f, 0f, 0f),
            "Верх" to listOf(0f, 0f, 0f, 0f, 2f, 4f, 6f),
            "Вокал" to listOf(-2f, -1f, 1f, 3f, 3f, 1f, 0f),
            "Громко" to listOf(5f, 3f, 0f, -1f, 0f, 3f, 5f),
        )
    }
}
