import XCTest
@testable import NocturneCore

final class NavidromeClientTests: XCTestCase {
    func testSubsonicAuthenticationMatchesOfficialVector() throws {
        let client = NavidromeClient(credentials: try Credentials(server: "https://music.example.com", username: "joe", password: "sesame"))
        let url = try client.url("ping", salt: "c19b2d")
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(query.first { $0.name == "t" }?.value, "26719a1196d2a940705a59634eb18eab")
        XCTAssertFalse(query.contains { $0.name == "p" })
        XCTAssertFalse(url.absoluteString.contains("sesame"))
    }

    func testServerSubpathAndUnicodeArePreserved() throws {
        let client = NavidromeClient(credentials: try Credentials(server: "https://music.example.com/navidrome/", username: "Иван + &", password: "test-only"))
        let url = try client.url("search3", parameters: ["query": "a&b + ночь"])
        XCTAssertEqual(url.path, "/navidrome/rest/search3.view")
        XCTAssertFalse(url.absoluteString.contains("+"))
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(query.first { $0.name == "u" }?.value, "Иван + &")
        XCTAssertEqual(query.first { $0.name == "query" }?.value, "a&b + ночь")
    }

    func testInvalidAndInsecureServerAddressesAreRejected() {
        for address in ["http://music.example.com", "ftp://host", "https://", "https://joe:secret@host", "https://host?token=value", "https://host/#secret"] {
            XCTAssertThrowsError(try Credentials(server: address, username: "test", password: "test-only"), address)
        }
    }

    func testPlainHTTPIsAllowedOnlyForLocalNetwork() throws {
        for address in ["http://192.168.1.20:4533", "http://10.0.0.5", "http://172.20.1.1", "http://nas.local:4533",
                        "http://localhost:4533", "http://nas", "http://100.101.102.103", "http://[fd12::1]:4533"] {
            XCTAssertTrue(try Credentials(server: address, username: "test", password: "test-only").isInsecure, address)
        }
        for address in ["http://8.8.8.8", "http://172.32.0.1", "http://music.example.com", "http://192.168.1.example.com"] {
            XCTAssertThrowsError(try Credentials(server: address, username: "test", password: "test-only"), address)
        }
        XCTAssertFalse(try Credentials(server: "https://music.example.com", username: "t", password: "p").isInsecure)
    }

    func testAccountKeyHasNoPassword() throws {
        let credentials = try Credentials(server: "https://host/navidrome", username: "joe", password: "sesame")
        XCTAssertEqual(credentials.account, "joe@https://host/navidrome")
    }

    func testStreamQualityParameters() {
        XCTAssertEqual(StreamQuality.original.streamParameters, ["format": "raw"])
        XCTAssertEqual(StreamQuality.mp3Medium.streamParameters["maxBitRate"], "192")
    }

    func testEmptyCredentialsAreRejected() {
        XCTAssertThrowsError(try Credentials(server: "https://host", username: "  ", password: "test-only"))
        XCTAssertThrowsError(try Credentials(server: "https://host", username: "test", password: ""))
    }

    func testEachRequestUsesFreshSalt() throws {
        let client = NavidromeClient(credentials: try Credentials(server: "https://host", username: "test", password: "test-only"))
        XCTAssertNotEqual(try client.url("ping"), try client.url("ping"))
    }

    func testAuthenticationFailureInsideHTTP200IsRejected() {
        let data = Data(#"{"subsonic-response":{"status":"failed","error":{"code":40,"message":"private detail"}}}"#.utf8)
        XCTAssertThrowsError(try NavidromeClient.decode(data)) { error in
            XCTAssertEqual(error.localizedDescription, "Неверный логин или пароль.")
            XCTAssertFalse(error.localizedDescription.contains("private detail"))
        }
    }

    func testMissingOptionalAlbumMetadataAndEmptyLists() throws {
        let data = Data(#"{"subsonic-response":{"status":"ok","albumList2":{"album":[{"id":"1","name":"Album"}]}}}"#.utf8)
        let response = try NavidromeClient.decode(data)
        XCTAssertEqual(response.albumList2?.album?.first?.name, "Album")
        XCTAssertNil(response.albumList2?.album?.first?.artist)
        let empty = try NavidromeClient.decode(Data(#"{"subsonic-response":{"status":"ok","albumList2":{}}}"#.utf8))
        XCTAssertNil(empty.albumList2?.album)
    }

    func testMalformedOrHTMLResponseIsRejected() {
        XCTAssertThrowsError(try NavidromeClient.decode(Data("<html>Proxy login</html>".utf8)))
        XCTAssertThrowsError(try NavidromeClient.decode(Data(#"{"unrelated":true}"#.utf8)))
    }

    func testAlbumSongsDecodeFractionalDuration() throws {
        let data = Data(#"{"subsonic-response":{"status":"ok","album":{"id":"a","name":"Album","song":[{"id":"s","title":"Song","duration":123.5}]}}}"#.utf8)
        XCTAssertEqual(try NavidromeClient.decode(data).album?.song?.first?.duration, 123.5)
    }

    func testRepeatedParametersKeepOrder() throws {
        let client = NavidromeClient(credentials: try Credentials(server: "https://host", username: "test", password: "test-only"))
        let url = try client.url("createPlaylist", parameters: ["name": "Mix"], repeated: ["a", "b"].map { URLQueryItem(name: "songId", value: $0) })
        let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(items.filter { $0.name == "songId" }.map(\.value), ["a", "b"])
    }

    func testStarredGenresAndLyricsDecode() throws {
        let data = Data(#"""
        {"subsonic-response":{"status":"ok","starred2":{"song":[{"id":"s","title":"Song"}]},
         "genres":{"genre":[{"value":"Rock","albumCount":3}]},
         "lyricsList":{"structuredLyrics":[{"lang":"xxx","synced":true,"line":[{"start":1200,"value":"Hi"}]}]}}}
        """#.utf8)
        let response = try NavidromeClient.decode(data)
        XCTAssertEqual(response.starred2?.song?.first?.id, "s")
        XCTAssertEqual(response.genres?.genre?.first?.value, "Rock")
        XCTAssertEqual(response.lyricsList?.structuredLyrics?.first?.line?.first?.start, 1200)
    }

    func testRadioShareAndReplayGainDecode() throws {
        let data = Data(#"""
        {"subsonic-response":{"status":"ok",
         "internetRadioStations":{"internetRadioStation":[{"id":"r1","name":"Jazz","streamUrl":"https://radio.example/jazz"}]},
         "shares":{"share":[{"id":"x","url":"https://music.example/share/abc"}]},
         "album":{"id":"a","name":"A","song":[{"id":"s","title":"S","userRating":4,"replayGain":{"trackGain":-7.5,"trackPeak":0.98}}]}}}
        """#.utf8)
        let response = try NavidromeClient.decode(data)
        XCTAssertEqual(response.internetRadioStations?.internetRadioStation?.first?.streamUrl, "https://radio.example/jazz")
        XCTAssertEqual(response.shares?.share?.first?.url, "https://music.example/share/abc")
        XCTAssertEqual(response.album?.song?.first?.replayGain?.trackGain, -7.5)
        XCTAssertEqual(response.album?.song?.first?.userRating, 4)
    }
}
