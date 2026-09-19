import XCTest
@testable import NocturneCore

final class PlaybackQueueTests: XCTestCase {
    private let songs = (0..<6).map { Song(id: "s\($0)", title: "Song \($0)") }
    private func ids(_ entries: some Sequence<PlaybackQueue.Entry>) -> [String] { entries.map(\.song.id) }

    func testLinearOrderAndEnd() {
        var queue = PlaybackQueue(songs: songs, startAt: 4, shuffle: false)
        XCTAssertEqual(queue.current?.song.id, "s4")
        XCTAssertEqual(queue.nextPosition(automatic: true), 5)
        queue.jump(to: 5)
        XCTAssertNil(queue.nextPosition(automatic: true))
        queue.repeatMode = .all
        XCTAssertEqual(queue.nextPosition(automatic: true), 0)
    }

    func testRepeatOneLoopsOnlyAutomatically() {
        var queue = PlaybackQueue(songs: songs, startAt: 2, shuffle: false)
        queue.repeatMode = .one
        XCTAssertEqual(queue.nextPosition(automatic: true), 2)
        XCTAssertEqual(queue.nextPosition(automatic: false), 3)
    }

    func testShuffleIsPermutationWithCurrentFirstAndPreviousWorks() {
        var queue = PlaybackQueue(songs: songs, startAt: 3, shuffle: true)
        XCTAssertEqual(queue.current?.song.id, "s3")
        XCTAssertEqual(queue.position, 0)
        XCTAssertEqual(Set(ids(queue.items)), Set(ids(queue.natural)))
        XCTAssertEqual(queue.items.count, songs.count)
        let second = queue.items[1].song.id
        queue.jump(to: queue.nextPosition(automatic: false)!)
        queue.jump(to: queue.nextPosition(automatic: false)!)
        queue.jump(to: queue.previousPosition()!)
        XCTAssertEqual(queue.current?.song.id, second, "previous returns to the track that actually played")
    }

    func testShuffleOffRestoresNaturalOrderAroundCurrent() {
        var queue = PlaybackQueue(songs: songs, startAt: 0, shuffle: true)
        queue.jump(to: 3)
        let playing = queue.current!.song.id
        queue.setShuffle(false)
        XCTAssertEqual(ids(queue.items), ids(songs.map(PlaybackQueue.Entry.init)))
        XCTAssertEqual(queue.current?.song.id, playing)
    }

    func testInsertNextAppendRemoveAndMove() {
        var queue = PlaybackQueue(songs: Array(songs.prefix(3)), startAt: 1, shuffle: false)
        queue.insertNext([Song(id: "n", title: "Next")])
        queue.append([Song(id: "a", title: "Last")])
        XCTAssertEqual(ids(queue.items), ["s0", "s1", "n", "s2", "a"])
        queue.moveUpcoming(fromOffsets: [2], toOffset: 0)
        XCTAssertEqual(ids(queue.upcoming), ["a", "n", "s2"])
        queue.remove(id: queue.items[0].id)
        XCTAssertEqual(queue.current?.song.id, "s1", "removing history keeps the current track")
        queue.remove(id: queue.current!.id)
        XCTAssertEqual(queue.items.count, 4, "current entry can't be removed")
    }

    func testSnapshotRoundTrip() throws {
        var queue = PlaybackQueue(songs: songs, startAt: 2, shuffle: true)
        queue.repeatMode = .all
        let snapshot = QueueSnapshot(account: "joe@https://host", queue: queue, elapsed: 42)
        let decoded = try JSONDecoder().decode(QueueSnapshot.self, from: JSONEncoder().encode(snapshot))
        XCTAssertEqual(decoded, snapshot)
    }
}
