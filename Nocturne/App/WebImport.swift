import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// Shared rules for files fetched from the web: only audio is kept, and the file gets an extension
/// AVFoundation recognises (taken from the name, or from the MIME type when the name has none).
enum WebImport {
    private static let extensionsByMIME = ["audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
                                           "audio/m4a": "m4a", "audio/aac": "m4a", "audio/flac": "flac", "audio/x-flac": "flac",
                                           "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/aiff": "aiff", "audio/x-aiff": "aiff"]

    static func isAudio(_ response: URLResponse) -> Bool {
        let mime = response.mimeType?.lowercased() ?? ""
        return mime.hasPrefix("audio/") || audioExtension(for: fileName(for: response)) != nil
    }

    static func fileName(for response: URLResponse) -> String {
        var name = response.suggestedFilename ?? response.url?.lastPathComponent ?? "track"
        let mime = response.mimeType?.lowercased() ?? ""
        // Known aliases first, then the system type database (covers audio/vnd.wave, audio/x-aac, …).
        if audioExtension(for: name) == nil,
           let ext = extensionsByMIME[mime] ?? UTType(mimeType: mime)?.preferredFilenameExtension {
            name = (name as NSString).deletingPathExtension + "." + ext
        }
        return name
    }

    private static func audioExtension(for name: String) -> String? {
        let ext = (name as NSString).pathExtension.lowercased()
        return LocalLibrary.audioExtensions.contains(ext) ? ext : nil
    }

    /// A fresh temporary folder for one download; removed after import.
    static func stagingFolder() -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("web-import-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    /// Adds a downloaded file to the on-device library and cleans up.
    @MainActor static func finish(_ file: URL, player: PlayerStore) async {
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        guard audioExtension(for: file.lastPathComponent) != nil else {
            player.show(String(localized: "Это не аудиофайл — пропущено")); return
        }
        let added = await LocalLibrary.shared.importItems([file])
        player.show(added > 0 ? String(localized: "Скачано на \(Device.name): \(file.deletingPathExtension().lastPathComponent)")
                              : String(localized: "Файл уже есть в медиатеке"))
    }
}

/// Download a single file from a direct link.
struct LinkImportView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    // System paste button: no "Allow Paste" prompt, unlike reading UIPasteboard directly.
                    PasteButton(payloadType: String.self) { strings in
                        if let text = strings.first { address = text.trimmingCharacters(in: .whitespacesAndNewlines) }
                    }.labelStyle(.titleAndIcon)
                } footer: {
                    Text(String(localized: "Прямая ссылка на аудиофайл: MP3, M4A, AAC, FLAC, WAV. Файл появится в «На \(Device.name)»."))
                }
                if let error { Text(error).foregroundStyle(.red) }
                Section {
                    Button { Task { await download() } } label: {
                        HStack { Text(String(localized: "Скачать")); Spacer(); if busy { ProgressView() } }
                    }.disabled(busy || URL(string: address.trimmingCharacters(in: .whitespaces))?.scheme == nil)
                }
            }
            .navigationTitle(String(localized: "По ссылке")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(String(localized: "Отмена")) { dismiss() }.disabled(busy) } }
        }
    }

    private func download() async {
        guard let url = URL(string: address.trimmingCharacters(in: .whitespaces)), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            error = String(localized: "Нужна ссылка, начинающаяся с https://"); return
        }
        busy = true; error = nil
        defer { busy = false }
        do {
            let (temporary, response) = try await URLSession.shared.download(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw URLError(.badServerResponse)
            }
            guard WebImport.isAudio(response) else {
                try? FileManager.default.removeItem(at: temporary)
                error = String(localized: "По ссылке не аудиофайл. Нужна прямая ссылка на сам файл."); return
            }
            let file = WebImport.stagingFolder().appendingPathComponent(WebImport.fileName(for: response))
            try FileManager.default.moveItem(at: temporary, to: file)
            await WebImport.finish(file, player: player)
            dismiss()
        } catch {
            self.error = String(localized: "Не удалось скачать файл. Проверь ссылку и сеть.")
        }
    }
}

/// In-app browser: the user goes wherever they like; responses that are audio files are saved to the library.
struct BrowserView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    @State private var model = BrowserModel()
    @FocusState private var editing: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.secondary)
                    TextField(String(localized: "Адрес или поиск"), text: $model.address)
                        .keyboardType(.webSearch).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($editing)
                        .onSubmit { model.go() }
                        .onChange(of: editing) { _, value in model.isEditing = value }
                    if model.isLoading { ProgressView().controlSize(.small) }
                    if !model.address.isEmpty {
                        Button { model.address = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.secondary) }
                            .accessibilityLabel(String(localized: "Очистить адрес"))
                    }
                }
                .padding(10).background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius(12))).padding(.horizontal, 12).padding(.vertical, 8)
                WebView(webView: model.webView)
                if !model.downloads.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(model.downloads) { item in
                            HStack {
                                Image(systemName: "arrow.down.circle").foregroundStyle(Theme.accent)
                                Text(item.name).font(.caption).lineLimit(1)
                                Spacer()
                                ProgressView(value: item.progress).frame(width: 80)
                            }
                        }
                    }.padding(12).background(.ultraThinMaterial)
                }
            }
            .background(Theme.background)
            .navigationTitle(String(localized: "Браузер")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button(String(localized: "Готово")) { dismiss() } }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { model.webView.goBack() } label: { Image(systemName: "chevron.backward") }.disabled(!model.canGoBack)
                        .accessibilityLabel(String(localized: "Назад"))
                    Button { model.webView.goForward() } label: { Image(systemName: "chevron.forward") }.disabled(!model.canGoForward)
                        .accessibilityLabel(String(localized: "Вперёд"))
                    Spacer()
                    Button { model.webView.reload() } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel(String(localized: "Обновить"))
                }
            }
            .overlay(alignment: .top) { if let notice = player.notice { Toast(text: notice).padding(.top, 60) } }
            .animation(.spring(duration: 0.3), value: player.notice)
        }
        .onAppear {
            model.player = player
            if let start = AddMusicCoordinator.shared.browserStart { model.open(start); AddMusicCoordinator.shared.browserStart = nil }
        }
    }
}

private struct WebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

@MainActor @Observable
final class BrowserModel: NSObject, WKNavigationDelegate, WKDownloadDelegate {
    struct Item: Identifiable { let id: ObjectIdentifier; var name: String; var progress: Double }

    var address = ""
    /// While the user types, page loads must not overwrite the address field.
    @ObservationIgnored var isEditing = false
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    private(set) var isLoading = false
    private(set) var downloads: [Item] = []
    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored weak var player: PlayerStore?
    @ObservationIgnored private var active: [ObjectIdentifier: (download: WKDownload, file: URL)] = [:]
    @ObservationIgnored private var progressTask: Task<Void, Never>?

    override init() {
        webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        super.init()
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        load(URL(string: "https://duckduckgo.com/")!)
    }

    /// Opens a typed address, or searches for the text.
    func go() {
        let text = address.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        if !text.contains(" "), text.contains("."), let url = URL(string: text.contains("://") ? text : "https://" + text) {
            load(url)
        } else if let query = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                  let url = URL(string: "https://duckduckgo.com/?q=\(query)") {
            load(url)
        }
    }

    func open(_ url: URL) { load(url) }
    private func load(_ url: URL) { webView.load(URLRequest(url: url)) }

    private func refreshState() {
        canGoBack = webView.canGoBack; canGoForward = webView.canGoForward
        isLoading = webView.isLoading
        if !isEditing, let url = webView.url?.absoluteString { address = url }
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { refreshState() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { refreshState() }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { refreshState() }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        navigationAction.shouldPerformDownload ? .download : .allow
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if WebImport.isAudio(navigationResponse.response) { return .download }
        if !navigationResponse.canShowMIMEType {
            player?.show(String(localized: "Nocturne Player сохраняет только аудиофайлы"))
            return .cancel
        }
        return .allow
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        Log.library.notice("Browser: response became download")
        download.delegate = self
    }

    // MARK: Downloads

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        Log.library.notice("Browser: destination for \(response.mimeType ?? "-", privacy: .public), audio \(WebImport.isAudio(response), privacy: .public)")
        guard WebImport.isAudio(response) else {
            player?.show(String(localized: "Nocturne Player сохраняет только аудиофайлы"))
            return nil
        }
        let file = WebImport.stagingFolder().appendingPathComponent(WebImport.fileName(for: response))
        let id = ObjectIdentifier(download)
        active[id] = (download, file)
        downloads.append(Item(id: id, name: file.deletingPathExtension().lastPathComponent, progress: 0))
        trackProgress()
        return file
    }

    func downloadDidFinish(_ download: WKDownload) {
        Log.library.notice("Browser: download finished")
        guard let entry = active.removeValue(forKey: ObjectIdentifier(download)) else { return }
        downloads.removeAll { $0.id == ObjectIdentifier(download) }
        guard let player else { return }
        Task { await WebImport.finish(entry.file, player: player) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        Log.library.error("Browser: download failed \(Log.describe(error), privacy: .public)")
        if let entry = active.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: entry.file.deletingLastPathComponent())
        }
        downloads.removeAll { $0.id == ObjectIdentifier(download) }
        player?.show(String(localized: "Загрузка не удалась"))
    }

    /// WKDownload reports progress through Progress; poll it while downloads run.
    private func trackProgress() {
        guard progressTask == nil else { return }
        progressTask = Task { [weak self] in
            while let self, !self.active.isEmpty {
                for index in self.downloads.indices {
                    if let download = self.active[self.downloads[index].id]?.download {
                        self.downloads[index].progress = download.progress.fractionCompleted
                    }
                }
                try? await Task.sleep(for: .milliseconds(300))
            }
            self?.progressTask = nil
        }
    }
}
