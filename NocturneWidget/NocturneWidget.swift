import AppIntents
import SwiftUI
import WidgetKit

struct NowPlayingEntry: TimelineEntry {
    let date: Date
    let snapshot: NowPlayingSnapshot?
    let cover: UIImage?
}

struct NowPlayingProvider: TimelineProvider {
    func placeholder(in context: Context) -> NowPlayingEntry {
        NowPlayingEntry(date: .now, snapshot: NowPlayingSnapshot(title: "Название трека", artist: "Исполнитель", album: "Альбом", isPlaying: true), cover: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NowPlayingEntry) -> Void) { completion(entry()) }

    /// The app reloads the timeline on every track or play-state change, so no refresh schedule is needed.
    func getTimeline(in context: Context, completion: @escaping (Timeline<NowPlayingEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }

    private func entry() -> NowPlayingEntry {
        let cover = NowPlayingSnapshot.coverURL.flatMap { try? Data(contentsOf: $0) }.flatMap(UIImage.init(data:))
        return NowPlayingEntry(date: .now, snapshot: NowPlayingSnapshot.load(), cover: cover)
    }
}

private let accent = Color(red: 0.77, green: 0.66, blue: 1)

struct NowPlayingWidgetView: View {
    let entry: NowPlayingEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular: accessory
            case .systemMedium: medium
            default: small
            }
        }
        .widgetURL(URL(string: "nocturne://player"))
    }

    private var cover: some View {
        Group {
            if let image = entry.cover { Image(uiImage: image).resizable().scaledToFill() }
            else {
                ZStack {
                    LinearGradient(colors: [Color(red: 0.16, green: 0.11, blue: 0.3), .black], startPoint: .top, endPoint: .bottom)
                    Image(systemName: "waveform").font(.title).foregroundStyle(accent)
                }
            }
        }.clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var titles: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.snapshot?.title ?? "Ничего не играет").font(.headline).lineLimit(2)
            Text(entry.snapshot?.artist ?? "Открой Nocturne Player").font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    private var controls: some View {
        HStack(spacing: 14) {
            Button(intent: WidgetTogglePlaybackIntent()) {
                Image(systemName: entry.snapshot?.isPlaying == true ? "pause.fill" : "play.fill")
            }
            Button(intent: WidgetNextTrackIntent()) { Image(systemName: "forward.end.fill") }
        }
        .font(.title3).tint(accent).buttonStyle(.plain).foregroundStyle(accent)
        .disabled(entry.snapshot == nil)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                cover.frame(width: 56, height: 56)
                Spacer()
                controls.labelStyle(.iconOnly)
            }
            Spacer(minLength: 0)
            titles
        }
    }

    private var medium: some View {
        HStack(spacing: 14) {
            cover.aspectRatio(1, contentMode: .fit)
            VStack(alignment: .leading, spacing: 10) {
                Text("СЕЙЧАС ИГРАЕТ").font(.caption2.weight(.semibold)).tracking(1.5).foregroundStyle(.secondary)
                titles
                Spacer(minLength: 0)
                controls
            }
            Spacer(minLength: 0)
        }
    }

    private var accessory: some View {
        HStack {
            Image(systemName: entry.snapshot?.isPlaying == true ? "waveform" : "pause")
            VStack(alignment: .leading) {
                Text(entry.snapshot?.title ?? "Nocturne Player").font(.headline).lineLimit(1)
                Text(entry.snapshot?.artist ?? "Ничего не играет").font(.caption).lineLimit(1)
            }
        }
    }
}

struct NowPlayingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: NowPlayingSnapshot.widgetKind, provider: NowPlayingProvider()) { entry in
            NowPlayingWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(red: 0.1, green: 0.08, blue: 0.16), Color(red: 0.055, green: 0.055, blue: 0.075)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
        }
        .configurationDisplayName("Сейчас играет")
        .description("Текущий трек Nocturne Player с кнопками управления.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

@main
struct NocturneWidgetBundle: WidgetBundle {
    var body: some Widget { NowPlayingWidget() }
}
