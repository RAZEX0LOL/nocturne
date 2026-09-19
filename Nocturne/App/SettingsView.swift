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
    @State private var cacheSize: Int?
    @State private var connection = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Сервер") {
                    if let credentials = library.client?.credentials {
                        LabeledContent("Адрес", value: credentials.server.host() ?? credentials.server.absoluteString)
                        LabeledContent("Пользователь", value: credentials.username)
                        if credentials.isInsecure {
                            Label("Соединение без шифрования (HTTP). Используй только в домашней сети.", systemImage: "exclamationmark.triangle")
                                .font(.footnote).foregroundStyle(.orange)
                        }
                    } else {
                        Text("Демоверсия").foregroundStyle(Theme.secondary)
                    }
                    Button(library.isConnected ? "Изменить подключение" : "Подключить Navidrome") { connection = true }
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
                    LabeledContent("Скачано", value: "\(downloads.items.count) · \(ByteCountFormatter.string(fromByteCount: Int64(downloads.totalSize), countStyle: .file))")
                    Button("Удалить все загрузки", role: .destructive) { confirmRemoveDownloads = true }.disabled(downloads.items.isEmpty)
                } header: { Text("Загрузки") } footer: {
                    Text("Скачанные треки играют без сети и не расходуют трафик. Загрузка идёт, пока приложение открыто или играет музыка.")
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
            .onChange(of: library.isConnected) { _, connected in if !connected { dismiss() } }
            .sheet(isPresented: $connection) { ConnectionView(isInitial: false) }
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
