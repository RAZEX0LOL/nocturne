import Foundation
import CryptoKit

struct Credentials: Codable, Sendable {
    let server: URL
    let username: String
    let password: String

    init(server: String, username: String, password: String) throws {
        let text = server.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
              let host = url.host, !host.isEmpty,
              scheme == "https" || (scheme == "http" && Self.isLocalNetworkHost(host)),
              url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !password.isEmpty
        else { throw MusicError.invalidServer }
        self.server = url
        self.username = username.trimmingCharacters(in: .whitespacesAndNewlines)
        self.password = password
    }

    var isInsecure: Bool { server.scheme?.lowercased() == "http" }
    /// Stable identity of server + user, without secrets.
    var account: String { "\(username)@\(server.absoluteString)" }

    /// Hosts that App Transport Security lets us reach over plain HTTP (`NSAllowsLocalNetworking`).
    static func isLocalNetworkHost(_ rawHost: String) -> Bool {
        let host = rawHost.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".home.arpa") { return true }
        if host.contains(":") { return host == "::1" || host.hasPrefix("fe80:") || host.hasPrefix("fc") || host.hasPrefix("fd") }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        if labels.count == 1 { return true }
        let octets = labels.compactMap { UInt8($0) }
        guard labels.count == 4, octets.count == 4 else { return false }
        switch (octets[0], octets[1]) {
        case (10, _), (127, _), (192, 168), (169, 254), (172, 16...31), (100, 64...127): return true
        default: return false
        }
    }
}

struct NavidromeClient: Sendable {
    let credentials: Credentials
    let session: URLSession

    init(credentials: Credentials, session: URLSession? = nil) {
        self.credentials = credentials
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 25
        self.session = session ?? URLSession(configuration: configuration)
    }

    /// `repeated` carries parameters that may appear several times, like `songId` in `createPlaylist`.
    func url(_ endpoint: String, parameters: [String: String] = [:], repeated: [URLQueryItem] = [],
             salt: String = UUID().uuidString) throws -> URL {
        let endpointURL = credentials.server.appendingPathComponent("rest").appendingPathComponent(endpoint + ".view")
        guard var components = URLComponents(url: endpointURL, resolvingAgainstBaseURL: false) else {
            throw MusicError.invalidServer
        }
        // MD5 требуется протоколом Subsonic; пароль передаётся только как salted token по HTTPS.
        let token = Insecure.MD5.hash(data: Data((credentials.password + salt).utf8))
            .map { String(format: "%02x", $0) }.joined()
        components.queryItems = [
            URLQueryItem(name: "u", value: credentials.username), URLQueryItem(name: "t", value: token),
            URLQueryItem(name: "s", value: salt), URLQueryItem(name: "v", value: "1.16.1"),
            URLQueryItem(name: "c", value: "Nocturne"), URLQueryItem(name: "f", value: "json")
        ] + parameters.sorted(by: { $0.key < $1.key }).map { URLQueryItem(name: $0.key, value: $0.value) } + repeated
        components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        guard let url = components.url else { throw MusicError.invalidServer }
        return url
    }

    /// Subsonic reads are idempotent, so transient network failures are retried with backoff.
    func request(_ endpoint: String, parameters: [String: String] = [:], repeated: [URLQueryItem] = []) async throws -> ServerResponse {
        var attempt = 0
        while true {
            do { return try await perform(endpoint, parameters: parameters, repeated: repeated) }
            catch let error as URLError where attempt < 2 && Self.isTransient(error) {
                attempt += 1
                try await Task.sleep(for: .milliseconds(500 * attempt * attempt))
            }
        }
    }

    static func isTransient(_ error: URLError) -> Bool {
        [.timedOut, .networkConnectionLost, .cannotConnectToHost, .dnsLookupFailed, .cannotFindHost].contains(error.code)
    }

    private func perform(_ endpoint: String, parameters: [String: String], repeated: [URLQueryItem]) async throws -> ServerResponse {
        let (data, response) = try await session.data(from: url(endpoint, parameters: parameters, repeated: repeated))
        guard let http = response as? HTTPURLResponse else { throw MusicError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw MusicError.http(http.statusCode) }
        return try Self.decode(data)
    }

    static func decode(_ data: Data) throws -> ServerResponse {
        let envelope: ResponseEnvelope
        do { envelope = try JSONDecoder().decode(ResponseEnvelope.self, from: data) }
        catch { throw MusicError.invalidResponse }
        guard envelope.response.status == "ok" else { throw MusicError.server(envelope.response.error?.code ?? 0) }
        return envelope.response
    }

    func albums(type: String = "newest", offset: Int = 0, size: Int = 40) async throws -> [Album] {
        try await request("getAlbumList2", parameters: ["type": type, "size": String(size), "offset": String(offset)]).albumList2?.album ?? []
    }
    func songs(albumID: String) async throws -> [Song] {
        try await request("getAlbum", parameters: ["id": albumID]).album?.song ?? []
    }
    func starred() async throws -> Starred {
        try await request("getStarred2").starred2 ?? Starred()
    }
    func topSongs(artist: String) async throws -> [Song] {
        try await request("getTopSongs", parameters: ["artist": artist, "count": "10"]).topSongs?.song ?? []
    }
    func genres() async throws -> [Genre] {
        (try await request("getGenres").genres?.genre ?? []).sorted { ($0.albumCount ?? 0) > ($1.albumCount ?? 0) }
    }
    /// Prefers synced OpenSubsonic lyrics; falls back to the legacy plain-text endpoint.
    func lyrics(for song: Song) async throws -> StructuredLyrics? {
        if let list = try? await request("getLyricsBySongId", parameters: ["id": song.id]).lyricsList?.structuredLyrics,
           let best = list.first(where: \.synced) ?? list.first, !(best.line ?? []).isEmpty {
            return best
        }
        let plain = try await request("getLyrics", parameters: ["artist": song.artist ?? "", "title": song.title]).lyrics?.value ?? ""
        let lines = plain.split(separator: "\n", omittingEmptySubsequences: false).map { LyricLine(value: String($0)) }
        return plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : StructuredLyrics(synced: false, line: lines)
    }
    func createPlaylist(name: String, songIDs: [String]) async throws {
        _ = try await request("createPlaylist", parameters: ["name": name], repeated: songIDs.map { URLQueryItem(name: "songId", value: $0) })
    }
    func addToPlaylist(id: String, songIDs: [String]) async throws {
        _ = try await request("updatePlaylist", parameters: ["playlistId": id], repeated: songIDs.map { URLQueryItem(name: "songIdToAdd", value: $0) })
    }
    func removeFromPlaylist(id: String, indexes: [Int]) async throws {
        _ = try await request("updatePlaylist", parameters: ["playlistId": id],
                              repeated: indexes.map { URLQueryItem(name: "songIndexToRemove", value: String($0)) })
    }
    /// `submission == false` reports "now playing"; `true` records the play (Last.fm / ListenBrainz via Navidrome).
    func scrobble(songID: String, submission: Bool) async throws {
        _ = try await request("scrobble", parameters: ["id": songID, "submission": submission ? "true" : "false"])
    }

    func search(_ query: String) async throws -> SearchResult {
        try await request("search3", parameters: ["query": query, "songCount": "50", "albumCount": "30", "artistCount": "20"]).searchResult3
            ?? SearchResult()
    }
}
