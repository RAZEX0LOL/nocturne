import AppIntents

/// Buttons in the widget. Audio playback intents run in the app's process, so the widget
/// only needs the declarations; the app target compiles the real `perform`.
struct WidgetTogglePlaybackIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource { "Пауза или продолжить" }
    static var isDiscoverable: Bool { false }

    #if WIDGET_EXTENSION
    func perform() async throws -> some IntentResult { .result() }
    #else
    @MainActor func perform() async throws -> some IntentResult {
        PlayerStore.shared.toggle()
        return .result()
    }
    #endif
}

struct WidgetNextTrackIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource { "Следующий трек" }
    static var isDiscoverable: Bool { false }

    #if WIDGET_EXTENSION
    func perform() async throws -> some IntentResult { .result() }
    #else
    @MainActor func perform() async throws -> some IntentResult {
        PlayerStore.shared.advance()
        return .result()
    }
    #endif
}
