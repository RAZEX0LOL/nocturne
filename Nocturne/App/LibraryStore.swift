import SwiftUI
import Security

@MainActor @Observable
final class LibraryStore {
    static let shared = LibraryStore()
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
    /// All saved servers (`user@server`), for the switcher in settings.
    private(set) var accounts: [String] = []

    init() {
        CredentialVault.migrate()
        accounts = CredentialVault.accounts
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
        accounts = CredentialVault.accounts
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

    /// Forgets the current server; switches to another saved one if there is any.
    func disconnect() throws {
        guard let account = client?.credentials.account else { return }
        let next = CredentialVault.delete(account)
        accounts = CredentialVault.accounts
        activate(next.flatMap { CredentialVault.load($0) })
    }

    func switchTo(_ account: String) async {
        guard account != client?.credentials.account, let credentials = CredentialVault.load(account) else { return }
        CredentialVault.setActive(account)
        activate(credentials)
        await refresh()
    }

    private func activate(_ credentials: Credentials?) {
        generation = UUID()
        client = credentials.map { NavidromeClient(credentials: $0) }
        isDemo = false; clearSections()
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
        if error is CancellationError { return String(localized: "Загрузка отменена.") }
        // Системные ошибки могут содержать URL с токеном — не показываем их пользователю.
        return String(localized: "Не удалось связаться с сервером. Проверь подключение и адрес Navidrome.")
    }
}

/// Keychain storage for several servers: one item per account key (`user@server`).
/// The list of accounts and the active one live in UserDefaults — no secrets there.
@MainActor enum CredentialVault {
    private static let service = "app.nocturne.navidrome"
    private static let accountsKey = "servers.accounts"
    private static let activeKey = "servers.active"

    static var accounts: [String] { UserDefaults.standard.stringArray(forKey: accountsKey) ?? [] }
    static var active: String? { UserDefaults.standard.string(forKey: activeKey) }

    /// Moves the single pre-multi-server item ("primary") into the new layout once.
    static func migrate() {
        guard accounts.isEmpty, let legacy = read("primary") else { return }
        try? save(legacy)
        remove("primary")
    }

    static func load(_ account: String? = nil) -> Credentials? {
        guard let account = account ?? active else { return nil }
        return read(account)
    }

    /// Stores the credentials and makes them active.
    static func save(_ credentials: Credentials) throws {
        let data = try JSONEncoder().encode(credentials)
        let query = itemQuery(credentials.account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else { throw MusicError.keychain }
        } else if status != errSecSuccess { throw MusicError.keychain }
        var list = accounts
        if !list.contains(credentials.account) { list.append(credentials.account) }
        UserDefaults.standard.set(list, forKey: accountsKey)
        setActive(credentials.account)
    }

    static func setActive(_ account: String?) { UserDefaults.standard.set(account, forKey: activeKey) }

    /// Removes one server; returns the account that should become active, if any.
    @discardableResult static func delete(_ account: String) -> String? {
        remove(account)
        let list = accounts.filter { $0 != account }
        UserDefaults.standard.set(list, forKey: accountsKey)
        if active == account { setActive(list.first) }
        return active
    }

    private static func itemQuery(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    private static func read(_ account: String) -> Credentials? {
        var request = itemQuery(account)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }

    private static func remove(_ account: String) { SecItemDelete(itemQuery(account) as CFDictionary) }
}
