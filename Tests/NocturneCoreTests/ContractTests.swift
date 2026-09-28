import XCTest
@testable import NocturneCore

/// Runs the cross-platform contract from `shared/cases` against this implementation.
/// Android and the desktop app run the very same files, so a difference in behaviour
/// shows up as the same named failure on whichever platform drifted.
/// Подставной транспорт: роняет связь или отвечает отказом столько раз, сколько просит кейс.
private final class StubTransport: URLProtocol, @unchecked Sendable {
    struct Plan { var kind: String; var failures: Int }
    nonisolated(unsafe) static var plan = Plan(kind: "network", failures: 0)
    nonisolated(unsafe) static var attempts = 0

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        Self.attempts += 1
        let failing = Self.attempts <= Self.plan.failures
        guard failing else { return answer(status: 200, body: #"{"subsonic-response":{"status":"ok"}}"#) }
        switch Self.plan.kind {
        case "network": client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
        case "auth": answer(status: 200, body: #"{"subsonic-response":{"status":"failed","error":{"code":40}}}"#)
        default: answer(status: 500, body: "")
        }
    }

    private func answer(status: Int, body: String) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class ContractTests: XCTestCase {
    private static let casesFolder = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("shared/cases")

    private func load(_ file: String) throws -> [String: Any] {
        let url = Self.casesFolder.appendingPathComponent(file)
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try XCTUnwrap(object as? [String: Any], "\(file) is not a JSON object")
    }

    override func setUp() {
        super.setUp()
        StubTransport.attempts = 0
    }

    private func cases(_ file: String, _ key: String = "cases") throws -> [[String: Any]] {
        try XCTUnwrap(load(file)[key] as? [[String: Any]], "\(file) has no \(key)")
    }

    // MARK: - credentials.json

    func testCredentialCases() throws {
        for item in try cases("credentials.json") {
            let name = item["name"] as? String ?? "?"
            let server = item["server"] as? String ?? ""
            let username = item["username"] as? String ?? ""
            let password = item["password"] as? String ?? ""
            guard item["valid"] as? Bool == true else {
                XCTAssertThrowsError(try Credentials(server: server, username: username, password: password), name)
                continue
            }
            let credentials = try XCTUnwrap(try? Credentials(server: server, username: username, password: password), name)
            if let insecure = item["insecure"] as? Bool { XCTAssertEqual(credentials.isInsecure, insecure, name) }
            if let account = item["account"] as? String { XCTAssertEqual(credentials.account, account, name) }
        }
    }

    // MARK: - requests.json

    func testRequestCases() throws {
        for item in try cases("requests.json") {
            let name = item["name"] as? String ?? "?"
            let credentials = try Credentials(server: item["server"] as? String ?? "",
                                              username: item["username"] as? String ?? "",
                                              password: item["password"] as? String ?? "")
            let repeated = (item["repeated"] as? [[String: String]] ?? [])
                .map { URLQueryItem(name: $0["name"] ?? "", value: $0["value"]) }
            let url = try NavidromeClient(credentials: credentials)
                .url(item["endpoint"] as? String ?? "ping",
                     parameters: item["parameters"] as? [String: String] ?? [:],
                     repeated: repeated,
                     salt: item["salt"] as? String ?? "salt")
            let expect = item["expect"] as? [String: Any] ?? [:]
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []

            if let path = expect["path"] as? String { XCTAssertEqual(url.path, path, name) }
            for (key, value) in expect["query"] as? [String: String] ?? [:] {
                XCTAssertEqual(query.first { $0.name == key }?.value, value, "\(name): \(key)")
            }
            if let prefix = expect["clientNameStartsWith"] as? String {
                let client = query.first { $0.name == "c" }?.value ?? ""
                XCTAssertTrue(client.hasPrefix(prefix), "\(name): client name \(client)")
            }
            for key in expect["absentParameters"] as? [String] ?? [] {
                XCTAssertFalse(query.contains { $0.name == key }, "\(name): \(key) must not be sent")
            }
            for text in expect["absentSubstrings"] as? [String] ?? [] {
                XCTAssertFalse(url.absoluteString.contains(text), "\(name): url must not contain \(text)")
            }
            for (key, values) in expect["repeated"] as? [String: [String]] ?? [:] {
                XCTAssertEqual(query.filter { $0.name == key }.map(\.value), values, "\(name): \(key)")
            }
        }
    }

    func testStreamQualityCases() throws {
        for item in try cases("requests.json", "streamQuality") {
            let name = item["name"] as? String ?? "?"
            let quality = try XCTUnwrap(StreamQuality(rawValue: item["quality"] as? String ?? ""), name)
            XCTAssertEqual(quality.streamParameters, item["parameters"] as? [String: String] ?? [:], name)
        }
    }

    func testFreshSaltCase() throws {
        let item = try XCTUnwrap(load("requests.json")["freshSalt"] as? [String: Any])
        let client = NavidromeClient(credentials: try Credentials(server: item["server"] as? String ?? "",
                                                                  username: item["username"] as? String ?? "",
                                                                  password: item["password"] as? String ?? ""))
        let endpoint = item["endpoint"] as? String ?? "ping"
        XCTAssertNotEqual(try client.url(endpoint), try client.url(endpoint), item["name"] as? String ?? "?")
    }

    // MARK: - decode.json

    func testDecodeCases() throws {
        for item in try cases("decode.json") {
            let name = item["name"] as? String ?? "?"
            let data = Data((item["json"] as? String ?? "").utf8)
            guard item["accept"] as? Bool == true else {
                XCTAssertThrowsError(try NavidromeClient.decode(data), name) { error in
                    for text in item["errorMustNotContain"] as? [String] ?? [] {
                        XCTAssertFalse(error.localizedDescription.contains(text), "\(name): error leaks server detail")
                    }
                }
                continue
            }
            let response = try NavidromeClient.decode(data)
            let expect = item["expect"] as? [String: Any] ?? [:]
            for (key, value) in expect {
                switch key {
                case "firstAlbumName": XCTAssertEqual(response.albumList2?.album?.first?.name, value as? String, name)
                case "firstAlbumArtist": XCTAssertNil(response.albumList2?.album?.first?.artist, name)
                case "albumCount": XCTAssertEqual(response.albumList2?.album?.count ?? 0, value as? Int, name)
                case "firstSongDuration": XCTAssertEqual(response.album?.song?.first?.duration, value as? Double, name)
                case "firstStarredSongId": XCTAssertEqual(response.starred2?.song?.first?.id, value as? String, name)
                case "firstGenreValue": XCTAssertEqual(response.genres?.genre?.first?.value, value as? String, name)
                case "firstLyricStart": XCTAssertEqual(response.lyricsList?.structuredLyrics?.first?.line?.first?.start, value as? Int, name)
                case "firstRadioStreamUrl": XCTAssertEqual(response.internetRadioStations?.internetRadioStation?.first?.streamUrl, value as? String, name)
                case "firstShareUrl": XCTAssertEqual(response.shares?.share?.first?.url, value as? String, name)
                case "firstSongTrackGain": XCTAssertEqual(response.album?.song?.first?.replayGain?.trackGain, value as? Double, name)
                case "firstSongRating": XCTAssertEqual(response.album?.song?.first?.userRating, value as? Int, name)
                default: XCTFail("\(name): unknown check \(key)")
                }
            }
        }
    }

    // MARK: - replaygain.json

    func testReplayGainCases() throws {
        let file = try load("replaygain.json")
        let tolerance = Float(file["tolerance"] as? Double ?? 0.01)
        for item in try cases("replaygain.json") {
            let name = item["name"] as? String ?? "?"
            var song = Song(id: "s", title: "S")
            if let gain = item["replayGain"] as? [String: Double] {
                song.replayGain = ReplayGain(trackGain: gain["trackGain"], albumGain: gain["albumGain"],
                                             trackPeak: gain["trackPeak"], albumPeak: gain["albumPeak"])
            }
            let mode = try XCTUnwrap(ReplayGainMode(rawValue: item["mode"] as? String ?? ""), name)
            let expected = Float(item["expected"] as? Double ?? 1)
            XCTAssertEqual(mode.volume(for: song), expected, accuracy: tolerance, name)
        }
    }

    // MARK: - retries.json

    func testRetryCases() async throws {
        for item in try cases("retries.json") {
            let name = item["name"] as? String ?? "?"
            let failures = item["failures"] as? Int ?? 0
            StubTransport.plan = StubTransport.Plan(kind: item["failure"] as? String ?? "network", failures: failures)
            StubTransport.attempts = 0

            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [StubTransport.self]
            // Паузы в тесте нулевые: проверяем число попыток, а не терпение.
            let client = NavidromeClient(credentials: try Credentials(server: "https://host", username: "test", password: "test-only"),
                                         session: URLSession(configuration: configuration), retryDelays: [0, 0])
            var succeeded = false
            do {
                _ = try await client.request("ping")
                succeeded = true
            } catch {
                XCTAssertTrue(error is MusicError || error is URLError, "\(name): ошибка понятна человеку")
            }
            XCTAssertEqual(succeeded, item["succeeds"] as? Bool, name)
            XCTAssertEqual(StubTransport.attempts, item["attempts"] as? Int, "\(name): число попыток")
        }
    }

    // MARK: - quality.json и scrobbles.json

    func testQualityByNetworkCases() throws {
        for item in try cases("quality.json") {
            let name = item["name"] as? String ?? "?"
            let wifi = try XCTUnwrap(StreamQuality(rawValue: item["wifi"] as? String ?? ""), name)
            let cellular = try XCTUnwrap(StreamQuality(rawValue: item["cellular"] as? String ?? ""), name)
            let expected = try XCTUnwrap(StreamQuality(rawValue: item["expected"] as? String ?? ""), name)
            let chosen = StreamQuality.forNetwork(expensive: item["expensive"] as? Bool ?? false, wifi: wifi, cellular: cellular)
            XCTAssertEqual(chosen, expected, name)
        }
        let defaults = try XCTUnwrap(load("quality.json")["defaults"] as? [String: String])
        XCTAssertEqual(StreamQuality.defaultWifi.rawValue, defaults["wifi"])
        XCTAssertEqual(StreamQuality.defaultCellular.rawValue, defaults["cellular"])
    }

    func testScrobbleQueueCases() throws {
        for item in try cases("scrobbles.json") {
            let name = item["name"] as? String ?? "?"
            let queue = (item["keep"] as? [[String: Any]] ?? []).reduce(into: [ScrobblePlay]()) { result, play in
                result = Scrobbles.keep(result, plays(play))
            }
            XCTAssertEqual(Scrobbles.ordered(queue), (item["expected"] as? [[String: Any]] ?? []).map(plays), name)
        }
        for item in try cases("scrobbles.json", "afterSending") {
            let name = item["name"] as? String ?? "?"
            let kept = (item["kept"] as? [[String: Any]] ?? []).map(plays)
            let sent = (item["sent"] as? [[String: Any]] ?? []).map(plays)
            XCTAssertEqual(Scrobbles.remaining(kept, sent: sent), (item["remaining"] as? [[String: Any]] ?? []).map(plays), name)
        }
    }

    private func plays(_ raw: [String: Any]) -> ScrobblePlay {
        ScrobblePlay(id: raw["id"] as? String ?? "", time: raw["time"] as? Double ?? 0)
    }

    // MARK: - queue.json

    func testQueueCases() throws {
        for item in try cases("queue.json") {
            let name = item["name"] as? String ?? "?"
            let ids = item["songs"] as? [String] ?? []
            let songs = ids.map { Song(id: $0, title: $0) }
            var queue = PlaybackQueue(songs: songs, startAt: item["startAt"] as? Int ?? 0,
                                      shuffle: item["shuffle"] as? Bool ?? false)
            var remembered: [String: String] = [:]

            for step in item["steps"] as? [[String: Any]] ?? [] {
                switch step["op"] as? String {
                case "jump": queue.jump(to: step["pos"] as? Int ?? 0)
                case "jumpNext":
                    let next = try XCTUnwrap(queue.nextPosition(automatic: false), "\(name): no next position")
                    queue.jump(to: next)
                case "jumpPrevious":
                    let previous = try XCTUnwrap(queue.previousPosition(), "\(name): no previous position")
                    queue.jump(to: previous)
                case "setShuffle": queue.setShuffle(step["enabled"] as? Bool ?? false)
                case "setRepeat": queue.repeatMode = try XCTUnwrap(PlaybackQueue.Repeat(rawValue: step["mode"] as? String ?? ""), name)
                case "insertNext": queue.insertNext((step["songs"] as? [String] ?? []).map { Song(id: $0, title: $0) })
                case "append": queue.append((step["songs"] as? [String] ?? []).map { Song(id: $0, title: $0) })
                case "removeAt": queue.remove(id: queue.items[step["pos"] as? Int ?? 0].id)
                case "removeCurrent": queue.remove(id: try XCTUnwrap(queue.current?.id, name))
                case "moveUpcoming":
                    queue.moveUpcoming(fromOffsets: IndexSet(step["from"] as? [Int] ?? []), toOffset: step["to"] as? Int ?? 0)
                case "remember":
                    let key = step["as"] as? String ?? ""
                    if step["atCurrent"] as? Bool == true {
                        remembered[key] = queue.current?.song.id
                    } else {
                        remembered[key] = queue.items[step["atPosition"] as? Int ?? 0].song.id
                    }
                case nil: break
                case let other?: XCTFail("\(name): unknown operation \(other)")
                }

                for (key, value) in step["expect"] as? [String: Any] ?? [:] {
                    switch key {
                    case "comment": break
                    case "currentId": XCTAssertEqual(queue.current?.song.id, value as? String, name)
                    case "position": XCTAssertEqual(queue.position, value as? Int, name)
                    case "count": XCTAssertEqual(queue.items.count, value as? Int, name)
                    case "itemIds": XCTAssertEqual(queue.items.map(\.song.id), value as? [String], name)
                    case "upcomingIds": XCTAssertEqual(queue.upcoming.map(\.song.id), value as? [String], name)
                    case "nextPositionAutomatic": XCTAssertEqual(queue.nextPosition(automatic: true), value as? Int, name)
                    case "nextPositionManual": XCTAssertEqual(queue.nextPosition(automatic: false), value as? Int, name)
                    case "isPermutationOfNatural":
                        XCTAssertEqual(Set(queue.items.map(\.song.id)), Set(queue.natural.map(\.song.id)), name)
                    case "currentIsFirst": XCTAssertEqual(queue.position, 0, name)
                    case "currentIdIsRemembered":
                        XCTAssertEqual(queue.current?.song.id, remembered[value as? String ?? ""], name)
                    default: XCTFail("\(name): unknown check \(key)")
                    }
                }
            }
        }
    }
}
