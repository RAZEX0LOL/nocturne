import SwiftUI

struct LyricsView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    @Environment(\.dismiss) private var dismiss
    @State private var lyrics: StructuredLyrics?
    @State private var state = LoadState.loading
    private enum LoadState { case loading, loaded, empty, failed }

    var body: some View {
        NavigationStack {
            Group {
                switch state {
                case .loading: ProgressView()
                case .empty: ContentUnavailableView("Текста нет", systemImage: "quote.bubble", description: Text("Navidrome не нашёл текст для этого трека."))
                case .failed: ContentUnavailableView("Не удалось загрузить текст", systemImage: "exclamationmark.triangle")
                case .loaded: content
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                ZStack {
                    Theme.background
                    Cover(id: player.current?.coverArt, size: 600).blur(radius: 80).opacity(0.3)
                }.ignoresSafeArea()
            }
            .navigationTitle(player.current?.title ?? "Текст").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { Appearance.shared.lyricsScale = max(0.8, Appearance.shared.lyricsScale - 0.1) } label: { Image(systemName: "textformat.size.smaller") }
                        .accessibilityLabel("Уменьшить текст")
                    Button { Appearance.shared.lyricsScale = min(1.6, Appearance.shared.lyricsScale + 0.1) } label: { Image(systemName: "textformat.size.larger") }
                        .accessibilityLabel("Увеличить текст")
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Готово") { dismiss() } }
            }
        }
        .task(id: player.current?.id) { await load() }
    }

    @ViewBuilder private var content: some View {
        let lines = lyrics?.line ?? []
        let synced = lyrics?.synced == true
        let active = synced ? activeLine(in: lines) : nil
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: synced ? 18 : 6) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        Text(line.value.isEmpty ? " " : line.value)
                            .font(.system(size: (synced ? 22 : 17) * Appearance.shared.lyricsScale, weight: synced ? .semibold : .regular))
                            .foregroundStyle(!synced || index == active ? Theme.primary : Theme.secondary.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(index)
                            .onTapGesture { if synced, let start = line.start { player.seek(Double(start) / 1000) } }
                    }
                }.padding(24).padding(.vertical, synced ? 120 : 0)
            }
            .onChange(of: active) { _, index in
                guard let index else { return }
                withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(index, anchor: .center) }
            }
        }
    }

    private func activeLine(in lines: [LyricLine]) -> Int? {
        let now = Int(player.elapsed * 1000)
        return lines.lastIndex { ($0.start ?? .max) <= now }
    }

    private func load() async {
        state = .loading
        guard let song = player.current, let client = library.client else { state = .empty; return }
        do {
            lyrics = try await client.lyrics(for: song)
            state = lyrics == nil ? .empty : .loaded
        } catch { state = .failed }
    }
}
