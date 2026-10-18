package app.nocturne.core

import kotlin.math.min
import kotlin.math.pow

/**
 * Очередь воспроизведения — общий для всех платформ порядок треков.
 * Поведение описано в shared/spec/playback.md и проверяется shared/cases/queue.json.
 */
class PlaybackQueue(songs: List<Song>, startAt: Int, shuffle: Boolean) {
    enum class Repeat { off, all, one }

    data class Entry(val id: String, val song: Song)

    private var entries: List<Entry> = songs.mapIndexed { index, song -> Entry("$index:${song.id}", song) }
    /** Порядок, каким он был до перемешивания: по нему восстанавливается список и считается «дальше». */
    private var naturalEntries: List<Entry> = entries

    var position: Int = startAt.coerceIn(0, maxOf(entries.lastIndex, 0))
        private set
    var repeatMode: Repeat = Repeat.off
    var shuffle: Boolean = false
        private set

    /** Треки, которые в самом деле играли, в порядке проигрывания: по ним работает «назад». */
    private val history = ArrayDeque<String>()

    init { if (shuffle) setShuffle(true) }

    val items: List<Entry> get() = entries
    val natural: List<Entry> get() = naturalEntries
    val current: Entry? get() = entries.getOrNull(position)
    val upcoming: List<Entry> get() = if (position in entries.indices) entries.drop(position + 1) else emptyList()

    fun setShuffle(enabled: Boolean) {
        if (enabled == shuffle) return
        val playing = current
        shuffle = enabled
        entries = if (enabled) {
            listOfNotNull(playing) + entries.filter { it.id != playing?.id }.shuffled()
        } else {
            naturalEntries
        }
        position = entries.indexOfFirst { it.id == playing?.id }.coerceAtLeast(0)
        history.clear()
    }

    fun nextPosition(automatic: Boolean): Int? {
        if (automatic && repeatMode == Repeat.one) return position
        if (position + 1 < entries.size) return position + 1
        return if (repeatMode == Repeat.all) 0 else null
    }

    fun previousPosition(): Int? {
        if (history.isNotEmpty()) {
            val id = history.last()
            val index = entries.indexOfFirst { it.id == id }
            if (index >= 0) return index
        }
        if (position - 1 >= 0) return position - 1
        return if (repeatMode == Repeat.all) entries.lastIndex else null
    }

    fun jump(to: Int) {
        if (to !in entries.indices) return
        val leaving = current?.id
        if (history.lastOrNull() == entries[to].id) history.removeLast() else if (leaving != null) history.addLast(leaving)
        position = to
    }

    fun insertNext(songs: List<Song>) {
        val added = songs.map { Entry(newId(it), it) }
        entries = entries.toMutableList().apply { addAll(min(position + 1, size), added) }
        if (!shuffle) naturalEntries = entries
        else { val at = naturalEntries.indexOfFirst { it.id == current?.id } + 1; naturalEntries = naturalEntries.take(at) + added + naturalEntries.drop(at) }
    }

    fun append(songs: List<Song>) {
        val added = songs.map { Entry(newId(it), it) }
        entries = entries + added
        naturalEntries = if (shuffle) naturalEntries + added else entries
    }

    /** Играющий трек удалить нельзя: иначе непонятно, что должно зазвучать вместо него. */
    fun remove(id: String) {
        val index = entries.indexOfFirst { it.id == id }
        if (index < 0 || index == position) return
        entries = entries.filterIndexed { i, _ -> i != index }
        naturalEntries = naturalEntries.filterNot { it.id == id }
        if (index < position) position -= 1
        history.remove(id)
    }

    fun moveUpcoming(from: List<Int>, to: Int) {
        val base = position + 1
        if (base >= entries.size) return
        val tail = entries.drop(base).toMutableList()
        val moving = from.sorted().mapNotNull { tail.getOrNull(it) }
        tail.removeAll(moving)
        tail.addAll(to.coerceIn(0, tail.size), moving)
        entries = entries.take(base) + tail
        if (!shuffle) naturalEntries = entries
    }

    data class State(val natural: List<Entry>, val order: List<String>, val current: String?, val shuffle: Boolean, val repeat: Repeat, val history: List<String>)
    fun snapshot() = State(naturalEntries, entries.map { it.id }, current?.id, shuffle, repeatMode, history.toList())
    companion object {
        fun restore(state: State): PlaybackQueue {
            val natural = state.natural.associateBy { it.id }
            require(natural.size == state.natural.size && state.order.size == natural.size && state.order.toSet() == natural.keys)
            return PlaybackQueue(emptyList(), 0, false).apply {
                naturalEntries = state.natural
                entries = state.order.map { natural.getValue(it) }
                position = entries.indexOfFirst { it.id == state.current }.coerceAtLeast(0)
                shuffle = state.shuffle; repeatMode = state.repeat
                history.addAll(state.history.filter { it in natural })
            }
        }
    }
    private fun newId(song: Song) = "${java.util.UUID.randomUUID()}:${song.id}"
}

/** Профили потока. Оригинал отдаётся без перекодирования, остальные — MP3 с заданным потолком. */
enum class StreamQuality(val parameters: Map<String, String>) {
    original(mapOf("format" to "raw")),
    mp3High(mapOf("format" to "mp3", "maxBitRate" to "320")),
    mp3Medium(mapOf("format" to "mp3", "maxBitRate" to "192")),
    mp3Low(mapOf("format" to "mp3", "maxBitRate" to "128")),
}

/** Выравнивание громкости по тегам ReplayGain: усиливать выше 1 нельзя, пик защищает от перегрузки. */
enum class ReplayGainMode {
    off, track, album, auto;

    /**
     * «Авто»: альбом подряд звучит как задумано (по альбому), перемешанная очередь — ровно
     * (по треку). Альбом подряд — когда не перемешано и сосед по очереди с того же альбома.
     */
    fun resolved(songs: List<Song>, index: Int, shuffled: Boolean): ReplayGainMode {
        if (this != auto) return this
        val album = songs.getOrNull(index)?.albumId
        if (shuffled || album == null) return track
        val inOrder = songs.getOrNull(index - 1)?.albumId == album || songs.getOrNull(index + 1)?.albumId == album
        return if (inOrder) ReplayGainMode.album else track
    }

    fun volume(song: Song, preamp: Double = 0.0): Float {
        if (this == off) return 1f
        // Без очереди «Авто» не решить — как по треку; решение принимает resolved(...).
        if (this == auto) return track.volume(song, preamp)
        val gain = song.replayGain ?: return 1f
        val decibels = (if (this == album) gain.albumGain ?: gain.trackGain else gain.trackGain ?: gain.albumGain) ?: 0.0
        val peak = (if (this == album) gain.albumPeak ?: gain.trackPeak else gain.trackPeak ?: gain.albumPeak) ?: 0.0
        var linear = 10.0.pow((decibels + preamp) / 20.0)
        if (peak > 0) linear = min(linear, 1.0 / peak)
        return min(maxOf(linear, 0.0), 1.0).toFloat()
    }
}
