import SwiftUI
import UniformTypeIdentifiers

/// "На iPhone": music files stored on the phone — import, browse by album, play without a server.
struct DeviceLibraryView: View {
    @Environment(PlayerStore.self) private var player
    @Environment(LibraryStore.self) private var library
    private var local: LocalLibrary { .shared }

    var body: some View {
        let songs = local.songs
        VStack(alignment: .leading, spacing: 18) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                addButton(String(localized: "Файлы"), "doc.badge.plus", .files)
                addButton(String(localized: "Папка"), "folder.badge.plus", .folder)
                addButton(String(localized: "По ссылке"), "link.badge.plus", .link)
                addButton(String(localized: "Браузер"), "safari", .browser)
            }
            if local.isImporting { HStack { ProgressView(); Text(String(localized: "Добавляю музыку…")).font(.caption).foregroundStyle(Theme.secondary) } }
            if songs.isEmpty {
                ContentUnavailableView {
                    Label(String(localized: "На \(Device.name) пока нет музыки"), systemImage: Device.icon)
                } description: {
                    Text(hint)
                }
            } else {
                Text(String(localized: "\(songs.count) треков · \(ByteCountFormatter.string(fromByteCount: Int64(local.totalSize), countStyle: .file))"))
                    .font(.caption).foregroundStyle(Theme.secondary)
                PlayButtons(songs: songs)
                DeviceAlbumGrid(albums: DeviceAlbum.group(songs))
            }
        }
    }

    /// Where the files can come from differs per platform: on a Mac the folder is right there in Finder.
    private var hint: String {
        #if targetEnvironment(macCatalyst)
        String(localized: "Добавь файлы или папку кнопками выше, скачай по ссылке или через браузер, или положи файлы в папку Nocturne Player → Music в Finder. Поддерживаются MP3, M4A, AAC, ALAC, FLAC, WAV.")
        #else
        String(localized: "Добавь файлы или папку кнопками выше, скачай по ссылке или через браузер, отправь через «Поделиться → Nocturne Player» из любого приложения или скопируй с Mac в Finder: \(Device.name) → Файлы → Nocturne Player → Music. Поддерживаются MP3, M4A, AAC, ALAC, FLAC, WAV.")
        #endif
    }

    private func addButton(_ title: String, _ icon: String, _ source: AddMusicCoordinator.Source) -> some View {
        Button { AddMusicCoordinator.shared.request = source } label: {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(12)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius(12)))
        }.buttonStyle(.plain).disabled(local.isImporting)
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
                        Text(String(localized: "Показано то, что есть на \(Device.name) и в загрузках.")).font(.caption).foregroundStyle(Theme.secondary)
                    }
                    Spacer()
                    Button(String(localized: "Повторить")) { Task { await library.refresh() } }.font(.callout)
                }
                .padding(14).background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius(14)))
            }
            if songs.isEmpty {
                if !library.isOffline {
                    ContentUnavailableView {
                        Label(String(localized: "Добавь свою музыку"), systemImage: "music.note.house")
                    } description: {
                        Text(String(localized: "Нажми «+» вверху: файлы, папка, ссылка или браузер. Или подключи сервер Navidrome в настройках."))
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
