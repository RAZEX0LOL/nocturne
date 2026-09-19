import SwiftUI
import UniformTypeIdentifiers

/// "На iPhone": music files stored on the phone — import, browse by album, play without a server.
struct DeviceLibraryView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    private var local: LocalLibrary { .shared }
    @State private var importing = false

    var body: some View {
        let songs = local.songs
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Button { importing = true } label: {
                    Label(String(localized: "Добавить из «Файлов»"), systemImage: "folder.badge.plus").fontWeight(.semibold)
                        .frame(maxWidth: .infinity).padding(14)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                }.buttonStyle(.plain).disabled(local.isImporting)
                if local.isImporting { ProgressView() }
            }
            if songs.isEmpty {
                ContentUnavailableView {
                    Label(String(localized: "На iPhone пока нет музыки"), systemImage: "iphone")
                } description: {
                    Text(String(localized: "Добавь файлы кнопкой выше, через «Поделиться → Nocturne» из любого приложения или скопируй их с Mac в Finder: iPhone → Файлы → Nocturne → Music. Поддерживаются MP3, M4A, AAC, ALAC, FLAC, WAV."))
                }
            } else {
                Text(String(localized: "\(songs.count) треков · \(ByteCountFormatter.string(fromByteCount: Int64(local.totalSize), countStyle: .file))"))
                    .font(.caption).foregroundStyle(Theme.secondary)
                PlayButtons(songs: songs)
                DeviceAlbumGrid(albums: DeviceAlbum.group(songs))
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio, .folder], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task {
                let added = await local.importItems(urls)
                player.show(added > 0 ? String(localized: "Добавлено на iPhone: \(added)") : String(localized: "Новых треков не найдено"))
            }
        }
    }
}

struct DeviceAlbumGrid: View {
    let albums: [DeviceAlbum]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 230), spacing: 16)], spacing: 22) {
            ForEach(albums) { album in
                NavigationLink { DeviceAlbumView(album: album) } label: {
                    VStack(alignment: .leading, spacing: 7) {
                        Color.clear.aspectRatio(1, contentMode: .fit)
                            .overlay { GeometryReader { proxy in Cover(id: album.coverArt, size: proxy.size.width) } }
                        Text(album.title).font(.subheadline.weight(.medium)).foregroundStyle(Theme.primary).lineLimit(1)
                        Text(album.artist ?? String(localized: "Неизвестный исполнитель")).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                    }
                }.buttonStyle(.plain)
            }
        }
    }
}

struct DeviceAlbumView: View {
    let album: DeviceAlbum
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Cover(id: album.coverArt, size: 240).padding(.top, 12)
                VStack(spacing: 6) {
                    Text(album.title).font(.title2.bold()).multilineTextAlignment(.center)
                    if let artist = album.artist { Text(artist).foregroundStyle(Theme.accent) }
                    Text(String(localized: "Треков: \(album.songs.count)")).font(.caption).foregroundStyle(Theme.secondary)
                }
                PlayButtons(songs: album.songs)
                LazyVStack(spacing: 12) {
                    ForEach(Array(album.songs.enumerated()), id: \.offset) { index, song in
                        SongRow(song: song) { player.play(album.songs, at: index, client: library.client) }
                    }
                }
            }.padding(24)
        }.background(Theme.background).navigationBarTitleDisplayMode(.inline)
    }
}

/// Home screen block when there is no server connection (offline) or no server at all (on-device mode).
struct OnDeviceHomeSection: View {
    @Environment(LibraryStore.self) private var library
    @Environment(DownloadStore.self) private var downloads
    @Environment(PlayerStore.self) private var player
    private var local: LocalLibrary { .shared }

    var body: some View {
        let songs = local.songs + downloads.songs
        VStack(alignment: .leading, spacing: 18) {
            if library.isOffline {
                HStack(spacing: 10) {
                    Image(systemName: "wifi.slash").foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "Нет связи с сервером")).font(.subheadline.weight(.semibold))
                        Text(String(localized: "Показано то, что есть на iPhone и в загрузках.")).font(.caption).foregroundStyle(Theme.secondary)
                    }
                    Spacer()
                    Button(String(localized: "Повторить")) { Task { await library.refresh() } }.font(.callout)
                }
                .padding(14).background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            }
            if songs.isEmpty {
                if !library.isOffline {
                    ContentUnavailableView {
                        Label(String(localized: "Добавь свою музыку"), systemImage: "music.note.house")
                    } description: {
                        Text(String(localized: "Медиатека → На iPhone → «Добавить из «Файлов»». Или подключи сервер Navidrome в настройках."))
                    }
                }
            } else {
                HStack {
                    Text(library.isOffline ? String(localized: "Доступно без сети") : String(localized: "Моя музыка")).font(.title2.bold())
                    Spacer()
                    PlayAllButton(songs: songs)
                }
                DeviceAlbumGrid(albums: DeviceAlbum.group(songs))
            }
        }
    }
}

private struct PlayAllButton: View {
    let songs: [Song]
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    var body: some View {
        Button { player.play(songs, at: songs.indices.randomElement() ?? 0, shuffle: true, client: library.client) } label: {
            Image(systemName: "shuffle").padding(10).background(Theme.surface, in: Circle())
        }.accessibilityLabel(String(localized: "Перемешать всё"))
    }
}
