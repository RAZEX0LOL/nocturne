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
            if library.isConnected || library.isDemo {
                TabView(selection: $selectedTab) {
                    NavigationStack { HomeView(settings: $settings) }
                        .safeAreaInset(edge: .bottom, spacing: 0) { miniPlayer }
                        .tabItem { Label("Главная", systemImage: "house.fill") }.tag(0)
                    NavigationStack { LibraryView() }
                        .safeAreaInset(edge: .bottom, spacing: 0) { miniPlayer }
                        .tabItem { Label("Медиатека", systemImage: "square.stack.fill") }.tag(1)
                    NavigationStack { SearchView() }
                        .safeAreaInset(edge: .bottom, spacing: 0) { miniPlayer }
                        .tabItem { Label("Поиск", systemImage: "magnifyingglass") }.tag(2)
                }
                .task { await library.refresh() }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if !player.network.isOnline {
                        Button {
                            UserDefaults.standard.set(LibraryView.Category.downloads.rawValue, forKey: "library.category")
                            selectedTab = 1
                        } label: {
                            Label(downloads.items.isEmpty ? "Нет сети" : "Нет сети · открыть загрузки", systemImage: "wifi.slash")
                                .font(.footnote.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 6)
                        }.background(.orange.opacity(0.85)).foregroundStyle(.black)
                            .transition(.move(edge: .top))
                    }
                }
                .animation(.default, value: player.network.isOnline)
            } else { ConnectionView(isInitial: true) }
        }
        .task(id: library.client?.credentials.account) {
            downloads.use(library.client)
            if downloads.network == nil { downloads.network = player.network }
            player.localFile = { [downloads] id in downloads.localURL(for: id) }
            if let client = library.client { player.restore(client: client) }
        }
        .task { await ArtworkCache.shared.trim() }
        .onChange(of: library.starredSongs) { _, songs in
            if UserDefaults.standard.bool(forKey: DownloadStore.autoFavoritesKey) { downloads.download(songs) }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { player.save(force: true) } }
        #if DEBUG
        .task {
            // Layout check without a server: `--demo --demo-player` opens the full player with a stub track.
            guard ProcessInfo.processInfo.arguments.contains("--demo-player") else { return }
            player.preview([Song(id: "demo-track", title: "Очень длинное название трека для проверки переноса", artist: "Свет внутри",
                                 album: "Параллели", coverArt: "demo-0", duration: 214)])
            fullPlayer = true
        }
        #endif
        .sheet(isPresented: $settings) { SettingsView() }
        .sheet(isPresented: $fullPlayer) { PlayerView().presentationDragIndicator(.visible) }
        .alert("Воспроизведение", isPresented: Binding(get: { player.error != nil }, set: { if !$0 { player.error = nil } })) {
            Button("Понятно") { player.error = nil }
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
                        Text("Твоя музыка.\nТвоё пространство.").font(.system(size: 34, weight: .bold, design: .rounded))
                        Text("Подключи Navidrome и забери любимую музыку с собой.")
                            .foregroundStyle(Theme.secondary).font(.body)
                    }
                    VStack(spacing: 16) {
                        field("Адрес сервера") { TextField("https://music.example.com", text: $server).keyboardType(.URL).textContentType(.URL) }
                        Text("HTTP без шифрования разрешён только для адресов домашней сети: 192.168.x.x, 10.x.x.x, *.local.")
                            .font(.caption).foregroundStyle(Theme.secondary)
                        field("Логин") { TextField("Имя пользователя", text: $username).textContentType(.username) }
                        field("Пароль") { SecureField("Пароль Navidrome", text: $password).textContentType(.password) }
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
                        HStack { Spacer(); if busy { ProgressView().tint(Theme.onAccent) } else { Text("Подключиться").fontWeight(.semibold); Image(systemName: "arrow.right") }; Spacer() }
                            .padding(18).background(Theme.accent, in: RoundedRectangle(cornerRadius: 18)).foregroundStyle(Theme.onAccent)
                    }.disabled(busy || server.isEmpty || username.isEmpty || password.isEmpty)
                    Label("Пароль хранится в Связке ключей на этом устройстве.", systemImage: "lock.shield")
                        .font(.caption).foregroundStyle(Theme.secondary)
                    if adding {
                        EmptyView()
                    } else if !library.isConnected {
                        Button("Посмотреть демоверсию") { player.stop(); library.useDemo(); dismiss() }
                            .frame(maxWidth: .infinity).padding(.vertical, 8).disabled(busy)
                    } else {
                        Button("Отключить сервер", role: .destructive) {
                            do { try library.disconnect(); player.stop(); dismiss() }
                            catch { self.error = LibraryStore.message(error) }
                        }.disabled(busy)
                    }
                    Text("NOCTURNE").font(.caption2.weight(.semibold)).tracking(5).foregroundStyle(Theme.secondary).frame(maxWidth: .infinity)
                }.padding(24)
            }.background(Theme.background)
                .toolbar { if !isInitial { ToolbarItem(placement: .topBarTrailing) { Button("Закрыть") { dismiss() }.disabled(busy) } } }
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
