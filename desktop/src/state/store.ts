import { useSyncExternalStore } from 'react'
import { AudioEngine, EQ_PRESETS, type EqSettings } from '../audio/engine'
import { setLanguage, t, type Language } from '../i18n'
import { Credentials, NavidromeClient, type StreamQuality } from '../core/client'
import { MusicError, type Album, type Artist, type LyricLine, type Playlist, type Song } from '../core/models'
import { PlaybackQueue, type RepeatMode } from '../core/queue'
import type { ReplayGainMode } from '../core/replaygain'
import { keepScrobble, orderedScrobbles, remainingScrobbles, type ScrobblePlay } from '../core/scrobbles'
import { chooseSource, isLocalId, type Availability } from '../core/source'
import * as platform from '../platform'
import { forgetCredentials, loadCredentials, saveCredentials } from './vault'

export interface Settings {
  quality: StreamQuality
  replayGain: ReplayGainMode
  fadeSeconds: number
  eq: EqSettings
  volume: number
  language: Language
}

/** Что открыто в основной области окна. */
export type View =
  | { kind: 'home' }
  | { kind: 'local' }
  | { kind: 'downloads' }
  | { kind: 'albums' }
  | { kind: 'album'; album: Album }
  | { kind: 'artists' }
  | { kind: 'artist'; artist: Artist }
  | { kind: 'playlists' }
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'favorites' }
  | { kind: 'search' }

export interface SearchResults {
  query: string
  songs: Song[]
  albums: Album[]
  artists: Artist[]
}

export interface State {
  status: 'connecting' | 'signed-out' | 'ready'
  client?: NavidromeClient
  /** Сервер сохранён, но сейчас недоступен: работаем с тем, что есть на диске. */
  offline: boolean
  /** Человек пользуется только своей музыкой, сервер не подключён вовсе. */
  serverless: boolean
  error?: string
  notice?: string
  view: View
  history: View[]
  recent: Album[]
  albums: Album[]
  albumsComplete: boolean
  artists: Artist[]
  playlists: Playlist[]
  starred: Song[]
  starredIds: Set<string>
  /** Треки альбомов и плейлистов по их id; альбомы артиста — по id артиста. */
  songs: Record<string, Song[]>
  artistAlbums: Record<string, Album[]>
  search?: SearchResults
  /** Своя музыка из папки на компьютере. */
  local: Song[]
  musicFolder?: string
  /** Скачанные с сервера треки: id → путь к файлу. */
  downloads: Record<string, string>
  downloadedSongs: Song[]
  /** Обложки, лежащие рядом с загрузками: id обложки → файл на диске. */
  coverFiles: Record<string, string>
  downloading: Record<string, true>
  importing: boolean
  queue?: PlaybackQueue
  /** Меняется на каждую правку очереди: сама очередь мутабельна, и React иначе не заметит изменений. */
  queueVersion: number
  playing: boolean
  buffering: boolean
  position: number
  duration: number
  /** Когда плеер сам встанет на паузу: момент по таймеру сна или конец текущего трека. */
  sleepAt?: number
  sleepAtTrackEnd: boolean
  lyrics?: Lyrics
  /** Вышедшая версия: показывается предложением обновиться, пока человек его не закроет. */
  update?: platform.PendingUpdate
  settings: Settings
}

/** Текст песни: грузится по требованию, поэтому вместе с ним хранится и состояние загрузки. */
export interface Lyrics {
  songID: string
  state: 'loading' | 'ready' | 'failed'
  synced: boolean
  lines: LyricLine[]
}

const SETTINGS_KEY = 'nocturne.settings'
const QUEUE_KEY = 'nocturne.queue'
const SERVERLESS_KEY = 'nocturne.serverless'
const PENDING_SCROBBLES_KEY = 'nocturne.pendingScrobbles'
const PAGE = 60

const defaultSettings: Settings = {
  quality: 'mp3High',
  replayGain: 'off',
  fadeSeconds: 0,
  eq: { enabled: false, gains: [...EQ_PRESETS.flat!] },
  volume: 1,
  language: 'auto',
}

interface QueueSnapshot {
  account: string
  natural: Song[]
  currentId?: string
  shuffle: boolean
  repeat: RepeatMode
  position: number
  /** Начало и отметка текущего прослушивания: перезапуск продолжает его, а не начинает новое. */
  startedAt?: number
  scrobbled?: boolean
}

/**
 * Маленький стор поверх useSyncExternalStore: состояние плеера живёт вне React,
 * потому что аудиодвижок обновляет позицию по нескольку раз в секунду.
 */
class Store {
  private state: State = {
    status: 'connecting',
    offline: false,
    serverless: false,
    view: { kind: 'home' },
    history: [],
    recent: [],
    albums: [],
    albumsComplete: false,
    artists: [],
    playlists: [],
    starred: [],
    starredIds: new Set(),
    songs: {},
    artistAlbums: {},
    local: [],
    downloads: {},
    downloadedSongs: [],
    coverFiles: {},
    downloading: {},
    importing: false,
    queueVersion: 0,
    playing: false,
    buffering: false,
    position: 0,
    duration: 0,
    sleepAtTrackEnd: false,
    settings: readSettings(),
  }

  private listeners = new Set<() => void>()
  private engine = new AudioEngine()
  /** Пути своих файлов по id: в состоянии окна они не нужны, только плееру. */
  private localPaths = new Map<string, string>()
  /** Время начала прослушивания: по нему отправляется отметка, как требует протокол. */
  private startedAt = 0
  private scrobbled = false
  private lastSavedSecond = -1
  private sleepTimer?: ReturnType<typeof setTimeout>

  constructor() {
    this.engine.onEnded = () => void this.advance(true)
    this.engine.onTimeUpdate = (position, duration) => {
      this.patch({ position, duration })
      // Прослушивание засчитывается после половины трека или четырёх минут — как у Navidrome.
      if (!this.scrobbled && duration > 0 && position > Math.min(duration / 2, 240)) void this.scrobble()
      // Позицию сохраняем раз в несколько секунд, чтобы после перезапуска продолжить с того же места.
      const second = Math.floor(position / 5)
      if (second !== this.lastSavedSecond) {
        this.lastSavedSecond = second
        this.saveQueue()
      }
      updatePositionState(position, duration)
    }
    this.engine.onStateChange = (playing, buffering) => {
      this.patch({ playing, buffering })
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    }
    this.engine.onError = (message) => this.patch({ error: message })
    this.applySettings()
    this.installMediaKeys()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = () => this.state

  private patch(change: Partial<State>) {
    // Что считается доступным, меняется только вместе с диском или связью.
    if ('downloads' in change || 'local' in change || 'offline' in change || 'client' in change) this.availability = undefined
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }

  private touchQueue() {
    this.patch({ queueVersion: this.state.queueVersion + 1 })
    this.saveQueue()
  }

  // MARK: - Подключение

  async restore() {
    await this.loadOnDisk()
    const saved = await loadCredentials()
    if (!saved) {
      if (localStorage.getItem(SERVERLESS_KEY)) {
        this.patch({ status: 'ready', serverless: true, view: { kind: 'local' } })
        await this.restoreQueue()
      } else {
        this.patch({ status: 'signed-out' })
      }
      return
    }
    let client: NavidromeClient
    try {
      client = new NavidromeClient(new Credentials(saved.server, saved.username, saved.password))
    } catch {
      return this.patch({ status: 'signed-out' })
    }
    // Недоступный сервер — не повод выкидывать на экран входа: работаем с тем, что на диске.
    this.patch({ client, status: 'ready' })
    await this.reconnect()
    await this.restoreQueue()
  }

  /**
   * Новая версия приложения. Молча: не вышла или сервер обновлений недоступен — человеку
   * об этом знать незачем, он не просил проверять.
   */
  async checkForUpdate() {
    try {
      const update = await platform.checkForUpdate()
      if (update) this.patch({ update })
    } catch {
      // Сервер обновлений недоступен — приложение от этого работать не перестаёт.
    }
  }

  async installUpdate() {
    const update = this.state.update
    if (!update) return
    this.showNotice(t('Загружаю обновление…'))
    try {
      await update.install()
    } catch (error) {
      // Причину показываем рядом: без неё «не удалось» не говорит ничего ни человеку, ни отчёту.
      this.patch({ update: undefined, error: `${t('Не удалось установить обновление.')} ${String(error)}` })
    }
  }

  dismissUpdate() {
    this.patch({ update: undefined })
  }

  /** Проверяет связь с сервером; при успехе подтягивает библиотеку и досылает отметки. */
  async reconnect() {
    const client = this.state.client
    if (!client) return
    try {
      await client.ping()
      this.patch({ offline: false })
      await this.refresh()
      void this.flushScrobbles()
    } catch {
      this.patch({ offline: true })
    }
  }

  async connect(server: string, username: string, password: string) {
    try {
      const client = new NavidromeClient(new Credentials(server, username, password))
      await client.ping()
      await saveCredentials(client.credentials.account, { server, username, password })
      localStorage.removeItem(SERVERLESS_KEY)
      this.patch({ client, status: 'ready', offline: false, serverless: false, error: undefined, view: { kind: 'home' }, history: [] })
      await this.refresh()
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : t('Не удалось подключиться.') })
    }
  }

  /** Режим без сервера: только своя музыка с этого компьютера. */
  async useOnDevice() {
    localStorage.setItem(SERVERLESS_KEY, '1')
    await this.loadOnDisk()
    this.patch({ status: 'ready', serverless: true, error: undefined, view: { kind: 'local' }, history: [] })
  }

  /** Из режима без сервера — на экран подключения. */
  showConnect() {
    this.engine.pause()
    this.patch({ status: 'signed-out', serverless: false })
  }

  async disconnect() {
    this.engine.pause()
    await forgetCredentials()
    localStorage.removeItem(QUEUE_KEY)
    localStorage.removeItem(SERVERLESS_KEY)
    this.patch({
      client: undefined,
      status: 'signed-out',
      offline: false,
      serverless: false,
      recent: [],
      albums: [],
      albumsComplete: false,
      artists: [],
      playlists: [],
      starred: [],
      starredIds: new Set(),
      songs: {},
      artistAlbums: {},
      queue: undefined,
      view: { kind: 'home' },
      history: [],
    })
  }

  // MARK: - Навигация

  open(view: View) {
    this.patch({ view, history: [...this.state.history, this.state.view].slice(-30) })
    void this.load(view)
  }

  /** Разделы бокового меню открываются заново, без истории «назад». */
  section(view: View) {
    this.patch({ view, history: [] })
    void this.load(view)
  }

  back() {
    const history = [...this.state.history]
    const view = history.pop()
    if (view) this.patch({ view, history })
  }

  private get online() {
    return !!this.state.client && !this.state.offline
  }

  private async load(view: View) {
    if (view.kind === 'local' || view.kind === 'downloads') return void this.loadOnDisk()
    const client = this.state.client
    if (!client || !this.online) return
    try {
      switch (view.kind) {
        case 'album':
          if (!this.state.songs[view.album.id]) this.putSongs(view.album.id, await client.albumSongs(view.album.id))
          break
        case 'playlist':
          this.putSongs(view.playlist.id, await client.playlistSongs(view.playlist.id))
          break
        case 'artist':
          if (!this.state.artistAlbums[view.artist.id]) {
            const { albums } = await client.artist(view.artist.id)
            this.patch({ artistAlbums: { ...this.state.artistAlbums, [view.artist.id]: albums } })
          }
          break
        case 'albums':
          if (!this.state.albums.length) await this.moreAlbums()
          break
        case 'artists':
          if (!this.state.artists.length) this.patch({ artists: await client.artists() })
          break
        case 'playlists':
          this.patch({ playlists: await client.playlists() })
          break
        default:
          break
      }
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : t('Не удалось загрузить раздел.') })
    }
  }

  private putSongs(id: string, songs: Song[]) {
    this.patch({ songs: { ...this.state.songs, [id]: songs } })
  }

  // MARK: - Библиотека сервера

  async refresh() {
    const client = this.state.client
    if (!client) return
    try {
      const [recent, starred] = await Promise.all([client.albums('newest', 0, 24), client.starred()])
      this.patch({
        recent,
        starred: starred.songs,
        starredIds: new Set(starred.songs.map((song) => song.id)),
        offline: false,
        error: undefined,
      })
      void this.load(this.state.view)
    } catch (error) {
      if (error instanceof MusicError && error.kind === 'auth') return this.patch({ error: error.message })
      this.patch({ offline: true })
    }
  }

  /** Все альбомы по алфавиту, порциями: большие библиотеки иначе грузились бы минуту. */
  async moreAlbums() {
    const client = this.state.client
    if (!client || this.state.albumsComplete || !this.online) return
    const page = await client.albums('alphabeticalByName', this.state.albums.length, PAGE)
    this.patch({ albums: [...this.state.albums, ...page], albumsComplete: page.length < PAGE })
  }

  pendingQuery = ''

  async search(query: string) {
    const text = query.trim()
    if (!text) return this.patch({ search: undefined })
    // Своя музыка и загрузки ищутся всегда, сервер — когда он доступен.
    const needle = text.toLowerCase()
    const matches = (song: Song) =>
      [song.title, song.artist, song.album].some((field) => field?.toLowerCase().includes(needle))
    const onDisk = [...this.state.local, ...this.state.downloadedSongs].filter(matches)
    const client = this.state.client
    try {
      const remote = client && this.online ? await client.search(text) : { songs: [], albums: [], artists: [] }
      if (this.pendingQuery !== query) return
      const known = new Set(remote.songs.map((song) => song.id))
      this.patch({ search: { query: text, ...remote, songs: [...onDisk.filter((song) => !known.has(song.id)), ...remote.songs] } })
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : t('Поиск не удался.') })
    }
  }

  async toggleStar(song: Song) {
    const client = this.state.client
    if (!client || isLocalId(song.id)) return
    const starred = !this.state.starredIds.has(song.id)
    const ids = new Set(this.state.starredIds)
    if (starred) ids.add(song.id)
    else ids.delete(song.id)
    // Сразу отражаем в интерфейсе; если сервер откажет — вернём как было.
    this.patch({
      starredIds: ids,
      starred: starred ? [song, ...this.state.starred] : this.state.starred.filter((one) => one.id !== song.id),
    })
    try {
      await client.setStarred(song.id, starred)
    } catch {
      await this.refresh()
      this.patch({ error: t('Не удалось изменить избранное.') })
    }
  }

  // MARK: - Своя музыка и загрузки

  /** Перечитывает папку музыки и список загрузок: файлы могли добавить через проводник. */
  async loadOnDisk() {
    try {
      const [library, downloaded] = await Promise.all([platform.localLibrary(), platform.downloads()])
      this.localPaths = new Map(library.tracks.map((track) => [track.id, track.path]))
      const local: Song[] = library.tracks
        .map((track) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          track: track.track,
          duration: track.duration,
          coverArt: track.cover ? `file:${track.cover}` : undefined,
        }))
        .sort(byAlbumThenTrack)
      this.patch({
        local,
        musicFolder: library.folder,
        downloads: Object.fromEntries(downloaded.map((item) => [item.id, item.path])),
        downloadedSongs: downloaded.map((item) => item.song).sort(byAlbumThenTrack),
        // Обложка ищется по её серверному id, поэтому весь скачанный альбом показывается без сети.
        coverFiles: Object.fromEntries(
          downloaded.flatMap((item) => (item.cover && item.song.coverArt ? [[item.song.coverArt, item.cover] as const] : [])),
        ),
      })
    } catch (error) {
      this.patch({ error: t('Не удалось прочитать папку музыки: {error}', { error: String(error) }) })
    }
  }

  async importMusic(kind: 'files' | 'folder') {
    const paths = await platform.pick(kind)
    if (!paths.length) return
    this.patch({ importing: true })
    try {
      const added = await platform.importItems(paths)
      await this.loadOnDisk()
      this.showNotice(added ? t('Добавлено на компьютер: {n}', { n: added }) : t('Новых треков не найдено'))
    } catch (error) {
      this.patch({ error: t('Не удалось добавить музыку: {error}', { error: String(error) }) })
    } finally {
      this.patch({ importing: false })
    }
  }

  openMusicFolder() {
    if (this.state.musicFolder) void platform.openFolder(this.state.musicFolder)
  }

  async removeLocal(song: Song) {
    const path = this.localPaths.get(song.id)
    if (!path) return
    try {
      await platform.removeLocal(path)
      await this.loadOnDisk()
    } catch (error) {
      this.patch({ error: t('Не удалось удалить файл: {error}', { error: String(error) }) })
    }
  }

  /** Скачивает по одному: сервер домашний, и десяток параллельных потоков ему ни к чему. */
  async download(songs: Song[]) {
    const client = this.state.client
    if (!client || !this.online) return
    const wanted = songs.filter((song) => !isLocalId(song.id) && !this.state.downloads[song.id] && !this.state.downloading[song.id])
    if (!wanted.length) return this.showNotice(t('Уже скачано'))
    this.patch({ downloading: { ...this.state.downloading, ...Object.fromEntries(wanted.map((song) => [song.id, true as const])) } })
    let done = 0
    for (const song of wanted) {
      try {
        const url = await client.stream(song.id, this.state.settings.quality)
        // Обложку забираем вместе с треком: без сети серверный адрес уже не откроется.
        const cover = song.coverArt ? await client.cover(song.coverArt, 600) : undefined
        const saved = await platform.downloadTrack(url, song, cover)
        done += 1
        this.patch({
          downloads: { ...this.state.downloads, [song.id]: saved.path },
          downloadedSongs: [...this.state.downloadedSongs.filter((one) => one.id !== song.id), song].sort(byAlbumThenTrack),
          coverFiles:
            saved.cover && song.coverArt ? { ...this.state.coverFiles, [song.coverArt]: saved.cover } : this.state.coverFiles,
        })
      } catch (error) {
        this.patch({ error: t('Не удалось скачать «{title}»: {error}', { title: song.title, error: String(error) }) })
      } finally {
        const { [song.id]: _finished, ...rest } = this.state.downloading
        this.patch({ downloading: rest })
      }
    }
    if (done) this.showNotice(done === 1 ? t('Трек скачан') : t('Скачано треков: {n}', { n: done }))
  }

  async removeDownload(song: Song) {
    try {
      await platform.removeDownload(song.id)
      const { [song.id]: _removed, ...rest } = this.state.downloads
      this.patch({ downloads: rest, downloadedSongs: this.state.downloadedSongs.filter((one) => one.id !== song.id) })
      // Файл обложки ушёл вместе с треком; у альбома он мог остаться от других загрузок.
      await this.loadOnDisk()
    } catch (error) {
      this.patch({ error: t('Не удалось удалить загрузку: {error}', { error: String(error) }) })
    }
  }

  /** Можно ли сыграть трек прямо сейчас — по правилу из shared/cases/source.json. */
  isPlayable(song: Song) {
    return this.sourceOf(song.id) !== 'unavailable'
  }

  private availability?: Availability

  private sourceOf(id: string) {
    this.availability ??= {
      local: new Set(this.localPaths.keys()),
      downloaded: new Set(Object.keys(this.state.downloads)),
      online: this.online,
    }
    return chooseSource(id, this.availability)
  }

  // MARK: - Воспроизведение

  async play(songs: Song[], at: number, shuffle = false) {
    // Без сети из списка играет только то, что лежит на диске.
    const chosen = songs[at]
    const playable = songs.filter((song) => this.isPlayable(song))
    if (!chosen || !this.isPlayable(chosen)) return this.showNotice(t('Трек не скачан — недоступен без сети'))
    const queue = new PlaybackQueue(playable, playable.indexOf(chosen), shuffle)
    this.patch({ queue })
    this.touchQueue()
    await this.startCurrent(true)
  }

  playNext(songs: Song[]) {
    const queue = this.state.queue
    const playable = songs.filter((song) => this.isPlayable(song))
    if (!playable.length) return
    if (!queue) return void this.play(playable, 0)
    queue.insertNext(playable)
    this.touchQueue()
    this.showNotice(playable.length === 1 ? t('Сыграет следующим') : t('Следующими: {n}', { n: playable.length }))
  }

  append(songs: Song[]) {
    const queue = this.state.queue
    const playable = songs.filter((song) => this.isPlayable(song))
    if (!playable.length) return
    if (!queue) return void this.play(playable, 0)
    queue.append(playable)
    this.touchQueue()
    this.showNotice(playable.length === 1 ? t('Добавлено в очередь') : t('В очередь: {n}', { n: playable.length }))
  }

  removeFromQueue(entryId: string) {
    this.state.queue?.remove(entryId)
    this.touchQueue()
  }

  private async sourceUrl(song: Song): Promise<string | undefined> {
    switch (this.sourceOf(song.id)) {
      case 'local':
        return platform.fileSource(this.localPaths.get(song.id)!)
      case 'download':
        return platform.fileSource(this.state.downloads[song.id]!)
      case 'stream':
        return this.state.client!.stream(song.id, this.state.settings.quality)
      case 'unavailable':
        return undefined
    }
  }

  private async startCurrent(autoplay: boolean, from = 0) {
    const { queue, settings } = this.state
    const song = queue?.current?.song
    if (!song) return
    const url = await this.sourceUrl(song)
    if (!url) {
      this.engine.pause()
      return this.showNotice(t('Трек не скачан — недоступен без сети'))
    }
    this.startedAt = Date.now()
    this.scrobbled = false
    await this.engine.load(url, song, settings.replayGain, autoplay)
    if (from > 0) this.engine.seek(from)
    this.patch({ position: from, duration: song.duration ?? 0 })
    void this.updateNowPlaying(song)
    void this.prepareNext()
  }

  /** Следующий трек скачивается заранее: переход между треками не должен ждать сети. */
  private async prepareNext() {
    const queue = this.state.queue
    if (!queue) return
    const next = queue.nextPosition(true)
    if (next === null) return
    const song = queue.items[next]?.song
    // Повтор одного трека и недоступные треки готовить не нужно: играть будет нечего или то же самое.
    if (!song || song.id === queue.current?.song.id || !this.isPlayable(song)) return
    const url = await this.sourceUrl(song)
    if (url) this.engine.prepare(url, song.id)
  }

  toggle() {
    if (!this.state.queue?.current) return
    if (this.engine.playing) this.engine.pause()
    else void this.engine.play()
  }

  async advance(automatic = false) {
    const queue = this.state.queue
    if (!queue) return
    // Таймер «в конце трека»: дослушали — и тишина, следующий не начинаем.
    if (automatic && this.state.sleepAtTrackEnd) {
      this.patch({ sleepAtTrackEnd: false })
      this.engine.pause()
      return
    }
    // Пропускаем то, что стало недоступно (связь пропала, файл удалили), но не по кругу бесконечно.
    for (let attempt = 0; attempt < queue.items.length; attempt++) {
      const next = queue.nextPosition(automatic)
      if (next === null) {
        this.engine.pause()
        return
      }
      queue.jump(next)
      if (this.isPlayable(queue.current!.song)) break
      automatic = false
    }
    this.touchQueue()
    await this.startCurrent(true)
  }

  async previous() {
    const queue = this.state.queue
    if (!queue) return
    // Первые секунды трека «назад» означает «в начало», дальше — к предыдущему треку.
    if (this.engine.position > 3) return this.engine.seek(0)
    const previous = queue.previousPosition()
    if (previous === null) return this.engine.seek(0)
    queue.jump(previous)
    this.touchQueue()
    await this.startCurrent(true)
  }

  async select(position: number) {
    const queue = this.state.queue
    if (!queue) return
    queue.jump(position)
    this.touchQueue()
    await this.startCurrent(true)
  }

  seek(position: number) {
    this.engine.seek(position)
    this.patch({ position })
  }

  setShuffle(enabled: boolean) {
    this.state.queue?.setShuffle(enabled)
    this.touchQueue()
  }

  cycleRepeat() {
    const queue = this.state.queue
    if (!queue) return
    const order: RepeatMode[] = ['off', 'all', 'one']
    queue.repeatMode = order[(order.indexOf(queue.repeatMode) + 1) % order.length]!
    this.touchQueue()
  }

  // MARK: - Таймер сна

  /** `null` выключает таймер, `0` означает «в конце этого трека». */
  setSleepTimer(minutes: number | null) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer)
    this.sleepTimer = undefined
    this.patch({ sleepAt: undefined, sleepAtTrackEnd: minutes === 0 })
    if (!minutes || minutes <= 0) return
    const deadline = Date.now() + minutes * 60_000
    this.patch({ sleepAt: deadline })
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = undefined
      this.patch({ sleepAt: undefined })
      this.engine.pause()
    }, deadline - Date.now())
  }

  // MARK: - Текст песни

  /** Текст берётся с сервера по требованию: без него плеер работает точно так же. */
  async loadLyrics() {
    const song = this.state.queue?.current?.song
    if (!song) return
    if (this.state.lyrics?.songID === song.id && this.state.lyrics.state !== 'failed') return
    const client = this.state.client
    if (isLocalId(song.id) || !client || !this.online) {
      this.patch({ lyrics: { songID: song.id, state: 'ready', synced: false, lines: [] } })
      return
    }
    this.patch({ lyrics: { songID: song.id, state: 'loading', synced: false, lines: [] } })
    try {
      const found = await client.lyrics(song)
      if (this.state.queue?.current?.song.id !== song.id) return
      this.patch({
        lyrics: { songID: song.id, state: 'ready', synced: found?.synced ?? false, lines: found?.line ?? [] },
      })
    } catch {
      if (this.state.queue?.current?.song.id !== song.id) return
      this.patch({ lyrics: { songID: song.id, state: 'failed', synced: false, lines: [] } })
    }
  }

  // MARK: - Отметки о прослушивании

  private async scrobble() {
    const song = this.state.queue?.current?.song
    if (!song || isLocalId(song.id) || this.state.serverless) return
    this.scrobbled = true
    const pending: ScrobblePlay = { id: song.id, time: this.startedAt }
    const client = this.state.client
    if (!client || !this.online) return this.keepScrobble(pending)
    try {
      await client.scrobble(pending.id, pending.time)
    } catch {
      this.keepScrobble(pending)
    }
  }

  /** Без связи отметка ждёт на диске и уходит, когда сервер снова доступен. */
  private keepScrobble(pending: ScrobblePlay) {
    localStorage.setItem(PENDING_SCROBBLES_KEY, JSON.stringify(keepScrobble(readPendingScrobbles(), pending)))
  }

  private async flushScrobbles() {
    const client = this.state.client
    const queue = readPendingScrobbles()
    if (!client || !queue.length) return
    const sent: ScrobblePlay[] = []
    // По порядку: сервер строит историю прослушиваний по времени.
    for (const item of orderedScrobbles(queue)) {
      try {
        await client.scrobble(item.id, item.time)
        sent.push(item)
      } catch {
        // Не дошла — останется ждать следующей попытки.
      }
    }
    localStorage.setItem(PENDING_SCROBBLES_KEY, JSON.stringify(remainingScrobbles(queue, sent)))
  }

  // MARK: - Сохранение очереди

  private get queueOwner() {
    return this.state.client?.credentials.account ?? (this.state.serverless ? 'on-device' : undefined)
  }

  private saveQueue() {
    const { queue } = this.state
    const owner = this.queueOwner
    if (!queue || !owner) return
    const snapshot: QueueSnapshot = {
      account: owner,
      natural: queue.natural.map((entry) => entry.song),
      currentId: queue.current?.song.id,
      shuffle: queue.shuffle,
      repeat: queue.repeatMode,
      position: this.engine.position,
      startedAt: this.startedAt,
      scrobbled: this.scrobbled,
    }
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(snapshot))
    } catch {
      // Переполненное хранилище не должно ломать воспроизведение.
    }
  }

  /** Очередь возвращается на паузе, с того же места: включать звук самовольно при запуске нельзя. */
  private async restoreQueue() {
    const owner = this.queueOwner
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!owner || !raw) return
    try {
      const snapshot = JSON.parse(raw) as QueueSnapshot
      if (snapshot.account !== owner || !snapshot.natural.length) return
      const index = Math.max(snapshot.natural.findIndex((song) => song.id === snapshot.currentId), 0)
      const queue = new PlaybackQueue(snapshot.natural, index, snapshot.shuffle)
      queue.repeatMode = snapshot.repeat
      this.patch({ queue })
      this.touchQueue()
      if (!queue.current || !this.isPlayable(queue.current.song)) return
      await this.startCurrent(false, snapshot.position)
      if (snapshot.startedAt) this.startedAt = snapshot.startedAt
      this.scrobbled = snapshot.scrobbled ?? false
    } catch {
      localStorage.removeItem(QUEUE_KEY)
    }
  }

  // MARK: - Системные медиаклавиши и «Сейчас играет»

  private installMediaKeys() {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => void this.engine.play()],
      ['pause', () => this.engine.pause()],
      ['previoustrack', () => void this.previous()],
      ['nexttrack', () => void this.advance()],
      ['seekto', (details) => details.seekTime !== undefined && this.seek(details.seekTime)],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Движок окна может не поддерживать отдельное действие — остальные работают.
      }
    }
  }

  private async updateNowPlaying(song: Song) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    const artwork = await coverUrl(song.coverArt, this.online ? this.state.client : undefined, 512)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist ?? '',
      album: song.album ?? '',
      artwork: artwork ? [{ src: artwork, sizes: '512x512' }] : [],
    })
  }

  // MARK: - Настройки

  update(change: Partial<Settings>) {
    const settings = { ...this.state.settings, ...change }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    this.patch({ settings })
    this.applySettings()
  }

  private applySettings() {
    const { eq, fadeSeconds, volume, language } = this.state.settings
    setLanguage(language)
    this.engine.setEq(eq)
    this.engine.setFadeSeconds(fadeSeconds)
    this.engine.setVolume(volume)
  }

  showNotice(text: string) {
    this.patch({ notice: text })
    setTimeout(() => this.state.notice === text && this.patch({ notice: undefined }), 2500)
  }

  dismissError() {
    this.patch({ error: undefined })
  }
}

/** Обложка: своя — файл на диске, скачанная — файл рядом с треком, серверная — по подписанному адресу. */
export async function coverUrl(id: string | undefined, client: NavidromeClient | undefined, size: number) {
  if (!id) return undefined
  if (id.startsWith('file:')) return platform.fileSource(id.slice('file:'.length))
  const saved = store.snapshot().coverFiles[id]
  if (saved) return platform.fileSource(saved)
  return client?.cover(id, size)
}

function byAlbumThenTrack(a: Song, b: Song) {
  return (
    (a.album ?? '').localeCompare(b.album ?? '', 'ru') ||
    (a.track ?? 0) - (b.track ?? 0) ||
    a.title.localeCompare(b.title, 'ru')
  )
}

function readPendingScrobbles(): ScrobblePlay[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SCROBBLES_KEY) ?? '[]') as ScrobblePlay[]
  } catch {
    return []
  }
}

function updatePositionState(position: number, duration: number) {
  if (!('mediaSession' in navigator) || !Number.isFinite(duration) || duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 })
  } catch {
    // Не все движки знают setPositionState.
  }
}

function readSettings(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

export const store = new Store()

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
}
