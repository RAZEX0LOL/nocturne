import SwiftUI

@main
struct NocturneApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var library = LibraryStore.shared
    @State private var player = PlayerStore.shared
    @State private var downloads = DownloadStore.shared
    var body: some Scene {
        WindowGroup {
            RootView().environment(library).environment(player).environment(downloads)
        }
    }
}

extension View {
    /// Mac Catalyst does not always carry the observable stores into a presented sheet, so every
    /// modal gets them handed over explicitly. Harmless on iOS: it re-installs the same objects.
    func appStores(_ library: LibraryStore, _ player: PlayerStore, _ downloads: DownloadStore) -> some View {
        environment(library).environment(player).environment(downloads)
    }
}

struct RootView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(DownloadStore.self) private var downloads
    @State private var settings = false
    @State private var fullPlayer = false
    @State private var selectedTab = 0
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        @Bindable var player = player
        Group {
            if library.isConnected || library.isDemo || library.onDeviceOnly {
                TabView(selection: $selectedTab) {
                    NavigationStack { HomeView(settings: $settings) }
                        .safeAreaInset(edge: .bottom, spacing: 0) { miniPlayer }
                        .tabItem { Label(String(localized: "Главная"), systemImage: "house.fill") }.tag(0)
                    NavigationStack { LibraryView() }
                        .safeAreaInset(edge: .bottom, spacing: 0) { miniPlayer }
                        .tabItem { Label(String(localized: "Медиатека"), systemImage: "square.stack.fill") }.tag(1)
                    NavigationStack { SearchView() }
                        .safeAreaInset(edge: .bottom, spacing: 0) { miniPlayer }
                        .tabItem { Label(String(localized: "Поиск"), systemImage: "magnifyingglass") }.tag(2)
                }
                .task { await library.refresh() }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if !player.network.isOnline {
                        Button {
                            UserDefaults.standard.set(LibraryView.Category.downloads.rawValue, forKey: "library.category")
                            selectedTab = 1
                        } label: {
                            Label(downloads.items.isEmpty ? String(localized: "Нет сети") : String(localized: "Нет сети · открыть загрузки"), systemImage: "wifi.slash")
                                .font(.footnote.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 6)
                        }.background(.orange.opacity(0.85)).foregroundStyle(.black)
                            .transition(.move(edge: .top))
                    }
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let remote = player.remoteQueue { RemoteQueueBanner(remote: remote) }
                }
                .animation(.default, value: player.network.isOnline)
                .animation(.default, value: player.remoteQueue?.changed)
            } else { ConnectionView(isInitial: true) }
        }
        .task(id: library.client?.credentials.account) {
            downloads.use(library.client)
            if downloads.network == nil { downloads.network = player.network }
            // Files on the phone first, then offline copies of server tracks.
            player.localFile = { [downloads] id in LocalLibrary.shared.url(for: id) ?? downloads.localURL(for: id) }
            player.use(library.client)
            if let client = library.client { player.restore(client: client) } else if library.onDeviceOnly { player.restoreOnDevice() }
            await player.checkRemoteQueue(client: library.client)
        }
        .task { await ArtworkCache.shared.trim() }
        .task { await LocalLibrary.shared.scan() }
        .onOpenURL { url in
            // Audio files shared to the app ("Open in Nocturne") go to the on-device library.
            if url.isFileURL {
                Task {
                    let added = await LocalLibrary.shared.importItems([url])
                    player.show(added > 0 ? String(localized: "Добавлено на \(Device.name): \(added)") : String(localized: "Новых треков не найдено"))
                }
                return
            }
            // nocturne://player — from the widget and Siri results.
            if url.scheme == "nocturne", url.host() == "player", player.current != nil { fullPlayer = true }
        }
        .onChange(of: library.starredSongs) { _, songs in
            if UserDefaults.standard.bool(forKey: DownloadStore.autoFavoritesKey) { downloads.download(songs) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { player.save(force: true); return }
            // Maybe the music went on on a computer meanwhile.
            Task { await player.checkRemoteQueue(client: library.client) }
            // Files may have been added in Finder/Files meanwhile; the server may be back.
            Task { await LocalLibrary.shared.scan() }
            if library.isOffline { Task { await library.refresh() } }
        }
        #if DEBUG
        .task {
            // UI check of web import without typing: `--open-browser <url>`.
            let arguments = ProcessInfo.processInfo.arguments
            guard let flag = arguments.firstIndex(of: "--open-browser"), arguments.count > flag + 1,
                  let url = URL(string: arguments[flag + 1]) else { return }
            AddMusicCoordinator.shared.browserStart = url
            AddMusicCoordinator.shared.request = .browser
        }
        .task {
            // Threading self-check (`--check-threading`): SwiftUI's async renderer resolves dynamic colours
            // off the main thread; doing the same here must not trip Swift's isolation checks.
            guard ProcessInfo.processInfo.arguments.contains("--check-threading") else { return }
            let colors = [Theme.background, Theme.surface, Theme.primary, Theme.secondary, Theme.onAccent, Theme.accent].map { UIColor($0) }
            DispatchQueue.global().async {
                for color in colors {
                    for style in [UIUserInterfaceStyle.light, .dark] { _ = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)) }
                }
            }
        }
        .task {
            // Layout check without a server: `--demo --demo-player` opens the full player with a stub track.
            guard ProcessInfo.processInfo.arguments.contains("--demo-player") else { return }
            player.preview([Song(id: "demo-track", title: "Очень длинное название трека для проверки переноса", artist: "Свет внутри",
                                 album: String(localized: "Параллели"), coverArt: "demo-0", duration: 214)])
            fullPlayer = true
        }
        #endif
        .sheet(isPresented: $settings) { SettingsView().appStores(library, player, downloads) }
        .addMusicPresenter()
        .sheet(isPresented: $fullPlayer) { PlayerView().presentationDragIndicator(.visible).appStores(library, player, downloads) }
        .alert(String(localized: "Воспроизведение"), isPresented: Binding(get: { player.error != nil }, set: { if !$0 { player.error = nil } })) {
            Button(String(localized: "Понятно")) { player.error = nil }
        } message: { Text(player.error ?? "") }
        .preferredColorScheme(Appearance.shared.colorScheme)
        .tint(Theme.accent)
        .overlay(alignment: .top) { if let notice = player.notice, !fullPlayer { Toast(text: notice).padding(.top, 8) } }
        .animation(.spring(duration: 0.3), value: player.notice)
    }

    @ViewBuilder private var miniPlayer: some View {
        if player.current != nil {
            MiniPlayer(open: { fullPlayer = true }).padding(.horizontal, 12).padding(.bottom, 6)
        }
    }
}

struct ConnectionView: View {
    let isInitial: Bool
    /// Adding another server: empty form, no "disconnect" button.
    var adding = false
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 28).fill(Theme.accent.opacity(0.12)).frame(width: 86, height: 86)
                        Image(systemName: "waveform").font(.system(size: 37, weight: .light)).foregroundStyle(Theme.accent)
                    }.padding(.top, 35)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(String(localized: "Твоя музыка.\nТвоё пространство.")).font(.system(size: 34, weight: .bold, design: .rounded))
                        Text(String(localized: "Подключи Navidrome и забери любимую музыку с собой."))
                            .foregroundStyle(Theme.secondary).font(.body)
                    }
                    VStack(spacing: 16) {
                        field(String(localized: "Адрес сервера")) { TextField("https://music.example.com", text: $server).keyboardType(.URL).textContentType(.URL) }
                        Text(String(localized: "HTTP без шифрования разрешён только для адресов домашней сети: 192.168.x.x, 10.x.x.x, *.local."))
                            .font(.caption).foregroundStyle(Theme.secondary)
                        field(String(localized: "Логин")) { TextField(String(localized: "Имя пользователя"), text: $username).textContentType(.username) }
                        field(String(localized: "Пароль")) { SecureField(String(localized: "Пароль Navidrome"), text: $password).textContentType(.password) }
                    }.textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let error { Text(error).font(.callout).foregroundStyle(.red) }
                    Button {
                        busy = true; error = nil
                        Task {
                            do {
                                try await library.connect(server: server, username: username, password: password)
                                player.stop(); password = ""; dismiss()
                            } catch { self.error = LibraryStore.message(error) }
                            busy = false
                        }
                    } label: {
                        HStack { Spacer(); if busy { ProgressView().tint(Theme.onAccent) } else { Text(String(localized: "Подключиться")).fontWeight(.semibold); Image(systemName: "arrow.right") }; Spacer() }
                            .padding(18).background(Theme.accent, in: RoundedRectangle(cornerRadius: 18)).foregroundStyle(Theme.onAccent)
                    }.disabled(busy || server.isEmpty || username.isEmpty || password.isEmpty)
                    Label(String(localized: "Пароль хранится в Связке ключей на этом устройстве."), systemImage: "lock.shield")
                        .font(.caption).foregroundStyle(Theme.secondary)
                    if adding {
                        EmptyView()
                    } else if !library.isConnected {
                        Button(String(localized: "Слушать музыку с \(Device.name)")) { player.stop(); library.useOnDevice(); dismiss() }
                            .frame(maxWidth: .infinity).padding(.vertical, 8).disabled(busy)
                        Button(String(localized: "Посмотреть демоверсию")) { player.stop(); library.useDemo(); dismiss() }
                            .frame(maxWidth: .infinity).padding(.vertical, 8).disabled(busy)
                    } else {
                        Button(String(localized: "Отключить сервер"), role: .destructive) {
                            do { try library.disconnect(); player.stop(); dismiss() }
                            catch { self.error = LibraryStore.message(error) }
                        }.disabled(busy)
                    }
                    Text("NOCTURNE").font(.caption2.weight(.semibold)).tracking(5).foregroundStyle(Theme.secondary).frame(maxWidth: .infinity)
                }.padding(24)
            }.background(Theme.background)
                .toolbar { if !isInitial { ToolbarItem(placement: .topBarTrailing) { Button(String(localized: "Закрыть")) { dismiss() }.disabled(busy) } } }
                .interactiveDismissDisabled(busy)
                .onAppear {
                    guard !adding else { return }
                    server = library.client?.credentials.server.absoluteString ?? ""
                    username = library.client?.credentials.username ?? ""
                }
        }
    }
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption).foregroundStyle(Theme.secondary)
            content().padding(16).background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
        }
    }
}

/// "Continue from another device": the song and the second where it stopped there.
private struct RemoteQueueBanner: View {
    let remote: PlayQueue
    @Environment(PlayerStore.self) private var player

    private var song: Song? { remote.entry?.first { $0.id == remote.current } ?? remote.entry?.first }
    private var fromComputer: Bool { remote.changedBy == "NocturneDesktop" }
    private var time: String {
        let seconds = Int(remote.positionSeconds)
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: fromComputer ? "desktopcomputer" : "iphone")
                .font(.title3).foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(fromComputer ? String(localized: "Играло на компьютере") : String(localized: "Играло на другом устройстве"))
                    .font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.85)
                if let song {
                    Text(String(localized: "«\(song.title)», с \(time)"))
                        .font(.footnote).foregroundStyle(Theme.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Button(String(localized: "Продолжить")) { player.acceptRemoteQueue() }
                .buttonStyle(.borderedProminent).controlSize(.small).tint(Theme.accent).foregroundStyle(Theme.onAccent)
            Button { player.dismissRemoteQueue() } label: { Image(systemName: "xmark") }
                .buttonStyle(.plain).foregroundStyle(Theme.secondary)
                .accessibilityLabel(String(localized: "Закрыть"))
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.thinMaterial)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
