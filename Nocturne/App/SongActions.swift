import SwiftUI

/// Menu items shared by song rows, album headers and the player: queueing, favourites, playlists.
struct SongActions: View {
    let songs: [Song]
    @Binding var addToPlaylist: Bool
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(DownloadStore.self) private var downloads

    var body: some View {
        Button { player.playNext(songs, client: library.client) } label: { Label("Играть следующим", systemImage: "text.line.first.and.arrowtriangle.forward") }
        Button { player.addToQueue(songs, client: library.client) } label: { Label("В конец очереди", systemImage: "text.append") }
        if songs.count == 1, let song = songs.first {
            let starred = library.isStarred(song)
            Button {
                Task {
                    do { try await library.setStarred(song, !starred); player.show(starred ? "Убрано из любимых" : "Добавлено в любимые") }
                    catch { player.error = LibraryStore.message(error) }
                }
            } label: { Label(starred ? "Убрать из любимых" : "В любимые", systemImage: starred ? "heart.slash" : "heart") }
        }
        Button { addToPlaylist = true } label: { Label("Добавить в плейлист…", systemImage: "music.note.list") }
        if library.client != nil {
            let missing = songs.filter { !downloads.isDownloaded($0) }
            if !missing.isEmpty {
                Button { downloads.download(missing); player.show(missing.count == 1 ? "Загрузка началась" : "Загружается треков: \(missing.count)") } label: {
                    Label(songs.count == 1 ? "Скачать" : "Скачать все", systemImage: "arrow.down.circle")
                }
            }
            if missing.count < songs.count {
                Button(role: .destructive) { downloads.remove(songs) } label: {
                    Label(songs.count == 1 ? "Удалить загрузку" : "Удалить загрузки", systemImage: "trash")
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
                Button { creating = true } label: { Label("Новый плейлист", systemImage: "plus") }
                ForEach(library.playlists) { playlist in
                    Button {
                        run("Добавлено в «\(playlist.name)»") { try await library.add(songs, to: playlist) }
                    } label: {
                        HStack(spacing: 12) {
                            Cover(id: playlist.coverArt, size: 44)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(playlist.name).foregroundStyle(Theme.primary)
                                Text("Треков: \(playlist.songCount ?? 0)").font(.caption).foregroundStyle(Theme.secondary)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden).background(Theme.background)
            .disabled(busy)
            .navigationTitle("В плейлист").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Отмена") { dismiss() } } }
            .alert("Новый плейлист", isPresented: $creating) {
                TextField("Название", text: $name)
                Button("Создать") {
                    let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !title.isEmpty else { return }
                    run("Плейлист «\(title)» создан") { try await library.createPlaylist(name: title, songs: songs) }
                }
                Button("Отмена", role: .cancel) {}
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
