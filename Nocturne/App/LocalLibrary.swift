import AVFoundation
import CryptoKit
import UIKit

/// The device the app runs on, for texts like "На iPhone" / "На Mac" — the same build ships to phone, iPad and Mac.
@MainActor enum Device {   // UIDevice is main-actor isolated
    static var name: String {
        #if targetEnvironment(macCatalyst)
        "Mac"
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        #endif
    }
    static var icon: String {
        #if targetEnvironment(macCatalyst)
        "laptopcomputer"
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        #endif
    }
}

/// Music stored on the device itself. Files live in Documents/Music, so they are visible in the Files app
/// and in Finder; the index (tags, artwork) lives in Application Support. Song ids are "local:<hash of path>".
@MainActor @Observable
final class LocalLibrary {
    static let shared = LocalLibrary()
    nonisolated static let idPrefix = "local:"
    nonisolated static let audioExtensions: Set<String> = ["mp3", "m4a", "m4b", "aac", "alac", "flac", "wav", "aif", "aiff", "caf"]

    struct Track: Codable, Sendable {
        var path: String
        var song: Song
        var added: Date
        var size: Int
    }

    private(set) var tracks: [String: Track] = [:]
    private(set) var isImporting = false

    /// Album order, then track number, then title.
    var songs: [Song] {
        tracks.values.map(\.song).sorted {
            let lhs = ($0.album ?? "", $0.track ?? 0), rhs = ($1.album ?? "", $1.track ?? 0)
            if lhs.0 != rhs.0 { return lhs.0.localizedStandardCompare(rhs.0) == .orderedAscending }
            if lhs.1 != rhs.1 { return lhs.1 < rhs.1 }
            return $0.title.localizedStandardCompare($1.title) == .orderedAscending
        }
    }
    var recentlyAdded: [Song] { tracks.values.sorted { $0.added > $1.added }.map(\.song) }
    var totalSize: Int { tracks.values.reduce(0) { $0 + $1.size } }

    nonisolated static let musicFolder = URL.documentsDirectory.appendingPathComponent("Music", isDirectory: true)
    nonisolated static let artworkFolder = URL.applicationSupportDirectory.appendingPathComponent("LocalArtwork", isDirectory: true)
    private static let indexURL = URL.applicationSupportDirectory.appendingPathComponent("local-library.json")

    private init() {
        try? FileManager.default.createDirectory(at: Self.musicFolder, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: Self.artworkFolder, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: Self.indexURL),
           let saved = try? JSONDecoder().decode([String: Track].self, from: data) { tracks = saved }
    }

    nonisolated static func isLocal(_ id: String?) -> Bool { id?.hasPrefix(idPrefix) ?? false }

    func url(for songID: String) -> URL? {
        tracks[songID].map { Self.musicFolder.appendingPathComponent($0.path) }
    }

    nonisolated static func artworkURL(for id: String) -> URL {
        artworkFolder.appendingPathComponent(id.replacingOccurrences(of: idPrefix, with: "") + ".img")
    }

    /// Copies picked files (or whole folders) into Music and indexes them. Returns the number of new tracks.
    @discardableResult
    func importItems(_ urls: [URL]) async -> Int {
        isImporting = true
        defer { isImporting = false }
        let before = tracks.count
        await Task.detached(priority: .userInitiated) { Self.copyIntoLibrary(urls) }.value
        await scan()
        return tracks.count - before
    }

    /// Syncs the index with the Music folder: picks up files added through Files/Finder, drops deleted ones.
    func scan() async {
        let paths = await Task.detached(priority: .utility) { Self.audioPaths() }.value
        let present = Set(paths)
        var changed = false
        for (id, track) in tracks where !present.contains(track.path) {
            tracks[id] = nil
            try? FileManager.default.removeItem(at: Self.artworkURL(for: id))
            changed = true
        }
        let known = Set(tracks.values.map(\.path))
        for path in paths where !known.contains(path) {
            let track = await Task.detached(priority: .utility) { await Self.readTrack(path: path) }.value
            tracks[track.song.id] = track
            changed = true
        }
        if changed { save() }
    }

    func remove(_ songs: [Song]) {
        for song in songs {
            guard let track = tracks.removeValue(forKey: song.id) else { continue }
            try? FileManager.default.removeItem(at: Self.musicFolder.appendingPathComponent(track.path))
            try? FileManager.default.removeItem(at: Self.artworkURL(for: song.id))
        }
        save()
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(tracks) else { return }
        try? data.write(to: Self.indexURL, options: .atomic)
    }

    // MARK: - File work (off the main actor)

    private nonisolated static func copyIntoLibrary(_ urls: [URL]) {
        let fm = FileManager.default
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            // Already inside the library (opened in place from Files): nothing to copy.
            if url.standardizedFileURL.path.hasPrefix(musicFolder.standardizedFileURL.path) { continue }
            var isDirectory: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDirectory) else { continue }
            if isDirectory.boolValue {
                let target = uniqueURL(musicFolder.appendingPathComponent(url.lastPathComponent, isDirectory: true))
                let files = (fm.enumerator(at: url, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? [])
                    .filter { audioExtensions.contains($0.pathExtension.lowercased()) }
                for file in files {
                    let relative = file.path.replacingOccurrences(of: url.path + "/", with: "")
                    let destination = target.appendingPathComponent(relative)
                    try? fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try? fm.copyItem(at: file, to: destination)
                }
            } else if audioExtensions.contains(url.pathExtension.lowercased()) {
                try? fm.copyItem(at: url, to: uniqueURL(musicFolder.appendingPathComponent(url.lastPathComponent)))
            }
        }
    }

    private nonisolated static func uniqueURL(_ url: URL) -> URL {
        var candidate = url, index = 2
        let base = url.deletingPathExtension().lastPathComponent, ext = url.pathExtension
        while FileManager.default.fileExists(atPath: candidate.path) {
            let name = ext.isEmpty ? "\(base) \(index)" : "\(base) \(index).\(ext)"
            candidate = url.deletingLastPathComponent().appendingPathComponent(name)
            index += 1
        }
        return candidate
    }

    private nonisolated static func audioPaths() -> [String] {
        let root = musicFolder.standardizedFileURL.path + "/"
        let files = FileManager.default.enumerator(at: musicFolder, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? []
        return files.filter { audioExtensions.contains($0.pathExtension.lowercased()) }
            .map { $0.standardizedFileURL.path.replacingOccurrences(of: root, with: "") }
    }

    /// Reads tags with AVFoundation; falls back to the file and folder names.
    private nonisolated static func readTrack(path: String) async -> Track {
        let url = musicFolder.appendingPathComponent(path)
        let id = idPrefix + SHA256.hash(data: Data(path.utf8)).prefix(10).map { String(format: "%02x", $0) }.joined()
        let asset = AVURLAsset(url: url)
        var title: String?, artist: String?, album: String?, trackNumber: Int?, artwork: Data?
        for item in (try? await asset.load(.commonMetadata)) ?? [] {
            switch item.commonKey {
            case .commonKeyTitle?: title = try? await item.load(.stringValue)
            case .commonKeyArtist?: artist = try? await item.load(.stringValue)
            case .commonKeyAlbumName?: album = try? await item.load(.stringValue)
            case .commonKeyArtwork?: artwork = try? await item.load(.dataValue)
            default: break
            }
        }
        for format in (try? await asset.load(.availableMetadataFormats)) ?? [] {
            for item in (try? await asset.loadMetadata(for: format)) ?? [] where trackNumber == nil {
                let key = item.identifier?.rawValue.lowercased() ?? ""
                guard key.contains("trkn") || key.contains("trck") || key.contains("tracknumber") else { continue }
                if let text = try? await item.load(.stringValue), let number = Int(text.split(separator: "/").first ?? "") {
                    trackNumber = number
                } else if let data = try? await item.load(.dataValue), data.count >= 4 {
                    trackNumber = Int(data[data.startIndex + 2]) << 8 | Int(data[data.startIndex + 3])
                }
            }
        }
        let seconds = (try? await asset.load(.duration))?.seconds
        // "03 - Title.mp3" / "03. Title" / "03 Title": leading number is the track, the rest the title.
        var fileName = url.deletingPathExtension().lastPathComponent
        if let match = fileName.firstMatch(of: /^(\d{1,3})[\s._-]+(.+)$/) {
            if trackNumber == nil { trackNumber = Int(match.1) }
            fileName = String(match.2)
        }
        let folder = url.deletingLastPathComponent().lastPathComponent
        if let artwork { try? artwork.write(to: artworkURL(for: id), options: .atomic) }
        let song = Song(id: id, title: title?.nilIfBlank ?? fileName, artist: artist?.nilIfBlank,
                        album: album?.nilIfBlank ?? (folder == musicFolder.lastPathComponent ? nil : folder),
                        coverArt: artwork == nil ? nil : id,
                        duration: seconds.flatMap { $0.isFinite ? $0 : nil }, track: trackNumber)
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return Track(path: path, song: song, added: Date(), size: size)
    }
}

private extension String {
    var nilIfBlank: String? { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self }
}

/// Groups songs (on-device or downloaded) into album tiles for offline browsing.
struct DeviceAlbum: Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String?
    let coverArt: String?
    let songs: [Song]

    static func group(_ songs: [Song]) -> [DeviceAlbum] {
        let groups = Dictionary(grouping: songs) { "\($0.album ?? "")|\($0.artist ?? "")" }
        return groups.map { key, songs in
            let sorted = songs.sorted { ($0.track ?? 0, $0.title) < ($1.track ?? 0, $1.title) }
            return DeviceAlbum(id: key, title: sorted.first?.album ?? String(localized: "Без альбома"),
                               artist: sorted.first?.artist, coverArt: sorted.first { $0.coverArt != nil }?.coverArt, songs: sorted)
        }.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }
}
