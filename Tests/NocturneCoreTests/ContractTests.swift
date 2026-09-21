import XCTest
@testable import NocturneCore

/// Runs the cross-platform contract from `shared/cases` against this implementation.
/// Android and the desktop app run the very same files, so a difference in behaviour
/// shows up as the same named failure on whichever platform drifted.
final class ContractTests: XCTestCase {
    private static let casesFolder = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("shared/cases")

    private func load(_ file: String) throws -> [String: Any] {
        let url = Self.casesFolder.appendingPathComponent(file)
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try XCTUnwrap(object as? [String: Any], "\(file) is not a JSON object")
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
