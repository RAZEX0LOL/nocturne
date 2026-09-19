import SwiftUI

struct HomeView: View {
    @Binding var settings: Bool
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    var body: some View {
        GeometryReader { geometry in
            // Two columns on iPhone, more on iPad; tiles stay around 160–220 pt.
            let columns = max(2, Int((geometry.size.width - 48) / 210))
            let width = max(1, (geometry.size.width - 48 - CGFloat(columns - 1) * 12) / CGFloat(columns))
            let carouselWidth = min(max(1, (geometry.size.width - 64) / 2.4), 190)
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if library.isDemo {
                        Button { settings = true } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "sparkles")
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(String(localized: "Твоя музыка будет здесь")).font(.subheadline.weight(.medium))
                                    Text(String(localized: "Демоверсия · Подключить Navidrome")).font(.caption).foregroundStyle(Theme.secondary)
                                }
                                Spacer(); Image(systemName: "arrow.up.right")
                            }.padding(16).background(Theme.surface, in: RoundedRectangle(cornerRadius: 17))
                        }.buttonStyle(.plain)
                    }
                    if library.isOffline || library.onDeviceOnly { OnDeviceHomeSection() }
                    if library.isLoading && library.albums.isEmpty && !library.isOffline { ProgressView().frame(maxWidth: .infinity).padding(40) }
                    if let error = library.error, !library.isOffline {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(error).foregroundStyle(Theme.secondary)
                            Button(String(localized: "Повторить")) { Task { await library.refresh() } }
                        }
                    }
                    ForEach(Appearance.shared.visibleHome) { section in
                        homeSection(section, width: width, columns: columns, carouselWidth: carouselWidth)
                    }
                    if library.albums.isEmpty && !library.isLoading && library.error == nil && library.client != nil && !library.isOffline {
                        ContentUnavailableView(String(localized: "Здесь пока тихо"), systemImage: "music.note", description: Text(String(localized: "Добавь музыку в Navidrome и обнови медиатеку.")))
                    }
                }.padding(24)
            }.refreshable { await library.refresh() }
                .background(Theme.background)
                .navigationTitle(String(localized: "Главная"))
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { AddMusicMenu() }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { settings = true } label: { Image(systemName: "gearshape").foregroundStyle(Theme.primary) }.accessibilityLabel(String(localized: "Настройки"))
                    }
                }
                .navigationDestination(for: Album.self) { AlbumDetailView(album: $0) }
        }.background(Theme.background)
    }
}

extension HomeView {
    @ViewBuilder func homeSection(_ section: Appearance.HomeSection, width: CGFloat, columns: Int, carouselWidth: CGFloat) -> some View {
        switch section {
        case .recentlyPlayed: AlbumCarousel(title: section.title, albums: library.recentlyPlayed, width: carouselWidth)
        case .frequent: AlbumCarousel(title: section.title, albums: library.frequent, width: carouselWidth)
        case .favoriteAlbums: AlbumCarousel(title: section.title, albums: library.favorites, width: carouselWidth)
        case .discover: AlbumCarousel(title: section.title, albums: library.discover, width: carouselWidth)
        case .recentlyAdded:
            if !library.albums.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text(section.title).font(.title2.bold())
                        Spacer()
                        NavigationLink { AlbumListPage(title: String(localized: "Все альбомы"), type: "newest") } label: {
                            Image(systemName: "chevron.right").foregroundStyle(Theme.secondary)
                        }.accessibilityLabel(String(localized: "Все альбомы"))
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: columns), spacing: 24) {
                        ForEach(library.albums.prefix(columns == 2 ? 6 : columns * 2)) { album in
                            NavigationLink(value: album) { AlbumTile(album: album, width: width) }.buttonStyle(.plain)
                        }
                    }
                }
            }
        case .starredSongs:
            if !library.starredSongs.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(section.title).font(.title2.bold())
                        Spacer()
                        NavigationLink { StarredSongsView() } label: { Text(String(localized: "Все")).foregroundStyle(Theme.accent) }
                    }
                    let songs = library.starredSongs
                    ForEach(Array(songs.prefix(4).enumerated()), id: \.offset) { index, song in
                        SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                    }
                }
            }
        }
    }
}

struct AlbumCarousel: View {
    let title: String
    let albums: [Album]
    let width: CGFloat
    var body: some View {
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                Text(title).font(.title2.bold())
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 16) {
                        ForEach(albums) { album in
                            NavigationLink(value: album) { AlbumTile(album: album, width: width) }.buttonStyle(.plain)
                        }
                    }
                }.scrollClipDisabled()
            }
        }
    }
}

struct LibraryView: View {
    enum Category: String, CaseIterable { case albums = "Альбомы", artists = "Артисты", playlists = "Плейлисты", songs = "Любимое", downloads = "Загрузки", device = "На iPhone", radio = "Радио", genres = "Жанры" }
    /// Tabs that make sense right now: without a server only the phone's own music.
    private var categories: [Category] {
        if library.client == nil && !library.isDemo { return [.device] }
        if library.isOffline { return [.downloads, .device, .songs, .playlists] }
        return Category.allCases
    }
    private var current: Category { categories.contains(category) ? category : categories[0] }
    enum AlbumSort: String, CaseIterable {
        case newest, alphabeticalByName, alphabeticalByArtist, recent, frequent, random
        var title: String {
            switch self {
            case .newest: String(localized: "Недавно добавленные")
            case .alphabeticalByName: String(localized: "По названию")
            case .alphabeticalByArtist: String(localized: "По исполнителю")
            case .recent: String(localized: "Недавно прослушанные")
            case .frequent: String(localized: "Часто прослушиваемые")
            case .random: String(localized: "Случайные")
            }
        }
    }
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @AppStorage("library.category") private var category = Category.albums
    @AppStorage("library.albumSort") private var sort = AlbumSort.newest
    @State private var creatingPlaylist = false
    @State private var playlistName = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(categories, id: \.self) { item in
                            Button { category = item } label: {
                                Text(LocalizedStringKey(item.rawValue)).font(.subheadline.weight(.medium)).padding(.horizontal, 14).padding(.vertical, 8)
                                    .background(current == item ? Theme.accent : Theme.surface, in: Capsule())
                                    .foregroundStyle(current == item ? Theme.onAccent : Theme.primary)
                            }.buttonStyle(.plain).accessibilityAddTraits(current == item ? .isSelected : [])
                        }
                    }
                }.scrollClipDisabled()
                switch current {
                case .device: DeviceLibraryView()
                case .albums: AlbumBrowser(type: sort.rawValue).id(sort)
                case .artists: artists
                case .playlists: playlists
                case .songs: favoriteSongs
                case .downloads: DownloadsList()
                case .radio: RadioStationsView()
                case .genres: GenresView()
                }
                if let error = library.error, !library.isOffline { Text(error).foregroundStyle(Theme.secondary) }
            }.padding(24)
        }.background(Theme.background).navigationTitle(String(localized: "Медиатека"))
            .refreshable { await library.refresh() }
            .navigationDestination(for: Album.self) { AlbumDetailView(album: $0) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { AddMusicMenu() }
                if current == .albums {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker(String(localized: "Сортировка"), selection: $sort) { ForEach(AlbumSort.allCases, id: \.self) { Text($0.title).tag($0) } }
                            Toggle(String(localized: "Сеткой"), systemImage: "square.grid.2x2", isOn: Binding(get: { Appearance.shared.libraryGrid }, set: { Appearance.shared.libraryGrid = $0 }))
                        } label: { Image(systemName: "arrow.up.arrow.down") }.accessibilityLabel(String(localized: "Сортировка альбомов"))
                    }
                }
                if current == .playlists && library.isConnected {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { playlistName = ""; creatingPlaylist = true } label: { Image(systemName: "plus") }.accessibilityLabel(String(localized: "Новый плейлист"))
                    }
                }
            }
            .alert(String(localized: "Новый плейлист"), isPresented: $creatingPlaylist) {
                TextField(String(localized: "Название"), text: $playlistName)
                Button(String(localized: "Создать")) {
                    let name = playlistName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    Task {
                        do { try await library.createPlaylist(name: name, songs: []); player.show(String(localized: "Плейлист «\(name)» создан")) }
                        catch { player.error = LibraryStore.message(error) }
                    }
                }
                Button(String(localized: "Отмена"), role: .cancel) {}
            }
    }

    /// Artists grouped by first letter; digits and symbols go under "#".
    @ViewBuilder private var artists: some View {
        let groups = Dictionary(grouping: library.artists) { artist -> String in
            guard let first = artist.name.first, first.isLetter else { return "#" }
            return String(first).uppercased()
        }
        let letters = groups.keys.sorted { lhs, rhs in lhs == "#" ? false : rhs == "#" ? true : lhs.localizedStandardCompare(rhs) == .orderedAscending }
        LazyVStack(alignment: .leading, spacing: 6, pinnedViews: [.sectionHeaders]) {
            ForEach(letters, id: \.self) { letter in
                Section {
                    ForEach(groups[letter] ?? []) { artist in
                        NavigationLink { ArtistDetailView(artist: artist) } label: {
                            HStack(spacing: 14) {
                                Cover(id: artist.coverArt, size: 56).clipShape(Circle())
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(artist.name).foregroundStyle(Theme.primary)
                                    Text(String(localized: "Альбомов: \(artist.albumCount ?? 0)")).font(.caption).foregroundStyle(Theme.secondary)
                                }
                                Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.secondary)
                            }.padding(.vertical, 4)
                        }.buttonStyle(.plain)
                    }
                } header: {
                    Text(letter).font(.headline).foregroundStyle(Theme.accent)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6).background(Theme.background)
                }
            }
        }
    }

    @ViewBuilder private var playlists: some View {
        if library.playlists.isEmpty {
            ContentUnavailableView(String(localized: "Плейлистов пока нет"), systemImage: "music.note.list", description: Text(String(localized: "Создай плейлист кнопкой «+» или через меню трека.")))
        }
        ForEach(library.playlists) { playlist in
            NavigationLink { PlaylistDetailView(playlist: playlist) } label: {
                HStack(spacing: 14) {
                    Cover(id: playlist.coverArt, size: 64)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(playlist.name).foregroundStyle(Theme.primary)
                        Text(String(localized: "Треков: \(playlist.songCount ?? 0)")).font(.caption).foregroundStyle(Theme.secondary)
                    }
                    Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.secondary)
                }
            }.buttonStyle(.plain)
        }
    }

    @ViewBuilder private var favoriteSongs: some View {
        let songs = library.starredSongs
        if songs.isEmpty {
            ContentUnavailableView(String(localized: "Любимых треков нет"), systemImage: "heart", description: Text(String(localized: "Отмечай треки сердцем в плеере или через долгое нажатие.")))
        } else {
            PlayButtons(songs: songs)
            LazyVStack(spacing: 12) {
                ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                    SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                }
            }
        }
    }
}

struct RadioStationsView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @State private var stations: [RadioStation] = []
    @State private var loading = true
    var body: some View {
        LazyVStack(alignment: .leading, spacing: 4) {
            if loading { ProgressView().frame(maxWidth: .infinity).padding() }
            else if stations.isEmpty {
                ContentUnavailableView(String(localized: "Радиостанций нет"), systemImage: "antenna.radiowaves.left.and.right",
                                       description: Text(String(localized: "Добавь станции в Navidrome: Настройки → Интернет-радио.")))
            }
            ForEach(stations) { station in
                Button { player.playRadio(station, client: library.client) } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "antenna.radiowaves.left.and.right").font(.title3).frame(width: 48, height: 48)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(station.name).foregroundStyle(Theme.primary)
                            Text(URL(string: station.streamUrl)?.host() ?? "").font(.caption).foregroundStyle(Theme.secondary)
                        }
                        Spacer()
                        if player.current?.id == "radio-\(station.id)" { Image(systemName: "waveform").foregroundStyle(Theme.accent) }
                    }.padding(.vertical, 6).contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
        }
        .task {
            defer { loading = false }
            stations = (try? await library.client?.radioStations()) ?? []
        }
    }
}

/// Songs available offline; works without a connection.
struct DownloadsList: View {
    @Environment(DownloadStore.self) private var downloads
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    var body: some View {
        let songs = downloads.songs
        if songs.isEmpty {
            ContentUnavailableView(String(localized: "Загрузок нет"), systemImage: "arrow.down.circle",
                                   description: Text(String(localized: "Долгое нажатие на трек или меню альбома → «Скачать». Скачанное играет без сети.")))
        } else {
            Text(String(localized: "\(songs.count) треков · \(ByteCountFormatter.string(fromByteCount: Int64(downloads.totalSize), countStyle: .file))"))
                .font(.caption).foregroundStyle(Theme.secondary)
            PlayButtons(songs: songs)
            LazyVStack(spacing: 12) {
                ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                    SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                }
            }
        }
    }
}

/// "Слушать" + "Перемешать" for any list of songs.
struct PlayButtons: View {
    let songs: [Song]
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    var body: some View {
        HStack(spacing: 14) {
            Button { player.play(songs, shuffle: false, client: library.client) } label: {
                Label(String(localized: "Слушать"), systemImage: "play.fill").fontWeight(.semibold).frame(maxWidth: .infinity).padding(16)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 15)).foregroundStyle(Theme.onAccent)
            }
            Button { player.play(songs, at: songs.indices.randomElement() ?? 0, shuffle: true, client: library.client) } label: {
                Image(systemName: "shuffle").frame(width: 52, height: 52).background(Theme.surface, in: RoundedRectangle(cornerRadius: 15))
            }.accessibilityLabel(String(localized: "Перемешать"))
        }.disabled(songs.isEmpty)
    }
}

/// Server-side sorted album list that loads the next page when the last row appears.
struct AlbumBrowser: View {
    let type: String
    var genre: String?
    @Environment(LibraryStore.self) private var library
    @State private var albums: [Album] = []
    @State private var hasMore = true
    @State private var loading = false
    @State private var error: String?
    private let pageSize = 40

    var body: some View {
        Group {
            if Appearance.shared.libraryGrid {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 230), spacing: 16)], spacing: 22) {
                    ForEach(albums) { album in
                        NavigationLink(value: album) { AlbumGridTile(album: album) }.buttonStyle(.plain)
                            .onAppear { if album.id == albums.last?.id { Task { await loadMore() } } }
                    }
                }
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(albums) { album in
                        AlbumRow(album: album).onAppear { if album.id == albums.last?.id { Task { await loadMore() } } }
                    }
                }
            }
        }
        LazyVStack(spacing: 16) {
            if loading { ProgressView().padding() }
            if let error {
                Text(error).foregroundStyle(Theme.secondary)
                Button(String(localized: "Повторить")) { Task { await loadMore() } }
            }
            if !loading && error == nil && !hasMore && albums.isEmpty {
                ContentUnavailableView(String(localized: "Альбомов нет"), systemImage: "square.stack")
            }
        }
        .task { if albums.isEmpty { await loadMore() } }
    }

    private func loadMore() async {
        guard hasMore, !loading else { return }
        if library.isDemo { albums = DemoLibrary.albums; hasMore = false; return }
        guard let client = library.client else { hasMore = false; return }
        loading = true; error = nil
        defer { loading = false }
        var parameters = ["type": type, "size": String(pageSize), "offset": String(albums.count)]
        if let genre { parameters["genre"] = genre }
        do {
            let page = try await client.request("getAlbumList2", parameters: parameters).albumList2?.album ?? []
            let known = Set(albums.map(\.id))
            albums += page.filter { !known.contains($0.id) }
            // "random" returns a new sample on every call, so paging it would never end.
            hasMore = page.count == pageSize && type != "random"
        } catch { self.error = LibraryStore.message(error) }
    }
}

struct AlbumListPage: View {
    let title: String
    let type: String
    var genre: String?
    var body: some View {
        ScrollView { AlbumBrowser(type: type, genre: genre).padding(24) }
            .background(Theme.background).navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}

struct GenresView: View {
    @Environment(LibraryStore.self) private var library
    @State private var genres: [Genre] = []
    @State private var loading = true
    var body: some View {
        LazyVStack(alignment: .leading, spacing: 4) {
            if loading { ProgressView().frame(maxWidth: .infinity).padding() }
            else if genres.isEmpty { ContentUnavailableView(String(localized: "Жанров нет"), systemImage: "guitars", description: Text(String(localized: "Жанры берутся из тегов файлов."))) }
            ForEach(genres) { genre in
                NavigationLink { AlbumListPage(title: genre.value, type: "byGenre", genre: genre.value) } label: {
                    HStack {
                        Text(genre.value).foregroundStyle(Theme.primary)
                        Spacer()
                        Text("\(genre.albumCount ?? 0)").font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.secondary)
                    }.padding(.vertical, 12)
                }.buttonStyle(.plain)
                Divider().overlay(Theme.surface)
            }
        }
        .task {
            defer { loading = false }
            genres = (try? await library.client?.genres()) ?? []
        }
    }
}

struct StarredSongsView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    var body: some View {
        let songs = library.starredSongs
        ScrollView {
            VStack(spacing: 18) {
                PlayButtons(songs: songs)
                LazyVStack(spacing: 12) {
                    ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                        SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                    }
                }
            }.padding(24)
        }.background(Theme.background).navigationTitle(String(localized: "Любимые треки")).navigationBarTitleDisplayMode(.inline)
    }
}

/// Grid cell that sizes its cover to the column width.
struct AlbumGridTile: View {
    let album: Album
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Color.clear.aspectRatio(1, contentMode: .fit)
                .overlay { GeometryReader { proxy in Cover(id: album.coverArt, size: proxy.size.width) } }
            Text(album.name).font(.subheadline.weight(.medium)).foregroundStyle(Theme.primary).lineLimit(1)
            Text(album.artist ?? String(localized: "Неизвестный исполнитель")).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
        }
    }
}

struct AlbumRow: View {
    let album: Album
    var body: some View {
        NavigationLink(value: album) {
            HStack(spacing: 14) {
                Cover(id: album.coverArt, size: 70)
                VStack(alignment: .leading, spacing: 5) {
                    Text(album.name).font(.body.weight(.medium)).foregroundStyle(Theme.primary).lineLimit(1)
                    Text(album.artist ?? String(localized: "Неизвестный исполнитель")).font(.subheadline).foregroundStyle(Theme.secondary).lineLimit(1)
                    Text([album.year.map(String.init), album.songCount.map { String(localized: "Треков: \($0)") }].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.secondary)
            }.padding(.vertical, 4)
        }.buttonStyle(.plain)
    }
}

struct AlbumDetailView: View {
    let album: Album
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @State private var songs: [Song] = []
    @State private var loading = true
    @State private var error: String?
    @State private var starred = false
    @State private var saving = false
    @State private var addToPlaylist = false
    @State private var notes: String?
    @State private var notesExpanded = false
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Cover(id: album.coverArt, size: 260).shadow(color: Theme.accent.opacity(0.1), radius: 35, y: 10).padding(.top, 18)
                VStack(spacing: 8) {
                    Text(album.name).font(.title2.bold()).multilineTextAlignment(.center)
                    Text(album.artist ?? String(localized: "Неизвестный исполнитель")).foregroundStyle(Theme.accent)
                    Text([album.year.map(String.init), album.songCount.map { String(localized: "Треков: \($0)") }].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                PlayButtons(songs: songs)
                if let notes, !notes.isEmpty {
                    Text(notes).font(.callout).foregroundStyle(Theme.secondary).lineLimit(notesExpanded ? nil : 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .onTapGesture { withAnimation { notesExpanded.toggle() } }
                        .accessibilityHint(notesExpanded ? String(localized: "Свернуть описание") : String(localized: "Показать описание полностью"))
                }
                if loading { ProgressView() }
                if let error {
                    Text(error).foregroundStyle(Theme.secondary)
                    Button(String(localized: "Повторить")) { Task { await load() } }
                }
                LazyVStack(spacing: 12) {
                    ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                        SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                    }
                }
            }.padding(24)
        }.background(Theme.background).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        guard let client = library.client else { player.error = MusicError.demo.localizedDescription; return }
                        saving = true
                        Task {
                            do {
                                _ = try await client.request(starred ? "unstar" : "star", parameters: ["albumId": album.id])
                                starred.toggle(); await library.refresh()
                            } catch { self.error = LibraryStore.message(error) }
                            saving = false
                        }
                    } label: { Image(systemName: starred ? "heart.fill" : "heart") }
                        .disabled(saving).accessibilityLabel(starred ? String(localized: "Убрать из избранного") : String(localized: "В избранное"))
                    Menu { SongActions(songs: songs, addToPlaylist: $addToPlaylist) } label: { Image(systemName: "ellipsis") }
                        .disabled(songs.isEmpty || library.client == nil).accessibilityLabel(String(localized: "Действия с альбомом"))
                }
            }
            .sheet(isPresented: $addToPlaylist) { PlaylistPicker(songs: songs) }
            .task { starred = album.starred != nil; await load() }
    }
    private func load() async {
        loading = true; error = nil
        defer { loading = false }
        if library.isDemo { songs = DemoLibrary.songs(for: album); return }
        if let cached = library.albumSongs[album.id] { songs = cached }
        if library.isOffline {
            if songs.isEmpty { self.error = String(localized: "Альбом не открывался раньше — треклист появится, когда будет связь с сервером.") }
            return
        }
        do {
            songs = try await library.client?.songs(albumID: album.id) ?? []
            library.cacheSongs(songs, albumID: album.id)
        } catch where !songs.isEmpty {
            // Keep the cached list when the server can't be reached.
        } catch { self.error = LibraryStore.message(error) }
        if let info = try? await library.client?.albumInfo(id: album.id) { notes = info.notes.map(stripHTML) }
    }
}

/// Last.fm texts come with HTML links and entities; show them as plain text.
func stripHTML(_ text: String) -> String {
    text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        .replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&quot;", with: "\"")
        .replacingOccurrences(of: "&#39;", with: "'").trimmingCharacters(in: .whitespacesAndNewlines)
}

struct ArtistDetailView: View {
    let artist: Artist
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @State private var albums: [Album] = []
    @State private var topSongs: [Song] = []
    @State private var biography: String?
    @State private var imageURL: URL?
    @State private var bioExpanded = false
    @State private var error: String?
    @State private var loading = true
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(spacing: 12) {
                    Group {
                        if let imageURL {
                            AsyncImage(url: imageURL) { image in image.resizable().scaledToFill() } placeholder: { Cover(id: artist.coverArt, size: 180) }
                        } else { Cover(id: artist.coverArt, size: 180) }
                    }.frame(width: 180, height: 180).clipShape(Circle())
                    Text(artist.name).font(.title.bold()).multilineTextAlignment(.center)
                    Text(String(localized: "Альбомов: \(albums.isEmpty ? artist.albumCount ?? 0 : albums.count)")).font(.caption).foregroundStyle(Theme.secondary)
                }.frame(maxWidth: .infinity)
                if loading { ProgressView().frame(maxWidth: .infinity) }
                if let error { Text(error).foregroundStyle(Theme.secondary) }
                if let biography, !biography.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(String(localized: "Об исполнителе")).font(.title2.bold())
                        Text(biography).font(.callout).foregroundStyle(Theme.secondary).lineLimit(bioExpanded ? nil : 4)
                        Button(bioExpanded ? String(localized: "Свернуть") : String(localized: "Читать полностью")) { withAnimation { bioExpanded.toggle() } }.font(.callout)
                    }
                }
                if !topSongs.isEmpty {
                    Text(String(localized: "Популярные треки")).font(.title2.bold())
                    PlayButtons(songs: topSongs)
                    ForEach(Array(topSongs.prefix(5).enumerated()), id: \.offset) { index, song in
                        SongRow(song: song) { player.play(topSongs, at: index, client: library.client) }
                    }
                }
                if !albums.isEmpty {
                    Text(String(localized: "Альбомы")).font(.title2.bold())
                    LazyVStack(spacing: 16) { ForEach(albums) { AlbumRow(album: $0) } }
                }
            }.padding(24)
        }.background(Theme.background).navigationBarTitleDisplayMode(.inline)
            .task {
                defer { loading = false }
                if library.isDemo { albums = library.albums.filter { $0.artist == artist.name }; return }
                guard let client = library.client else { return }
                // Top songs need Last.fm on the server; without it the section simply stays hidden.
                async let top = try? client.topSongs(artist: artist.name)
                async let info = try? client.artistInfo(id: artist.id)
                do { albums = try await client.request("getArtist", parameters: ["id": artist.id]).artist?.album ?? [] }
                catch { self.error = LibraryStore.message(error) }
                topSongs = await top ?? []
                if let details = await info ?? nil {
                    biography = details.biography.map(stripHTML)
                    // Only HTTPS images; Last.fm placeholders are skipped by Navidrome when there is no photo.
                    imageURL = details.largeImageUrl.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
                }
            }
    }
}

struct PlaylistDetailView: View {
    let playlist: MusicPlaylist
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(\.dismiss) private var dismiss
    @State private var songs: [Song] = []
    @State private var error: String?
    @State private var loading = true
    @State private var confirmDelete = false
    var body: some View {
        List {
            Section {
                VStack(spacing: 14) {
                    Cover(id: playlist.coverArt, size: 180)
                    Text(playlist.name).font(.title2.bold()).multilineTextAlignment(.center)
                    Text(String(localized: "Треков: \(songs.count)")).font(.caption).foregroundStyle(Theme.secondary)
                    PlayButtons(songs: songs)
                }.frame(maxWidth: .infinity).listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            if loading { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
            if let error { Text(error).foregroundStyle(Theme.secondary).listRowBackground(Color.clear) }
            ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            .onDelete { offsets in remove(offsets) }
        }
        .listStyle(.plain).scrollContentBackground(.hidden).background(Theme.background)
        .navigationTitle(playlist.name).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(String(localized: "Удалить плейлист"), systemImage: "trash", role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis") }.disabled(library.client == nil)
            }
        }
        .confirmationDialog(String(localized: "Удалить «\(playlist.name)»?"), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(String(localized: "Удалить"), role: .destructive) {
                Task {
                    do {
                        _ = try await library.client?.request("deletePlaylist", parameters: ["id": playlist.id])
                        await library.reloadPlaylists(); dismiss()
                    } catch { self.error = LibraryStore.message(error) }
                }
            }
        } message: { Text(String(localized: "Треки останутся в медиатеке.")) }
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        do { songs = try await library.client?.request("getPlaylist", parameters: ["id": playlist.id]).playlist?.entry ?? [] }
        catch { self.error = LibraryStore.message(error) }
    }

    private func remove(_ offsets: IndexSet) {
        guard let client = library.client else { return }
        songs.remove(atOffsets: offsets)
        Task {
            do {
                try await client.removeFromPlaylist(id: playlist.id, indexes: Array(offsets))
                await library.reloadPlaylists()
            } catch {
                self.error = LibraryStore.message(error)
                await load()
            }
        }
    }
}

struct SearchView: View {
    @Environment(LibraryStore.self) private var library
    @Environment(PlayerStore.self) private var player
    @Environment(DownloadStore.self) private var downloads
    @State private var query = ""
    @State private var result = SearchResult()
    @State private var loading = false
    @State private var error: String?
    @State private var filter = Filter.all
    @AppStorage("search.history") private var historyData = Data()
    enum Filter: String, CaseIterable { case all = "Всё", artists = "Исполнители", albums = "Альбомы", songs = "Треки" }

    private var history: [String] { (try? JSONDecoder().decode([String].self, from: historyData)) ?? [] }
    private func remember(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let list = [trimmed] + history.filter { $0.caseInsensitiveCompare(trimmed) != .orderedSame }
        historyData = (try? JSONEncoder().encode(Array(list.prefix(12)))) ?? Data()
    }
    private func show(_ kind: Filter) -> Bool { filter == .all || filter == kind }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    if history.isEmpty {
                        ContentUnavailableView(String(localized: "Найди своё звучание"), systemImage: "magnifyingglass", description: Text(String(localized: "Альбомы, исполнители и любимые треки.")))
                    } else {
                        HStack {
                            Text(String(localized: "Недавние запросы")).font(.title3.bold())
                            Spacer()
                            Button(String(localized: "Очистить")) { historyData = Data() }.font(.callout)
                        }
                        ForEach(history, id: \.self) { item in
                            Button { query = item } label: {
                                Label(item, systemImage: "clock.arrow.circlepath").foregroundStyle(Theme.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                            }.buttonStyle(.plain)
                        }
                    }
                } else if loading { ProgressView().frame(maxWidth: .infinity).padding(40) }
                else if let error { Text(error).foregroundStyle(Theme.secondary) }
                else if (result.album ?? []).isEmpty && (result.song ?? []).isEmpty && (result.artist ?? []).isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    Picker(String(localized: "Фильтр"), selection: $filter) { ForEach(Filter.allCases, id: \.self) { Text(LocalizedStringKey($0.rawValue)).tag($0) } }
                        .pickerStyle(.segmented)
                    if show(.artists), let artists = result.artist, !artists.isEmpty {
                        Text(String(localized: "Исполнители")).font(.title2.bold())
                        ForEach(artists) { artist in
                            NavigationLink { ArtistDetailView(artist: artist) } label: { Label(artist.name, systemImage: "person.crop.circle").padding(.vertical, 8) }
                        }
                    }
                    if show(.albums), let albums = result.album, !albums.isEmpty {
                        Text(String(localized: "Альбомы")).font(.title2.bold())
                        ForEach(albums) { AlbumRow(album: $0) }
                    }
                    if show(.songs), let songs = result.song, !songs.isEmpty {
                        Text(String(localized: "Треки")).font(.title2.bold())
                        ForEach(Array(songs.enumerated()), id: \.offset) { index, song in
                            SongRow(song: song) { player.play(songs, at: index, client: library.client) }
                        }
                    }
                }
            }.padding(24)
        }.background(Theme.background).navigationTitle(String(localized: "Поиск"))
            .searchable(text: $query, prompt: String(localized: "Поиск в медиатеке"))
            .onSubmit(of: .search) { remember(query) }
            .navigationDestination(for: Album.self) { AlbumDetailView(album: $0) }
            .task(id: query) {
                let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
                result = SearchResult(); error = nil
                guard !value.isEmpty else { loading = false; return }
                loading = true
                do {
                    try await Task.sleep(for: .milliseconds(300))
                    let next: SearchResult
                    if library.client == nil && !library.isDemo || library.isOffline {
                        let pool = LocalLibrary.shared.songs + downloads.songs
                        next = SearchResult(song: pool.filter { "\($0.title) \($0.artist ?? "") \($0.album ?? "")".localizedCaseInsensitiveContains(value) })
                    } else if library.isDemo {
                        next = SearchResult(album: library.albums.filter { ($0.name + ($0.artist ?? "")).localizedCaseInsensitiveContains(value) },
                                            song: library.albums.flatMap { DemoLibrary.songs(for: $0) }.filter { $0.title.localizedCaseInsensitiveContains(value) })
                    } else { next = try await library.client?.search(value) ?? SearchResult() }
                    try Task.checkCancellation()
                    result = next; loading = false
                } catch {
                    guard !Task.isCancelled else { return }
                    self.error = LibraryStore.message(error); loading = false
                }
            }
    }
}
