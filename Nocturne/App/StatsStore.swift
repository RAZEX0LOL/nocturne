import Foundation

/// Local listening history: one record per counted play (same rule as scrobbling). Stays on the device.
@MainActor @Observable
final class StatsStore {
    static let shared = StatsStore()

    struct Play: Codable, Sendable {
        var songID: String
        var title: String
        var artist: String
        var album: String
        var seconds: Double
        var date: Date
        var playId: String? = nil
        var account: String? = nil
    }

    private(set) var plays: [Play] = []
    private static let url = URL.applicationSupportDirectory.appendingPathComponent("stats.json")
    private static let limit = 20_000

    private init() {
        if let data = try? Data(contentsOf: Self.url), let saved = try? JSONDecoder().decode([Play].self, from: data) { plays = saved }
    }

    func record(_ song: Song, seconds: Double, playId: String? = nil, account: String? = nil) {
        if let playId, plays.contains(where: { $0.playId == playId && $0.account == account }) { return }
        plays.append(Play(songID: song.id, title: song.title, artist: song.artist ?? String(localized: "Неизвестный исполнитель"),
                          album: song.album ?? "", seconds: seconds, date: Date(), playId: playId, account: account))
        if plays.count > Self.limit { plays.removeFirst(plays.count - Self.limit) }
        save()
    }

    func clear() { plays = []; save() }

    func plays(since date: Date) -> [Play] { plays.filter { $0.date >= date } }

    /// Top entries by play count.
    func top(_ key: KeyPath<Play, String>, in plays: [Play], limit: Int = 5) -> [(name: String, count: Int)] {
        Dictionary(grouping: plays, by: { $0[keyPath: key] })
            .map { (name: $0.key, count: $0.value.count) }
            .sorted { $0.count > $1.count }
            .prefix(limit).map { $0 }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(plays) else { return }
        try? FileManager.default.createDirectory(at: Self.url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: Self.url, options: .atomic)
    }
}
