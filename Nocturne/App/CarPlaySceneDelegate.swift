import CarPlay
import UIKit

/// CarPlay audio app: tabs for favourites, recently played albums, playlists and radio.
/// Requires the `com.apple.developer.carplay-audio` entitlement (granted by Apple on request).
@MainActor
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interface: CPInterfaceController?
    private var library: LibraryStore { .shared }
    private var player: PlayerStore { .shared }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
        interface = interfaceController
        let favorites = CPListTemplate(title: String(localized: "Любимое"), sections: [])
        favorites.tabImage = UIImage(systemName: "heart.fill")
        let recent = CPListTemplate(title: String(localized: "Недавно"), sections: [])
        recent.tabImage = UIImage(systemName: "clock")
        let playlists = CPListTemplate(title: String(localized: "Плейлисты"), sections: [])
        playlists.tabImage = UIImage(systemName: "music.note.list")
        let radio = CPListTemplate(title: String(localized: "Радио"), sections: [])
        radio.tabImage = UIImage(systemName: "antenna.radiowaves.left.and.right")
        interfaceController.setRootTemplate(CPTabBarTemplate(templates: [favorites, recent, playlists, radio]), animated: false, completion: nil)
        Task { await fill(favorites: favorites, recent: recent, playlists: playlists, radio: radio) }
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        interface = nil
    }

    private func fill(favorites: CPListTemplate, recent: CPListTemplate, playlists: CPListTemplate, radio: CPListTemplate) async {
        guard let client = library.client else {
            favorites.updateSections([CPListSection(items: [CPListItem(text: String(localized: "Подключи сервер в приложении на iPhone"), detailText: nil)])])
            return
        }
        if library.starredSongs.isEmpty { await library.refresh() }
        favorites.updateSections([CPListSection(items: songItems(library.starredSongs))])
        recent.updateSections([CPListSection(items: (library.recentlyPlayed.isEmpty ? library.albums : library.recentlyPlayed).prefix(20).map(albumItem))])
        playlists.updateSections([CPListSection(items: library.playlists.map { playlist in
            let item = CPListItem(text: playlist.name, detailText: String(localized: "Треков: \(playlist.songCount ?? 0)"))
            item.handler = { [weak self] _, completion in
                Task { @MainActor in
                    let songs = (try? await client.request("getPlaylist", parameters: ["id": playlist.id]).playlist?.entry) ?? []
                    self?.play(songs, at: 0)
                    completion()
                }
            }
            return item
        })])
        let stations = (try? await client.radioStations()) ?? []
        radio.updateSections([CPListSection(items: stations.map { station in
            let item = CPListItem(text: station.name, detailText: URL(string: station.streamUrl)?.host())
            item.handler = { [weak self] _, completion in
                Task { @MainActor in
                    self?.player.playRadio(station, client: client)
                    self?.showNowPlaying()
                    completion()
                }
            }
            return item
        })])
    }

    private func songItems(_ songs: [Song]) -> [CPListItem] {
        songs.prefix(CPListTemplate.maximumItemCount).enumerated().map { index, song in
            let item = CPListItem(text: song.title, detailText: song.artist)
            item.handler = { [weak self] _, completion in
                Task { @MainActor in self?.play(songs, at: index); completion() }
            }
            loadArtwork(song.coverArt, into: item)
            return item
        }
    }

    private func albumItem(_ album: Album) -> CPListItem {
        let item = CPListItem(text: album.name, detailText: album.artist)
        item.handler = { [weak self] _, completion in
            Task { @MainActor in
                let songs = (try? await self?.library.client?.songs(albumID: album.id)) ?? []
                self?.play(songs, at: 0)
                completion()
            }
        }
        loadArtwork(album.coverArt, into: item)
        return item
    }

    private func play(_ songs: [Song], at index: Int) {
        guard !songs.isEmpty else { return }
        player.play(songs, at: index, client: library.client)
        showNowPlaying()
    }

    private func showNowPlaying() {
        guard let interface, !(interface.topTemplate is CPNowPlayingTemplate) else { return }
        interface.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
    }

    private func loadArtwork(_ id: String?, into item: CPListItem) {
        guard let id, let client = library.client else { return }
        Task { @MainActor in
            if let image = await ArtworkCache.shared.image(id: id, bucket: 160, client: client) { item.setImage(image) }
        }
    }
}
