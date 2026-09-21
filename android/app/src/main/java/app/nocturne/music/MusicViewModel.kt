package app.nocturne.music

import android.app.Application
import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.*
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.nocturne.core.*
import kotlinx.coroutines.*

internal data class Detail(val title: String, val cover: String? = null, val songs: List<Song> = emptyList(), val albums: List<Album> = emptyList(), val loading: Boolean = true)
internal data class Playback(val current: Song? = null, val playing: Boolean = false, val buffering: Boolean = false, val position: Long = 0, val duration: Long = 0, val shuffle: Boolean = false, val repeat: Int = Player.REPEAT_MODE_OFF, val queue: List<Song> = emptyList())

internal class MusicViewModel(application: Application) : AndroidViewModel(application) {
    var client: NavidromeClient? by mutableStateOf(null); private set
    var demo by mutableStateOf(false); private set
    var albums by mutableStateOf(emptyList<Album>()); private set
    var favorites by mutableStateOf(emptyList<Album>()); private set
    var artists by mutableStateOf(emptyList<Artist>()); private set
    var playlists by mutableStateOf(emptyList<Playlist>()); private set
    var detail by mutableStateOf<Detail?>(null); private set
    var search by mutableStateOf(SearchResult()); private set
    var searchLoading by mutableStateOf(false); private set
    var loading by mutableStateOf(false); private set
    var connecting by mutableStateOf(false); private set
    var hasMore by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var playback by mutableStateOf(Playback()); private set
    private val vault = CredentialVault(application)
    private var sessionVersion = 0
    private var detailJob: Job? = null
    private var searchJob: Job? = null
    private var controller: MediaController? = null
    private val controllerFuture = MediaController.Builder(application, SessionToken(application, ComponentName(application, PlaybackService::class.java))).buildAsync()

    init {
        try { client = vault.load()?.let(::NavidromeClient) }
        catch (_: Exception) { error = "Не удалось прочитать сохранённый вход. Подключи сервер заново." }
        if (client != null) refresh()
        controllerFuture.addListener({
            try {
                controller = controllerFuture.get().apply {
                    addListener(object : Player.Listener {
                        override fun onEvents(player: Player, events: Player.Events) { updatePlayback() }
                        override fun onPlayerError(error: PlaybackException) { this@MusicViewModel.error = "Не удалось воспроизвести трек. Проверь сеть и транскодирование Navidrome." }
                    })
                }
                updatePlayback()
            } catch (_: Exception) { error = "Аудиосервис недоступен. Перезапусти приложение." }
        }, ContextCompat.getMainExecutor(application))
        viewModelScope.launch { while (isActive) { updatePlayback(); delay(500) } }
    }

    fun connect(server: String, username: String, password: String, onSuccess: () -> Unit) {
        if (connecting) return
        connecting = true; error = null
        viewModelScope.launch {
            try {
                val credentials = Credentials(server, username, password)
                val candidate = NavidromeClient(credentials)
                candidate.request("ping")
                withContext(Dispatchers.IO) { vault.save(credentials) }
                resetSession(); client = candidate; demo = false
                refresh(); onSuccess()
            } catch (error: Exception) { report(error) }
            finally { connecting = false }
        }
    }
    fun useDemo() {
        resetSession(); client = null; demo = true
        albums = DemoLibrary.albums; favorites = albums.takeLast(2)
        artists = albums.map { Artist(it.id, it.artist, 1, it.coverArt) }
    }
    fun disconnect() {
        try { vault.clear(); resetSession(); client = null; demo = false }
        catch (_: Exception) { error = "Не удалось удалить сохранённый вход." }
    }
    private fun resetSession() {
        sessionVersion++; detailJob?.cancel(); searchJob?.cancel(); controller?.stop(); controller?.clearMediaItems()
        albums = emptyList(); favorites = emptyList(); artists = emptyList(); playlists = emptyList()
        detail = null; search = SearchResult(); searchLoading = false; loading = false; hasMore = false; error = null
    }
    fun refresh(more: Boolean = false) {
        val api = client ?: return
        if (loading) return
        val version = sessionVersion
        loading = true; error = null
        viewModelScope.launch {
            try {
                if (more) {
                    val next = api.albums(offset = albums.size)
                    if (version == sessionVersion) { albums = albums + next; hasMore = next.size == 40 }
                } else {
                    val results = coroutineScope {
                        val recent = async { api.albums() }; val starred = async { api.albums("starred") }
                        val people = async { api.artists() }; val lists = async { api.playlists() }
                        LibraryResult(recent.await(), starred.await(), people.await(), lists.await())
                    }
                    if (version == sessionVersion) {
                        albums = results.albums; favorites = results.favorites; artists = results.artists; playlists = results.playlists
                        hasMore = albums.size == 40
                    }
                }
            } catch (error: Exception) { if (version == sessionVersion) report(error) }
            finally { if (version == sessionVersion) loading = false }
        }
    }
    fun openAlbum(album: Album) = loadDetail(album.name, album.coverArt) {
        Detail(album.name, album.coverArt, songs = if (demo) DemoLibrary.songs(album) else client?.songs(album.id).orEmpty(), loading = false)
    }
    fun openArtist(artist: Artist) = loadDetail(artist.name, artist.coverArt) {
        Detail(artist.name, artist.coverArt, albums = if (demo) albums.filter { it.artist == artist.name } else client?.artistAlbums(artist.id).orEmpty(), loading = false)
    }
    fun openPlaylist(playlist: Playlist) = loadDetail(playlist.name, playlist.coverArt) {
        Detail(playlist.name, playlist.coverArt, songs = client?.playlistSongs(playlist.id).orEmpty(), loading = false)
    }
    private fun loadDetail(title: String, cover: String?, block: suspend () -> Detail) {
        detailJob?.cancel(); detail = Detail(title, cover)
        detailJob = viewModelScope.launch {
            try { val result = block(); ensureActive(); detail = result }
            catch (error: Exception) { if (error !is CancellationException) { report(error); detail = detail?.copy(loading = false) } }
        }
    }
    fun closeDetail() { detailJob?.cancel(); detail = null }
    fun search(query: String) {
        searchJob?.cancel(); search = SearchResult()
        if (query.isBlank()) { searchLoading = false; return }
        searchLoading = true
        searchJob = viewModelScope.launch {
            try {
                delay(300)
                val result = if (demo) SearchResult(
                    albums.filter { (it.name + it.artist).contains(query, ignoreCase = true) },
                    albums.flatMap(DemoLibrary::songs).filter { it.title.contains(query, ignoreCase = true) },
                    artists.filter { it.name.contains(query, ignoreCase = true) },
                ) else client?.search(query) ?: SearchResult()
                ensureActive(); search = result
            } catch (error: Exception) { report(error) }
            finally { if (isActive) searchLoading = false }
        }
    }
    fun play(songs: List<Song>, index: Int = 0) {
        val api = client
        if (demo || api == null) { error = "Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку."; return }
        val player = controller ?: run { error = "Аудиосервис ещё подключается. Попробуй через секунду."; return }
        if (index !in songs.indices) return
        val items = songs.map { song ->
            val extras = Bundle().apply { putString("coverId", song.coverArt); putLong("durationMillis", ((song.duration ?: 0.0) * 1000).toLong()) }
            MediaItem.Builder().setMediaId(song.id).setUri(api.stream(song.id)).setMediaMetadata(
                MediaMetadata.Builder().setTitle(song.title).setArtist(song.artist).setAlbumTitle(song.album)
                    .setArtworkUri(api.cover(song.coverArt)?.let(Uri::parse)).setExtras(extras).build()
            ).build()
        }
        player.setMediaItems(items, index, 0); player.prepare(); player.play()
    }
    fun toggle() { controller?.let { if (it.playWhenReady) it.pause() else { if (it.playbackState == Player.STATE_ENDED) it.seekToDefaultPosition(); it.play() } } }
    fun next() { controller?.seekToNextMediaItem() }
    fun previous() { controller?.seekToPrevious() }
    fun seek(position: Long) { controller?.seekTo(position.coerceAtLeast(0)) }
    fun selectQueue(index: Int) { controller?.let { it.seekToDefaultPosition(index); it.play() } }
    fun shuffle() { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun repeat() { controller?.let { it.repeatMode = when (it.repeatMode) { Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL; Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF } } }
    private fun updatePlayback() {
        val player = controller ?: return
        val songs = (0 until player.mediaItemCount).map { index ->
            val item = player.getMediaItemAt(index); val meta = item.mediaMetadata
            Song(item.mediaId, meta.title?.toString().orEmpty(), meta.artist?.toString().orEmpty(), meta.albumTitle?.toString().orEmpty(), meta.extras?.getString("coverId"), meta.extras?.getLong("durationMillis")?.takeIf { it > 0 }?.div(1000.0))
        }
        playback = Playback(songs.getOrNull(player.currentMediaItemIndex), player.isPlaying, player.playbackState == Player.STATE_BUFFERING,
            player.currentPosition.coerceAtLeast(0), player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: ((songs.getOrNull(player.currentMediaItemIndex)?.duration ?: 0.0) * 1000).toLong(),
            player.shuffleModeEnabled, player.repeatMode, songs)
    }
    private fun report(error: Exception) { if (error !is CancellationException) this.error = if (error is MusicException) error.message else "Не удалось выполнить действие. Проверь подключение." }
    override fun onCleared() { MediaController.releaseFuture(controllerFuture); super.onCleared() }
    private data class LibraryResult(val albums: List<Album>, val favorites: List<Album>, val artists: List<Artist>, val playlists: List<Playlist>)
}
