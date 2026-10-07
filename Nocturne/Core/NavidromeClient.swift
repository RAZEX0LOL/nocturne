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
    /// Паузы перед повторами; в тестах их обнуляют, чтобы не ждать по-настоящему.
    let retryDelays: [Double]

    init(credentials: Credentials, session: URLSession? = nil, retryDelays: [Double] = [0.5, 2]) {
        self.credentials = credentials
        self.retryDelays = retryDelays
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
            URLQueryItem(name: "c", value: Self.clientName), URLQueryItem(name: "f", value: "json")
        ] + parameters.sorted(by: { $0.key < $1.key }).map { URLQueryItem(name: $0.key, value: $0.value) } + repeated
        components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        guard let url = components.url else { throw MusicError.invalidServer }
        return url
    }

    /// Subsonic reads are idempotent, so transient network failures are retried with backoff.
    /// A server's own answer (wrong password, HTTP 500) is never retried: it would say the same again.
    func request(_ endpoint: String, parameters: [String: String] = [:], repeated: [URLQueryItem] = []) async throws -> ServerResponse {
        var attempt = 0
        while true {
            do { return try await perform(endpoint, parameters: parameters, repeated: repeated) }
            catch let error as URLError where attempt < retryDelays.count && Self.isTransient(error) {
                try await Task.sleep(for: .seconds(retryDelays[attempt]))
                attempt += 1
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
    /// `time` backdates a play that was queued while offline.
    func scrobble(songID: String, submission: Bool, time: Date? = nil) async throws {
        var parameters = ["id": songID, "submission": submission ? "true" : "false"]
        if let time { parameters["time"] = String(Int64(time.timeIntervalSince1970 * 1000)) }
        _ = try await request("scrobble", parameters: parameters)
    }

    /// "Instant mix": tracks similar to the seed (needs Last.fm integration on the server).
    func similarSongs(to songID: String) async throws -> [Song] {
        try await request("getSimilarSongs2", parameters: ["id": songID, "count": "50"]).similarSongs2?.song ?? []
    }
    /// Client name sent as `c`; other devices see it in `PlayQueue.changedBy`.
    static let clientName = "Nocturne"

    /// Saves the queue on the server so another device can continue it. Position is in milliseconds.
    func savePlayQueue(songIDs: [String], current: String?, position: Double) async throws {
        var parameters = ["position": String(Int64(max(0, position) * 1000))]
        if let current { parameters["current"] = current }
        _ = try await request("savePlayQueue", parameters: parameters, repeated: songIDs.map { URLQueryItem(name: "id", value: $0) })
    }

    /// The queue another device (or this one) last saved; nil when there is none.
    func playQueue() async throws -> PlayQueue? {
        guard let queue = try await request("getPlayQueue").playQueue, !(queue.entry ?? []).isEmpty else { return nil }
        return queue
    }

    func radioStations() async throws -> [RadioStation] {
        try await request("getInternetRadioStations").internetRadioStations?.internetRadioStation ?? []
    }
    func artistInfo(id: String) async throws -> ArtistInfo? {
        try await request("getArtistInfo2", parameters: ["id": id]).artistInfo2
    }
    func albumInfo(id: String) async throws -> AlbumInfo? {
        try await request("getAlbumInfo2", parameters: ["id": id]).albumInfo
    }
    /// `rating` 0 removes the rating, 1…5 sets it.
    func setRating(songID: String, rating: Int) async throws {
        _ = try await request("setRating", parameters: ["id": songID, "rating": String(min(max(rating, 0), 5))])
    }
    /// Public link to a song; requires `EnableSharing` in Navidrome.
    func createShare(songID: String) async throws -> URL? {
        let link = try await request("createShare", parameters: ["id": songID]).shares?.share?.first?.url
        return link.flatMap(URL.init(string:))
    }

    func search(_ query: String) async throws -> SearchResult {
        try await request("search3", parameters: ["query": query, "songCount": "50", "albumCount": "30", "artistCount": "20"]).searchResult3
            ?? SearchResult()
    }
}

// MARK: - LRC и LRCLIB


/// LRC lyrics: "[mm:ss.xx] line"; one line may carry several timestamps (a repeated chorus).
/// Lines without a timestamp (metadata such as "[ar: …]") are skipped.
enum Lrc {
    static func parse(_ text: String) -> [LyricLine] {
        var lines: [LyricLine] = []
        let stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/
        for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw).trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            let matches = line.matches(of: stamp)
            guard let last = matches.last else { continue }
            let value = String(line[last.range.upperBound...]).trimmingCharacters(in: .whitespaces)
            for match in matches {
                let minutes = Int(match.output.1) ?? 0
                let seconds = Int(match.output.2) ?? 0
                let fraction = match.output.3.map { Int(String($0).padding(toLength: 3, withPad: "0", startingAt: 0)) ?? 0 } ?? 0
                lines.append(LyricLine(start: (minutes * 60 + seconds) * 1000 + fraction, value: value))
            }
        }
        return lines.sorted { ($0.start ?? 0) < ($1.start ?? 0) }
    }
}

/// Lyrics from LRCLIB (lrclib.net), an open database of synced lyrics. Asked only when Navidrome has
/// none and the user turned it on: song titles go to a third-party service.
struct LrclibClient: Sendable {
    let session: URLSession

    init(session: URLSession = .shared) { self.session = session }

    static func url(for song: Song) -> URL? {
        guard let artist = song.artist, !artist.isEmpty, !song.title.isEmpty else { return nil }
        var components = URLComponents(string: "https://lrclib.net/api/get")
        var items = [URLQueryItem(name: "track_name", value: song.title), URLQueryItem(name: "artist_name", value: artist)]
        if let album = song.album { items.append(URLQueryItem(name: "album_name", value: album)) }
        if let duration = song.duration { items.append(URLQueryItem(name: "duration", value: String(Int(duration.rounded())))) }
        components?.queryItems = items
        return components?.url
    }

    private struct Answer: Decodable { var syncedLyrics: String?; var plainLyrics: String? }

    static func decode(_ data: Data) -> StructuredLyrics? {
        guard let answer = try? JSONDecoder().decode(Answer.self, from: data) else { return nil }
        if let synced = answer.syncedLyrics {
            let lines = Lrc.parse(synced)
            if !lines.isEmpty { return StructuredLyrics(synced: true, line: lines) }
        }
        if let plain = answer.plainLyrics, !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return StructuredLyrics(synced: false, line: plain.split(separator: "\n", omittingEmptySubsequences: false).map { LyricLine(value: String($0)) })
        }
        return nil
    }

    func lyrics(for song: Song) async -> StructuredLyrics? {
        guard let url = Self.url(for: song),
              let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return Self.decode(data)
    }
}
