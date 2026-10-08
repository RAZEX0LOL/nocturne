import XCTest
@testable import NocturneCore

final class SyncAndLyricsTests: XCTestCase {
    private func client() throws -> NavidromeClient {
        NavidromeClient(credentials: try Credentials(server: "https://host", username: "test", password: "test-only"))
    }

    func testPlayQueueRequestCarriesEveryIdAndMilliseconds() throws {
        let url = try client().url("savePlayQueue", parameters: ["current": "s2", "position": "83456"],
                                   repeated: ["s1", "s2", "s3"].map { URLQueryItem(name: "id", value: $0) })
        let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(items.filter { $0.name == "id" }.map(\.value), ["s1", "s2", "s3"])
        XCTAssertEqual(items.first { $0.name == "c" }?.value, NavidromeClient.clientName)
    }

    func testPlayQueueDecodesPositionTimeAndAuthor() throws {
        let data = Data(#"""
        {"subsonic-response":{"status":"ok","playQueue":{"entry":[{"id":"s1","title":"Один"},{"id":"s2","title":"Два"}],
         "current":"s2","position":61500,"changed":"2026-10-07T20:15:00Z","changedBy":"NocturneDesktop","username":"test"}}}
        """#.utf8)
        let queue = try XCTUnwrap(NavidromeClient.decode(data).playQueue)
        XCTAssertEqual(queue.entry?.count, 2)
        XCTAssertEqual(queue.current, "s2")
        XCTAssertEqual(queue.positionSeconds, 61.5)
        XCTAssertEqual(queue.changedBy, "NocturneDesktop")
        XCTAssertEqual(queue.changedAt, ISO8601DateFormatter().date(from: "2026-10-07T20:15:00Z"))
    }

    func testFractionalChangedTimeIsUnderstood() {
        let queue = PlayQueue(entry: [], current: nil, position: nil, changed: "2026-10-07T20:15:00.123Z", changedBy: nil)
        XCTAssertNotNil(queue.changedAt)
    }

    func testLrcTimestampsMetadataAndChorus() {
        let lines = Lrc.parse("[ar: Кино]\n[00:12.34] Белый снег\n[01:02.5]Серый лёд\n[00:40.00][00:10.00] Припев")
        XCTAssertEqual(lines.map(\.start), [10000, 12340, 40000, 62500])
        XCTAssertEqual(lines.map(\.value), ["Припев", "Белый снег", "Припев", "Серый лёд"])
    }

    func testLrclibPrefersSyncedLyricsAndAsksWithDuration() throws {
        let song = Song(id: "s", title: "Кукушка", artist: "Кино", album: "Чёрный альбом", duration: 397.4)
        let url = try XCTUnwrap(LrclibClient.url(for: song))
        let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(items.first { $0.name == "duration" }?.value, "397")
        XCTAssertNil(items.first { $0.name == "album_name" })
        let synced = LrclibClient.decode(Data(#"{"syncedLyrics":"[00:01.00] Песен ещё ненаписанных","plainLyrics":"x"}"#.utf8))
        XCTAssertEqual(synced?.synced, true)
        XCTAssertEqual(synced?.line?.first?.start, 1000)
        let plain = LrclibClient.decode(Data(#"{"plainLyrics":"раз\nдва"}"#.utf8))
        XCTAssertEqual(plain?.synced, false)
        XCTAssertEqual(plain?.line?.map(\.value), ["раз", "два"])
        XCTAssertNil(LrclibClient.decode(Data("{}".utf8)))
        XCTAssertNil(LrclibClient.url(for: Song(id: "s", title: "Без исполнителя")))
    }

    func testLyricsQueryCleansTitlesAndArtists() throws {
        XCTAssertEqual(LyricsQuery.cleanTitle("Another Love (Sped Up)"), "Another Love")
        XCTAssertEqual(LyricsQuery.cleanTitle("Experience (Starkey Remix / Remastered 2020) (Slowed)"), "Experience")
        XCTAssertEqual(LyricsQuery.cleanTitle("Arcade - Bonus Track"), "Arcade")
        XCTAssertEqual(LyricsQuery.cleanTitle("Кукушка (Live)"), "Кукушка (Live)")
        XCTAssertEqual(LyricsQuery.primaryArtist("Lil Wayne, Ty Dolla $ign, XXXTentacion"), "Lil Wayne")
        XCTAssertEqual(LyricsQuery.primaryArtist("Ondi vil & Mishaal"), "Ondi vil")
        XCTAssertEqual(LyricsQuery.knownArtist("Неизвестен"), "")

        let vk = Song(id: "v", title: "Scars (feat. mishaal)", artist: "Ondi vil & Mishaal", album: "VK", duration: 96)
        let first = try XCTUnwrap(URLComponents(url: try XCTUnwrap(LrclibClient.searchURLs(for: vk).first), resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(first.first { $0.name == "track_name" }?.value, "Scars")
        XCTAssertEqual(first.first { $0.name == "artist_name" }?.value, "Ondi vil")
        let unknown = LrclibClient.searchURLs(for: Song(id: "u", title: "ALL TIME LOW - Jon Bellion (Version SAD)", artist: "Неизвестен"))
        XCTAssertEqual(unknown.count, 1)
        XCTAssertEqual(URLComponents(url: unknown[0], resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "ALL TIME LOW - Jon Bellion")

        let records = [
            LrclibClient.Record(duration: 140, syncedLyrics: "[00:01.00] чужая версия"),
            LrclibClient.Record(duration: 96, syncedLyrics: "[00:02.00] та самая"),
        ]
        XCTAssertEqual(LrclibClient.pick(records, duration: 96)?.line?.map(\.start), [2000])
        let sped = LrclibClient.pick([LrclibClient.Record(duration: 244, syncedLyrics: "[00:01.00] раз\n[00:02.00] два")], duration: 203)
        XCTAssertEqual(sped?.synced, false)
        XCTAssertEqual(sped?.line?.map(\.value), ["раз", "два"])
    }

    func testAutoReplayGainFollowsTheAlbumOnlyInOrder() {
        func song(_ id: String, _ album: String?) -> Song { Song(id: id, title: id, albumId: album) }
        let album = [song("a1", "A"), song("a2", "A"), song("a3", "A")]
        XCTAssertEqual(ReplayGainMode.auto.resolved(songs: album, index: 1, shuffled: false), .album)
        XCTAssertEqual(ReplayGainMode.auto.resolved(songs: album, index: 1, shuffled: true), .track)
        XCTAssertEqual(ReplayGainMode.auto.resolved(songs: [song("x", "A"), song("y", "B")], index: 1, shuffled: false), .track)
        XCTAssertEqual(ReplayGainMode.album.resolved(songs: album, index: 0, shuffled: true), .album)
    }
}
