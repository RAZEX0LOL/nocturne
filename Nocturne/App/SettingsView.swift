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
    @AppStorage(AudioEffects.fadeKey) private var fade = 0.0
    @AppStorage(DownloadStore.wifiOnlyKey) private var wifiOnly = false
    @AppStorage(DownloadStore.autoFavoritesKey) private var autoFavorites = false
    @AppStorage(DownloadStore.limitKey) private var limitGB = 0.0
    @State private var cacheSize: Int?
    @State private var connection = false
    @State private var confirmDisconnect = false

    var body: some View {
        NavigationStack {
            Form {
                Section(String(localized: "Серверы")) {
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
                            Label(String(localized: "Соединение без шифрования (HTTP). Используй только в домашней сети."), systemImage: "exclamationmark.triangle")
                                .font(.footnote).foregroundStyle(.orange)
                        }
                    } else {
                        Text(String(localized: "Демоверсия")).foregroundStyle(Theme.secondary)
                    }
                    Button(library.isConnected ? String(localized: "Добавить сервер") : String(localized: "Подключить Navidrome")) { connection = true }
                    if library.isConnected {
                        Button(String(localized: "Отключить текущий сервер"), role: .destructive) { confirmDisconnect = true }
                    }
                }
                Section {
                    NavigationLink { AppearanceSettingsView() } label: { Label(String(localized: "Оформление"), systemImage: "paintpalette") }
                }
                Section {
                    Picker("Wi-Fi", selection: $wifiQuality) { qualityOptions }
                    Picker(String(localized: "Сотовая сеть"), selection: $cellularQuality) { qualityOptions }
                } header: { Text(String(localized: "Качество потока")) } footer: {
                    Text(String(localized: "Оригинал передаёт файл без перекодирования: FLAC и ALAC звучат лучше, но занимают в 3–5 раз больше трафика. Форматы, которые iPhone не воспроизводит (например, OGG), выбирай только с MP3. Новое качество применяется со следующего трека."))
                }
                Section {
                    Picker(String(localized: "Качество загрузок"), selection: $downloadQuality) { qualityOptions }
                    Toggle(String(localized: "Только по Wi-Fi"), isOn: $wifiOnly)
                    Toggle(String(localized: "Скачивать любимые треки"), isOn: $autoFavorites)
                    Picker(String(localized: "Лимит места"), selection: $limitGB) {
                        Text(String(localized: "Без лимита")).tag(0.0)
                        ForEach([1.0, 2, 5, 10, 20], id: \.self) { Text(String(localized: "\(Int($0)) ГБ")).tag($0) }
                    }
                    LabeledContent(String(localized: "Скачано"), value: "\(downloads.items.count) · \(ByteCountFormatter.string(fromByteCount: Int64(downloads.totalSize), countStyle: .file))")
                    Button(String(localized: "Удалить все загрузки"), role: .destructive) { confirmRemoveDownloads = true }.disabled(downloads.items.isEmpty)
                } header: { Text(String(localized: "Загрузки")) } footer: {
                    Text(String(localized: "Скачанные треки играют без сети и не расходуют трафик. Загрузка идёт, пока приложение открыто или играет музыка."))
                }
                Section {
                    NavigationLink { EqualizerView() } label: { Label(String(localized: "Эквалайзер"), systemImage: "slider.vertical.3") }
                    Picker(String(localized: "Выравнивание громкости"), selection: $replayGain) {
                        ForEach(ReplayGainMode.allCases) { Text($0.title).tag($0) }
                    }
                    Picker(String(localized: "Затухание между треками"), selection: $fade) {
                        Text(String(localized: "Выключено")).tag(0.0)
                        ForEach([2.0, 4, 6, 8], id: \.self) { Text(String(localized: "\(Int($0)) с")).tag($0) }
                    }
                } header: { Text(String(localized: "Звук")) } footer: {
                    Text(String(localized: "ReplayGain выравнивает громкость по тегам файлов: «по треку» для перемешанных очередей, «по альбому» сохраняет задуманную разницу между треками. Применяется со следующего трека."))
                }
                Section {
                    NavigationLink { StatsView() } label: { Label(String(localized: "Статистика прослушиваний"), systemImage: "chart.bar") }
                }
                Section(String(localized: "Хранилище")) {
                    LabeledContent(String(localized: "Кэш обложек"), value: cacheSize.map { ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file) } ?? "…")
                    Button(String(localized: "Очистить кэш обложек"), role: .destructive) {
                        Task { await ArtworkCache.shared.clear(); cacheSize = await ArtworkCache.shared.diskUsage() }
                    }
                }
                Section(String(localized: "О приложении")) {
                    LabeledContent(String(localized: "Версия"), value: Self.version)
                    Link("OpenSubsonic API", destination: URL(string: "https://opensubsonic.netlify.app")!)
                }
            }
            .scrollContentBackground(.hidden).background(Theme.background)
            .navigationTitle(String(localized: "Настройки")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(String(localized: "Готово")) { dismiss() } } }
            .task { cacheSize = await ArtworkCache.shared.diskUsage() }
            .onChange(of: library.isConnected) { _, connected in if !connected && !library.isDemo { dismiss() } }
            .sheet(isPresented: $connection) { ConnectionView(isInitial: false, adding: true) }
            .confirmationDialog(String(localized: "Отключить сервер?"), isPresented: $confirmDisconnect, titleVisibility: .visible) {
                Button(String(localized: "Отключить"), role: .destructive) {
                    player.stop()
                    try? library.disconnect()
                }
            } message: { Text(String(localized: "Логин и пароль будут удалены с устройства. Загрузки этого сервера останутся.")) }
            .confirmationDialog(String(localized: "Удалить все загрузки?"), isPresented: $confirmRemoveDownloads, titleVisibility: .visible) {
                Button(String(localized: "Удалить"), role: .destructive) { downloads.removeAll() }
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
