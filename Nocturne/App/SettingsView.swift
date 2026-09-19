import SwiftUI

struct SettingsView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    @AppStorage(PlaybackSettings.wifiQualityKey) private var wifiQuality = PlaybackSettings.defaultWifi
    @AppStorage(PlaybackSettings.cellularQualityKey) private var cellularQuality = PlaybackSettings.defaultCellular
    @AppStorage(DownloadStore.qualityKey) private var downloadQuality = DownloadStore.defaultQuality
    @Environment(DownloadStore.self) private var downloads
    @State private var confirmRemoveDownloads = false
    @AppStorage(PlaybackSettings.replayGainKey) private var replayGain = ReplayGainMode.off
    @AppStorage(DownloadStore.wifiOnlyKey) private var wifiOnly = false
    @AppStorage(DownloadStore.autoFavoritesKey) private var autoFavorites = false
    @AppStorage(DownloadStore.limitKey) private var limitGB = 0.0
    @State private var cacheSize: Int?
    @State private var connection = false
    @State private var confirmDisconnect = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Серверы") {
                    ForEach(library.accounts, id: \.self) { account in
                        let parts = account.split(separator: "@", maxSplits: 1).map(String.init)
                        Button {
                            Task { player.stop(); await library.switchTo(account) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(URL(string: parts.last ?? "")?.host() ?? account).foregroundStyle(Theme.primary)
                                    Text(parts.first ?? "").font(.caption).foregroundStyle(Theme.secondary)
                                }
                                Spacer()
                                if account == library.client?.credentials.account { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
                            }
                        }.accessibilityAddTraits(account == library.client?.credentials.account ? .isSelected : [])
                    }
                    if let credentials = library.client?.credentials {
                        if credentials.isInsecure {
                            Label("Соединение без шифрования (HTTP). Используй только в домашней сети.", systemImage: "exclamationmark.triangle")
                                .font(.footnote).foregroundStyle(.orange)
                        }
                    } else {
                        Text("Демоверсия").foregroundStyle(Theme.secondary)
                    }
                    Button(library.isConnected ? "Добавить сервер" : "Подключить Navidrome") { connection = true }
                    if library.isConnected {
                        Button("Отключить текущий сервер", role: .destructive) { confirmDisconnect = true }
                    }
                }
                Section {
                    NavigationLink { AppearanceSettingsView() } label: { Label("Оформление", systemImage: "paintpalette") }
                }
                Section {
                    Picker("Wi-Fi", selection: $wifiQuality) { qualityOptions }
                    Picker("Сотовая сеть", selection: $cellularQuality) { qualityOptions }
                } header: { Text("Качество потока") } footer: {
                    Text("Оригинал передаёт файл без перекодирования: FLAC и ALAC звучат лучше, но занимают в 3–5 раз больше трафика. Форматы, которые iPhone не воспроизводит (например, OGG), выбирай только с MP3. Новое качество применяется со следующего трека.")
                }
                Section {
                    Picker("Качество загрузок", selection: $downloadQuality) { qualityOptions }
                    Toggle("Только по Wi-Fi", isOn: $wifiOnly)
                    Toggle("Скачивать любимые треки", isOn: $autoFavorites)
                    Picker("Лимит места", selection: $limitGB) {
                        Text("Без лимита").tag(0.0)
                        ForEach([1.0, 2, 5, 10, 20], id: \.self) { Text("\(Int($0)) ГБ").tag($0) }
                    }
                    LabeledContent("Скачано", value: "\(downloads.items.count) · \(ByteCountFormatter.string(fromByteCount: Int64(downloads.totalSize), countStyle: .file))")
                    Button("Удалить все загрузки", role: .destructive) { confirmRemoveDownloads = true }.disabled(downloads.items.isEmpty)
                } header: { Text("Загрузки") } footer: {
                    Text("Скачанные треки играют без сети и не расходуют трафик. Загрузка идёт, пока приложение открыто или играет музыка.")
                }
                Section {
                    Picker("Выравнивание громкости", selection: $replayGain) {
                        ForEach(ReplayGainMode.allCases) { Text($0.title).tag($0) }
                    }
                } header: { Text("Звук") } footer: {
                    Text("ReplayGain выравнивает громкость по тегам файлов: «по треку» для перемешанных очередей, «по альбому» сохраняет задуманную разницу между треками. Применяется со следующего трека.")
                }
                Section {
                    NavigationLink { StatsView() } label: { Label("Статистика прослушиваний", systemImage: "chart.bar") }
                }
                Section("Хранилище") {
                    LabeledContent("Кэш обложек", value: cacheSize.map { ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file) } ?? "…")
                    Button("Очистить кэш обложек", role: .destructive) {
                        Task { await ArtworkCache.shared.clear(); cacheSize = await ArtworkCache.shared.diskUsage() }
                    }
                }
                Section("О приложении") {
                    LabeledContent("Версия", value: Self.version)
                    Link("OpenSubsonic API", destination: URL(string: "https://opensubsonic.netlify.app")!)
                }
            }
            .scrollContentBackground(.hidden).background(Theme.background)
            .navigationTitle("Настройки").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Готово") { dismiss() } } }
            .task { cacheSize = await ArtworkCache.shared.diskUsage() }
            .onChange(of: library.isConnected) { _, connected in if !connected && !library.isDemo { dismiss() } }
            .sheet(isPresented: $connection) { ConnectionView(isInitial: false, adding: true) }
            .confirmationDialog("Отключить сервер?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
                Button("Отключить", role: .destructive) {
                    player.stop()
                    try? library.disconnect()
                }
            } message: { Text("Логин и пароль будут удалены с устройства. Загрузки этого сервера останутся.") }
            .confirmationDialog("Удалить все загрузки?", isPresented: $confirmRemoveDownloads, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { downloads.removeAll() }
            }
        }
    }

    @ViewBuilder private var qualityOptions: some View {
        ForEach(StreamQuality.allCases) { Text($0.title).tag($0) }
    }

    private static var version: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }
}
