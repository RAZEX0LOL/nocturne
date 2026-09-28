package app.nocturne.music

import android.app.Application
import android.content.ComponentName
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
import java.io.File
import kotlinx.coroutines.*

internal data class Detail(
    val title: String,
    val cover: String? = null,
    val songs: List<Song> = emptyList(),
    val albums: List<Album> = emptyList(),
    val loading: Boolean = true,
)

internal data class Playback(
    val current: Song? = null,
    val playing: Boolean = false,
    val buffering: Boolean = false,
    val position: Long = 0,
    val duration: Long = 0,
    val shuffle: Boolean = false,
    val repeat: PlaybackQueue.Repeat = PlaybackQueue.Repeat.off,
    val queue: List<Song> = emptyList(),
    val index: Int = 0,
)

internal class MusicViewModel(application: Application) : AndroidViewModel(application) {
    var client: NavidromeClient? by mutableStateOf(null); private set
    var demo by mutableStateOf(false); private set
    /** Сервер сохранён, но недоступен: играем то, что на телефоне. */
    var offline by mutableStateOf(false); private set
    /** Человек выбрал обходиться без сервера вовсе. */
    var onDeviceOnly by mutableStateOf(false); private set

    var albums by mutableStateOf(emptyList<Album>()); private set
    var favorites by mutableStateOf(emptyList<Album>()); private set
    var starred by mutableStateOf(emptyList<Song>()); private set
    var artists by mutableStateOf(emptyList<Artist>()); private set
    var playlists by mutableStateOf(emptyList<Playlist>()); private set
    var local by mutableStateOf(emptyList<Song>()); private set
    var downloaded by mutableStateOf(emptyList<Song>()); private set
    var downloading by mutableStateOf(emptySet<String>()); private set
    var importing by mutableStateOf(false); private set
    var detail by mutableStateOf<Detail?>(null); private set
    var search by mutableStateOf(SearchResult()); private set
    var searchLoading by mutableStateOf(false); private set
    var loading by mutableStateOf(false); private set
    var connecting by mutableStateOf(false); private set
    var hasMore by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var notice by mutableStateOf<String?>(null)
    var playback by mutableStateOf(Playback()); private set
    var lyrics by mutableStateOf<List<LyricLine>?>(null); private set
    var sleepAt by mutableStateOf<Long?>(null); private set

    val settings = Settings(application)
    val musicFolder: String get() = localLibrary.folderPath

    private val vault = CredentialVault(application)
    private val localLibrary = LocalLibrary(application)
    private val downloads = DownloadStore(application)
    private val scrobbles = PendingScrobbles(application)
    private val snapshots = QueueSnapshots(application)
    /** Очередь возвращаем один раз за запуск — и только когда плеер и диск уже готовы. */
    private var restored = false
    private var queue: PlaybackQueue? = null
    private var sessionVersion = 0
    private var detailJob: Job? = null
    private var searchJob: Job? = null
    private var sleepJob: Job? = null
    private var startedAt = 0L
    private var scrobbled = false
    private var controller: MediaController? = null
    private val controllerFuture = MediaController.Builder(application, SessionToken(application, ComponentName(application, PlaybackService::class.java))).buildAsync()

    init {
        try { client = vault.load()?.let(::NavidromeClient) }
        catch (_: Exception) { error = "Не удалось прочитать сохранённый вход. Подключи сервер заново." }
        onDeviceOnly = client == null && vault.prefersOnDevice()
        viewModelScope.launch { reloadOnDisk() }
        if (client != null) viewModelScope.launch { reconnect() }
        controllerFuture.addListener({
            try {
                controller = controllerFuture.get().apply {
                    addListener(object : Player.Listener {
                        override fun onEvents(player: Player, events: Player.Events) = updatePlayback()
                        override fun onMediaItemTransition(item: MediaItem?, reason: Int) = onTrackChanged()
                        override fun onPlayerError(error: PlaybackException) {
                            this@MusicViewModel.error = "Не удалось воспроизвести трек. Проверь сеть и транскодирование Navidrome."
                        }
                    })
                }
                updatePlayback()
                restoreQueue()
            } catch (_: Exception) { error = "Аудиосервис недоступен. Перезапусти приложение." }
        }, ContextCompat.getMainExecutor(application))
        viewModelScope.launch {
            var lastSavedSecond = -1L
            while (isActive) {
                updatePlayback()
                checkScrobble()
                // Позицию сохраняем раз в несколько секунд: чаще незачем, реже — потеряется место.
                val second = playback.position / 5000
                if (second != lastSavedSecond) {
                    lastSavedSecond = second
                    saveQueue()
                }
                delay(500)
            }
        }
    }

    // MARK: - Подключение

    fun connect(server: String, username: String, password: String, onSuccess: () -> Unit) {
        if (connecting) return
        connecting = true; error = null
        viewModelScope.launch {
            try {
                val credentials = Credentials(server, username, password)
                val candidate = NavidromeClient(credentials)
                candidate.request("ping")
                withContext(Dispatchers.IO) { vault.save(credentials) }
                resetSession(); client = candidate; demo = false; offline = false; onDeviceOnly = false
                refresh(); onSuccess()
            } catch (error: Exception) { report(error) }
            finally { connecting = false }
        }
    }

    /** Режим без сервера: только музыка с телефона. */
    fun useOnDevice() {
        resetSession(); client = null; demo = false; offline = false; onDeviceOnly = true
        vault.rememberOnDevice(true)
        viewModelScope.launch { reloadOnDisk() }
    }

    fun useDemo() {
        resetSession(); client = null; demo = true; onDeviceOnly = false
        albums = DemoLibrary.albums; favorites = albums.takeLast(2)
        artists = albums.map { Artist(it.id, it.artist, 1, it.coverArt) }
    }

    fun showConnect() {
        vault.rememberOnDevice(false)
        resetSession(); client = null; demo = false; onDeviceOnly = false
    }

    fun disconnect() {
        try { snapshots.clear(); vault.clear(); vault.rememberOnDevice(false); resetSession(); client = null; demo = false; offline = false }
        catch (_: Exception) { error = "Не удалось удалить сохранённый вход." }
    }

    /**
     * Повторная проверка связи живёт в области жизни модели, а не экрана: как только связь
     * возвращается, баннер исчезает, и работа, привязанная к нему, оборвалась бы на полпути —
     * вместе с досылкой отметок о прослушивании.
     */
    fun retry() { viewModelScope.launch { reconnect() } }

    /** Проверяет связь: при успехе подтягивает библиотеку и досылает отметки о прослушивании. */
    suspend fun reconnect() {
        val api = client ?: return
        try {
            api.request("ping")
            offline = false
            refresh()
            flushScrobbles()
        } catch (_: Exception) {
            offline = true
        }
    }

    private fun resetSession() {
        sessionVersion++; detailJob?.cancel(); searchJob?.cancel(); controller?.stop(); controller?.clearMediaItems()
        queue = null
        albums = emptyList(); favorites = emptyList(); starred = emptyList(); artists = emptyList(); playlists = emptyList()
        detail = null; search = SearchResult(); searchLoading = false; loading = false; hasMore = false; error = null
    }

    // MARK: - Библиотека сервера

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
                        val recent = async { api.albums() }
                        val starredAlbums = async { api.albums("starred") }
                        val people = async { api.artists() }
                        val lists = async { api.playlists() }
                        val songs = async { api.starredSongs() }
                        LibraryResult(recent.await(), starredAlbums.await(), people.await(), lists.await(), songs.await())
                    }
                    if (version == sessionVersion) {
                        albums = results.albums; favorites = results.favorites; artists = results.artists
                        playlists = results.playlists; starred = results.starred
                        hasMore = albums.size == 40
                        offline = false
                        if (settings.downloadFavorites) download(results.starred.filter { !downloads.isDownloaded(it.id) })
                    }
                }
            } catch (error: Exception) {
                if (version == sessionVersion) {
                    if (error is MusicException && error.message?.contains("логин") == true) report(error) else offline = true
                }
            }
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
                // Своё и скачанное ищем всегда, сервер — когда он доступен.
                val onDisk = (local + downloaded).filter {
                    listOf(it.title, it.artist, it.album).any { field -> field.contains(query, ignoreCase = true) }
                }
                val remote = when {
                    demo -> SearchResult(
                        albums.filter { (it.name + it.artist).contains(query, ignoreCase = true) },
                        albums.flatMap(DemoLibrary::songs).filter { it.title.contains(query, ignoreCase = true) },
                        artists.filter { it.name.contains(query, ignoreCase = true) },
                    )
                    online -> client?.search(query) ?: SearchResult()
                    else -> SearchResult()
                }
                ensureActive()
                val known = remote.songs.map { it.id }.toSet()
                search = remote.copy(songs = onDisk.filter { it.id !in known } + remote.songs)
            } catch (error: Exception) { report(error) }
            finally { if (isActive) searchLoading = false }
        }
    }

    fun toggleStar(song: Song) {
        val api = client ?: return
        if (isLocalId(song.id) || !online) return
        val starring = starred.none { it.id == song.id }
        starred = if (starring) listOf(song) + starred else starred.filterNot { it.id == song.id }
        viewModelScope.launch {
            try { api.favorite(song.id, starring) }
            catch (error: Exception) { report(error); starred = if (starring) starred.filterNot { it.id == song.id } else listOf(song) + starred }
        }
    }

    fun isStarred(song: Song) = starred.any { it.id == song.id }

    fun loadLyrics(song: Song) {
        lyrics = null
        val api = client ?: return
        if (isLocalId(song.id) || !online) return
        viewModelScope.launch { lyrics = runCatching { api.lyrics(song.id) }.getOrDefault(emptyList()) }
    }

    fun addToPlaylist(playlist: Playlist, songs: List<Song>) {
        val api = client ?: return
        viewModelScope.launch {
            try {
                api.addToPlaylist(playlist.id, songs.map { it.id })
                notice = "Добавлено в «${playlist.name}»"
                playlists = api.playlists()
            } catch (error: Exception) { report(error) }
        }
    }

    fun createPlaylist(name: String, songs: List<Song>) {
        val api = client ?: return
        viewModelScope.launch {
            try {
                api.createPlaylist(name, songs.map { it.id })
                notice = "Плейлист «$name» создан"
                playlists = api.playlists()
            } catch (error: Exception) { report(error) }
        }
    }

    // MARK: - Своя музыка и загрузки

    suspend fun reloadOnDisk() {
        local = runCatching { localLibrary.scan() }.getOrDefault(emptyList())
        downloaded = runCatching { downloads.load() }.getOrDefault(emptyList())
        // Что играбельно, теперь известно — можно вернуть сохранённую очередь.
        restoreQueue()
    }

    fun importMusic(uris: List<Uri>) {
        if (uris.isEmpty()) return
        importing = true
        viewModelScope.launch {
            val added = runCatching { localLibrary.import(uris) }.getOrDefault(0)
            reloadOnDisk()
            importing = false
            notice = if (added > 0) "Добавлено на телефон: $added" else "Новых треков не найдено"
        }
    }

    fun rescan() { viewModelScope.launch { reloadOnDisk(); notice = "Треков на телефоне: ${local.size}" } }

    fun removeLocal(song: Song) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { localLibrary.remove(song) }
            reloadOnDisk()
        }
    }

    fun download(songs: List<Song>) {
        val api = client ?: return
        val wanted = songs.filter { !isLocalId(it.id) && !downloads.isDownloaded(it.id) && it.id !in downloading }
        if (wanted.isEmpty()) { notice = "Уже скачано"; return }
        if (settings.downloadOverWifiOnly && !onWifi) { error = "Загрузка только по Wi-Fi — включи Wi-Fi или измени настройку."; return }
        downloading = downloading + wanted.map { it.id }
        viewModelScope.launch {
            var done = 0
            for (song in wanted) {
                val ok = runCatching { downloads.download(api.stream(song.id, settings.quality(onWifi)), song) }.getOrDefault(false)
                if (ok) done++ else error = "Не удалось скачать «${song.title}»"
                downloading = downloading - song.id
                downloaded = runCatching { downloads.load() }.getOrDefault(downloaded)
            }
            if (done > 0) notice = if (done == 1) "Трек скачан" else "Скачано треков: $done"
        }
    }

    fun removeDownload(song: Song) {
        viewModelScope.launch {
            downloads.remove(song)
            downloaded = runCatching { downloads.load() }.getOrDefault(downloaded)
        }
    }

    fun isDownloaded(song: Song) = downloads.isDownloaded(song.id)

    private val online: Boolean get() = (client != null && !offline) || demo

    private val onWifi: Boolean
        get() {
            val manager = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return true
            val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
            return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        }

    /** Можно ли сыграть трек прямо сейчас — правило из shared/cases/source.json. */
    fun isPlayable(song: Song) = sourceOf(song) != SourceKind.unavailable

    private fun sourceOf(song: Song) = chooseSource(
        song.id,
        Availability(
            local = local.map { it.id }.toSet(),
            downloaded = downloaded.map { it.id }.toSet(),
            online = client != null && !offline,
        ),
    )

    // MARK: - Воспроизведение

    fun play(songs: List<Song>, index: Int = 0, shuffle: Boolean = false) {
        if (demo) { error = "Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку."; return }
        val chosen = songs.getOrNull(index) ?: return
        if (!isPlayable(chosen)) { notice = "Трек не скачан — недоступен без сети"; return }
        val playable = songs.filter { isPlayable(it) }
        val prepared = PlaybackQueue(playable, playable.indexOf(chosen), shuffle)
        queue = prepared
        pushQueue(prepared, play = true)
    }

    fun playNext(songs: List<Song>) {
        val prepared = queue ?: return play(songs)
        val playable = songs.filter { isPlayable(it) }
        if (playable.isEmpty()) return
        prepared.insertNext(playable)
        pushQueue(prepared, play = false, keepPosition = true)
        notice = if (playable.size == 1) "Сыграет следующим" else "Следующими: ${playable.size}"
    }

    fun appendToQueue(songs: List<Song>) {
        val prepared = queue ?: return play(songs)
        val playable = songs.filter { isPlayable(it) }
        if (playable.isEmpty()) return
        prepared.append(playable)
        pushQueue(prepared, play = false, keepPosition = true)
        notice = if (playable.size == 1) "Добавлено в очередь" else "В очередь: ${playable.size}"
    }

    fun removeFromQueue(index: Int) {
        val prepared = queue ?: return
        prepared.items.getOrNull(index)?.let { prepared.remove(it.id) }
        pushQueue(prepared, play = false, keepPosition = true)
    }

    /**
     * Порядок треков задаёт общая очередь из ядра, а ExoPlayer только проигрывает готовый список:
     * своё перемешивание у него другое, и «назад» после него ведёт не туда.
     */
    private fun pushQueue(prepared: PlaybackQueue, play: Boolean, keepPosition: Boolean = false, startAtMillis: Long = 0) {
        val api = client
        val player = controller ?: run { error = "Аудиосервис ещё подключается. Попробуй через секунду."; return }
        val items = prepared.items.map { entry -> mediaItem(entry.song, api) }
        // Место старта задаём вместе со списком: отдельная перемотка сразу после setMediaItems теряется.
        val position = if (keepPosition) player.currentPosition else startAtMillis
        player.setMediaItems(items, prepared.position, position)
        player.repeatMode = when (prepared.repeatMode) {
            PlaybackQueue.Repeat.off -> Player.REPEAT_MODE_OFF
            PlaybackQueue.Repeat.all -> Player.REPEAT_MODE_ALL
            PlaybackQueue.Repeat.one -> Player.REPEAT_MODE_ONE
        }
        player.prepare()
        if (play || player.isPlaying) player.play()
        updatePlayback()
        saveQueue()
    }

    private fun mediaItem(song: Song, api: NavidromeClient?): MediaItem {
        val uri = when (sourceOf(song)) {
            SourceKind.local -> localLibrary.pathOf(song.id)?.let { Uri.fromFile(File(it)).toString() }
            SourceKind.download -> downloads.pathOf(song.id)?.let { Uri.fromFile(File(it)).toString() }
            SourceKind.stream -> api?.stream(song.id, settings.quality(onWifi))
            SourceKind.unavailable -> null
        }
        val extras = Bundle().apply {
            putString("coverId", song.coverArt)
            putLong("durationMillis", ((song.duration ?: 0.0) * 1000).toLong())
        }
        val artwork = song.coverArt?.let { cover ->
            if (cover.startsWith(LocalLibrary.FILE_COVER_PREFIX)) Uri.fromFile(File(cover.removePrefix(LocalLibrary.FILE_COVER_PREFIX)))
            else api?.cover(cover)?.let(Uri::parse)
        }
        return MediaItem.Builder().setMediaId(song.id).setUri(uri).setMediaMetadata(
            MediaMetadata.Builder().setTitle(song.title).setArtist(song.artist).setAlbumTitle(song.album)
                .setArtworkUri(artwork).setExtras(extras).build()
        ).build()
    }

    fun toggle() {
        controller?.let {
            if (it.playWhenReady) it.pause() else {
                if (it.playbackState == Player.STATE_ENDED) it.seekToDefaultPosition()
                it.play()
            }
        }
    }

    fun next() {
        val prepared = queue ?: return controller?.seekToNextMediaItem() ?: Unit
        val position = prepared.nextPosition(false) ?: return
        prepared.jump(position)
        controller?.seekToDefaultPosition(position)
        controller?.play()
    }

    fun previous() {
        val player = controller ?: return
        // Первые секунды «назад» означает «в начало», дальше — к предыдущему треку.
        if (player.currentPosition > 3000) return player.seekTo(0)
        val prepared = queue ?: return player.seekToPrevious()
        val position = prepared.previousPosition() ?: return player.seekTo(0)
        prepared.jump(position)
        player.seekToDefaultPosition(position)
        player.play()
    }

    fun seek(position: Long) { controller?.seekTo(position.coerceAtLeast(0)) }

    fun selectQueue(index: Int) {
        queue?.jump(index)
        controller?.let { it.seekToDefaultPosition(index); it.play() }
    }

    fun toggleShuffle() {
        val prepared = queue ?: return
        prepared.setShuffle(!prepared.shuffle)
        pushQueue(prepared, play = false, keepPosition = true)
    }

    fun cycleRepeat() {
        val prepared = queue ?: return
        prepared.repeatMode = when (prepared.repeatMode) {
            PlaybackQueue.Repeat.off -> PlaybackQueue.Repeat.all
            PlaybackQueue.Repeat.all -> PlaybackQueue.Repeat.one
            PlaybackQueue.Repeat.one -> PlaybackQueue.Repeat.off
        }
        controller?.repeatMode = when (prepared.repeatMode) {
            PlaybackQueue.Repeat.off -> Player.REPEAT_MODE_OFF
            PlaybackQueue.Repeat.all -> Player.REPEAT_MODE_ALL
            PlaybackQueue.Repeat.one -> Player.REPEAT_MODE_ONE
        }
        updatePlayback()
    }

    /** Таймер сна: 0 — остановиться в конце текущего трека. */
    fun setSleepTimer(minutes: Int?) {
        sleepJob?.cancel()
        if (minutes == null) { sleepAt = null; return }
        val deadline = System.currentTimeMillis() + minutes * 60_000L
        sleepAt = deadline
        sleepJob = viewModelScope.launch {
            delay(minutes * 60_000L)
            controller?.pause()
            sleepAt = null
            notice = "Таймер сна: музыка остановлена"
        }
    }

    /** Кому принадлежит очередь: сервер или режим без сервера. Чужую не восстанавливаем. */
    private val queueOwner: String?
        get() = client?.credentials?.account ?: if (onDeviceOnly) "on-device" else null

    private fun saveQueue() {
        val prepared = queue ?: return
        val owner = queueOwner ?: return
        snapshots.save(
            QueueSnapshots.Snapshot(
                account = owner,
                natural = prepared.natural.map { it.song },
                currentId = prepared.current?.song?.id,
                shuffle = prepared.shuffle,
                repeat = prepared.repeatMode,
                positionMillis = playback.position,
                startedAt = startedAt,
                scrobbled = scrobbled,
            )
        )
    }

    /** Очередь возвращается на паузе, с того же места: включать звук самовольно при запуске нельзя. */
    private fun restoreQueue() {
        if (restored || queue != null) return
        val player = controller ?: return
        val owner = queueOwner ?: return
        val snapshot = snapshots.load() ?: run { restored = true; return }
        restored = true
        if (snapshot.account != owner) return
        val index = snapshot.natural.indexOfFirst { it.id == snapshot.currentId }.coerceAtLeast(0)
        val prepared = PlaybackQueue(snapshot.natural, index, snapshot.shuffle)
        prepared.repeatMode = snapshot.repeat
        if (prepared.current?.song?.let(::isPlayable) != true) return
        queue = prepared
        pushQueue(prepared, play = false, startAtMillis = snapshot.positionMillis.coerceAtLeast(0))
        startedAt = snapshot.startedAt
        scrobbled = snapshot.scrobbled
        updatePlayback()
    }

    private fun onTrackChanged() {
        val player = controller ?: return
        queue?.let { prepared ->
            if (player.currentMediaItemIndex != prepared.position) prepared.jump(player.currentMediaItemIndex)
        }
        startedAt = System.currentTimeMillis()
        scrobbled = false
        lyrics = null
        saveQueue()
    }

    private fun updatePlayback() {
        val player = controller ?: return
        val prepared = queue
        val songs = prepared?.items?.map { it.song } ?: (0 until player.mediaItemCount).map { index ->
            val item = player.getMediaItemAt(index)
            val meta = item.mediaMetadata
            Song(
                item.mediaId, meta.title?.toString().orEmpty(), meta.artist?.toString().orEmpty(),
                meta.albumTitle?.toString().orEmpty(), meta.extras?.getString("coverId"),
                meta.extras?.getLong("durationMillis")?.takeIf { it > 0 }?.div(1000.0),
            )
        }
        val index = player.currentMediaItemIndex
        playback = Playback(
            current = songs.getOrNull(index),
            playing = player.isPlaying,
            buffering = player.playbackState == Player.STATE_BUFFERING,
            position = player.currentPosition.coerceAtLeast(0),
            duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 }
                ?: ((songs.getOrNull(index)?.duration ?: 0.0) * 1000).toLong(),
            shuffle = prepared?.shuffle ?: false,
            repeat = prepared?.repeatMode ?: PlaybackQueue.Repeat.off,
            queue = songs,
            index = index,
        )
    }

    // MARK: - Отметки о прослушивании

    private fun checkScrobble() {
        if (scrobbled || demo || onDeviceOnly) return
        val song = playback.current ?: return
        if (isLocalId(song.id)) return
        val duration = playback.duration
        if (duration <= 0 || playback.position < minOf(duration / 2, 240_000)) return
        scrobbled = true
        val moment = startedAt.takeIf { it > 0 } ?: System.currentTimeMillis()
        viewModelScope.launch {
            val api = client
            if (api == null || offline) return@launch scrobbles.keep(song.id, moment)
            runCatching { api.scrobble(song.id, moment) }.onFailure { scrobbles.keep(song.id, moment) }
        }
    }

    /** Накопленные без сети отметки уходят по порядку: сервер строит историю по времени. */
    private suspend fun flushScrobbles() {
        val api = client ?: return
        val pending = scrobbles.all()
        if (pending.isEmpty()) return
        val sent = pending.filter { play -> runCatching { api.scrobble(play.id, play.time) }.isSuccess }
        scrobbles.keepOnly(sent)
    }

    private fun report(error: Exception) {
        if (error !is CancellationException) {
            this.error = if (error is MusicException) error.message else "Не удалось выполнить действие. Проверь подключение."
        }
    }

    override fun onCleared() { MediaController.releaseFuture(controllerFuture); super.onCleared() }

    private data class LibraryResult(
        val albums: List<Album>,
        val favorites: List<Album>,
        val artists: List<Artist>,
        val playlists: List<Playlist>,
        val starred: List<Song>,
    )
}
