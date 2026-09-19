import SwiftUI
import Security

@MainActor @Observable
final class LibraryStore {
    var client: NavidromeClient?
    var albums: [Album] = []
    var favorites: [Album] = []
    var artists: [Artist] = []
    var playlists: [MusicPlaylist] = []
    var starredSongs: [Song] = []
    var recentlyPlayed: [Album] = []
    var frequent: [Album] = []
    var discover: [Album] = []
    var isDemo = false
    var isLoading = false
    var error: String?
    private var generation = UUID()
    var isConnected: Bool { client != nil }

    init() {
        if let credentials = CredentialVault.load() { client = NavidromeClient(credentials: credentials) }
        if ProcessInfo.processInfo.arguments.contains("--demo") { useDemo() }
        #if DEBUG
        // Test hook: `--connect <server> <user> <password>` (simulator keyboards may not type URLs reliably).
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "--connect"), arguments.count > flag + 3,
           let credentials = try? Credentials(server: arguments[flag + 1], username: arguments[flag + 2], password: arguments[flag + 3]) {
            client = NavidromeClient(credentials: credentials)
        }
        #endif
    }

    func connect(server: String, username: String, password: String) async throws {
        let credentials = try Credentials(server: server, username: username, password: password)
        let candidate = NavidromeClient(credentials: credentials)
        _ = try await candidate.request("ping")
        try CredentialVault.save(credentials)
        generation = UUID()
        client = candidate
        isDemo = false
        clearSections()
        await refresh()
    }

    func useDemo() {
        generation = UUID()
        client = nil
        isDemo = true
        albums = DemoLibrary.albums
        favorites = Array(DemoLibrary.albums.suffix(2))
        recentlyPlayed = Array(DemoLibrary.albums.prefix(3)); frequent = []; discover = DemoLibrary.albums.shuffled()
        starredSongs = DemoLibrary.songs(for: DemoLibrary.albums[0]).prefix(2).map { var song = $0; song.starred = "demo"; return song }
        artists = DemoLibrary.albums.map { Artist(id: $0.id, name: $0.artist ?? "", albumCount: 1, coverArt: $0.coverArt) }
        playlists = []
        isLoading = false
        error = nil
    }

    func disconnect() throws {
        try CredentialVault.delete()
        generation = UUID()
        client = nil; isDemo = false; clearSections()
        isLoading = false; error = nil
    }

    func refresh() async {
        guard let client, !isDemo else { return }
        let requestGeneration = generation
        isLoading = true
        error = nil
        defer { if generation == requestGeneration { isLoading = false } }
        do {
            async let newest = client.albums()
            async let starred = client.starred()
            async let people = client.request("getArtists")
            async let lists = client.request("getPlaylists")
            // Personal sections are optional: an older server without play stats shouldn't break the home screen.
            async let played = try? client.albums(type: "recent", size: 12)
            async let often = try? client.albums(type: "frequent", size: 12)
            async let random = try? client.albums(type: "random", size: 12)
            let result = try await (newest, starred, people, lists)
            let personal = await (played, often, random)
            guard generation == requestGeneration else { return }
            albums = result.0
            favorites = result.1.album ?? []; starredSongs = result.1.song ?? []
            artists = result.2.artists?.index?.flatMap { $0.artist ?? [] } ?? []
            playlists = result.3.playlists?.playlist ?? []
            recentlyPlayed = personal.0 ?? []; frequent = personal.1 ?? []; discover = personal.2 ?? []
        } catch {
            guard generation == requestGeneration else { return }
            Log.library.error("Refresh failed: \(Log.describe(error), privacy: .public)")
            self.error = Self.message(error)
        }
    }

    private func clearSections() {
        albums = []; favorites = []; artists = []; playlists = []
        starredSongs = []; recentlyPlayed = []; frequent = []; discover = []
    }

    /// Stars or unstars a song and keeps the favourites list in sync.
    func setStarred(_ song: Song, _ starred: Bool) async throws {
        guard let client else { throw MusicError.demo }
        _ = try await client.request(starred ? "star" : "unstar", parameters: ["id": song.id])
        starredSongs.removeAll { $0.id == song.id }
        if starred { var copy = song; copy.starred = "local"; starredSongs.insert(copy, at: 0) }
    }

    func isStarred(_ song: Song) -> Bool { starredSongs.contains { $0.id == song.id } }

    func reloadPlaylists() async {
        guard let client else { return }
        if let lists = try? await client.request("getPlaylists").playlists?.playlist { playlists = lists }
    }

    func createPlaylist(name: String, songs: [Song]) async throws {
        guard let client else { throw MusicError.demo }
        try await client.createPlaylist(name: name, songIDs: songs.map(\.id))
        await reloadPlaylists()
    }

    func add(_ songs: [Song], to playlist: MusicPlaylist) async throws {
        guard let client else { throw MusicError.demo }
        try await client.addToPlaylist(id: playlist.id, songIDs: songs.map(\.id))
        await reloadPlaylists()
    }

    static func message(_ error: Error) -> String {
        if let known = error as? MusicError { return known.localizedDescription }
        if (error as? URLError)?.code == .notConnectedToInternet { return MusicError.offline.localizedDescription }
        if error is CancellationError { return "Загрузка отменена." }
        // Системные ошибки могут содержать URL с токеном — не показываем их пользователю.
        return "Не удалось связаться с сервером. Проверь подключение и адрес Navidrome."
    }
}

@MainActor enum CredentialVault {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "app.nocturne.navidrome",
        kSecAttrAccount as String: "primary"
    ]

    static func load() -> Credentials? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }

    static func save(_ credentials: Credentials) throws {
        let data = try JSONEncoder().encode(credentials)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let insert = query.merging(attributes) { _, new in new }
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw MusicError.keychain }
        } else if status != errSecSuccess { throw MusicError.keychain }
    }

    static func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw MusicError.keychain }
    }
}
