import CryptoKit
import Foundation
import UIKit

/// Offline copies of songs. Files live in Application Support (not purged by iOS, excluded from backup),
/// one folder per account; `index.json` maps song ids to files and metadata.
/// Transfers run in a background `URLSession`, so they continue after the app is closed.
@MainActor @Observable
final class DownloadStore {
    static let shared = DownloadStore()
    static let prepareQueueKey = "downloads.prepareQueue"
    static let wifiOnlyKey = "downloads.wifiOnly"
    static let autoFavoritesKey = "downloads.autoFavorites"
    static let limitKey = "downloads.limitGB"
    static let qualityKey = "quality.downloads"
    static let defaultQuality = StreamQuality.mp3High
    static let sessionIdentifier = "app.nocturne.downloads"

    enum State: Equatable { case queued, downloading(Double), failed }

    struct Item: Codable, Sendable {
        var song: Song
        var file: String
        var size: Int
        var date: Date
        var automatic: Bool? = nil
    }

    /// A transfer handed to the system; persisted so results can be filed after a relaunch.
    struct Transfer: Codable, Sendable {
        var song: Song
        var account: String
        var quality: StreamQuality? = nil
        var automatic: Bool? = nil
    }

    private(set) var items: [String: Item] = [:]
    private(set) var active: [String: State] = [:]
    var songs: [Song] { items.values.sorted { $0.date > $1.date }.map(\.song) }
    var totalSize: Int { items.values.reduce(0) { $0 + $1.size } }

    @ObservationIgnored private var client: NavidromeClient?
    @ObservationIgnored private var directory: URL?
    @ObservationIgnored private var transfers: [String: Transfer] = [:]
    @ObservationIgnored private var expectedSizes: [String: Int64] = [:]
    @ObservationIgnored private var resuming = false
    @ObservationIgnored private var foregroundFallbacks: Set<String> = []
    @ObservationIgnored private var session: URLSession!
    @ObservationIgnored private let delegate = BackgroundDelegate()
    /// Handed over by the app delegate when iOS relaunches us to finish background transfers.
    @ObservationIgnored var backgroundCompletion: (() -> Void)?
    /// Kept for the Downloads UI; the Wi-Fi rule itself is enforced per request.
    @ObservationIgnored var network: NetworkMonitor?

    nonisolated private static let root = URL.applicationSupportDirectory.appendingPathComponent("Downloads", isDirectory: true)
    private static let transfersURL = root.appendingPathComponent("transfers.json")
    nonisolated private static let staging = root.appendingPathComponent("staging", isDirectory: true)

    private init() {
        try? FileManager.default.createDirectory(at: Self.staging, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: Self.transfersURL),
           let saved = try? JSONDecoder().decode([String: Transfer].self, from: data) { transfers = saved }
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        configuration.httpMaximumConnectionsPerHost = 2
        configuration.sessionSendsLaunchEvents = true
        configuration.urlCache = nil
        delegate.store = self
        session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        // Show transfers that survived a relaunch as queued until they report progress.
        NetworkMonitor.shared.onChange.append { [weak self] in
            guard NetworkMonitor.shared.isOnline else { return }
            Task { await self?.resumePending() }
        }
    }

    /// Switches to the account's folder; called whenever the connected server changes.
    func use(_ client: NavidromeClient?) {
        guard client?.credentials.account != self.client?.credentials.account else { return }
        self.client = client
        items = [:]; active = [:]
        guard let client else { directory = nil; return }
        for transfer in transfers.values where transfer.account == client.credentials.account { active[transfer.song.id] = .queued }
        Task { await resumePending() }
        let folder = Self.folder(for: client.credentials.account)
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

    func download(_ songs: [Song], automatic: Bool = false) {
        guard let client else { return }
        let quality = UserDefaults.standard.string(forKey: Self.qualityKey).flatMap(StreamQuality.init) ?? Self.defaultQuality
        for song in songs where !LocalLibrary.isLocal(song.id) {
            if var item = items[song.id] {
                if !automatic { item.automatic = false; items[song.id] = item; saveIndex() }
                continue
            }
            let key = UUID().uuidString
            if let existing = transfers.first(where: { $0.value.account == client.credentials.account && $0.value.song.id == song.id }) {
                if !automatic { var pinned = existing.value; pinned.automatic = false; transfers[existing.key] = pinned }
                continue
            }
            transfers[key] = Transfer(song: song, account: client.credentials.account, quality: quality, automatic: automatic)
            active[song.id] = .queued
        }
        saveTransfers()
        Task { await resumePending() }
    }

    private func availableBytes(automatic: Bool) -> Int {
        let limitGB = UserDefaults.standard.double(forKey: Self.limitKey)
        let totalAvailable = limitGB > 0 ? max(0, Int(limitGB * 1_073_741_824) - totalSize) : Int.max
        if !automatic { return totalAvailable }
        let cacheSize = items.values.filter { $0.automatic == true }.reduce(0) { $0 + $1.size }
        return min(totalAvailable, max(0, 256 * 1024 * 1024 - cacheSize))
    }

    func resumePending() async {
        guard let client, NetworkMonitor.shared.isOnline, !resuming else { return }
        resuming = true
        defer { resuming = false }
        let tasks = await session.allTasks
        guard self.client?.credentials.account == client.credentials.account else { return }
        let running = Set(tasks.compactMap(\.taskDescription))
        for (key, transfer) in transfers where transfer.account == client.credentials.account && !running.contains(key) && !foregroundFallbacks.contains(key) {
            let automatic = transfer.automatic == true
            if automatic && (!UserDefaults.standard.bool(forKey: Self.prepareQueueKey) || (NetworkMonitor.shared.isExpensive || NetworkMonitor.shared.isConstrained)) { continue }
            guard availableBytes(automatic: automatic) > 0,
                  let request = Self.request(for: transfer.song, client: client, quality: transfer.quality ?? Self.defaultQuality, automatic: automatic) else { continue }
            let task = session.downloadTask(with: request)
            task.taskDescription = key
            active[transfer.song.id] = .queued
            task.resume()
        }
    }

    func prepare(_ upcoming: [Song], currentID: String?) {
        guard UserDefaults.standard.bool(forKey: Self.prepareQueueKey), NetworkMonitor.shared.isOnline,
              !NetworkMonitor.shared.isExpensive, !NetworkMonitor.shared.isConstrained, let account = client?.credentials.account else { return }
        let wanted = OfflinePreparation.songs(upcoming, enabled: true, online: true, unmetered: true)
        let keep = Set(wanted.map(\.id) + [currentID].compactMap { $0 })
        let obsolete = items.values.filter { $0.automatic == true && !keep.contains($0.song.id) }.map(\.song)
        remove(obsolete)
        let keys = Set(transfers.filter { $0.value.account == account && $0.value.automatic == true && !keep.contains($0.value.song.id) }.keys)
        cancelTransfers { keys.contains($0) }
        download(wanted, automatic: true)
    }

    nonisolated private static func transferKey(account: String, songID: String) -> String {
        SHA256.hash(data: Data((account + "\u{0}" + songID).utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static func request(for song: Song, client: NavidromeClient, quality: StreamQuality, automatic: Bool = false) -> URLRequest? {
        let parameters = quality.streamParameters.merging(["id": song.id]) { $1 }
        guard let url = try? client.url("stream", parameters: parameters) else { return nil }
        var request = URLRequest(url: url)
        // "Wi-Fi only": the system holds the transfer until an unmetered network is available.
        request.allowsConstrainedNetworkAccess = !automatic
        request.allowsExpensiveNetworkAccess = !(automatic || UserDefaults.standard.bool(forKey: wifiOnlyKey))
        return request
    }

    /// Fallback when the background transfer daemon is unavailable (seen on some simulators):
    /// download in the app's own session while it is running.
    private func downloadInForeground(_ songID: String) async {
        guard let transfer = transfers[songID], let client, client.credentials.account == transfer.account else {
            failed(songID, URLError(.cancelled)); return
        }
        let quality = transfer.quality ?? Self.defaultQuality
        guard let request = Self.request(for: transfer.song, client: client, quality: quality, automatic: transfer.automatic == true) else { failed(songID, URLError(.badURL)); return }
        active[transfer.song.id] = .downloading(0)
        do {
            let (temporary, response) = try await client.session.download(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let ext = Self.fileExtension(for: response)
            let staged = Self.staging.appendingPathComponent("\(SHA256.hash(data: Data(songID.utf8)).map { String(format: "%02x", $0) }.joined()).\(ext)")
            try? FileManager.default.removeItem(at: staged)
            try FileManager.default.moveItem(at: temporary, to: staged)
            finished(songID, staged: staged, fileExtension: ext)
        } catch { failed(songID, error) }
    }

    func remove(_ songs: [Song]) {
        let ids = Set(songs.map(\.id))
        let account = client?.credentials.account
        let keys = Set(transfers.filter { $0.value.account == account && ids.contains($0.value.song.id) }.keys)
        cancelTransfers { keys.contains($0) }
        for song in songs {
            active[song.id] = nil
            if let url = localURL(for: song.id) { try? FileManager.default.removeItem(at: url) }
            items[song.id] = nil
        }
        saveIndex()
    }

    func removeAll() {
        remove(items.values.map(\.song) + transfers.values.filter { $0.account == client?.credentials.account }.map(\.song))
        // Обложки больше ни к чему не относятся: удаляем вместе с последними загрузками.
        guard let directory, let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return }
        for file in files where file.lastPathComponent.hasPrefix("cover-") { try? FileManager.default.removeItem(at: file) }
    }

    private func cancelTransfers(where match: @escaping @Sendable (String) -> Bool) {
        for id in transfers.keys where match(id) { if let song = transfers[id]?.song { active[song.id] = nil }; transfers[id] = nil }
        saveTransfers()
        let session = session!
        Task {
            for task in await session.allTasks where match(task.taskDescription ?? "") { task.cancel() }
        }
    }

    // MARK: - Session events (forwarded from the delegate on the main actor)

    fileprivate func progress(_ songID: String, _ fraction: Double, written: Int64, expected: Int64) {
        guard let transfer = transfers[songID], transfer.account == client?.credentials.account else { return }
        let incoming = max(written, expected)
        let reserved = expectedSizes.filter { key, _ in key != songID && transfers[key]?.account == transfer.account }.values.reduce(0, +)
        if incoming > max(0, Int64(availableBytes(automatic: transfer.automatic == true)) - reserved) {
            expectedSizes[songID] = nil
            active[transfer.song.id] = .failed
            Task { for task in await session.allTasks where task.taskDescription == songID { task.cancel() } }
            return
        }
        expectedSizes[songID] = incoming
        if fraction.isFinite { active[transfer.song.id] = .downloading(fraction) }
    }

    /// `staged` was moved out of the system's temporary location by the delegate.
    fileprivate func finished(_ songID: String, staged: URL, fileExtension: String) {
        defer { saveTransfers() }
        expectedSizes[songID] = nil
        guard let transfer = transfers.removeValue(forKey: songID) else { try? FileManager.default.removeItem(at: staged); return }
        foregroundFallbacks.remove(songID)
        if transfer.account == client?.credentials.account { active[transfer.song.id] = nil }
        let folder = Self.folder(for: transfer.account)
        let file = "\(Self.transferKey(account: transfer.account, songID: transfer.song.id)).\(fileExtension)"
        let destination = folder.appendingPathComponent(file)
        let incoming = (try? staged.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if transfer.account == client?.credentials.account, incoming > availableBytes(automatic: transfer.automatic == true) {
            try? FileManager.default.removeItem(at: staged)
            active[transfer.song.id] = .failed
            transfers[songID] = transfer
            return
        }
        do {
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: staged, to: destination)
        } catch {
            Log.library.error("Download move failed: \(Log.describe(error), privacy: .public)")
            if transfer.account == client?.credentials.account { active[transfer.song.id] = .failed }
            transfers[songID] = transfer
            return
        }
        let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let item = Item(song: transfer.song, file: file, size: size, date: Date(), automatic: transfer.automatic)
        if let coverID = transfer.song.coverArt, let client, client.credentials.account == transfer.account {
            Task { await ArtworkCache.shared.keepCover(id: coverID, account: transfer.account, client: client) }
        }
        if transfer.account == client?.credentials.account {
            items[transfer.song.id] = item
            saveIndex()
        } else {
            // Finished for a server that isn't active right now: file it into that server's index.
            var index = (try? Data(contentsOf: folder.appendingPathComponent("index.json")))
                .flatMap { try? JSONDecoder().decode([String: Item].self, from: $0) } ?? [:]
            index[transfer.song.id] = item
            if let data = try? JSONEncoder().encode(index) { try? data.write(to: folder.appendingPathComponent("index.json"), options: .atomic) }
        }
    }

    fileprivate func failed(_ songID: String, _ error: Error?) {
        expectedSizes[songID] = nil
        guard let transfer = transfers[songID] else { return }
        let code = (error as? URLError)?.code
        if code == .unknown || code == .backgroundSessionRequiresSharedContainer || code == .backgroundSessionWasDisconnected,
           !foregroundFallbacks.contains(songID) {
            foregroundFallbacks.insert(songID)
            Task { await downloadInForeground(songID) }
            return
        }
        foregroundFallbacks.remove(songID)
        if (error as? URLError)?.code == .cancelled {
            if transfer.account == client?.credentials.account { active[transfer.song.id] = nil }
        } else {
            Log.library.error("Download failed: \(Log.describe(error), privacy: .public)")
            if transfer.account == client?.credentials.account { active[transfer.song.id] = .failed }
        }
        saveTransfers()
    }

    fileprivate func finishedBackgroundEvents() {
        backgroundCompletion?()
        backgroundCompletion = nil
    }

    // MARK: - Storage

    nonisolated private static func folder(for account: String) -> URL {
        let name = SHA256.hash(data: Data(account.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
        var folder = root.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? folder.setResourceValues(values)
        return folder
    }

    /// Cover kept next to the downloaded tracks: the artwork cache lives in Caches and iOS may purge it,
    /// which would leave the offline library as empty squares.
    nonisolated static func coverFile(account: String, coverID: String) -> URL {
        let name = SHA256.hash(data: Data(coverID.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
        return folder(for: account).appendingPathComponent("cover-\(name).img")
    }

    private func saveIndex() {
        guard let directory, let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: directory.appendingPathComponent("index.json"), options: .atomic)
    }

    private func saveTransfers() {
        guard let data = try? JSONEncoder().encode(transfers) else { return }
        try? data.write(to: Self.transfersURL, options: .atomic)
    }

    /// AVPlayer picks the decoder by file extension, so it must match the actual format.
    nonisolated fileprivate static func fileExtension(for response: URLResponse?) -> String {
        let known = ["audio/flac": "flac", "audio/x-flac": "flac", "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
                     "audio/aac": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg",
                     "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3"]
        if let mime = response?.mimeType?.lowercased(), let ext = known[mime] { return ext }
        let suggested = response?.suggestedFilename.map { ($0 as NSString).pathExtension } ?? ""
        return suggested.isEmpty ? "mp3" : suggested
    }

    nonisolated fileprivate static var stagingDirectory: URL { staging }
}

/// URLSession delegate for the background session. Callbacks arrive on a private queue;
/// the downloaded file must be moved before `didFinishDownloadingTo` returns.
private final class BackgroundDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    weak var store: DownloadStore?

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let id = downloadTask.taskDescription else { return }
        let fraction = totalBytesExpectedToWrite > 0 ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) : 0
        Task { @MainActor [weak store] in store?.progress(id, fraction, written: totalBytesWritten, expected: totalBytesExpectedToWrite) }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let id = downloadTask.taskDescription else { return }
        guard let http = downloadTask.response as? HTTPURLResponse, http.statusCode == 200 else {
            let status = URLError(.badServerResponse)
            Task { @MainActor [weak store] in store?.failed(id, status) }
            return
        }
        let ext = DownloadStore.fileExtension(for: http)
        let staged = DownloadStore.stagingDirectory.appendingPathComponent("\(SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()).\(ext)")
        try? FileManager.default.removeItem(at: staged)
        do { try FileManager.default.moveItem(at: location, to: staged) } catch {
            Task { @MainActor [weak store] in store?.failed(id, error) }
            return
        }
        Task { @MainActor [weak store] in store?.finished(id, staged: staged, fileExtension: ext) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // Success is handled in didFinishDownloadingTo; only report failures here.
        guard let error, let id = task.taskDescription else { return }
        Task { @MainActor [weak store] in store?.failed(id, error) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor [weak store] in store?.finishedBackgroundEvents() }
    }
}

/// Receives the relaunch event iOS sends when background downloads finish while the app is closed.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        guard identifier == DownloadStore.sessionIdentifier else { completionHandler(); return }
        DownloadStore.shared.backgroundCompletion = completionHandler
    }
}
