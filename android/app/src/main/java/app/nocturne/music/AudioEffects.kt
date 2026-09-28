package app.nocturne.music

import android.content.Context
import android.media.audiofx.Equalizer
import android.util.Log

/**
 * Эквалайзер системного звукового движка.
 *
 * Полосы у устройства свои (обычно пять), а настройка общая для всех платформ — семь полос.
 * Поэтому каждой полосе устройства достаётся усиление ближайшей из наших частот: пресеты звучат
 * узнаваемо, а ползунки означают одно и то же на телефоне, компьютере и iPhone.
 */
class AudioEffects(context: Context) {
    private val settings = Settings(context)
    private var equalizer: Equalizer? = null

    fun attach(audioSessionId: Int) {
        release()
        equalizer = runCatching { Equalizer(0, audioSessionId) }.getOrElse {
            Log.w("Nocturne", tr("Эквалайзер недоступен на этом устройстве"), it)
            null
        }
        apply()
    }

    fun apply() {
        val equalizer = equalizer ?: return
        runCatching {
            equalizer.enabled = settings.equalizerEnabled
            if (!settings.equalizerEnabled) return
            val range = equalizer.bandLevelRange
            for (band in 0 until equalizer.numberOfBands) {
                val centerHz = equalizer.getCenterFreq(band.toShort()) / 1000
                val nearest = Settings.EQ_BANDS.withIndex().minBy { kotlin.math.abs(it.value - centerHz) }.index
                val millibels = (settings.equalizerGains.getOrElse(nearest) { 0f } * 100).toInt()
                equalizer.setBandLevel(band.toShort(), millibels.coerceIn(range[0].toInt(), range[1].toInt()).toShort())
            }
        }.onFailure { Log.w("Nocturne", tr("Не удалось применить эквалайзер"), it) }
    }

    fun release() {
        runCatching { equalizer?.release() }
        equalizer = null
    }
}
