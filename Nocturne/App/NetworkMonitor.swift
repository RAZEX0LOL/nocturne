import Foundation
import Network

@MainActor @Observable
final class NetworkMonitor {
    static let shared = NetworkMonitor()
    private(set) var isOnline = true
    /// Cellular or personal hotspot: stream quality switches to the cellular preset.
    private(set) var isExpensive = false
    private(set) var isConstrained = false
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
            let constrained = path.isConstrained
            Task { @MainActor in monitor?.update(online: online, expensive: expensive, constrained: constrained) }
        }
    }

    private func update(online: Bool, expensive: Bool, constrained: Bool) {
        let reconnected = online && !isOnline
        isOnline = online
        isExpensive = expensive
        isConstrained = constrained
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
    /// Search lyrics on LRCLIB when Navidrome has none (off by default: titles go to a third party).
    static let lrclibKey = "lyrics.lrclib"
    /// Очередь кончилась — дальше похожая музыка (включено по умолчанию, как у стриминговых сервисов).
    static let endlessKey = "playback.endless"
    /// Скорость воспроизведения, 0,5–2×.
    static let speedKey = "playback.speed"
    static var endless: Bool { UserDefaults.standard.object(forKey: endlessKey) as? Bool ?? true }
    static var speed: Float { UserDefaults.standard.object(forKey: speedKey) as? Float ?? 1 }

    static func quality(expensive: Bool) -> StreamQuality {
        let saved = { (key: String) in UserDefaults.standard.string(forKey: key).flatMap(StreamQuality.init) }
        return StreamQuality.forNetwork(expensive: expensive,
                                        wifi: saved(wifiQualityKey) ?? defaultWifi,
                                        cellular: saved(cellularQualityKey) ?? defaultCellular)
    }
}
