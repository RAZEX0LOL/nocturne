import SwiftUI

struct MiniPlayer: View {
    let open: () -> Void
    @Environment(PlayerStore.self) private var player
    var body: some View {
        if let song = player.current {
            HStack(spacing: 12) {
                Button(action: open) {
                    HStack(spacing: 12) {
                        Cover(id: song.coverArt, size: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(song.title).font(.subheadline.weight(.medium)).foregroundStyle(Theme.primary).lineLimit(1)
                            Text(song.artist ?? "").font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel("Открыть плеер: \(song.title)")
                Button { player.toggle() } label: {
                    if player.isBuffering { ProgressView().frame(width: 44, height: 44) }
                    else { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 44, height: 44) }
                }.accessibilityLabel(player.isPlaying ? "Пауза" : "Воспроизвести")
                if Appearance.shared.miniButton == .forward15 {
                    Button { player.seek(player.elapsed + 15) } label: { Image(systemName: "goforward.15").frame(width: 36, height: 44) }
                        .accessibilityLabel("Вперёд на 15 секунд")
                } else {
                    Button { player.advance() } label: { Image(systemName: "forward.end.fill").frame(width: 36, height: 44) }
                        .accessibilityLabel("Следующий трек")
                }
            }.padding(10).foregroundStyle(Theme.primary)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.primary.opacity(0.08)))
        }
    }
}

struct PlayerView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    @Environment(\.dismiss) private var dismiss
    @State private var showQueue = false
    @State private var scrubbing = false
    @State private var position: Double = 0
    @State private var starred = false
    @State private var saving = false
    @State private var showLyrics = false
    @State private var swipeOffset: CGFloat = 0
    private var appearance: Appearance { Appearance.shared }
    @State private var addToPlaylist = false
    // Height taken by everything except the cover; scales with Dynamic Type so the layout still fits.
    @ScaledMetric(relativeTo: .body) private var reservedHeight: CGFloat = 465

    private func coverSize(in geometry: GeometryProxy) -> CGFloat {
        let byWidth = min(geometry.size.width - 56, 370)
        return max(140, min(byWidth, geometry.size.height - reservedHeight))
    }

    /// Horizontal swipe on the cover: left = next track, right = previous.
    private var coverSwipe: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                swipeOffset = value.translation.width * 0.6
            }
            .onEnded { value in
                let width = value.translation.width
                if width < -80 { player.advance() } else if width > 80 { player.previous() }
                withAnimation(.spring(duration: 0.35)) { swipeOffset = 0 }
            }
    }

    var body: some View {
        @Bindable var player = player
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Button { dismiss() } label: { Image(systemName: "chevron.down").frame(width: 44, height: 44) }.accessibilityLabel("Свернуть плеер")
                        Spacer()
                        VStack(spacing: 4) {
                            Text("СЕЙЧАС ИГРАЕТ").font(.system(size: 11, weight: .semibold)).tracking(2).foregroundStyle(Theme.secondary)
                            Text(player.current?.album ?? "Твоя музыка").font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                        }
                        Spacer()
                        Menu {
                            if let song = player.current { SongActions(songs: [song], addToPlaylist: $addToPlaylist) }
                        } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                            .accessibilityLabel("Действия с треком").disabled(library.client == nil)
                    }
                    Cover(id: player.current?.coverArt, size: coverSize(in: geometry))
                        .shadow(color: .black.opacity(0.35), radius: 25, y: 18)
                        .scaleEffect(appearance.animateCover && !player.isPlaying ? 0.86 : 1)
                        .animation(.spring(duration: 0.45, bounce: 0.3), value: player.isPlaying)
                        .offset(x: swipeOffset)
                        .rotationEffect(.degrees(Double(swipeOffset) / 40))
                        .onTapGesture { showLyrics = true }
                        .gesture(coverSwipe, including: appearance.coverSwipe ? .all : .none)
                        .accessibilityAction(named: "Текст песни") { showLyrics = true }
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text(player.current?.title ?? "Ничего не играет").font(.title2.bold()).lineLimit(2)
                            Text(player.current?.artist ?? "").font(.title3).foregroundStyle(Theme.secondary).lineLimit(1)
                        }
                        Spacer()
                        Button {
                            guard let song = player.current else { return }
                            saving = true
                            Task {
                                do {
                                    try await library.setStarred(song, !starred)
                                    starred.toggle()
                                    let value = starred ? "local" : nil
                                    player.updateSong(id: song.id) { $0.starred = value }
                                } catch { player.error = LibraryStore.message(error) }
                                saving = false
                            }
                        } label: { Image(systemName: starred ? "heart.fill" : "heart").font(.title2).frame(width: 44, height: 44).foregroundStyle(Theme.accent) }
                            .disabled(saving).accessibilityLabel(starred ? "Убрать из избранного" : "В избранное")
                    }
                    VStack(spacing: 0) {
                        Slider(value: Binding(get: { scrubbing ? position : min(player.elapsed, max(player.duration, 1)) }, set: { position = $0 }), in: 0...max(player.duration, 1)) { editing in
                            if editing { position = player.elapsed }
                            scrubbing = editing
                            if !editing { player.seek(position) }
                        }.accessibilityLabel("Позиция воспроизведения")
                        HStack {
                            Text(timeLabel(scrubbing ? position : player.elapsed))
                            Spacer()
                            Text("−" + timeLabel(max(0, player.duration - (scrubbing ? position : player.elapsed))))
                        }.font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                    }
                    HStack {
                        Button { player.shuffle.toggle() } label: { Image(systemName: "shuffle").frame(width: 44, height: 44).foregroundStyle(player.shuffle ? Theme.accent : Theme.primary) }
                            .accessibilityLabel(player.shuffle ? "Выключить перемешивание" : "Перемешивать")
                        Spacer()
                        Button { player.previous() } label: { Image(systemName: "backward.end.fill").font(.title).frame(width: 44, height: 44) }.accessibilityLabel("Предыдущий трек")
                        Spacer()
                        Button { player.toggle() } label: {
                            ZStack {
                                Circle().fill(Theme.primary.opacity(0.13)).frame(width: 80, height: 80)
                                if player.isBuffering { ProgressView() }
                                else { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.system(size: 31)) }
                            }
                        }.accessibilityLabel(player.isPlaying ? "Пауза" : "Воспроизвести")
                        Spacer()
                        Button { player.advance() } label: { Image(systemName: "forward.end.fill").font(.title).frame(width: 44, height: 44) }.accessibilityLabel("Следующий трек")
                        Spacer()
                        Button { player.cycleRepeat() } label: {
                            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").frame(width: 44, height: 44).foregroundStyle(player.repeatMode == .off ? Theme.primary : Theme.accent)
                        }.accessibilityLabel("Повтор: \(player.repeatMode == .off ? "выключен" : player.repeatMode == .one ? "один трек" : "вся очередь")")
                    }.buttonStyle(.plain)
                    VolumeSlider().frame(height: 30).accessibilityLabel("Громкость")
                    Spacer(minLength: 0)
                    HStack {
                        Button { showLyrics = true } label: { Image(systemName: "quote.bubble").frame(width: 44, height: 44) }
                            .accessibilityLabel("Текст песни")
                        Spacer()
                        SleepTimerMenu()
                        Spacer()
                        RoutePicker().frame(width: 44, height: 44).accessibilityLabel("Выбрать аудиоустройство")
                        Spacer()
                        Button { showQueue = true } label: { Image(systemName: "list.bullet").frame(width: 44, height: 44) }
                            .accessibilityLabel("Очередь")
                    }.font(.title3).foregroundStyle(Theme.secondary)
                }.padding(.horizontal, 28).padding(.top, 34).padding(.bottom, 12)
                    .frame(minHeight: geometry.size.height, alignment: .top)
            }.scrollBounceBehavior(.basedOnSize).background {
                ZStack(alignment: .top) {
                    Theme.background
                    switch appearance.playerBackground {
                    case .blur:
                        Cover(id: player.current?.coverArt, size: geometry.size.width).blur(radius: 90).opacity(0.35).allowsHitTesting(false)
                    case .gradient:
                        LinearGradient(colors: [Theme.accent.opacity(0.45), Theme.accent.opacity(0.12), .clear], startPoint: .top, endPoint: .bottom)
                            .animation(.easeInOut(duration: 0.6), value: player.current?.id)
                    case .solid:
                        EmptyView()
                    }
                }.ignoresSafeArea()
            }
        }.foregroundStyle(Theme.primary)
            .onChange(of: player.current?.id, initial: true) { _, _ in
                starred = player.current.map { $0.starred != nil || library.isStarred($0) } ?? false
            }
            .sensoryFeedback(.impact(weight: .light), trigger: player.isPlaying) { _, _ in appearance.haptics }
            .sensoryFeedback(.selection, trigger: player.current?.id) { _, _ in appearance.haptics }
            .sheet(isPresented: $showQueue) { QueueView() }
            .sheet(isPresented: $showLyrics) { LyricsView() }
            .sheet(isPresented: $addToPlaylist) { if let song = player.current { PlaylistPicker(songs: [song]) } }
            .overlay(alignment: .top) { if let notice = player.notice { Toast(text: notice).padding(.top, 8) } }
            .animation(.spring(duration: 0.3), value: player.notice)
    }
}

struct QueueView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if let entry = player.queue.current {
                    Section("Сейчас играет") { SongRow(song: entry.song) {} }
                }
                Section(player.queue.upcoming.isEmpty ? "Дальше ничего нет" : "Далее") {
                    ForEach(player.queue.upcoming) { entry in
                        SongRow(song: entry.song) { player.select(entry.id) }
                    }
                    .onMove { player.moveUpcoming(from: $0, to: $1) }
                    .onDelete { offsets in
                        let upcoming = Array(player.queue.upcoming)
                        for index in offsets { player.remove(upcoming[index].id) }
                    }
                }
            }
            .listStyle(.plain).scrollContentBackground(.hidden).background(Theme.background)
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Очередь").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack {
                        Button { player.shuffle.toggle() } label: { Image(systemName: "shuffle").foregroundStyle(player.shuffle ? Theme.accent : Theme.primary) }
                            .accessibilityLabel(player.shuffle ? "Выключить перемешивание" : "Перемешивать")
                        Button { player.cycleRepeat() } label: {
                            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").foregroundStyle(player.repeatMode == .off ? Theme.primary : Theme.accent)
                        }.accessibilityLabel("Режим повтора")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Готово") { dismiss() } }
            }
        }
    }
}

struct SleepTimerMenu: View {
    @Environment(PlayerStore.self) private var player
    var body: some View {
        Menu {
            if player.sleepDeadline != nil || player.sleepAtTrackEnd {
                Button("Выключить таймер", role: .destructive) { player.setSleepTimer(minutes: nil) }
            }
            Button("В конце трека") { player.setSleepTimer(minutes: 0) }
            ForEach([15, 30, 45, 60, 90], id: \.self) { minutes in
                Button("\(minutes) мин") { player.setSleepTimer(minutes: minutes) }
            }
        } label: {
            let active = player.sleepDeadline != nil || player.sleepAtTrackEnd
            Group {
                if let deadline = player.sleepDeadline {
                    Text(timerInterval: Date()...deadline, countsDown: true).font(.caption.monospacedDigit()).frame(minWidth: 44, minHeight: 44)
                } else {
                    Image(systemName: active ? "moon.zzz.fill" : "moon.zzz").frame(width: 44, height: 44)
                }
            }.foregroundStyle(active ? Theme.accent : Theme.secondary)
        }.accessibilityLabel("Таймер сна")
    }
}
