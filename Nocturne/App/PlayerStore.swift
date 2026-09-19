import AVFoundation
import MediaPlayer
import SwiftUI
import WidgetKit

@MainActor @Observable
final class PlayerStore {
    typealias RepeatMode = PlaybackQueue.Repeat
    static let shared = PlayerStore()

    private(set) var queue = PlaybackQueue()
    /// What the user asked for; stays true while the stream buffers or waits for the network.
    private(set) var isPlaying = false
    private(set) var isBuffering = false
    private(set) var elapsed: Double = 0
    private(set) var duration: Double = 0
    var error: String?
    /// Short confirmation shown as a toast ("Добавлено в очередь").
    var notice: String?
    /// Pause at this moment, or when the current track ends (`sleepAtTrackEnd`).
    private(set) var sleepDeadline: Date?
    private(set) var sleepAtTrackEnd = false
    let network = NetworkMonitor()

    var current: Song? { queue.current?.song }
    /// Internet radio: a live stream without duration, seeking or scrobbling.
    var isLive: Bool { current.map { directStreams[$0.id] != nil } ?? false }
    var shuffle: Bool {
        get { queue.shuffle }
        set { queue.setShuffle(newValue); queueDidChange() }
    }
    var repeatMode: RepeatMode {
        get { queue.repeatMode }
        set { queue.repeatMode = newValue; queueDidChange() }
    }

    @ObservationIgnored private let player = AVQueuePlayer()
    @ObservationIgnored private var client: NavidromeClient?
    @ObservationIgnored private var currentItem: AVPlayerItem?
    /// Preloaded item for the next queue position, so tracks change without a gap.
    @ObservationIgnored private var nextItem: (item: AVPlayerItem, position: Int)?
    @ObservationIgnored private var retryCount = 0
    /// The same failure arrives via KVO, a notification and the queue change; handle it once.
    @ObservationIgnored private weak var handledFailure: AVPlayerItem?
    @ObservationIgnored private var waitingForNetwork = false
    @ObservationIgnored private var resumeAfterInterruption = false
    @ObservationIgnored private var lastSaved = Date.distantPast
    @ObservationIgnored private var observations: [NSKeyValueObservation] = []
    @ObservationIgnored private var itemObservations: [ObjectIdentifier: NSKeyValueObservation] = [:]
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var notifications: [NSObjectProtocol] = []
    @ObservationIgnored private var remoteTargets: [(MPRemoteCommand, Any)] = []
    @ObservationIgnored private var artworkTask: Task<Void, Never>?
    @ObservationIgnored private var artwork: MPMediaItemArtwork?
    /// Offline copy lookup, provided by `DownloadStore`; local files are preferred over streaming.
    @ObservationIgnored var localFile: ((String) -> URL?)?
    /// Songs that stream from an external URL (radio stations), keyed by song id.
    @ObservationIgnored private var directStreams: [String: URL] = [:]
    @ObservationIgnored private var sleepTask: Task<Void, Never>?
    @ObservationIgnored private var noticeTask: Task<Void, Never>?
    /// Queue entry already submitted as a play, so a track is scrobbled at most once per play.
    @ObservationIgnored private var scrobbledEntry: PlaybackQueue.Entry.ID?

    private static let snapshotURL = URL.applicationSupportDirectory.appendingPathComponent("queue.json")

    init() {
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(time.seconds) }
        }
        observations = Self.observePlayer(player, store: self)
        let center = NotificationCenter.default
        notifications.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            MainActor.assumeIsolated { self?.interruption(began: type == AVAudioSession.InterruptionType.began.rawValue, options: options) }
        })
        notifications.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            MainActor.assumeIsolated { if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.pause() } }
        })
        notifications.append(center.addObserver(forName: AVPlayerItem.failedToPlayToEndTimeNotification, object: nil, queue: .main) { [weak self] note in
            guard let item = note.object as? AVPlayerItem else { return }
            let id = ObjectIdentifier(item)
            MainActor.assumeIsolated { self?.itemFailed(id) }
        })
        network.onReconnect = { [weak self] in self?.networkRestored() }
        bindRemoteCommands()
    }

    // MARK: - Public API

    func play(_ songs: [Song], at index: Int = 0, shuffle: Bool? = nil, client: NavidromeClient?) {
        guard songs.indices.contains(index) else { return }
        guard let client else { error = MusicError.demo.localizedDescription; return }
        self.client = client
        let repeatMode = queue.repeatMode
        queue = PlaybackQueue(songs: songs, startAt: index, shuffle: shuffle ?? queue.shuffle)
        queue.repeatMode = repeatMode
        startCurrent(at: 0, autoplay: true)
    }

    func playRadio(_ station: RadioStation, client: NavidromeClient?) {
        guard let url = URL(string: station.streamUrl), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            error = String(localized: "У станции некорректный адрес потока."); return
        }
        let song = Song(id: "radio-\(station.id)", title: station.name, artist: String(localized: "Интернет-радио"))
        directStreams[song.id] = url
        play([song], shuffle: false, client: client)
    }

    func playNext(_ songs: [Song], client: NavidromeClient?) {
        guard current != nil else { play(songs, client: client); return }
        queue.insertNext(songs)
        queueDidChange()
        show(songs.count == 1 ? String(localized: "Сыграет следующим") : String(localized: "Сыграют следующими: \(songs.count)"))
    }

    func addToQueue(_ songs: [Song], client: NavidromeClient?) {
        guard current != nil else { play(songs, client: client); return }
        queue.append(songs)
        queueDidChange()
        show(songs.count == 1 ? String(localized: "Добавлено в очередь") : String(localized: "Добавлено в очередь: \(songs.count)"))
    }

    func show(_ message: String) {
        notice = message
        noticeTask?.cancel()
        noticeTask = Task {
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { notice = nil }
        }
    }

    /// `minutes == nil` cancels; `0` means "at the end of this track".
    func setSleepTimer(minutes: Int?) {
        sleepTask?.cancel()
        sleepDeadline = nil
        sleepAtTrackEnd = minutes == 0
        guard let minutes, minutes > 0 else { return }
        let deadline = Date().addingTimeInterval(Double(minutes) * 60)
        sleepDeadline = deadline
        sleepTask = Task {
            try? await Task.sleep(for: .seconds(deadline.timeIntervalSinceNow))
            guard !Task.isCancelled else { return }
            sleepDeadline = nil
            pause()
        }
    }

    func remove(_ id: PlaybackQueue.Entry.ID) { queue.remove(id: id); queueDidChange() }

    func moveUpcoming(from source: IndexSet, to destination: Int) {
        queue.moveUpcoming(fromOffsets: source, toOffset: destination)
        queueDidChange()
    }

    func select(_ id: PlaybackQueue.Entry.ID) {
        guard let position = queue.items.firstIndex(where: { $0.id == id }) else { return }
        queue.jump(to: position)
        startCurrent(at: 0, autoplay: true)
    }

    func updateSong(id: String, _ change: (inout Song) -> Void) {
        queue.updateSong(id: id, change)
        save(force: true)
    }

    func toggle() { isPlaying ? pause() : resume() }

    func pause() {
        isPlaying = false
        resumeAfterInterruption = false
        player.pause()
        updateNowPlaying()
        publishWidget()
        save(force: true)
    }

    func resume() {
        guard current != nil else { return }
        let finished = duration > 0 && elapsed >= duration - 0.5
        guard let currentItem, currentItem.status != .failed, player.currentItem === currentItem else {
            startCurrent(at: finished ? 0 : elapsed, autoplay: true)
            return
        }
        if finished { seek(0) }
        isPlaying = true
        activateAndPlay()
        updateNowPlaying()
        publishWidget()
    }

    func seek(_ seconds: Double) {
        guard seconds.isFinite else { return }
        let value = min(max(0, seconds), max(duration, 0))
        elapsed = value
        if currentItem != nil { player.seek(to: CMTime(seconds: value, preferredTimescale: 600)) }
        updateNowPlaying()
        save(force: true)
    }

    func advance() {
        guard let position = queue.nextPosition(automatic: false) else { pause(); seek(duration); return }
        if let next = nextItem, next.position == position, player.items().contains(next.item) {
            isPlaying = true
            player.advanceToNextItem()
            activateAndPlay()
            syncCurrentItem()
        } else {
            queue.jump(to: position)
            startCurrent(at: 0, autoplay: true)
        }
    }

    func previous() {
        guard elapsed <= 3, let position = queue.previousPosition() else { seek(0); return }
        queue.jump(to: position)
        startCurrent(at: 0, autoplay: true)
    }

    #if DEBUG
    /// Fills the queue without a server, for layout checks (`--demo-player`).
    func preview(_ songs: [Song]) {
        queue = PlaybackQueue(songs: songs, startAt: 0, shuffle: false)
        duration = current?.duration ?? 0
    }
    #endif

    func cycleRepeat() { repeatMode = repeatMode == .off ? .all : repeatMode == .all ? .one : .off }

    func stop() {
        setSleepTimer(minutes: nil)
        isPlaying = false; isBuffering = false
        player.pause(); player.removeAllItems()
        artworkTask?.cancel()
        currentItem = nil; nextItem = nil; itemObservations = [:]
        queue = PlaybackQueue(); elapsed = 0; duration = 0; client = nil; artwork = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        publishWidget()
        Self.sessionQueue.async { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        try? FileManager.default.removeItem(at: Self.snapshotURL)
    }

    /// Brings back the last queue (paused) if it belongs to the same account.
    func restore(client: NavidromeClient) {
        guard current == nil, let data = try? Data(contentsOf: Self.snapshotURL),
              let snapshot = try? JSONDecoder().decode(QueueSnapshot.self, from: data),
              snapshot.account == client.credentials.account, let restored = snapshot.queue.current,
              !restored.song.id.hasPrefix("radio-") else { return }
        self.client = client
        queue = snapshot.queue
        duration = current?.duration ?? 0
        elapsed = min(snapshot.elapsed, duration)
    }

    func save(force: Bool = false) {
        guard let client, !queue.isEmpty, force || Date().timeIntervalSince(lastSaved) > 10 else { return }
        lastSaved = Date()
        let snapshot = QueueSnapshot(account: client.credentials.account, queue: queue, elapsed: elapsed)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? FileManager.default.createDirectory(at: Self.snapshotURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: Self.snapshotURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    // MARK: - Items

    private func startCurrent(at time: Double, autoplay: Bool, isRetry: Bool = false) {
        guard let song = current, let item = makeItem(for: song) else { return }
        Log.player.notice("Start \(song.id, privacy: .public) at \(time, privacy: .public)s, retry \(isRetry, privacy: .public)")
        if !isRetry { retryCount = 0 }
        waitingForNetwork = false
        player.removeAllItems()
        itemObservations = [:]
        currentItem = item
        nextItem = nil
        observe(item)
        player.insert(item, after: nil)
        if time > 0 { item.seek(to: CMTime(seconds: time, preferredTimescale: 600), completionHandler: nil) }
        elapsed = time
        duration = song.duration ?? 0
        isPlaying = autoplay
        if autoplay { activateAndPlay() }
        if !isRetry { artwork = nil; loadArtwork(for: song); reportNowPlaying() }
        prepareNext()
        updateNowPlaying()
        save(force: true)
    }

    private func makeItem(for song: Song) -> AVPlayerItem? {
        if let direct = directStreams[song.id] { return AVPlayerItem(url: direct) }
        let item: AVPlayerItem
        if let local = localFile?(song.id) { item = AVPlayerItem(url: local) } else {
            guard let url = streamURL(for: song) else { return nil }
            item = AVPlayerItem(url: url)
        }
        AudioEffects.shared.attach(to: item, duration: song.duration)
        return item
    }

    private func streamURL(for song: Song) -> URL? {
        guard let client else { return nil }
        let quality = PlaybackSettings.quality(expensive: network.isExpensive)
        let parameters = quality.streamParameters.merging(["id": song.id]) { $1 }
        return try? client.url("stream", parameters: parameters)
    }

    /// Keeps exactly one preloaded item after the current one, matching the queue's next position.
    private func prepareNext() {
        if let next = nextItem {
            player.remove(next.item)
            itemObservations[ObjectIdentifier(next.item)] = nil
            nextItem = nil
        }
        guard let currentItem, player.items().contains(currentItem),
              let position = queue.nextPosition(automatic: true),
              let item = makeItem(for: queue.items[position].song),
              player.canInsert(item, after: currentItem) else { return }
        observe(item)
        player.insert(item, after: currentItem)
        nextItem = (item, position)
    }

    private func queueDidChange() {
        prepareNext()
        save(force: true)
    }

    /// Reconciles state with the item AVQueuePlayer is actually playing.
    private func syncCurrentItem() {
        let actual = player.currentItem
        if actual === currentItem { return }
        // AVQueuePlayer silently drops an item that failed to load; that's an error, not the end of the track.
        if let old = currentItem, old.status == .failed || old.error != nil {
            currentFailed()
            return
        }
        if let next = nextItem, actual === next.item {
            if let old = currentItem { itemObservations[ObjectIdentifier(old)] = nil }
            queue.jump(to: next.position)
            currentItem = next.item
            nextItem = nil
            retryCount = 0
            elapsed = 0
            duration = current?.duration ?? 0
            if let song = current { artwork = nil; loadArtwork(for: song) }
            reportNowPlaying()
            if sleepAtTrackEnd {
                sleepAtTrackEnd = false
                pause()
            }
            prepareNext()
            updateNowPlaying()
            save(force: true)
        } else if actual == nil, currentItem != nil {
            currentItem = nil
            // The preloaded item failed or was never created: move on without it.
            if isPlaying, let position = queue.nextPosition(automatic: true), nextItem == nil, elapsed >= duration - 2 {
                queue.jump(to: position)
                startCurrent(at: 0, autoplay: true)
            } else {
                sleepAtTrackEnd = false
                // Without an item AVQueuePlayer keeps rate 1 and reports "waiting"; stop it explicitly.
                player.pause()
                isPlaying = false
                isBuffering = false
                elapsed = duration
                updateNowPlaying()
                save(force: true)
            }
        }
    }

    private func itemFailed(_ id: ObjectIdentifier) {
        if let next = nextItem, ObjectIdentifier(next.item) == id {
            player.remove(next.item)
            itemObservations[id] = nil
            nextItem = nil
            return
        }
        guard let currentItem, ObjectIdentifier(currentItem) == id else { return }
        currentFailed()
    }

    private func currentFailed() {
        guard let failedItem = currentItem, handledFailure !== failedItem else { return }
        handledFailure = failedItem
        Log.player.error("Item failed: \(Log.describe(failedItem.error), privacy: .public), retry \(self.retryCount, privacy: .public), online \(self.network.isOnline, privacy: .public)")
        let position = elapsed
        // Don't let AVQueuePlayer run ahead to the preloaded track while we recover this one.
        player.pause()
        if !network.isOnline {
            waitingForNetwork = isPlaying
            isBuffering = isPlaying
            return
        }
        guard retryCount < 4 else {
            Log.player.error("Giving up after \(self.retryCount, privacy: .public) retries")
            pause()
            error = String(localized: "Не удалось воспроизвести трек. Проверь сеть, формат файла и транскодирование в Navidrome.")
            return
        }
        retryCount += 1
        isBuffering = isPlaying
        let delay = Double(1 << (retryCount - 1))
        Task {
            try? await Task.sleep(for: .seconds(delay))
            guard self.currentItem === failedItem else { return }
            startCurrent(at: position, autoplay: isPlaying, isRetry: true)
        }
    }

    // Last.fm rules: a play counts after half the track or 4 minutes, and only for tracks longer than 30 s.
    private func submitScrobbleIfNeeded() {
        guard let entry = queue.current, scrobbledEntry != entry.id, !isLive, duration > 30,
              elapsed >= min(duration / 2, 240), let client else { return }
        scrobbledEntry = entry.id
        StatsStore.shared.record(entry.song, seconds: duration)
        let id = entry.song.id
        Task { try? await client.scrobble(songID: id, submission: true) }
    }

    private func reportNowPlaying() {
        applyReplayGain()
        publishWidget(resetCover: true)
        guard let client, let id = current?.id, !isLive else { return }
        scrobbledEntry = nil
        Task { try? await client.scrobble(songID: id, submission: false) }
    }

    /// Per-track volume from ReplayGain tags; radio and untagged tracks play at full volume.
    private func applyReplayGain() {
        let mode = UserDefaults.standard.string(forKey: PlaybackSettings.replayGainKey).flatMap(ReplayGainMode.init) ?? .off
        player.volume = current.map { mode.volume(for: $0) } ?? 1
    }

    /// Mirrors the current track into the App Group so the widget can show it.
    private func publishWidget(cover: UIImage? = nil, resetCover: Bool = false) {
        if let song = current {
            NowPlayingSnapshot(title: song.title, artist: song.artist ?? "", album: song.album ?? "", isPlaying: isPlaying).save()
            if let url = NowPlayingSnapshot.coverURL {
                if resetCover { try? FileManager.default.removeItem(at: url) }
                if let data = cover?.jpegData(compressionQuality: 0.8) { try? data.write(to: url, options: .atomic) }
            }
        } else {
            NowPlayingSnapshot.clear()
        }
        WidgetCenter.shared.reloadTimelines(ofKind: NowPlayingSnapshot.widgetKind)
    }

    private func networkRestored() {
        guard waitingForNetwork, current != nil else { return }
        Log.player.notice("Network restored, resuming at \(self.elapsed, privacy: .public)s")
        startCurrent(at: elapsed, autoplay: true, isRetry: true)
    }

    private func tick(_ seconds: Double) {
        guard currentItem != nil, player.currentItem === currentItem else { return }
        elapsed = seconds.isFinite ? max(0, seconds) : 0
        if let itemDuration = currentItem?.duration.seconds, itemDuration.isFinite, itemDuration > 0 { duration = itemDuration }
        submitScrobbleIfNeeded()
        save()
    }

    private func statusChanged(_ status: AVPlayer.TimeControlStatus) {
        let buffering = (status == .waitingToPlayAtSpecifiedRate && player.currentItem != nil) || waitingForNetwork
        guard buffering != isBuffering else { return }
        isBuffering = buffering
        updateNowPlaying()
    }

    private func interruption(began: Bool, options: UInt) {
        if began {
            let wasPlaying = isPlaying
            pause()
            resumeAfterInterruption = wasPlaying
        } else if resumeAfterInterruption, AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) {
            resume()
        }
    }

    /// Audio session calls can block for hundreds of milliseconds (calls, Bluetooth, AirPlay routing),
    /// so they run on a private serial queue; playback starts on the main actor once the session is active.
    private static let sessionQueue = DispatchQueue(label: "app.nocturne.audio-session", qos: .userInitiated)

    private func activateAndPlay() {
        Self.sessionQueue.async { [weak self] in
            var failure: String?
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, policy: .longFormAudio)
                try session.setActive(true)
            } catch { failure = Log.describe(error) }
            let result = failure
            Task { @MainActor in self?.sessionActivated(failure: result) }
        }
    }

    private func sessionActivated(failure: String?) {
        guard let failure else {
            // The user may have paused while the session was activating.
            if isPlaying { player.play() }
            return
        }
        Log.player.error("Audio session: \(failure, privacy: .public)")
        isPlaying = false
        error = String(localized: "Не удалось запустить аудио. Попробуй ещё раз.")
        updateNowPlaying()
        publishWidget()
    }

    // MARK: - Observation (callbacks arrive on arbitrary queues, so closures are built outside the actor)

    private func observe(_ item: AVPlayerItem) {
        itemObservations[ObjectIdentifier(item)] = Self.observeStatus(of: item, store: self)
    }

    private nonisolated static func observeStatus(of item: AVPlayerItem, store: PlayerStore) -> NSKeyValueObservation {
        item.observe(\.status, options: [.new]) { [weak store] item, _ in
            guard item.status == .failed else { return }
            let id = ObjectIdentifier(item)
            Task { @MainActor in store?.itemFailed(id) }
        }
    }

    private nonisolated static func observePlayer(_ player: AVQueuePlayer, store: PlayerStore) -> [NSKeyValueObservation] {
        [
            player.observe(\.timeControlStatus, options: [.new]) { [weak store] player, _ in
                let status = player.timeControlStatus
                Task { @MainActor in store?.statusChanged(status) }
            },
            player.observe(\.currentItem, options: [.new]) { [weak store] _, _ in
                Task { @MainActor in store?.syncCurrentItem() }
            }
        ]
    }

    // MARK: - System integration

    private func bindRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()
        bind(commands.playCommand) { $0.resume() }
        bind(commands.pauseCommand) { $0.pause() }
        bind(commands.togglePlayPauseCommand) { $0.toggle() }
        bind(commands.nextTrackCommand) { $0.advance() }
        bind(commands.previousTrackCommand) { $0.previous() }
        let target = commands.changePlaybackPositionCommand.addTarget { @Sendable [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let position = event.positionTime
            Task { @MainActor in self?.seek(position) }
            return .success
        }
        remoteTargets.append((commands.changePlaybackPositionCommand, target))
    }

    private func bind(_ command: MPRemoteCommand, action: @escaping @MainActor (PlayerStore) -> Void) {
        let target = command.addTarget { @Sendable [weak self] _ in
            Task { @MainActor in if let self { action(self) } }
            return .success
        }
        remoteTargets.append((command, target))
    }

    private func updateNowPlaying() {
        guard let current else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: current.title, MPMediaItemPropertyArtist: current.artist ?? "",
            MPMediaItemPropertyAlbumTitle: current.album ?? "", MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying && !isBuffering ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue
        ]
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadArtwork(for song: Song) {
        artworkTask?.cancel()
        guard let client, let id = song.coverArt else { Appearance.shared.coverColor = nil; return }
        artworkTask = Task {
            guard let image = await ArtworkCache.shared.image(id: id, bucket: 640, client: client),
                  !Task.isCancelled, self.current?.id == song.id else { return }
            artwork = Self.makeArtwork(image)
            Appearance.shared.coverColor = CoverPalette.vibrantColor(of: image)
            updateNowPlaying()
            publishWidget(cover: image)
        }
    }

    // MediaPlayer calls the handler on its own queue; the closure must not inherit @MainActor.
    private nonisolated static func makeArtwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
