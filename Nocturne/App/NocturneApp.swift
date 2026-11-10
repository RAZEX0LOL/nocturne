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
    #if targetEnvironment(macCatalyst)
    @State private var macSection = MacSection.home
    #endif
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        @Bindable var player = player
        Group {
            if library.isConnected || library.isDemo || library.onDeviceOnly {
                Group {
                #if targetEnvironment(macCatalyst)
                MacLibraryShell(section: $macSection, settings: $settings, openPlayer: { fullPlayer = true })
                #else
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
                #endif
                }
                .task { await library.refresh() }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if !player.network.isOnline {
                        Button {
                            UserDefaults.standard.set(LibraryView.Category.downloads.rawValue, forKey: "library.category")
                            #if targetEnvironment(macCatalyst)
                            macSection = .library(.downloads)
                            #else
                            selectedTab = 1
                            #endif
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
            // Audio files shared to the app ("Open in Nocturne Player") go to the on-device library.
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
            Task { await downloads.resumePending() }
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
        .fontDesign(Appearance.shared.roundedFont ? .rounded : .default)
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


#if targetEnvironment(macCatalyst)
// Отдельная оболочка Mac использует те же экраны и хранилища, что и iPhone.
// Навигация по разделам не должна пересоздавать аудиодвижок или плеер.
enum MacSection: Hashable {
    case home, search, library(LibraryView.Category), playlist(String)
}

struct MacLibraryShell: View {
    @Binding var section: MacSection
    @Binding var settings: Bool
    let openPlayer: () -> Void
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @State private var path = NavigationPath()
    @State private var creatingPlaylist = false
    @State private var playlistName = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                sidebar.frame(width: 270)
                Divider()
                NavigationStack(path: $path) {
                    Group {
                        switch section {
                        case .home: HomeView(settings: $settings)
                        case .search: SearchView()
                        case .library(let category): LibraryView(categoryOverride: category)
                        case .playlist(let id):
                            if let playlist = library.playlists.first(where: { $0.id == id }) {
                                PlaylistDetailView(playlist: playlist)
                            } else {
                                ContentUnavailableView(String(localized: "Плейлистов пока нет"), systemImage: "music.note.list")
                            }
                        }
                    }
                }.id(section)
            }
            Divider()
            MacPlayerBar(open: openPlayer)
        }
        .background(Theme.background)
        .onChange(of: section) { _, _ in path = NavigationPath() }
        .onChange(of: library.playlists.map(\.id)) { _, ids in
            if case .playlist(let id) = section, !ids.contains(id) { section = .library(.playlists) }
        }
        .task {
            for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
                scene.sizeRestrictions?.minimumSize = CGSize(width: 1000, height: 700)
            }
        }
        .alert(String(localized: "Новый плейлист"), isPresented: $creatingPlaylist) {
            TextField(String(localized: "Название"), text: $playlistName)
            Button(String(localized: "Создать")) {
                let name = playlistName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return }
                Task {
                    do { try await library.createPlaylist(name: name, songs: []) }
                    catch { player.error = LibraryStore.message(error) }
                }
            }
            Button(String(localized: "Отмена"), role: .cancel) {}
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Button { if !path.isEmpty { path.removeLast() } } label: {
                    Image(systemName: "chevron.left").frame(width: 28, height: 36)
                }.disabled(path.isEmpty).accessibilityLabel(String(localized: "Назад"))
                Text("NOCTURNE PLAYER").font(.system(size: 12, weight: .bold)).tracking(2).foregroundStyle(Theme.secondary)
                Spacer(minLength: 0)
            }.padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    navigationButton(.home, String(localized: "Главная"), "house", id: "home")
                        .keyboardShortcut("1", modifiers: .command)
                    navigationButton(.search, String(localized: "Поиск"), "magnifyingglass", id: "search")
                        .keyboardShortcut("f", modifiers: .command)
                    navigationButton(.library(.device), String(localized: "На компьютере"), "desktopcomputer", id: "device")
                    if library.client != nil || library.isDemo {
                        navigationButton(.library(.downloads), String(localized: "Загрузки"), "arrow.down.circle", id: "downloads")
                        if !library.isOffline {
                            navigationButton(.library(.albums), String(localized: "Альбомы"), "square.stack", id: "albums")
                            navigationButton(.library(.artists), String(localized: "Артисты"), "person.2", id: "artists")
                        }
                        navigationButton(.library(.playlists), String(localized: "Плейлисты"), "music.note.list", id: "playlists")
                        navigationButton(.library(.songs), String(localized: "Избранное"), "heart", id: "favorites")
                        if !library.isOffline {
                            navigationButton(.library(.genres), String(localized: "Жанры"), "guitars", id: "genres")
                            navigationButton(.library(.radio), String(localized: "Радио"), "antenna.radiowaves.left.and.right", id: "radio")
                        }
                        HStack {
                            Text(String(localized: "Плейлисты")).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.secondary)
                            Spacer()
                            Button { playlistName = ""; creatingPlaylist = true } label: {
                                Image(systemName: "plus").frame(width: 30, height: 30)
                            }.disabled(!library.isConnected || library.isOffline)
                                .accessibilityLabel(String(localized: "Новый плейлист"))
                        }.padding(.horizontal, 14).padding(.top, 22).padding(.bottom, 6)
                        ForEach(library.playlists) { playlist in
                            navigationButton(.playlist(playlist.id), playlist.name, "music.note.list", id: "playlist.\(playlist.id)")
                        }
                    }
                }.padding(.horizontal, 8)
            }
            VStack(spacing: 3) {
                AddMusicMenu(showsTitle: true).padding(.horizontal, 14).padding(.vertical, 8)
                Button { Task { await library.refresh() } } label: {
                    sidebarLabel(String(localized: "Обновить"), "arrow.clockwise")
                }.disabled(library.isLoading).keyboardShortcut("r", modifiers: .command)
                Button { settings = true } label: {
                    sidebarLabel(String(localized: "Настройки"), "gearshape")
                }.keyboardShortcut(",", modifiers: .command).accessibilityIdentifier("mac.settings")
            }.padding(8)
        }
        .font(.system(size: 17))
        .buttonStyle(.plain)
        .foregroundStyle(Theme.primary)
        .background(Theme.surface.opacity(0.65))
    }

    private func sidebarLabel(_ title: String, _ icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(Theme.accent).frame(width: 22)
            Text(title).lineLimit(1)
            Spacer(minLength: 0)
        }.padding(.horizontal, 14).frame(minHeight: 36).contentShape(Rectangle())
    }

    private func navigationButton(_ destination: MacSection, _ title: String, _ icon: String, id: String) -> some View {
        Button { section = destination } label: {
            sidebarLabel(title, icon)
                .background(section == destination ? Theme.primary.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 6))
        }
        .accessibilityAddTraits(section == destination ? .isSelected : [])
        .accessibilityIdentifier("mac.sidebar.\(id)")
    }
}
#endif

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
                        RoundedRectangle(cornerRadius: Theme.radius(28)).fill(Theme.accent.opacity(0.12)).frame(width: 86, height: 86)
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
                                player.stop(); password = ""; closeIfPresented()
                            } catch { self.error = LibraryStore.message(error) }
                            busy = false
                        }
                    } label: {
                        HStack { Spacer(); if busy { ProgressView().tint(Theme.onAccent) } else { Text(String(localized: "Подключиться")).fontWeight(.semibold); Image(systemName: "arrow.right") }; Spacer() }
                            .padding(18).background(Theme.accent, in: RoundedRectangle(cornerRadius: Theme.radius(18))).foregroundStyle(Theme.onAccent)
                    }.disabled(busy || server.isEmpty || username.isEmpty || password.isEmpty)
                    Label(String(localized: "Пароль хранится в Связке ключей на этом устройстве."), systemImage: "lock.shield")
                        .font(.caption).foregroundStyle(Theme.secondary)
                    if adding {
                        EmptyView()
                    } else if !library.isConnected {
                        Button {
                            player.stop(); library.useOnDevice(); closeIfPresented()
                        } label: {
                            Text(String(localized: "Слушать музыку с \(Device.name)"))
                                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                        }.buttonStyle(.plain).foregroundStyle(Theme.accent).disabled(busy)
                        Button {
                            Log.library.notice("Demo entry requested")
                            player.stop(); library.useDemo(); closeIfPresented()
                        } label: {
                            Text(String(localized: "Посмотреть демоверсию"))
                                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                        }.buttonStyle(.plain).foregroundStyle(Theme.accent).disabled(busy)
                    } else {
                        Button(String(localized: "Отключить сервер"), role: .destructive) {
                            do { try library.disconnect(); player.stop(); closeIfPresented() }
                            catch { self.error = LibraryStore.message(error) }
                        }.disabled(busy)
                    }
                    Text("NOCTURNE PLAYER").font(.caption2.weight(.semibold)).tracking(3).foregroundStyle(Theme.secondary).frame(maxWidth: .infinity)
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
    private func closeIfPresented() {
        // На первом входе RootView сам меняет экран. dismiss относится только к форме в sheet.
        if !isInitial { dismiss() }
    }
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption).foregroundStyle(Theme.secondary)
            content().padding(16).background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius(14)))
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
