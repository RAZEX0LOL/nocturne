import Foundation

/// What the widget shows; written by the app into the shared App Group container.
struct NowPlayingSnapshot: Codable, Sendable {
    static let appGroup = "group.app.nocturne.music"
    static let widgetKind = "NowPlaying"

    var title: String
    var artist: String
    var album: String
    var isPlaying: Bool

    static var coverURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent("widget-cover.jpg")
    }

    static func load() -> NowPlayingSnapshot? {
        UserDefaults(suiteName: appGroup)?.data(forKey: "nowPlaying").flatMap { try? JSONDecoder().decode(Self.self, from: $0) }
    }

    func save() {
        UserDefaults(suiteName: Self.appGroup)?.set(try? JSONEncoder().encode(self), forKey: "nowPlaying")
    }

    static func clear() {
        UserDefaults(suiteName: appGroup)?.removeObject(forKey: "nowPlaying")
        if let coverURL { try? FileManager.default.removeItem(at: coverURL) }
    }
}
