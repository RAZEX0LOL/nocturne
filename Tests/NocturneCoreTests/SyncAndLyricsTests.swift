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
        XCTAssertEqual(items.first { $0.name == "album_name" }?.value, "Чёрный альбом")
        let synced = LrclibClient.decode(Data(#"{"syncedLyrics":"[00:01.00] Песен ещё ненаписанных","plainLyrics":"x"}"#.utf8))
        XCTAssertEqual(synced?.synced, true)
        XCTAssertEqual(synced?.line?.first?.start, 1000)
        let plain = LrclibClient.decode(Data(#"{"plainLyrics":"раз\nдва"}"#.utf8))
        XCTAssertEqual(plain?.synced, false)
        XCTAssertEqual(plain?.line?.map(\.value), ["раз", "два"])
        XCTAssertNil(LrclibClient.decode(Data("{}".utf8)))
        XCTAssertNil(LrclibClient.url(for: Song(id: "s", title: "Без исполнителя")))
    }
}
