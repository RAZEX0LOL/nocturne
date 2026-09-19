import AppIntents

/// Siri, Shortcuts and Spotlight actions. Audio intents run in the background without opening the app.
enum NocturneIntentError: Error, CustomLocalizedStringResourceConvertible {
    case notConnected, noFavorites, nothingPlaying, noSimilar
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notConnected: "Сначала подключи сервер Navidrome в приложении."
        case .noFavorites: "В избранном пока нет треков."
        case .nothingPlaying: "Сейчас ничего не играет."
        case .noSimilar: "Похожих треков не нашлось."
        }
    }
}

struct PlayFavoritesIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource { "Включить любимые треки" }
    static var description: IntentDescription { IntentDescription("Перемешивает и включает любимые треки из Navidrome.") }

    @MainActor func perform() async throws -> some IntentResult {
        let library = LibraryStore.shared
        guard let client = library.client else { throw NocturneIntentError.notConnected }
        var songs = library.starredSongs
        if songs.isEmpty { songs = try await client.starred().song ?? [] }
        guard !songs.isEmpty else { throw NocturneIntentError.noFavorites }
        PlayerStore.shared.play(songs, at: songs.indices.randomElement() ?? 0, shuffle: true, client: client)
        return .result()
    }
}

struct PlayMixIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource { "Микс по текущему треку" }
    static var description: IntentDescription { IntentDescription("Включает похожие треки на тот, что играет сейчас.") }

    @MainActor func perform() async throws -> some IntentResult {
        let player = PlayerStore.shared
        guard let client = LibraryStore.shared.client else { throw NocturneIntentError.notConnected }
        guard let seed = player.current, !player.isLive else { throw NocturneIntentError.nothingPlaying }
        let similar = try await client.similarSongs(to: seed.id).filter { $0.id != seed.id }
        guard !similar.isEmpty else { throw NocturneIntentError.noSimilar }
        player.play([seed] + similar, shuffle: false, client: client)
        return .result()
    }
}

struct TogglePlaybackIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource { "Пауза или продолжить" }

    @MainActor func perform() async throws -> some IntentResult {
        guard PlayerStore.shared.current != nil else { throw NocturneIntentError.nothingPlaying }
        PlayerStore.shared.toggle()
        return .result()
    }
}

struct NextTrackIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource { "Следующий трек" }

    @MainActor func perform() async throws -> some IntentResult {
        guard PlayerStore.shared.current != nil else { throw NocturneIntentError.nothingPlaying }
        PlayerStore.shared.advance()
        return .result()
    }
}

struct NocturneShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: PlayFavoritesIntent(),
                    phrases: ["Включи любимое в \(.applicationName)", "Любимые треки в \(.applicationName)"],
                    shortTitle: "Любимое", systemImageName: "heart.fill")
        AppShortcut(intent: PlayMixIntent(),
                    phrases: ["Микс в \(.applicationName)", "Включи похожие в \(.applicationName)"],
                    shortTitle: "Микс по треку", systemImageName: "dot.radiowaves.left.and.right")
        AppShortcut(intent: TogglePlaybackIntent(),
                    phrases: ["Пауза в \(.applicationName)", "Продолжи \(.applicationName)"],
                    shortTitle: "Пауза / Продолжить", systemImageName: "playpause.fill")
        AppShortcut(intent: NextTrackIntent(),
                    phrases: ["Следующий трек в \(.applicationName)"],
                    shortTitle: "Следующий трек", systemImageName: "forward.end.fill")
    }
}
