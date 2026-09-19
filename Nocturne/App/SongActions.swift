import SwiftUI

/// Menu items shared by song rows, album headers and the player: queueing, favourites, playlists.
struct SongActions: View {
    let songs: [Song]
    @Binding var addToPlaylist: Bool
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(DownloadStore.self) private var downloads

    var body: some View {
        Button { player.playNext(songs, client: library.client) } label: { Label(String(localized: "Играть следующим"), systemImage: "text.line.first.and.arrowtriangle.forward") }
        Button { player.addToQueue(songs, client: library.client) } label: { Label(String(localized: "В конец очереди"), systemImage: "text.append") }
        if songs.count == 1, let song = songs.first, let client = library.client {
            Button {
                Task {
                    do {
                        let similar = try await client.similarSongs(to: song.id).filter { $0.id != song.id }
                        guard !similar.isEmpty else {
                            player.show(String(localized: "Похожих треков нет — нужен Last.fm в Navidrome")); return
                        }
                        player.play([song] + similar, shuffle: false, client: client)
                        player.show(String(localized: "Микс: \(similar.count + 1) треков"))
                    } catch { player.error = LibraryStore.message(error) }
                }
            } label: { Label(String(localized: "Микс по треку"), systemImage: "dot.radiowaves.left.and.right") }
            Menu {
                ForEach(0...5, id: \.self) { stars in
                    Button {
                        Task {
                            do { try await client.setRating(songID: song.id, rating: stars); player.show(stars == 0 ? String(localized: "Оценка снята") : String(localized: "Оценка: \(stars) из 5")) }
                            catch { player.error = LibraryStore.message(error) }
                        }
                    } label: {
                        if stars == (song.userRating ?? 0) { Label(stars == 0 ? String(localized: "Без оценки") : String(repeating: "★", count: stars), systemImage: "checkmark") }
                        else { Text(stars == 0 ? String(localized: "Без оценки") : String(repeating: "★", count: stars)) }
                    }
                }
            } label: { Label(String(localized: "Оценка"), systemImage: "star") }
            Button {
                Task {
                    do {
                        guard let url = try await client.createShare(songID: song.id) else { throw MusicError.invalidResponse }
                        ShareSheet.present([url])
                    } catch {
                        player.error = String(localized: "Не удалось создать ссылку. Проверь, что в Navidrome включён общий доступ (EnableSharing).")
                    }
                }
            } label: { Label(String(localized: "Поделиться"), systemImage: "square.and.arrow.up") }
        }
        if songs.count == 1, let song = songs.first {
            let starred = library.isStarred(song)
            Button {
                Task {
                    do { try await library.setStarred(song, !starred); player.show(starred ? String(localized: "Убрано из любимых") : String(localized: "Добавлено в любимые")) }
                    catch { player.error = LibraryStore.message(error) }
                }
            } label: { Label(starred ? String(localized: "Убрать из любимых") : String(localized: "В любимые"), systemImage: starred ? "heart.slash" : "heart") }
        }
        Button { addToPlaylist = true } label: { Label(String(localized: "Добавить в плейлист…"), systemImage: "music.note.list") }
        if library.client != nil {
            let missing = songs.filter { !downloads.isDownloaded($0) }
            if !missing.isEmpty {
                Button { downloads.download(missing); player.show(missing.count == 1 ? String(localized: "Загрузка началась") : String(localized: "Загружается треков: \(missing.count)")) } label: {
                    Label(songs.count == 1 ? String(localized: "Скачать") : String(localized: "Скачать все"), systemImage: "arrow.down.circle")
                }
            }
            if missing.count < songs.count {
                Button(role: .destructive) { downloads.remove(songs) } label: {
                    Label(songs.count == 1 ? String(localized: "Удалить загрузку") : String(localized: "Удалить загрузки"), systemImage: "trash")
                }
            }
        }
    }
}

/// Picks an existing playlist or creates a new one for the given songs.
struct PlaylistPicker: View {
    let songs: [Song]
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    @State private var creating = false
    @State private var name = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            List {
                Button { creating = true } label: { Label(String(localized: "Новый плейлист"), systemImage: "plus") }
                ForEach(library.playlists) { playlist in
                    Button {
                        run(String(localized: "Добавлено в «\(playlist.name)»")) { try await library.add(songs, to: playlist) }
                    } label: {
                        HStack(spacing: 12) {
                            Cover(id: playlist.coverArt, size: 44)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(playlist.name).foregroundStyle(Theme.primary)
                                Text(String(localized: "Треков: \(playlist.songCount ?? 0)")).font(.caption).foregroundStyle(Theme.secondary)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden).background(Theme.background)
            .disabled(busy)
            .navigationTitle(String(localized: "В плейлист")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(String(localized: "Отмена")) { dismiss() } } }
            .alert(String(localized: "Новый плейлист"), isPresented: $creating) {
                TextField(String(localized: "Название"), text: $name)
                Button(String(localized: "Создать")) {
                    let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !title.isEmpty else { return }
                    run(String(localized: "Плейлист «\(title)» создан")) { try await library.createPlaylist(name: title, songs: songs) }
                }
                Button(String(localized: "Отмена"), role: .cancel) {}
            }
            .task { await library.reloadPlaylists() }
        }
        .presentationDetents([.medium, .large])
    }

    private func run(_ success: String, _ action: @escaping () async throws -> Void) {
        busy = true
        Task {
            do { try await action(); player.show(success); dismiss() }
            catch { player.error = LibraryStore.message(error) }
            busy = false
        }
    }
}

extension View {
    /// Long-press menu with song actions plus the playlist sheet it may open.
    func songActions(_ songs: [Song]) -> some View { modifier(SongActionsModifier(songs: songs)) }
}

private struct SongActionsModifier: ViewModifier {
    let songs: [Song]
    @State private var addToPlaylist = false
    func body(content: Content) -> some View {
        content
            .contextMenu { SongActions(songs: songs, addToPlaylist: $addToPlaylist) }
            .sheet(isPresented: $addToPlaylist) { PlaylistPicker(songs: songs) }
    }
}

struct Toast: View {
    let text: String
    var body: some View {
        Text(text).font(.subheadline.weight(.medium)).foregroundStyle(Theme.primary)
            .padding(.horizontal, 18).padding(.vertical, 11)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Theme.primary.opacity(0.1)))
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityAddTraits(.isStaticText)
    }
}

/// Presents the system share sheet from the top-most view controller.
@MainActor enum ShareSheet {
    static func present(_ items: [Any]) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              var top = scene.keyWindow?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.popoverPresentationController?.sourceView = top.view
        top.present(controller, animated: true)
    }
}
