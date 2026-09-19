import Foundation
import Network

@MainActor @Observable
final class NetworkMonitor {
    private(set) var isOnline = true
    /// Cellular or personal hotspot: stream quality switches to the cellular preset.
    private(set) var isExpensive = false
    @ObservationIgnored var onReconnect: (() -> Void)?
    @ObservationIgnored private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = Self.handler(for: self)
        monitor.start(queue: DispatchQueue(label: "app.nocturne.network"))
    }

    deinit { monitor.cancel() }

    // Built outside the actor: NWPathMonitor calls it on its own queue.
    private nonisolated static func handler(for monitor: NetworkMonitor) -> @Sendable (NWPath) -> Void {
        { [weak monitor] path in
            let online = path.status == .satisfied
            let expensive = path.isExpensive
            Task { @MainActor in monitor?.update(online: online, expensive: expensive) }
        }
    }

    private func update(online: Bool, expensive: Bool) {
        let reconnected = online && !isOnline
        isOnline = online
        isExpensive = expensive
        if reconnected { onReconnect?() }
    }
}

enum PlaybackSettings {
    static let wifiQualityKey = "quality.wifi"
    static let cellularQualityKey = "quality.cellular"
    static let defaultWifi = StreamQuality.mp3High
    static let defaultCellular = StreamQuality.mp3Medium

    static func quality(expensive: Bool) -> StreamQuality {
        let key = expensive ? cellularQualityKey : wifiQualityKey
        return UserDefaults.standard.string(forKey: key).flatMap(StreamQuality.init) ?? (expensive ? defaultCellular : defaultWifi)
    }
}
