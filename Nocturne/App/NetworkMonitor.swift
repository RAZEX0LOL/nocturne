import Foundation
import Network

@MainActor @Observable
final class NetworkMonitor {
    static let shared = NetworkMonitor()
    private(set) var isOnline = true
    /// Cellular or personal hotspot: stream quality switches to the cellular preset.
    private(set) var isExpensive = false
    @ObservationIgnored var onReconnect: (() -> Void)?
    /// Extra listeners for any path change (downloads wait for Wi-Fi).
    @ObservationIgnored var onChange: [() -> Void] = []
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
        onChange.forEach { $0() }
    }
}

enum PlaybackSettings {
    static let wifiQualityKey = "quality.wifi"
    static let cellularQualityKey = "quality.cellular"
    static let defaultWifi = StreamQuality.defaultWifi
    static let defaultCellular = StreamQuality.defaultCellular
    static let replayGainKey = "playback.replayGain"

    static func quality(expensive: Bool) -> StreamQuality {
        let saved = { (key: String) in UserDefaults.standard.string(forKey: key).flatMap(StreamQuality.init) }
        return StreamQuality.forNetwork(expensive: expensive,
                                        wifi: saved(wifiQualityKey) ?? defaultWifi,
                                        cellular: saved(cellularQualityKey) ?? defaultCellular)
    }
}
