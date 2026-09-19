import SwiftUI
import UniformTypeIdentifiers

/// Ways to put music on the phone. Buttons anywhere set `request`; `AddMusicPresenter` on the root view shows the UI.
@MainActor @Observable
final class AddMusicCoordinator {
    static let shared = AddMusicCoordinator()
    enum Source: Identifiable { case files, folder, link, browser; var id: Self { self } }
    var request: Source?
    /// Page the browser opens first (debug hook `--open-browser <url>`).
    var browserStart: URL?
}

/// "+" menu for toolbars: files, a whole folder, a direct link or the built-in browser.
struct AddMusicMenu: View {
    var body: some View {
        Menu {
            Button { AddMusicCoordinator.shared.request = .files } label: { Label(String(localized: "Файлы с iPhone"), systemImage: "doc.badge.plus") }
            Button { AddMusicCoordinator.shared.request = .folder } label: { Label(String(localized: "Папка целиком"), systemImage: "folder.badge.plus") }
            Divider()
            Button { AddMusicCoordinator.shared.request = .link } label: { Label(String(localized: "Скачать по ссылке"), systemImage: "link.badge.plus") }
            Button { AddMusicCoordinator.shared.request = .browser } label: { Label(String(localized: "Браузер"), systemImage: "safari") }
        } label: {
            Image(systemName: "plus").foregroundStyle(Theme.primary)
        }.accessibilityLabel(String(localized: "Добавить музыку"))
    }
}

struct AddMusicPresenter: ViewModifier {
    @Environment(PlayerStore.self) private var player
    @Bindable private var coordinator = AddMusicCoordinator.shared

    func body(content: Content) -> some View {
        content
            // One importer; iOS lets you pick folders only when the picker asks for folders alone.
            .fileImporter(isPresented: Binding(get: { coordinator.request == .files || coordinator.request == .folder },
                                               set: { if !$0 { coordinator.request = nil } }),
                          allowedContentTypes: coordinator.request == .folder ? [.folder] : [.audio],
                          allowsMultipleSelection: true) { result in
                coordinator.request = nil
                guard case .success(let urls) = result else { return }
                Task {
                    let added = await LocalLibrary.shared.importItems(urls)
                    player.show(added > 0 ? String(localized: "Добавлено на iPhone: \(added)") : String(localized: "Новых треков не найдено"))
                }
            }
            .sheet(isPresented: Binding(get: { coordinator.request == .link }, set: { if !$0 { coordinator.request = nil } })) {
                LinkImportView()
            }
            .fullScreenCover(isPresented: Binding(get: { coordinator.request == .browser }, set: { if !$0 { coordinator.request = nil } })) {
                BrowserView()
            }
    }
}

extension View {
    func addMusicPresenter() -> some View { modifier(AddMusicPresenter()) }
}
