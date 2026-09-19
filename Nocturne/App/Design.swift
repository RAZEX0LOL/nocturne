import SwiftUI
import AVKit
import MediaPlayer


struct Cover: View {
    let id: String?
    var size: CGFloat = 64
    @Environment(LibraryStore.self) private var library
    @Environment(\.displayScale) private var displayScale
    @State private var loaded: (key: String, image: UIImage)?

    private var cacheKey: String? {
        guard let id, !id.hasPrefix("demo-") else { return nil }
        if LocalLibrary.isLocal(id) { return ArtworkCache.key(account: "local", id: id, bucket: ArtworkCache.bucket(for: size, scale: displayScale)) }
        guard let client = library.client else { return nil }
        return ArtworkCache.key(account: client.credentials.account, id: id, bucket: ArtworkCache.bucket(for: size, scale: displayScale))
    }

    var body: some View {
        let key = cacheKey
        let image = key.flatMap { key in loaded?.key == key ? loaded?.image : ArtworkCache.memoryImage(key) }
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else if let id, id.hasPrefix("demo-") { DemoCover(seed: Int(id.suffix(1)) ?? 0) }
            else {
                ZStack {
                    LinearGradient(colors: [Theme.surface, Theme.accent.opacity(0.22)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "music.note").font(.system(size: size * 0.28, weight: .light)).foregroundStyle(Theme.accent)
                }
            }
        }
        .frame(width: size, height: size).clipped().clipShape(RoundedRectangle(cornerRadius: size > 100 ? 12 : 7))
        .task(id: key) {
            guard let key, image == nil, let id else { return }
            let bucket = ArtworkCache.bucket(for: size, scale: displayScale)
            if LocalLibrary.isLocal(id) {
                if let fetched = await ArtworkCache.shared.localImage(id: id, bucket: bucket) { loaded = (key, fetched) }
                return
            }
            guard let client = library.client, let fetched = await ArtworkCache.shared.image(id: id, bucket: bucket, client: client), !Task.isCancelled else { return }
            loaded = (key, fetched)
        }
        .accessibilityHidden(true)
    }
}

struct DemoCover: View {
    let seed: Int
    private var colors: [Color] {
        switch seed % 6 {
        case 0: [Color(red: 0.55, green: 0.36, blue: 0.45), Color(red: 0.12, green: 0.18, blue: 0.28)]
        case 1: [Color(red: 0.83, green: 0.70, blue: 0.51), Color(red: 0.22, green: 0.29, blue: 0.24)]
        case 2: [Color(red: 0.50, green: 0.64, blue: 0.72), Color(red: 0.13, green: 0.22, blue: 0.33)]
        case 3: [Color(red: 0.68, green: 0.40, blue: 0.49), Color(red: 0.18, green: 0.17, blue: 0.31)]
        case 4: [Color(red: 0.41, green: 0.34, blue: 0.64), Color(red: 0.12, green: 0.17, blue: 0.25)]
        default: [Color(red: 0.34, green: 0.55, blue: 0.51), Color(red: 0.10, green: 0.23, blue: 0.24)]
        }
    }
    var body: some View {
        GeometryReader { proxy in
            let w = proxy.size.width
            let h = proxy.size.height
            ZStack {
                LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom)
                Circle().fill(Color(red: 0.96, green: 0.84, blue: 0.71).opacity(0.8))
                    .frame(width: w * 0.17).position(x: w * 0.72, y: h * 0.28)
                ForEach(0..<4) { layer in
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: h))
                        for step in 0...24 {
                            let x = CGFloat(step) / 24 * w
                            let wave = sin(CGFloat(step) * 0.28 + CGFloat(seed + layer) * 1.8)
                            let detail = cos(CGFloat(step) * 0.7 + CGFloat(seed)) * 0.025
                            let y = h * (0.55 + CGFloat(layer) * 0.12 + wave * 0.1 + detail)
                            path.addLine(to: CGPoint(x: x, y: y))
                        }
                        path.addLine(to: CGPoint(x: w, y: h)); path.closeSubpath()
                    }.fill(colors[1].opacity(0.48 + Double(layer) * 0.16))
                }
                if seed == 0 {
                    HStack(spacing: w * 0.18) {
                        ForEach(0..<4) { _ in Rectangle().fill(.black.opacity(0.36)).frame(width: w * 0.018) }
                    }.rotationEffect(.degrees(0))
                }
            }
        }
    }
}

struct AlbumTile: View {
    let album: Album
    let width: CGFloat
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Cover(id: album.coverArt, size: width)
            Text(album.name).font(.subheadline.weight(.medium)).lineLimit(1)
            Text(album.artist ?? String(localized: "Неизвестный исполнитель")).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
        }.frame(width: width, alignment: .leading)
    }
}

struct SongRow: View {
    let song: Song
    var action: () -> Void
    @Environment(PlayerStore.self) private var player
    @Environment(DownloadStore.self) private var downloads
    var body: some View {
        let unavailable = !player.isPlayable(song)
        Button { unavailable ? player.show(String(localized: "Трек не скачан — недоступен без сети")) : action() } label: {
            HStack(spacing: 12) {
                Cover(id: song.coverArt, size: 48)
                VStack(alignment: .leading, spacing: 5) {
                    Text(song.title).font(.subheadline.weight(.medium)).foregroundStyle(player.current?.id == song.id ? Theme.accent : Theme.primary).lineLimit(1)
                    Text(song.artist ?? String(localized: "Неизвестный исполнитель")).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                }
                Spacer()
                if player.current?.id == song.id { Image(systemName: "waveform").foregroundStyle(Theme.accent) }
                DownloadBadge(state: downloads.state(of: song), downloaded: downloads.isDownloaded(song))
                Text(timeLabel(song.duration ?? 0)).font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
            }.padding(.vertical, 5).contentShape(Rectangle())
                .opacity(unavailable ? 0.4 : 1)
        }.buttonStyle(.plain)
            .songActions([song])
            .accessibilityHint(unavailable ? String(localized: "Недоступен без сети") : "")
    }
}

struct DownloadBadge: View {
    let state: DownloadStore.State?
    let downloaded: Bool
    var body: some View {
        Group {
            switch state {
            case .downloading(let fraction):
                ZStack {
                    Circle().stroke(Theme.secondary.opacity(0.3), lineWidth: 2)
                    Circle().trim(from: 0, to: fraction).stroke(Theme.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round)).rotationEffect(.degrees(-90))
                }.frame(width: 14, height: 14).accessibilityLabel(String(localized: "Загружается"))
            case .queued: Image(systemName: "clock").foregroundStyle(Theme.secondary).accessibilityLabel(String(localized: "В очереди на загрузку"))
            case .failed: Image(systemName: "exclamationmark.circle").foregroundStyle(.orange).accessibilityLabel(String(localized: "Ошибка загрузки"))
            case nil:
                if downloaded { Image(systemName: "arrow.down.circle.fill").foregroundStyle(Theme.accent).accessibilityLabel(String(localized: "Скачано")) }
            }
        }.font(.caption)
    }
}

func timeLabel(_ seconds: Double) -> String {
    guard seconds.isFinite else { return "0:00" }
    let value = max(0, Int(seconds))
    return "\(value / 60):\(String(format: "%02d", value % 60))"
}

struct RoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = UIColor(Theme.secondary)
        view.activeTintColor = UIColor(Theme.accent)
        return view
    }
    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

struct VolumeSlider: UIViewRepresentable {
    func makeUIView(context: Context) -> MPVolumeView {
        let view = MPVolumeView()
        view.tintColor = UIColor(Theme.accent)
        return view
    }
    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}
