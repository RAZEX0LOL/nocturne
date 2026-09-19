import Foundation

struct Album: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var artist: String?
    var coverArt: String?
    var songCount: Int?
    var year: Int?
    var starred: String?
    var song: [Song]?
}

struct Song: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var title: String
    var artist: String?
    var album: String?
    var coverArt: String?
    var duration: Double?
    var track: Int?
    var starred: String?
    var userRating: Int?
    var genre: String?
    /// OpenSubsonic ReplayGain values in dB.
    var replayGain: ReplayGain?
}

struct ReplayGain: Codable, Hashable, Sendable {
    var trackGain: Double?
    var albumGain: Double?
    var trackPeak: Double?
    var albumPeak: Double?
}

struct RadioStation: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    var name: String
    var streamUrl: String
    var homePageUrl: String?
}
struct RadioList: Decodable, Sendable { var internetRadioStation: [RadioStation]? }
struct ArtistInfo: Decodable, Sendable { var biography: String?; var largeImageUrl: String? }
struct AlbumInfo: Decodable, Sendable { var notes: String? }
struct Share: Decodable, Sendable { var url: String }
struct ShareList: Decodable, Sendable { var share: [Share]? }

struct MusicPlaylist: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var songCount: Int?
    var coverArt: String?
    var entry: [Song]?
}

struct Artist: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var albumCount: Int?
    var coverArt: String?
    var album: [Album]?
}

struct AlbumList: Decodable, Sendable { var album: [Album]? }
struct PlaylistList: Decodable, Sendable { var playlist: [MusicPlaylist]? }
struct ArtistIndex: Decodable, Sendable { var artist: [Artist]? }
struct ArtistList: Decodable, Sendable { var index: [ArtistIndex]? }
struct SearchResult: Decodable, Sendable {
    var album: [Album]?
    var song: [Song]?
    var artist: [Artist]?
}

struct SongList: Decodable, Sendable { var song: [Song]? }
struct Starred: Decodable, Sendable { var song: [Song]?; var album: [Album]?; var artist: [Artist]? }
struct Genre: Decodable, Hashable, Identifiable, Sendable {
    let value: String
    var songCount: Int?
    var albumCount: Int?
    var id: String { value }
}
struct GenreList: Decodable, Sendable { var genre: [Genre]? }

/// OpenSubsonic structured lyrics; `start` is in milliseconds when `synced` is true.
struct LyricLine: Decodable, Hashable, Sendable { var start: Int?; var value: String }
struct StructuredLyrics: Decodable, Sendable { var lang: String?; var synced: Bool; var line: [LyricLine]? }
struct LyricsList: Decodable, Sendable { var structuredLyrics: [StructuredLyrics]? }
struct PlainLyrics: Decodable, Sendable { var value: String? }

struct ServerError: Decodable, Sendable { let code: Int; let message: String? }
struct ServerResponse: Decodable, Sendable {
    let status: String
    var error: ServerError?
    var albumList2: AlbumList?
    var album: Album?
    var playlists: PlaylistList?
    var playlist: MusicPlaylist?
    var artists: ArtistList?
    var artist: Artist?
    var searchResult3: SearchResult?
    var starred2: Starred?
    var topSongs: SongList?
    var randomSongs: SongList?
    var genres: GenreList?
    var lyricsList: LyricsList?
    var lyrics: PlainLyrics?
    var similarSongs2: SongList?
    var internetRadioStations: RadioList?
    var artistInfo2: ArtistInfo?
    var albumInfo: AlbumInfo?
    var shares: ShareList?
}

struct ResponseEnvelope: Decodable, Sendable {
    let response: ServerResponse
    enum CodingKeys: String, CodingKey { case response = "subsonic-response" }
}

enum MusicError: LocalizedError {
    case invalidServer, http(Int), server(Int), invalidResponse, keychain, demo, offline
    var errorDescription: String? {
        switch self {
        case .invalidServer: "Укажи HTTPS-адрес сервера без логина, параметров и фрагмента. HTTP разрешён только для локальной сети."
        case .http(let code): "Сервер вернул HTTP \(code). Проверь адрес и доступность Navidrome."
        case .server(let code): code == 40 ? "Неверный логин или пароль." : "Ошибка Navidrome (\(code))."
        case .invalidResponse: "Сервер вернул неожиданный ответ. Проверь адрес Navidrome."
        case .keychain: "Не удалось сохранить данные в Связке ключей."
        case .demo: "Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку."
        case .offline: "Нет подключения к сети."
        }
    }
}

enum DemoLibrary {
    static let albums: [Album] = [
        Album(id: "demo-0", name: "Параллели", artist: "Свет внутри", coverArt: "demo-0", songCount: 8, year: 2025),
        Album(id: "demo-1", name: "Тихие дни", artist: "Корали", coverArt: "demo-1", songCount: 10, year: 2024),
        Album(id: "demo-2", name: "Где-то дальше", artist: "Монолит", coverArt: "demo-2", songCount: 6, year: 2025),
        Album(id: "demo-3", name: "Поздний июль", artist: "Небо рядом", coverArt: "demo-3", songCount: 9, year: 2024),
        Album(id: "demo-4", name: "Afterglow", artist: "North Coast", coverArt: "demo-4", songCount: 7, year: 2025),
        Album(id: "demo-5", name: "Сны на повторе", artist: "Каменные реки", coverArt: "demo-5", songCount: 12, year: 2023)
    ]
    static func songs(for album: Album) -> [Song] {
        ["Первый свет", "Между нами", "Тишина", "Afterglow", "Остаться"].enumerated().map {
            Song(id: "\(album.id)-\($0.offset)", title: $0.element, artist: album.artist,
                 album: album.name, coverArt: album.coverArt, duration: Double(210 + $0.offset * 17), track: $0.offset + 1)
        }
    }
}
