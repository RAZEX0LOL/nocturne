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
                }.buttonStyle(.plain).accessibilityLabel(String(localized: "Открыть плеер: \(song.title)"))
                Button { player.toggle() } label: {
                    if player.isBuffering { ProgressView().frame(width: 44, height: 44) }
                    else { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 44, height: 44) }
                }.accessibilityLabel(player.isPlaying ? String(localized: "Пауза") : String(localized: "Воспроизвести"))
                if Appearance.shared.miniButton == .forward15 {
                    Button { player.seek(player.elapsed + 15) } label: { Image(systemName: "goforward.15").frame(width: 36, height: 44) }
                        .accessibilityLabel(String(localized: "Вперёд на 15 секунд"))
                } else {
                    Button { player.advance() } label: { Image(systemName: "forward.end.fill").frame(width: 36, height: 44) }
                        .accessibilityLabel(String(localized: "Следующий трек"))
                }
            }.padding(10).foregroundStyle(Theme.primary)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.radius(18)))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius(18)).stroke(Theme.primary.opacity(0.08)))
        }
    }
}

struct PlayerView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    @Environment(DownloadStore.self) private var downloads
    @Environment(\.dismiss) private var dismiss
    /// One sheet at a time: Mac Catalyst drops input when several .sheet modifiers sit on one view.
    enum Modal: String, Identifiable { case queue, lyrics, playlist; var id: String { rawValue } }
    @State private var modal: Modal?
    @State private var scrubbing = false
    @State private var position: Double = 0
    @State private var starred = false
    @State private var saving = false
    @State private var swipeOffset: CGFloat = 0
    private var appearance: Appearance { Appearance.shared }
    // Height taken by everything except the cover; scales with Dynamic Type so the layout still fits.
    /// Height of everything except the cover, measured from the laid-out content
    /// (so new controls, Dynamic Type or live mode never push the screen into scrolling).
    @State private var reservedHeight: CGFloat = 470
    /// Free space the flexible gap above the bottom row currently takes.
    @State private var slack: CGFloat = 0
    @State private var contentHeight: CGFloat = 0

    /// Both measurements can arrive in any order, so recompute from the latest pair.
    private func updateReserved(cover: CGFloat) {
        guard contentHeight > 0 else { return }
        let other = (contentHeight - cover - slack).rounded(.up)
        if abs(other - reservedHeight) > 0.5 { reservedHeight = other }
    }

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
                        Button { dismiss() } label: { Image(systemName: "chevron.down").frame(width: 44, height: 44) }.accessibilityLabel(String(localized: "Свернуть плеер"))
                        Spacer()
                        VStack(spacing: 4) {
                            Text(String(localized: "СЕЙЧАС ИГРАЕТ")).font(.system(size: 11, weight: .semibold)).tracking(2).foregroundStyle(Theme.secondary)
                            Text(player.current?.album ?? String(localized: "Твоя музыка")).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                        }
                        Spacer()
                        Menu {
                            if let song = player.current { SongActions(songs: [song], addToPlaylist: Binding(get: { modal == .playlist }, set: { modal = $0 ? .playlist : nil })) }
                        } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                            .accessibilityLabel(String(localized: "Действия с треком")).disabled(library.client == nil)
                    }
                    Cover(id: player.current?.coverArt, size: coverSize(in: geometry))
                        .shadow(color: .black.opacity(0.35), radius: 25, y: 18)
                        .scaleEffect(appearance.animateCover && !player.isPlaying ? 0.86 : 1)
                        .animation(.spring(duration: 0.45, bounce: 0.3), value: player.isPlaying)
                        .offset(x: swipeOffset)
                        .rotationEffect(.degrees(Double(swipeOffset) / 40))
                        .onTapGesture { modal = .lyrics }
                        .gesture(coverSwipe, including: appearance.coverSwipe ? .all : .none)
                        .accessibilityAction(named: String(localized: "Текст песни")) { modal = .lyrics }
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text(player.current?.title ?? String(localized: "Ничего не играет")).font(.title2.bold()).lineLimit(2)
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
                            .disabled(saving).accessibilityLabel(starred ? String(localized: "Убрать из избранного") : String(localized: "В избранное"))
                    }
                    if player.isLive {
                        HStack(spacing: 8) {
                            Circle().fill(.red).frame(width: 8, height: 8)
                            Text(String(localized: "ПРЯМОЙ ЭФИР")).font(.caption.weight(.semibold)).tracking(1.5)
                            Spacer()
                            Text(timeLabel(player.elapsed)).font(.caption.monospacedDigit())
                        }.foregroundStyle(Theme.secondary).frame(height: 44)
                    } else {
                    VStack(spacing: 0) {
                        Slider(value: Binding(get: { scrubbing ? position : min(player.elapsed, max(player.duration, 1)) }, set: { position = $0 }), in: 0...max(player.duration, 1)) { editing in
                            if editing { position = player.elapsed }
                            scrubbing = editing
                            if !editing { player.seek(position) }
                        }.accessibilityLabel(String(localized: "Позиция воспроизведения"))
                        HStack {
                            Text(timeLabel(scrubbing ? position : player.elapsed))
                            Spacer()
                            Text("−" + timeLabel(max(0, player.duration - (scrubbing ? position : player.elapsed))))
                        }.font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                    }
                    }
                    HStack {
                        Button { player.shuffle.toggle() } label: { Image(systemName: "shuffle").frame(width: 44, height: 44).foregroundStyle(player.shuffle ? Theme.accent : Theme.primary) }
                            .accessibilityLabel(player.shuffle ? String(localized: "Выключить перемешивание") : String(localized: "Перемешивать"))
                        Spacer()
                        Button { player.previous() } label: { Image(systemName: "backward.end.fill").font(.title).frame(width: 44, height: 44) }.accessibilityLabel(String(localized: "Предыдущий трек"))
                        Spacer()
                        Button { player.toggle() } label: {
                            ZStack {
                                Circle().fill(Theme.primary.opacity(0.13)).frame(width: 80, height: 80)
                                if player.isBuffering { ProgressView() }
                                else { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.system(size: 31)) }
                            }
                        }.accessibilityLabel(player.isPlaying ? String(localized: "Пауза") : String(localized: "Воспроизвести"))
                        Spacer()
                        Button { player.advance() } label: { Image(systemName: "forward.end.fill").font(.title).frame(width: 44, height: 44) }.accessibilityLabel(String(localized: "Следующий трек"))
                        Spacer()
                        Button { player.cycleRepeat() } label: {
                            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").frame(width: 44, height: 44).foregroundStyle(player.repeatMode == .off ? Theme.primary : Theme.accent)
                        }.accessibilityLabel(player.repeatMode == .off ? String(localized: "Повтор выключен") : player.repeatMode == .one ? String(localized: "Повтор одного трека") : String(localized: "Повтор всей очереди"))
                    }.buttonStyle(.plain)
                    VolumeSlider().frame(height: 30).accessibilityLabel(String(localized: "Громкость"))
                    Color.clear.frame(maxHeight: .infinity)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                            slack = $0
                            updateReserved(cover: coverSize(in: geometry))
                        }
                    HStack {
                        Button { modal = .lyrics } label: { Image(systemName: "quote.bubble").frame(width: 44, height: 44) }
                            .accessibilityLabel(String(localized: "Текст песни"))
                        Spacer()
                        SpeedMenu()
                        SleepTimerMenu()
                        Spacer()
                        RoutePicker().frame(width: 44, height: 44).accessibilityLabel(String(localized: "Выбрать аудиоустройство"))
                        Spacer()
                        Button { modal = .queue } label: { Image(systemName: "list.bullet").frame(width: 44, height: 44) }
                            .accessibilityLabel(String(localized: "Очередь"))
                    }.font(.title3).foregroundStyle(Theme.secondary)
                }.padding(.horizontal, 28).padding(.top, 34).padding(.bottom, 12)
                    // Natural height before the min-height frame; the cover is subtracted, the rest is what it must leave room for.
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        contentHeight = height
                        updateReserved(cover: coverSize(in: geometry))
                    }
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
            .modalOrPanel($modal) { which, close in
                Group {
                    switch which {
                    case .queue: QueueView(onClose: close)
                    case .lyrics: LyricsView(onClose: close)
                    case .playlist: if let song = player.current { PlaylistPicker(songs: [song], onClose: close) }
                    }
                }.appStores(library, player, downloads)
            }
            .overlay(alignment: .top) { if let notice = player.notice { Toast(text: notice).padding(.top, 8) } }
            .animation(.spring(duration: 0.3), value: player.notice)
    }
}

extension View {
    /// A sheet on iOS. On Mac Catalyst a sheet shown from inside another sheet renders but never receives
    /// clicks, so there the same content slides in as a panel over the presenting view instead.
    @ViewBuilder func modalOrPanel<Item: Identifiable, Content: View>(
        _ item: Binding<Item?>, @ViewBuilder content: @escaping (Item, @escaping () -> Void) -> Content
    ) -> some View {
        #if targetEnvironment(macCatalyst)
        overlay {
            if let value = item.wrappedValue {
                content(value) { item.wrappedValue = nil }
                    .background(Theme.background)
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.spring(duration: 0.3), value: item.wrappedValue?.id)
        #else
        sheet(item: item) { value in content(value) { item.wrappedValue = nil } }
        #endif
    }
}

struct QueueView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    /// Set when the view is shown as a panel instead of a sheet (Mac), where `dismiss` would close the player.
    var onClose: (() -> Void)?
    private func close() { if let onClose { onClose() } else { dismiss() } }

    var body: some View {
        NavigationStack {
            List {
                if let entry = player.queue.current {
                    Section(String(localized: "Сейчас играет")) { SongRow(song: entry.song) {} }
                }
                Section(player.queue.upcoming.isEmpty ? String(localized: "Дальше ничего нет") : String(localized: "Далее")) {
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
            .navigationTitle(String(localized: "Очередь")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack {
                        Button { player.shuffle.toggle() } label: { Image(systemName: "shuffle").foregroundStyle(player.shuffle ? Theme.accent : Theme.primary) }
                            .accessibilityLabel(player.shuffle ? String(localized: "Выключить перемешивание") : String(localized: "Перемешивать"))
                        Button { player.cycleRepeat() } label: {
                            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").foregroundStyle(player.repeatMode == .off ? Theme.primary : Theme.accent)
                        }.accessibilityLabel(String(localized: "Режим повтора"))
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { Button(String(localized: "Готово")) { close() } }
            }
        }
    }
}

/// Скорость для аудиокниг и длинных миксов: 0,5–2×, голос не становится «мультяшным».
struct SpeedMenu: View {
    @Environment(PlayerStore.self) private var player
    private static let speeds: [Float] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    private func label(_ value: Float) -> String {
        (value == value.rounded() ? String(Int(value)) : String(format: "%g", value).replacingOccurrences(of: ".", with: ",")) + "×"
    }
    var body: some View {
        Menu {
            ForEach(Self.speeds, id: \.self) { value in
                Button { player.setSpeed(value) } label: {
                    if value == player.speedValue { Label(label(value), systemImage: "checkmark") } else { Text(label(value)) }
                }
            }
        } label: {
            Text(label(player.speedValue)).font(.caption.weight(.semibold).monospacedDigit())
                .frame(minWidth: 44, minHeight: 44)
                .foregroundStyle(player.speedValue == 1 ? Theme.secondary : Theme.accent)
        }.accessibilityLabel(String(localized: "Скорость воспроизведения"))
    }
}

struct SleepTimerMenu: View {
    @Environment(PlayerStore.self) private var player
    var body: some View {
        Menu {
            if player.sleepDeadline != nil || player.sleepAtTrackEnd {
                Button(String(localized: "Выключить таймер"), role: .destructive) { player.setSleepTimer(minutes: nil) }
            }
            Button(String(localized: "В конце трека")) { player.setSleepTimer(minutes: 0) }
            ForEach([15, 30, 45, 60, 90], id: \.self) { minutes in
                Button(String(localized: "\(minutes) мин")) { player.setSleepTimer(minutes: minutes) }
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
        }.accessibilityLabel(String(localized: "Таймер сна"))
    }
}
