import CryptoKit
import Foundation

/// Offline copies of songs. Files live in Application Support (not purged by iOS, excluded from backup),
/// one folder per account; `index.json` maps song ids to files and metadata.
@MainActor @Observable
final class DownloadStore {
    static let shared = DownloadStore()
    static let wifiOnlyKey = "downloads.wifiOnly"
    static let autoFavoritesKey = "downloads.autoFavorites"
    static let limitKey = "downloads.limitGB"
    enum State: Equatable { case queued, downloading(Double), failed }

    struct Item: Codable, Sendable {
        var song: Song
        var file: String
        var size: Int
        var date: Date
    }

    static let qualityKey = "quality.downloads"
    static let defaultQuality = StreamQuality.mp3High
    static let maxConcurrent = 2

    private(set) var items: [String: Item] = [:]
    private(set) var active: [String: State] = [:]
    var songs: [Song] { items.values.sorted { $0.date > $1.date }.map(\.song) }
    var totalSize: Int { items.values.reduce(0) { $0 + $1.size } }

    @ObservationIgnored private var client: NavidromeClient?
    @ObservationIgnored private var pending: [Song] = []
    @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var directory: URL?
    /// Set by the app; used for the Wi-Fi-only rule.
    @ObservationIgnored var network: NetworkMonitor? {
        didSet { network?.onChange.append { [weak self] in self?.pump() } }
    }
    /// True while queued downloads wait for Wi-Fi.
    private(set) var waitingForWiFi = false

    /// Switches to the account's folder; called whenever the connected server changes.
    func use(_ client: NavidromeClient?) {
        guard client?.credentials.account != self.client?.credentials.account else { return }
        cancelAll()
        self.client = client
        items = [:]
        guard let client else { directory = nil; return }
        let name = SHA256.hash(data: Data(client.credentials.account.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
        var folder = URL.applicationSupportDirectory.appendingPathComponent("Downloads/\(name)", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? folder.setResourceValues(values)
        directory = folder
        if let data = try? Data(contentsOf: folder.appendingPathComponent("index.json")),
           let saved = try? JSONDecoder().decode([String: Item].self, from: data) {
            // Drop entries whose files were removed behind our back.
            items = saved.filter { FileManager.default.fileExists(atPath: folder.appendingPathComponent($0.value.file).path) }
        }
    }

    func localURL(for songID: String) -> URL? {
        guard let item = items[songID], let directory else { return nil }
        return directory.appendingPathComponent(item.file)
    }

    func isDownloaded(_ song: Song) -> Bool { items[song.id] != nil }
    func state(of song: Song) -> State? { active[song.id] }

    func download(_ songs: [Song]) {
        let fresh = songs.filter { items[$0.id] == nil && (active[$0.id] == nil || active[$0.id] == .failed) }
        for song in fresh { active[song.id] = .queued }
        pending += fresh
        pump()
    }

    func remove(_ songs: [Song]) {
        for song in songs {
            tasks[song.id]?.cancel()
            pending.removeAll { $0.id == song.id }
            active[song.id] = nil
            if let url = localURL(for: song.id) { try? FileManager.default.removeItem(at: url) }
            items[song.id] = nil
        }
        saveIndex()
    }

    func removeAll() { remove(items.values.map(\.song)) }

    private func cancelAll() {
        tasks.values.forEach { $0.cancel() }
        tasks = [:]; pending = []; active = [:]
    }

    private func pump() {
        let defaults = UserDefaults.standard
        waitingForWiFi = defaults.bool(forKey: Self.wifiOnlyKey) && (network?.isExpensive ?? false) && !pending.isEmpty
        guard !waitingForWiFi, network?.isOnline ?? true else { return }
        let limitGB = defaults.double(forKey: Self.limitKey)
        if limitGB > 0, Double(totalSize) >= limitGB * 1_073_741_824 {
            // Over the storage limit: leave the rest queued as failed so the user sees why.
            for song in pending { active[song.id] = .failed }
            pending = []
            Log.library.info("Download limit reached")
            return
        }
        while tasks.count < Self.maxConcurrent, !pending.isEmpty {
            let song = pending.removeFirst()
            tasks[song.id] = Task { await fetch(song) }
        }
    }

    private func fetch(_ song: Song) async {
        defer { tasks[song.id] = nil; pump() }
        guard let client, let directory else { return }
        let quality = UserDefaults.standard.string(forKey: Self.qualityKey).flatMap(StreamQuality.init) ?? Self.defaultQuality
        let parameters = quality.streamParameters.merging(["id": song.id]) { $1 }
        guard let url = try? client.url("stream", parameters: parameters) else { active[song.id] = .failed; return }
        active[song.id] = .downloading(0)
        let progress = ProgressDelegate { [weak self] fraction in
            Task { @MainActor in if self?.active[song.id] != nil { self?.active[song.id] = .downloading(fraction) } }
        }
        do {
            let (temporary, response) = try await client.session.download(from: url, delegate: progress)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw MusicError.invalidResponse }
            try Task.checkCancellation()
            let file = "\(song.id).\(Self.fileExtension(for: response, quality: quality))"
            let destination = directory.appendingPathComponent(file)
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: temporary, to: destination)
            let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            items[song.id] = Item(song: song, file: file, size: size, date: Date())
            active[song.id] = nil
            saveIndex()
        } catch is CancellationError {
            active[song.id] = nil
        } catch {
            Log.library.error("Download failed: \(Log.describe(error), privacy: .public)")
            active[song.id] = .failed
        }
    }

    private func saveIndex() {
        guard let directory, let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: directory.appendingPathComponent("index.json"), options: .atomic)
    }

    /// AVPlayer picks the decoder by file extension, so it must match the actual format.
    private static func fileExtension(for response: URLResponse, quality: StreamQuality) -> String {
        let known = ["audio/flac": "flac", "audio/x-flac": "flac", "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
                     "audio/aac": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg",
                     "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3"]
        if let mime = response.mimeType?.lowercased(), let ext = known[mime] { return ext }
        let suggested = response.suggestedFilename.map { ($0 as NSString).pathExtension } ?? ""
        return quality == .original && !suggested.isEmpty ? suggested : "mp3"
    }
}

/// Reports download progress for a single async `download(from:delegate:)` call.
private final class ProgressDelegate: NSObject, URLSessionDownloadDelegate, Sendable {
    let onProgress: @Sendable (Double) -> Void
    init(onProgress: @escaping @Sendable (Double) -> Void) { self.onProgress = onProgress }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        onProgress(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
}
