import AVFoundation
import MediaToolbox
import os

/// Seven-band equalizer and track fades, applied to every AVPlayerItem through its audio mix.
/// The EQ runs in an MTAudioProcessingTap (works for progressive streams and local files, not HLS).
final class AudioEffects: Sendable {
    static let shared = AudioEffects()
    static let frequencies: [Double] = [60, 150, 400, 1_000, 2_400, 6_000, 15_000]
    static let enabledKey = "eq.enabled", gainsKey = "eq.gains", presetKey = "eq.preset", fadeKey = "playback.fade"

    enum Preset: String, CaseIterable, Identifiable, Sendable {
        case flat, bass, treble, vocal, loudness, custom
        var id: String { rawValue }
        var title: String {
            switch self {
            case .flat: String(localized: "Ровно")
            case .bass: String(localized: "Больше баса")
            case .treble: String(localized: "Больше верхов")
            case .vocal: String(localized: "Вокал")
            case .loudness: String(localized: "Громкость (V-образный)")
            case .custom: String(localized: "Свой")
            }
        }
        var gains: [Float]? {
            switch self {
            case .flat: [0, 0, 0, 0, 0, 0, 0]
            case .bass: [6, 4, 1.5, 0, 0, 0, 0]
            case .treble: [0, 0, 0, 0, 2, 4, 6]
            case .vocal: [-2, -1, 1, 3, 3, 1, 0]
            case .loudness: [5, 3, 0, -1, 0, 3, 5]
            case .custom: nil
            }
        }
    }

    struct Settings: Sendable, Equatable {
        var enabled = false
        var gains: [Float] = Array(repeating: 0, count: AudioEffects.frequencies.count)
    }

    private let state: OSAllocatedUnfairLock<Settings>

    private init() {
        let defaults = UserDefaults.standard
        var settings = Settings()
        settings.enabled = defaults.bool(forKey: Self.enabledKey)
        if let saved = defaults.array(forKey: Self.gainsKey) as? [Double], saved.count == Self.frequencies.count {
            settings.gains = saved.map(Float.init)
        }
        state = OSAllocatedUnfairLock(initialState: settings)
    }

    var settings: Settings { state.withLock { $0 } }

    func update(_ change: (inout Settings) -> Void) {
        var copy = settings
        change(&copy)
        let updated = copy
        state.withLock { $0 = updated }
        UserDefaults.standard.set(copy.enabled, forKey: Self.enabledKey)
        UserDefaults.standard.set(copy.gains.map(Double.init), forKey: Self.gainsKey)
    }

    /// Seconds of fade-in/out at track edges; 0 disables.
    var fadeSeconds: Double { UserDefaults.standard.double(forKey: Self.fadeKey) }

    /// Attaches the EQ tap and fades before the item reaches the player: changing the mix of a playing
    /// item makes CoreMedia rebuild its pipeline. Audio files almost always use track ID 1; if the loaded
    /// asset says otherwise, the mix is rebuilt for the real track.
    @MainActor func attach(to item: AVPlayerItem, duration: Double?) {
        item.audioMix = mix(trackID: 1, duration: duration)
        Task { @MainActor in
            guard let track = try? await item.asset.loadTracks(withMediaType: .audio).first, track.trackID != 1 else { return }
            item.audioMix = mix(trackID: track.trackID, duration: duration)
        }
    }

    private func mix(trackID: CMPersistentTrackID, duration: Double?) -> AVAudioMix {
        let parameters = AVMutableAudioMixInputParameters()
        parameters.trackID = trackID
        parameters.audioTapProcessor = Self.makeTap()
        let fade = fadeSeconds
        if fade > 0, let duration, duration > fade * 3 {
            let scale: CMTimeScale = 600
            parameters.setVolumeRamp(fromStartVolume: 0, toEndVolume: 1,
                                     timeRange: CMTimeRange(start: .zero, duration: CMTime(seconds: fade, preferredTimescale: scale)))
            parameters.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0,
                                     timeRange: CMTimeRange(start: CMTime(seconds: duration - fade, preferredTimescale: scale),
                                                            duration: CMTime(seconds: fade, preferredTimescale: scale)))
        }
        let mix = AVMutableAudioMix()
        mix.inputParameters = [parameters]
        return mix
    }

    private static func makeTap() -> MTAudioProcessingTap? {
        let context = Unmanaged.passRetained(TapContext()).toOpaque()
        var callbacks = MTAudioProcessingTapCallbacks(
            version: kMTAudioProcessingTapCallbacksVersion_0,
            clientInfo: context,
            init: { _, clientInfo, storage in storage.pointee = clientInfo },
            finalize: { tap in Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release() },
            prepare: { tap, _, format in
                let context = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
                context.prepare(format.pointee)
            },
            unprepare: nil,
            process: { tap, frames, _, buffers, framesOut, flagsOut in
                guard MTAudioProcessingTapGetSourceAudio(tap, frames, buffers, flagsOut, nil, framesOut) == noErr else { return }
                let context = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
                context.process(UnsafeMutableAudioBufferListPointer(buffers), frames: Int(framesOut.pointee))
            })
        var tap: MTAudioProcessingTap?
        guard MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PostEffects, &tap) == noErr else {
            Unmanaged<TapContext>.fromOpaque(context).release()
            return nil
        }
        return tap
    }
}

/// Per-item filter state. Only touched from the tap's render thread after `prepare`.
private final class TapContext: @unchecked Sendable {
    private struct Biquad { var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0 }
    private struct History { var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0 }

    private var sampleRate = 44_100.0
    private var supported = false
    private var filters: [Biquad] = []
    private var history: [[History]] = []   // [channel][band]
    private var applied: AudioEffects.Settings?
    private var preamp = 1.0

    func prepare(_ format: AudioStreamBasicDescription) {
        sampleRate = format.mSampleRate
        let isFloat = format.mFormatFlags & kAudioFormatFlagIsFloat != 0
        let nonInterleaved = format.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0
        supported = isFloat && nonInterleaved && format.mBitsPerChannel == 32
        Log.player.info("EQ tap prepared: \(format.mSampleRate, privacy: .public) Hz, \(format.mChannelsPerFrame, privacy: .public) ch, supported \(self.supported, privacy: .public)")
        history = Array(repeating: Array(repeating: History(), count: AudioEffects.frequencies.count), count: Int(max(format.mChannelsPerFrame, 1)))
        applied = nil
    }

    func process(_ buffers: UnsafeMutableAudioBufferListPointer, frames: Int) {
        let settings = AudioEffects.shared.settings
        guard supported, settings.enabled, settings.gains.contains(where: { $0 != 0 }) else { return }
        if settings != applied { rebuild(settings) }
        for (channel, buffer) in buffers.enumerated() where channel < history.count {
            guard let samples = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
            let count = min(frames, Int(buffer.mDataByteSize) / MemoryLayout<Float>.size)
            for index in 0..<count {
                var value = Double(samples[index]) * preamp
                for band in filters.indices {
                    let f = filters[band]
                    var h = history[channel][band]
                    let output = f.b0 * value + f.b1 * h.x1 + f.b2 * h.x2 - f.a1 * h.y1 - f.a2 * h.y2
                    h.x2 = h.x1; h.x1 = value; h.y2 = h.y1; h.y1 = output
                    history[channel][band] = h
                    value = output
                }
                samples[index] = Float(value)
            }
        }
    }

    /// RBJ peaking filters; boosts are compensated by a negative preamp to avoid clipping.
    private func rebuild(_ settings: AudioEffects.Settings) {
        applied = settings
        preamp = pow(10, -Double(settings.gains.max() ?? 0).clamped(0, 12) / 20)
        filters = zip(AudioEffects.frequencies, settings.gains).map { frequency, gain in
            let a = pow(10, Double(gain) / 40)
            let w0 = 2 * Double.pi * min(frequency, sampleRate * 0.45) / sampleRate
            let alpha = sin(w0) / (2 * 1.0)
            let a0 = 1 + alpha / a
            return Biquad(b0: (1 + alpha * a) / a0, b1: -2 * cos(w0) / a0, b2: (1 - alpha * a) / a0,
                          a1: -2 * cos(w0) / a0, a2: (1 - alpha / a) / a0)
        }
    }
}

private extension Double {
    func clamped(_ lower: Double, _ upper: Double) -> Double { Swift.min(Swift.max(self, lower), upper) }
}
