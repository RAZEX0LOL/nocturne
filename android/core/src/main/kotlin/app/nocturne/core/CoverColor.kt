package app.nocturne.core

/**
 * Главный яркий цвет обложки — тот же алгоритм, что на iPhone и на компьютере: пиксели
 * уменьшенной обложки раскладываются на 12 оттенков, вес — насыщенность × яркость.
 * Возвращает (оттенок 0…1, насыщенность 0…1) или null, если обложка серая.
 */
object CoverColor {
    fun vibrant(pixels: IntArray): Pair<Float, Float>? {
        val weight = FloatArray(12)
        val hue = FloatArray(12)
        val saturation = FloatArray(12)
        for (pixel in pixels) {
            val (h, s, v) = hsv(pixel)
            if (s <= 0.15f || v <= 0.2f) continue
            val w = s * v
            val slot = minOf((h * 12).toInt(), 11)
            weight[slot] += w
            hue[slot] += h * w
            saturation[slot] += s * w
        }
        val best = weight.indices.maxBy { weight[it] }
        if (weight[best] <= 0.5f) return null
        return hue[best] / weight[best] to saturation[best] / weight[best]
    }

    /** ARGB → (оттенок, насыщенность, яркость), всё 0…1. */
    fun hsv(pixel: Int): Triple<Float, Float, Float> {
        val r = (pixel shr 16 and 0xFF) / 255f
        val g = (pixel shr 8 and 0xFF) / 255f
        val b = (pixel and 0xFF) / 255f
        val max = maxOf(r, g, b)
        val min = minOf(r, g, b)
        val delta = max - min
        val s = if (max == 0f) 0f else delta / max
        val h = when {
            delta == 0f -> 0f
            max == r -> ((g - b) / delta).let { if (it < 0) it + 6 else it } / 6f
            max == g -> ((b - r) / delta + 2) / 6f
            else -> ((r - g) / delta + 4) / 6f
        }
        return Triple(h, s, max)
    }
}
