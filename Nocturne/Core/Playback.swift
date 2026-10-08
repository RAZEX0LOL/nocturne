import Foundation

/// Play order over a list of songs: shuffle, repeat and queue editing, independent of AVFoundation.
struct PlaybackQueue: Codable, Equatable, Sendable {
    enum Repeat: String, Codable, CaseIterable, Sendable { case off, all, one }

    struct Entry: Codable, Hashable, Identifiable, Sendable {
        let id: UUID
        var song: Song
        init(_ song: Song) { id = UUID(); self.song = song }
    }

    /// Entries in the order they will play.
    private(set) var items: [Entry] = []
    /// Unshuffled order; restored when shuffle is turned off.
    private(set) var natural: [Entry] = []
    private(set) var position = 0
    private(set) var shuffle = false
    var repeatMode = Repeat.off

    var current: Entry? { items.indices.contains(position) ? items[position] : nil }
    var upcoming: ArraySlice<Entry> { items.indices.contains(position) ? items[(position + 1)...] : [] }
    var isEmpty: Bool { items.isEmpty }

    init() {}

    init(songs: [Song], startAt index: Int, shuffle: Bool) {
        natural = songs.map(Entry.init)
        items = natural
        position = natural.indices.contains(index) ? index : 0
        if shuffle { setShuffle(true) }
    }

    mutating func setShuffle(_ enabled: Bool) {
        guard let current else { shuffle = enabled; return }
        shuffle = enabled
        if enabled {
            items = [current] + natural.filter { $0.id != current.id }.shuffled()
            position = 0
        } else {
            items = natural
            position = natural.firstIndex { $0.id == current.id } ?? 0
        }
    }

    /// Position that plays after the current one. `automatic` is true when the track ended on its own.
    func nextPosition(automatic: Bool) -> Int? {
        guard !items.isEmpty else { return nil }
        if automatic && repeatMode == .one { return position }
        if position + 1 < items.count { return position + 1 }
        return repeatMode == .all ? 0 : nil
    }

    func previousPosition() -> Int? {
        guard !items.isEmpty else { return nil }
        if position > 0 { return position - 1 }
        return repeatMode == .all ? items.count - 1 : nil
    }

    mutating func jump(to newPosition: Int) {
        guard items.indices.contains(newPosition) else { return }
        position = newPosition
    }

    mutating func insertNext(_ songs: [Song]) {
        let entries = songs.map(Entry.init)
        guard let current else { self = PlaybackQueue(songs: songs, startAt: 0, shuffle: shuffle); return }
        items.insert(contentsOf: entries, at: position + 1)
        let naturalIndex = natural.firstIndex { $0.id == current.id }.map { $0 + 1 } ?? natural.count
        natural.insert(contentsOf: entries, at: naturalIndex)
    }

    mutating func append(_ songs: [Song]) {
        guard current != nil else { self = PlaybackQueue(songs: songs, startAt: 0, shuffle: shuffle); return }
        let entries = songs.map(Entry.init)
        items.append(contentsOf: entries)
        natural.append(contentsOf: entries)
    }

    /// Removes an entry that is not the current one.
    mutating func remove(id: Entry.ID) {
        guard id != current?.id, let index = items.firstIndex(where: { $0.id == id }) else { return }
        items.remove(at: index)
        natural.removeAll { $0.id == id }
        if index < position { position -= 1 }
    }

    /// Applies a metadata change (e.g. starred) to every entry of the song.
    mutating func updateSong(id: String, _ change: (inout Song) -> Void) {
        for index in items.indices where items[index].song.id == id { change(&items[index].song) }
        for index in natural.indices where natural[index].song.id == id { change(&natural[index].song) }
    }

    /// Reorders upcoming entries; offsets are relative to `upcoming`.
    mutating func moveUpcoming(fromOffsets source: IndexSet, toOffset destination: Int) {
        let base = position + 1
        var tail = Array(upcoming)
        let moving = source.sorted().filter { tail.indices.contains($0) }.map { tail[$0] }
        let before = source.filter { $0 < destination }.count
        tail.removeAll { entry in moving.contains { $0.id == entry.id } }
        tail.insert(contentsOf: moving, at: min(max(0, destination - before), tail.count))
        items.replaceSubrange(base..., with: tail)
        if !shuffle { natural = items }
    }
}

enum StreamQuality: String, Codable, CaseIterable, Identifiable, Sendable {
    case original, mp3High, mp3Medium, mp3Low
    var id: String { rawValue }
    var title: String {
        switch self {
        case .original: String(localized: "Оригинал (без сжатия)")
        case .mp3High: String(localized: "Высокое · MP3 320")
        case .mp3Medium: String(localized: "Среднее · MP3 192")
        case .mp3Low: String(localized: "Экономное · MP3 128")
        }
    }
    var streamParameters: [String: String] {
        switch self {
        case .original: ["format": "raw"]
        case .mp3High: ["format": "mp3", "maxBitRate": "320"]
        case .mp3Medium: ["format": "mp3", "maxBitRate": "192"]
        case .mp3Low: ["format": "mp3", "maxBitRate": "128"]
        }
    }
}

enum ReplayGainMode: String, CaseIterable, Identifiable, Sendable {
    case off, track, album, auto
    var id: String { rawValue }
    var title: String {
        switch self {
        case .off: String(localized: "Выключено")
        case .track: String(localized: "По треку")
        case .album: String(localized: "По альбому")
        case .auto: String(localized: "Авто")
        }
    }

    /// «Авто»: альбом подряд звучит как задумано (по альбому), перемешанная очередь — ровно
    /// (по треку). Альбом подряд — когда не перемешано и сосед по очереди с того же альбома.
    func resolved(songs: [Song], index: Int, shuffled: Bool) -> ReplayGainMode {
        guard self == .auto else { return self }
        guard !shuffled, songs.indices.contains(index), let album = songs[index].albumId else { return .track }
        let neighbours = [index - 1, index + 1].filter(songs.indices.contains).map { songs[$0].albumId }
        return neighbours.contains(album) ? .album : .track
    }

    /// Linear volume for the song. AVPlayer can't amplify, so positive gains are capped at 1;
    /// the peak keeps the result from clipping.
    func volume(for song: Song, preamp: Double = 0) -> Float {
        guard self != .off, let gain = song.replayGain else { return 1 }
        // Без очереди «Авто» не решить — как по треку; решение принимает resolved(...).
        if self == .auto { return ReplayGainMode.track.volume(for: song, preamp: preamp) }
        let db = (self == .album ? gain.albumGain ?? gain.trackGain : gain.trackGain ?? gain.albumGain) ?? 0
        let peak = (self == .album ? gain.albumPeak ?? gain.trackPeak : gain.trackPeak ?? gain.albumPeak) ?? 0
        var linear = pow(10, (db + preamp) / 20)
        if peak > 0 { linear = min(linear, 1 / peak) }
        return Float(min(max(linear, 0), 1))
    }
}

/// Persisted player state; restored paused on the next launch for the same server and user.
struct QueueSnapshot: Codable, Equatable, Sendable {
    var account: String
    var queue: PlaybackQueue
    var elapsed: Double
}

/// Одно прослушивание — одна отметка. Правила проверяются shared/cases/scrobbles.json.
struct ScrobblePlay: Codable, Hashable, Sendable {
    var id: String
    /// Время начала прослушивания в секундах эпохи: по нему сервер строит историю.
    var time: Double
}

enum Scrobbles {
    /// Повторную отметку того же прослушивания не добавляем: сервер засчитал бы его дважды.
    static func keep(_ queue: [ScrobblePlay], _ play: ScrobblePlay) -> [ScrobblePlay] {
        queue.contains(play) ? queue : queue + [play]
    }

    static func ordered(_ queue: [ScrobblePlay]) -> [ScrobblePlay] {
        queue.sorted { $0.time < $1.time }
    }

    static func remaining(_ queue: [ScrobblePlay], sent: [ScrobblePlay]) -> [ScrobblePlay] {
        queue.filter { !sent.contains($0) }
    }
}

extension StreamQuality {
    /// Значения по умолчанию — часть договорённости между платформами, не вкус отдельного экрана.
    static let defaultWifi = StreamQuality.mp3High
    static let defaultCellular = StreamQuality.mp3Medium

    /// Дорогая сеть — мобильная: там по умолчанию экономнее.
    static func forNetwork(expensive: Bool, wifi: StreamQuality, cellular: StreamQuality) -> StreamQuality {
        expensive ? cellular : wifi
    }
}
