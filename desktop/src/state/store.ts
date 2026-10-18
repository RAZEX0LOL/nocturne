import { useSyncExternalStore } from 'react'
import { AudioEngine, EQ_PRESETS, type EqSettings } from '../audio/engine'
import { setLanguage, t, type Language } from '../i18n'
import { Credentials, NavidromeClient, type RemoteQueue, type StreamQuality } from '../core/client'
import {
  MusicError,
  type Album,
  type Artist,
  type ArtistInfo,
  type Genre,
  type LyricLine,
  type Playlist,
  type RadioStation,
  type Song,
  type StructuredLyrics,
} from '../core/models'
import { moveItems } from '../core/order'
import { lrclibLyrics } from '../core/lrc'
import { effectiveReplayGain } from '../core/replaygain'
import { fromNsp, toNsp, type Nsp, type SmartForm } from '../core/smart'
import { PlaybackQueue, type QueueState, type RepeatMode } from '../core/queue'
import type { ReplayGainMode } from '../core/replaygain'
import { recoverListening, claimListening, type ListeningSession, keepScrobble, orderedScrobbles, remainingScrobbles, type ScrobblePlay } from '../core/scrobbles'
import { chooseSource, isLocalId, offlinePreparation, type Availability } from '../core/source'
import * as platform from '../platform'
import { AccountRepository, SessionEpoch } from './persistence'
import { forgetCredentials, loadCredentials, saveCredentials } from './vault'

export interface Shelves {
  played: Album[]
  frequent: Album[]
  random: Album[]
  /** Карусели ещё не пришли с сервера — показываются заготовки. */
  loaded: boolean
}

export interface CoverPalette {
  coverArt: string
  accent: string
  colors: string[]
  base: string
}

/** Откуда акцент: система (Windows, Mac), обложка играющего трека, фирменный фиолетовый или свой. */
export type AccentMode = 'system' | 'cover' | 'brand' | 'custom'

export type { ThemeMode } from '../core/colors'
import type { ThemeMode } from '../core/colors'

export type ShelfId = 'played' | 'recent' | 'starred' | 'frequent' | 'random'

export const SHELVES: ShelfId[] = ['played', 'recent', 'starred', 'frequent', 'random']

/** Кнопки справа в панели плеера, которые можно спрятать. */
export type PlayerButton = 'speed' | 'sleep' | 'mini' | 'lyrics' | 'queue'
export const PLAYER_BUTTONS: PlayerButton[] = ['speed', 'sleep', 'mini', 'lyrics', 'queue']

export interface Settings {
  /** Очередь кончилась — дальше играет похожая музыка (как радио по последнему треку). */
  prepareQueue: boolean
  downloadLimitMB: number
  autoplaySimilar: boolean
  /** Скорость воспроизведения, 0,5–2×. */
  playbackRate: number
  /** Свои пресеты эквалайзера: название → усиления полос. */
  eqPresets: Record<string, number[]>
  theme: ThemeMode
  /** Фон полноэкранного плеера: живые пятна цветов обложки, только размытая обложка или однотонный. */
  playerBackground: 'living' | 'blur' | 'solid'
  visualizerStyle: 'bars' | 'wave'
  /** Масштаб всего интерфейса: 0,9 — мельче, 1,25 — крупнее. */
  uiScale: number
  density: 'comfortable' | 'compact'
  /** Ширина обложки в сетках альбомов, точки. */
  cardSize: number
  /** Полки главной в выбранном порядке; не попавшие в список скрыты. */
  homeShelves: ShelfId[]
  /** Разделы бокового меню, которые человек скрыл. */
  hiddenSections: string[]
  /** Кнопки панели плеера, которые человек скрыл. */
  hiddenPlayerButtons: PlayerButton[]
  /** Текст песни: размер (1 — обычный) и выравнивание строк. */
  lyricsScale: number
  lyricsAlign: 'left' | 'center'
  /** Углы окон, карточек и кнопок: острые, как в системе или круглые. */
  corners: 'sharp' | 'normal' | 'round'
  /** Шрифт интерфейса: системный или скруглённый (SF Rounded — только на Mac). */
  fontStyle: 'system' | 'rounded'
  /** Свой цвет акцента (режим 'custom'). */
  accentColor: string
  /** Искать текст в LRCLIB, если у Navidrome его нет: названия треков уходят стороннему сервису. */
  lrclib: boolean
  /** Закрытие окна сворачивает в трей (Windows, Linux), музыка играет дальше. */
  closeToTray: boolean
  /** Сочетания клавиш, которые работают и когда окно не в фокусе. */
  globalShortcuts: boolean
  /** Полосы спектра под обложкой в полноэкранном плеере. */
  visualizer: boolean
  /** «Слушает … в Nocturne» в статусе Discord; нужен ID своего приложения Discord. */
  discord: boolean
  accent: AccentMode
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
  | { kind: 'genres' }
  | { kind: 'genre'; genre: string }
  | { kind: 'radio' }
  /** Редактор умного плейлиста: без id — новый. */
  | { kind: 'smart'; id?: string }
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
  /** Карусели главной: недавно слушал, часто слушаю, случайные. Недавно добавленные — это `recent`. */
  shelves: Shelves
  /** Цвета обложки текущего трека: живой фон плеера и акцент «из обложки». */
  palette?: CoverPalette
  albums: Album[]
  albumsComplete: boolean
  artists: Artist[]
  playlists: Playlist[]
  /** Оценки, поставленные в этом сеансе: поверх userRating из списков, чтобы звёзды менялись сразу. */
  ratings: Record<string, number>
  genres: Genre[]
  genreAlbums: Record<string, Album[]>
  radio: RadioStation[]
  /** Страница исполнителя: популярные треки и сведения Last.fm. */
  artistExtras: Record<string, { top: Song[]; info: ArtistInfo }>
  albumNotes: Record<string, string>
  /** Какие плейлисты умные (собираются сервером по правилам); null — сервер не Navidrome. */
  smartIds: Set<string> | null
  /** Очередь с другого устройства, которую можно продолжить здесь. */
  remoteQueue?: RemoteQueue
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
  /** Над окном держат файлы из проводника. */
  dragging: boolean
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
const SLEEP_FADE_SECONDS = 30
const QUEUE_SYNCED_KEY = 'nocturne.queueSyncedAt'
const SERVERLESS_KEY = 'nocturne.serverless'
const PAGE = 60

const defaultSettings: Settings = {
  prepareQueue: false,
  downloadLimitMB: 0,
  autoplaySimilar: true,
  playbackRate: 1,
  eqPresets: {},
  theme: 'dark',
  playerBackground: 'living',
  visualizerStyle: 'bars',
  uiScale: 1,
  density: 'comfortable',
  cardSize: 176,
  homeShelves: [...SHELVES],
  hiddenSections: [],
  hiddenPlayerButtons: [],
  lyricsScale: 1,
  lyricsAlign: 'left',
  corners: 'normal',
  fontStyle: 'system',
  accentColor: '#f472b6',
  lrclib: false,
  closeToTray: false,
  globalShortcuts: true,
  visualizer: true,
  discord: false,
  accent: 'system',
  quality: 'mp3High',
  replayGain: 'off',
  fadeSeconds: 0,
  eq: { enabled: false, gains: [...EQ_PRESETS.flat!] },
  volume: 1,
  language: 'auto',
}

interface QueueSnapshot {
  queueState?: QueueState
  account: string
  natural: Song[]
  currentId?: string
  shuffle: boolean
  repeat: RepeatMode
  position: number
  /** Начало и отметка текущего прослушивания: перезапуск продолжает его, а не начинает новое. */
  startedAt?: number
  scrobbled?: boolean
  listening?: ListeningSession
}

/**
 * Маленький стор поверх useSyncExternalStore: состояние плеера живёт вне React,
 * потому что аудиодвижок обновляет позицию по нескольку раз в секунду.
 */
interface DownloadJob { song: Song; quality: StreamQuality; automatic: boolean }
type Catalog = Pick<State, 'recent' | 'shelves' | 'albums' | 'artists' | 'playlists' | 'starred' | 'songs' | 'artistAlbums' | 'genres'>

class Store {
  private epoch = new SessionEpoch()
  private connectAttempt = 0
  private loadAttempt = 0
  private listening?: ListeningSession
  private flushing = false
  private runningDownloads = false
  private diskDownloads: platform.DownloadedTrack[] = []
  private viewListeners = new Set<() => void>()
  private transportListeners = new Set<() => void>()
  private transport = { position: 0, duration: 0 }
  private viewState?: State
  private catalogTimer?: ReturnType<typeof setTimeout>

  private repository(account = this.queueOwner) { return account ? new AccountRepository(localStorage, account) : undefined }

  private activate(client?: NavidromeClient) {
    this.persistCatalog()
    clearTimeout(this.catalogTimer)
    this.epoch.next()
    clearTimeout(this.queueSyncTimer)
    this.engine.pause()
    this.listening = undefined
    this.palettes.clear()
    this.diskDownloads = []
    this.patch({ client, queue: undefined, remoteQueue: undefined, palette: undefined, lyrics: undefined,
      position: 0, duration: 0, songs: {}, artistAlbums: {}, artistExtras: {}, albumNotes: {}, genreAlbums: {},
      albums: [], albumsComplete: false, artists: [], playlists: [], genres: [], ratings: {}, smartIds: new Set(),
      recent: [], shelves: { played: [], frequent: [], random: [], loaded: false }, starred: [], starredIds: new Set(),
      downloads: {}, downloadedSongs: [], coverFiles: {}, downloading: {}, search: undefined })
    const catalog = this.repository()?.read<Catalog>('catalog')
    if (catalog) this.patch({ ...catalog, starredIds: new Set(catalog.starred.map((song) => song.id)) })
    this.queueSyncedAt = this.repository()?.read<number>('queueSyncedAt') ?? 0
    this.remoteCheckedAt = 0
  }

  private persistCatalog() {
    const { recent, shelves, albums, artists, playlists, starred, songs, artistAlbums, genres } = this.state
    this.repository()?.write('catalog', { recent, shelves, albums, artists, playlists, starred,
      songs: Object.fromEntries(Object.entries(songs).slice(-200)), artistAlbums, genres })
  }

  private state: State = {
    status: 'connecting',
    offline: false,
    serverless: false,
    view: { kind: 'home' },
    history: [],
    recent: [],
    shelves: { played: [], frequent: [], random: [], loaded: false },
    albums: [],
    albumsComplete: false,
    artists: [],
    playlists: [],
    ratings: {},
    genres: [],
    genreAlbums: {},
    radio: [],
    smartIds: new Set(),
    artistExtras: {},
    albumNotes: {},
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
    dragging: false,
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
    // Кроссфейд или стык без паузы: следующий трек уже звучит, очередь догоняет его.
    this.engine.onAdvance = () => void this.advance(true)
    this.engine.canAdvance = (songID) => {
      const queue = this.state.queue
      if (!queue || this.state.sleepAtTrackEnd) return false
      const next = queue.nextPosition(true)
      return next !== null && queue.items[next]?.song.id === songID
    }
    this.engine.onTimeUpdate = (position, duration) => {
      this.patch({ position, duration })
      // Прослушивание засчитывается после половины трека или четырёх минут — как у Navidrome.
      if (!this.scrobbled && duration > 30 && position >= Math.min(duration / 2, 240)) void this.scrobble()
      // Позицию сохраняем раз в несколько секунд, чтобы после перезапуска продолжить с того же места.
      const second = Math.floor(position / 5)
      if (second !== this.lastSavedSecond) {
        this.lastSavedSecond = second
        this.saveQueue()
        // На сервер — реже: раз в полминуты хватает, чтобы продолжить на другом устройстве.
        if (second % 6 === 0) this.scheduleQueueSync(0)
      }
      updatePositionState(position, duration)
    }
    this.engine.onStateChange = (playing, buffering) => {
      this.patch({ playing, buffering })
      // Поставили на паузу — самое время сохранить место: дальше, скорее всего, другое устройство.
      if (!playing && !buffering) this.scheduleQueueSync(500)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    }
    this.engine.onError = (message) => this.patch({ error: message })
    this.applySettings()
    if (platform.isDesktop()) setInterval(() => { void this.processDownloads(); void this.prepareOffline() }, 30_000)
    window.addEventListener('online', () => void this.reconnect())
    this.installMediaKeys()
    // Вернулись к окну — может, за это время слушали на телефоне.
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void this.checkRemoteQueue())
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeView = (listener: () => void) => { this.viewListeners.add(listener); return () => this.viewListeners.delete(listener) }
  subscribeTransport = (listener: () => void) => { this.transportListeners.add(listener); return () => this.transportListeners.delete(listener) }
  transportSnapshot = () => this.transport
  viewSnapshot = () => this.viewState ?? this.state
  snapshot = () => this.state

  private patch(change: Partial<State>) {
    // Что считается доступным, меняется только вместе с диском или связью.
    if ('downloads' in change || 'local' in change || 'offline' in change || 'client' in change) this.availability = undefined
    this.state = { ...this.state, ...change }
    if ('position' in change || 'duration' in change) {
      this.transport = { position: this.state.position, duration: this.state.duration }
      this.transportListeners.forEach((listener) => listener())
    }
    if (Object.keys(change).some((key) => key !== 'position' && key !== 'duration')) {
      this.viewState = this.state
      this.viewListeners.forEach((listener) => listener())
    }
    if (['recent', 'shelves', 'albums', 'artists', 'playlists', 'starred', 'songs', 'artistAlbums', 'genres'].some((key) => key in change)) {
      clearTimeout(this.catalogTimer)
      this.catalogTimer = setTimeout(() => this.persistCatalog(), 200)
    }
    this.listeners.forEach((listener) => listener())
  }

  private touchQueue() {
    this.patch({ queueVersion: this.state.queueVersion + 1 })
    this.saveQueue()
    this.scheduleQueueSync()
    // Очередь поменялась — следующим может оказаться другой трек: готовим именно его.
    void this.prepareNext()
  }

  // MARK: - Очередь на сервере

  private queueSyncTimer?: ReturnType<typeof setTimeout>
  /** Когда это устройство последний раз сохранило очередь на сервер (или отказалось от чужой). */
  private queueSyncedAt = Number(localStorage.getItem(QUEUE_SYNCED_KEY) ?? 0)
  private remoteCheckedAt = 0

  private scheduleQueueSync(delay = 4000) {
    if (!this.state.client || !this.online || this.state.serverless) return
    clearTimeout(this.queueSyncTimer)
    this.queueSyncTimer = setTimeout(() => void this.pushQueue(), delay)
  }

  private markQueueSynced(at: number) {
    this.queueSyncedAt = at
    this.repository()?.write('queueSyncedAt', at)
  }

  /** На сервер уходят только треки с сервера: свои файлы и радио другим устройствам не сыграть. */
  private async pushQueue() {
    const { queue, client } = this.state
    if (!queue || !client || !this.online) return
    const songs = queue.items.map((entry) => entry.song).filter((song) => !isLocalId(song.id) && !isRadio(song))
    if (!songs.length) return
    const current = queue.current?.song
    const currentId = current && songs.some((song) => song.id === current.id) ? current.id : undefined
    try {
      await client.savePlayQueue(songs.map((song) => song.id), currentId, currentId ? this.engine.position : 0)
      if (this.state.client === client) this.markQueueSynced(Date.now())
    } catch {
      // Не дошло — дойдёт со следующим изменением.
    }
  }

  /**
   * Очередь, которую сохранило другое устройство позже нас, предлагается продолжить — не
   * подменяется молча: человек мог как раз слушать здесь что-то своё.
   */
  async checkRemoteQueue() {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    if (!client || !this.online || Date.now() - this.remoteCheckedAt < 15_000) return
    this.remoteCheckedAt = Date.now()
    try {
      const remote = await client.playQueue()
      if (this.state.client !== client || !remote || remote.changedBy === NavidromeClient.clientName || remote.changed <= this.queueSyncedAt + 2000) return
      const local = this.state.queue?.current?.song
      const sameSpot = local?.id === remote.currentId && Math.abs(this.engine.position - remote.position) < 10
      if (sameSpot) return
      commit({ remoteQueue: remote })
    } catch {
      // Сервер без поддержки getPlayQueue или нет связи — предлагать нечего.
    }
  }

  async acceptRemoteQueue() {
    const remote = this.state.remoteQueue
    if (!remote) return
    this.patch({ remoteQueue: undefined })
    this.markQueueSynced(remote.changed)
    const playable = remote.songs.filter((song) => this.isPlayable(song))
    if (!playable.length) return
    const index = Math.max(playable.findIndex((song) => song.id === remote.currentId), 0)
    this.patch({ queue: new PlaybackQueue(playable, index, false) })
    this.touchQueue()
    await this.startCurrent(true, playable[index]?.id === remote.currentId ? remote.position : 0)
  }

  dismissRemoteQueue() {
    const remote = this.state.remoteQueue
    if (remote) this.markQueueSynced(remote.changed)
    this.patch({ remoteQueue: undefined })
  }

  // MARK: - Подключение

  async restore() {
    const saved = await loadCredentials()
    if (!saved) {
      if (localStorage.getItem(SERVERLESS_KEY)) {
        this.patch({ status: 'ready', serverless: true, view: { kind: 'local' } })
        this.activate()
        await this.loadOnDisk()
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
    this.activate(client)
    this.patch({ status: 'ready' })
    await this.loadOnDisk()
    await this.restoreQueue()
    await this.reconnect()
    void this.checkRemoteQueue()
  }

  /**
   * Новая версия приложения. Сама по себе проверка молчит: не вышла или сервер обновлений
   * недоступен — человеку об этом знать незачем, он не просил. По кнопке (manual) — отвечает.
   */
  async checkForUpdate(manual = false) {
    try {
      const update = await platform.checkForUpdate()
      if (update) this.patch({ update })
      else if (manual) this.showNotice(t('Установлена последняя версия'))
    } catch (error) {
      // Сервер обновлений недоступен — приложение от этого работать не перестаёт.
      if (manual) this.patch({ error: `${t('Не удалось проверить обновления.')} ${String(error)}` })
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
    const current = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (current()) this.patch(change) }
    const client = this.state.client
    if (!client) return
    try {
      await client.ping()
      if (!current()) return
      commit({ offline: false })
      await this.refresh()
      if (!current()) return
      void this.flushScrobbles()
      void this.processDownloads()
    } catch (error) {
      if (error instanceof MusicError && error.kind === 'auth') commit({ error: error.message })
      else commit({ offline: true })
    }
  }

  async connect(server: string, username: string, password: string) {
    const attempt = ++this.connectAttempt
    try {
      const client = new NavidromeClient(new Credentials(server, username, password))
      await client.ping()
      if (attempt !== this.connectAttempt) return
      await saveCredentials(client.credentials.account, { server, username, password })
      localStorage.removeItem(SERVERLESS_KEY)
      this.activate(client)
      await this.loadOnDisk()
      this.patch({ status: 'ready', offline: false, serverless: false, error: undefined, view: { kind: 'home' }, history: [] })
      await this.restoreQueue()
      await this.refresh()
      void this.flushScrobbles()
      void this.processDownloads()
    } catch (error) {
      if (attempt !== this.connectAttempt) return
      this.patch({ error: error instanceof MusicError ? error.message : t('Не удалось подключиться.') })
    }
  }

  /** Режим без сервера: только своя музыка с этого компьютера. */
  async useOnDevice() {
    localStorage.setItem(SERVERLESS_KEY, '1')
    this.activate()
    await this.loadOnDisk()
    this.patch({ status: 'ready', serverless: true, error: undefined, view: { kind: 'local' }, history: [] })
  }

  /** Из режима без сервера — на экран подключения. */
  showConnect() {
    this.connectAttempt += 1
    this.activate()
    this.engine.pause()
    this.patch({ status: 'signed-out', serverless: false })
  }

  async disconnect() {
    this.connectAttempt += 1
    this.persistCatalog()
    this.activate()
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
      shelves: { played: [], frequent: [], random: [], loaded: false },
      palette: undefined,
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
    const putSongs = (id: string, songs: Song[]) => { if (current()) this.putSongs(id, songs) }
    const current = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (current()) this.patch(change) }
    if (view.kind === 'local' || view.kind === 'downloads') return void this.loadOnDisk()
    const client = this.state.client
    if (!client || !this.online) return
    try {
      switch (view.kind) {
        case 'album':
          if (!this.state.songs[view.album.id]) putSongs(view.album.id, await client.albumSongs(view.album.id))
          if (this.state.albumNotes[view.album.id] === undefined) {
            const notes = await client.albumNotes(view.album.id).catch(() => undefined)
            commit({ albumNotes: { ...this.state.albumNotes, [view.album.id]: notes ?? '' } })
          }
          break
        case 'playlist':
          putSongs(view.playlist.id, await client.playlistSongs(view.playlist.id))
          break
        case 'artist':
          if (!this.state.artistAlbums[view.artist.id]) {
            const { albums } = await client.artist(view.artist.id)
            commit({ artistAlbums: { ...this.state.artistAlbums, [view.artist.id]: albums } })
          }
          if (!this.state.artistExtras[view.artist.id]) {
            // Last.fm может быть не настроен на сервере — тогда страница просто без этих блоков.
            const [top, info] = await Promise.all([
              client.topSongs(view.artist.name).catch(() => []),
              client.artistInfo(view.artist.id).catch(() => ({})),
            ])
            commit({ artistExtras: { ...this.state.artistExtras, [view.artist.id]: { top, info } } })
          }
          break
        case 'albums':
          if (!this.state.albums.length) await this.moreAlbums()
          break
        case 'artists':
          if (!this.state.artists.length) commit({ artists: await client.artists() })
          break
        case 'playlists':
          commit({ playlists: await client.playlists() })
          break
        case 'genres':
          if (!this.state.genres.length) commit({ genres: await client.genres() })
          break
        case 'genre':
          if (!this.state.genreAlbums[view.genre])
            commit({ genreAlbums: { ...this.state.genreAlbums, [view.genre]: await client.albumsByGenre(view.genre) } })
          break
        case 'radio':
          commit({ radio: await client.radioStations() })
          break
        default:
          break
      }
    } catch (error) {
      commit({ error: error instanceof MusicError ? error.message : t('Не удалось загрузить раздел.') })
    }
  }

  private putSongs(id: string, songs: Song[]) {
    this.patch({ songs: { ...this.state.songs, [id]: songs } })
  }

  // MARK: - Библиотека сервера

  async refresh() {
    const current = this.epoch.capture()
    const client = this.state.client
    if (!client) return
    const commit = (change: Partial<State>) => { if (current()) this.patch(change) }
    const optional = async (request: Promise<Album[]>, shelf: 'played' | 'frequent' | 'random') => {
      try { const albums = await request; if (current()) commit({ shelves: { ...this.state.shelves, [shelf]: albums, loaded: true } }) } catch { /* Старая полка остаётся доступной. */ }
    }
    void client.playlists().then((playlists) => commit({ playlists })).catch(() => {})
    void this.loadSmartIds()
    void optional(client.albums('recent', 0, 24), 'played')
    void optional(client.albums('frequent', 0, 24), 'frequent')
    void optional(client.albums('random', 0, 24), 'random')
    void client.starred().then((starred) => commit({ starred: starred.songs, starredIds: new Set(starred.songs.map((song) => song.id)) })).catch(() => {})
    try {
      const recent = await client.albums('newest', 0, 24)
      if (!current()) return
      commit({ recent, offline: false, error: undefined })
      void this.load(this.state.view)
    } catch (error) {
      if (error instanceof MusicError && error.kind === 'auth') commit({ error: error.message })
      else if (error instanceof MusicError && error.kind === 'network') commit({ offline: true })
      else commit({ error: error instanceof Error ? error.message : t('Не удалось загрузить раздел.') })
    }
  }

  /** «Случайные альбомы» — новая подборка по кнопке, остальные карусели не трогаем. */
  async shuffleShelf() {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    if (!client || !this.online) return
    try {
      const random = await client.albums('random', 0, 24)
      commit({ shelves: { ...this.state.shelves, random } })
    } catch {
      // Подборка останется прежней — не беда.
    }
  }

  /** Альбом с карточки целиком, не открывая его страницу: кнопка «играть» поверх обложки. */
  async playAlbum(album: Album, shuffle = false) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    let songs = this.state.songs[album.id]
    if (!songs && client && this.online) {
      try {
        songs = await client.albumSongs(album.id)
        if (validSession()) this.putSongs(album.id, songs)
      } catch (error) {
        return commit({ error: error instanceof MusicError ? error.message : t('Не удалось загрузить раздел.') })
      }
    }
    if (!songs?.length) return
    if (!validSession()) return
    await this.play(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, shuffle)
  }

  /** Все альбомы по алфавиту, порциями: большие библиотеки иначе грузились бы минуту. */
  async moreAlbums() {
    const current = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (current()) this.patch(change) }
    const client = this.state.client
    if (!client || this.state.albumsComplete || !this.online) return
    const page = await client.albums('alphabeticalByName', this.state.albums.length, PAGE)
    commit({ albums: [...this.state.albums, ...page], albumsComplete: page.length < PAGE })
  }

  pendingQuery = ''

  async search(query: string) {
    const current = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (current()) this.patch(change) }
    const text = query.trim()
    if (!text) return commit({ search: undefined })
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
      commit({ search: { query: text, ...remote, songs: [...onDisk.filter((song) => !known.has(song.id)), ...remote.songs] } })
    } catch (error) {
      commit({ error: error instanceof MusicError ? error.message : t('Поиск не удался.') })
    }
  }

  async toggleStar(song: Song) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    if (!client || isLocalId(song.id) || isRadio(song)) return
    const starred = !this.state.starredIds.has(song.id)
    const ids = new Set(this.state.starredIds)
    if (starred) ids.add(song.id)
    else ids.delete(song.id)
    // Сразу отражаем в интерфейсе; если сервер откажет — вернём как было.
    commit({
      starredIds: ids,
      starred: starred ? [song, ...this.state.starred] : this.state.starred.filter((one) => one.id !== song.id),
    })
    try {
      await client.setStarred(song.id, starred)
    } catch {
      await this.refresh()
      commit({ error: t('Не удалось изменить избранное.') })
    }
  }

  /** Оценка звёздами сразу в интерфейсе; не дошла до сервера — возвращается прежняя. */
  async setRating(songs: Song[], rating: number) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    const targets = songs.filter((song) => !isLocalId(song.id))
    if (!client || !targets.length) return
    const previous = { ...this.state.ratings }
    commit({ ratings: { ...this.state.ratings, ...Object.fromEntries(targets.map((song) => [song.id, rating])) } })
    try {
      await Promise.all(targets.map((song) => client.setRating(song.id, rating)))
    } catch {
      commit({ ratings: previous, error: t('Не удалось поставить оценку.') })
    }
  }

  /** Спектр для визуализатора; звуковой движок наружу не отдаётся. */
  get spectrum() {
    return {
      size: this.engine.spectrumSize,
      sampleRate: this.engine.sampleRate,
      read: (into: Uint8Array<ArrayBuffer>) => this.engine.readSpectrum(into),
    }
  }

  ratingOf(song: Song) {
    return this.state.ratings[song.id] ?? song.userRating ?? 0
  }

  /** Плейлист целиком — из меню в боковой панели, не открывая его. */
  async playPlaylist(playlist: Playlist, shuffle = false) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    let songs = this.state.songs[playlist.id]
    if (!songs && client && this.online) {
      try {
        songs = await client.playlistSongs(playlist.id)
        if (validSession()) this.putSongs(playlist.id, songs)
      } catch (error) {
        return commit({ error: error instanceof MusicError ? error.message : t('Не удалось загрузить раздел.') })
      }
    }
    if (!songs?.length) return this.showNotice(t('В плейлисте пока нет треков'))
    if (!validSession()) return
    await this.play(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, shuffle)
  }

  /** Радиостанция играет как трек без длительности: обложки и отметок о прослушивании у неё нет. */
  async playRadio(station: RadioStation) {
    await this.play([{ id: `radio:${station.id}`, title: station.name, artist: t('Интернет-радио'), streamUrl: station.streamUrl }], 0)
  }

  /** «Микс по треку»: сам трек и похожие на него, как кнопка «Похожие» на телефоне. */
  async playMix(song: Song) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    if (!client || !this.online) return
    try {
      const similar = await client.similarSongs(song.id)
      if (!similar.length) return this.showNotice(t('Похожих треков не нашлось'))
      if (!validSession()) return
    await this.play([song, ...similar.filter((one) => one.id !== song.id)], 0)
    } catch (error) {
      commit({ error: error instanceof MusicError ? error.message : t('Не удалось собрать микс.') })
    }
  }

  /** Перейти к альбому трека: сведений об альбоме у трека немного, остальное догрузит страница. */
  openAlbumOf(song: Song) {
    if (!song.albumId) return
    this.open({ kind: 'album', album: { id: song.albumId, name: song.album ?? '', artist: song.artist, artistId: song.artistId, coverArt: song.coverArt } })
  }

  openArtistOf(song: Song) {
    if (!song.artistId) return
    this.open({ kind: 'artist', artist: { id: song.artistId, name: song.artist ?? '' } })
  }

  // MARK: - Плейлисты

  private async playlistAction(action: () => Promise<void>, failure: string) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    try {
      await action()
    } catch (error) {
      commit({ error: error instanceof MusicError ? error.message : failure })
    }
    const client = this.state.client
    if (client) commit({ playlists: await client.playlists().catch(() => this.state.playlists) })
  }

  async createPlaylist(name: string, songs: Song[] = []) {
    const validSession = this.epoch.capture()
    const client = this.state.client
    const title = name.trim()
    if (!client || !title) return
    let created: Playlist | undefined
    await this.playlistAction(async () => {
      created = await client.createPlaylist(title, songs.filter((song) => !isLocalId(song.id)).map((song) => song.id))
    }, t('Не удалось создать плейлист.'))
    if (validSession()) this.showNotice(t('Плейлист «{name}» создан', { name: title }))
    return created
  }

  async addToPlaylist(playlist: Playlist, songs: Song[]) {
    const validSession = this.epoch.capture()
    const client = this.state.client
    const ids = songs.filter((song) => !isLocalId(song.id)).map((song) => song.id)
    if (!client || !ids.length) return
    await this.playlistAction(async () => {
      await client.addToPlaylist(playlist.id, ids)
      const cached = this.state.songs[playlist.id]
      if (cached) this.putSongs(playlist.id, [...cached, ...songs.filter((song) => ids.includes(song.id))])
    }, t('Не удалось добавить в плейлист.'))
    if (validSession()) this.showNotice(t('Добавлено в «{name}»: {n}', { name: playlist.name, n: ids.length }))
  }

  /** Позиции — в текущем порядке плейлиста: один трек может стоять в нём несколько раз. */
  async removeFromPlaylist(playlist: Playlist, indexes: number[]) {
    const validSession = this.epoch.capture()
    const client = this.state.client
    if (!client || !indexes.length) return
    const cached = this.state.songs[playlist.id] ?? []
    if (validSession()) this.putSongs(playlist.id, cached.filter((_, index) => !indexes.includes(index)))
    await this.playlistAction(() => client.removeFromPlaylist(playlist.id, indexes), t('Не удалось изменить плейлист.'))
  }

  /** Перестановка перетаскиванием: сразу на экране, потом одним запросом на сервер. */
  async reorderPlaylist(playlist: Playlist, from: number[], to: number) {
    const validSession = this.epoch.capture()
    const client = this.state.client
    const cached = this.state.songs[playlist.id]
    if (!client || !cached) return
    const reordered = moveItems(cached, from, to)
    if (validSession()) this.putSongs(playlist.id, reordered)
    await this.playlistAction(
      () => client.replacePlaylistSongs(playlist.id, reordered.map((song) => song.id)),
      t('Не удалось изменить плейлист.'),
    )
  }

  async renamePlaylist(playlist: Playlist, name: string) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const client = this.state.client
    const title = name.trim()
    if (!client || !title || title === playlist.name) return
    await this.playlistAction(() => client.renamePlaylist(playlist.id, title), t('Не удалось переименовать плейлист.'))
    if (this.state.view.kind === 'playlist' && this.state.view.playlist.id === playlist.id)
      commit({ view: { kind: 'playlist', playlist: { ...playlist, name: title } } })
  }

  async deletePlaylist(playlist: Playlist) {
    const validSession = this.epoch.capture()
    const client = this.state.client
    if (!client) return
    await this.playlistAction(() => client.deletePlaylist(playlist.id), t('Не удалось удалить плейлист.'))
    if (!validSession()) return
    if (this.state.view.kind === 'playlist' && this.state.view.playlist.id === playlist.id) this.section({ kind: 'playlists' })
  }

  // MARK: - Умные плейлисты (собственный API Navidrome)

  private get navidromeLogin(): platform.NavidromeLogin | undefined {
    const credentials = this.state.client?.credentials
    if (!credentials) return undefined
    return { server: credentials.server.toString(), username: credentials.username, password: credentials.password }
  }

  /** Какие из плейлистов умные: у них есть правила. Не Navidrome (Gonic, Airsonic) — null. */
  async loadSmartIds() {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const login = this.navidromeLogin
    if (!login || !this.online) return
    try {
      const list = await platform.navidromeApi<Array<{ id: string; rules?: unknown }>>(login, 'GET', '/api/playlist')
      commit({ smartIds: new Set(list.filter((one) => one.rules).map((one) => one.id)) })
    } catch {
      commit({ smartIds: null })
    }
  }

  async loadSmartPlaylist(id: string): Promise<SmartForm> {
    const login = this.navidromeLogin
    if (!login) throw new MusicError(t('Нет подключения к серверу.'))
    const playlist = await platform.navidromeApi<{ name: string; rules?: Nsp | null }>(login, 'GET', `/api/playlist/${id}`)
    return fromNsp(playlist.name, playlist.rules)
  }

  /** Сохраняет правила; сервер сам пересоберёт треки. Возвращает id плейлиста. */
  async saveSmartPlaylist(form: SmartForm, id?: string): Promise<string | undefined> {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const login = this.navidromeLogin
    const client = this.state.client
    if (!login || !client) return
    const body = { name: form.name.trim(), rules: toNsp(form), public: false }
    try {
      const saved = id
        ? (await platform.navidromeApi(login, 'PUT', `/api/playlist/${id}`, body), id)
        : (await platform.navidromeApi<{ id: string }>(login, 'POST', '/api/playlist', body)).id
      commit({ playlists: await client.playlists().catch(() => this.state.playlists) })
      await this.loadSmartIds()
      // Старые треки плейлиста больше не верны — пусть страница возьмёт свежие.
      const { [saved]: _stale, ...songs } = this.state.songs
      commit({ songs })
      if (validSession()) this.showNotice(t('Умный плейлист «{name}» сохранён', { name: body.name }))
      return saved
    } catch {
      commit({ error: t('Не удалось сохранить умный плейлист. Он работает только с Navidrome.') })
    }
  }

  // MARK: - Своя музыка и загрузки

  /** Перечитывает папку музыки и список загрузок: файлы могли добавить через проводник. */
  async loadOnDisk() {
    const current = this.epoch.capture()
    const account = this.state.client?.credentials.account
    try {
      const [library, downloaded] = await Promise.all([platform.localLibrary(), account ? platform.downloads(account) : Promise.resolve([])])
      if (!current()) return
      this.diskDownloads = downloaded
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
        downloading: Object.fromEntries((this.repository()?.read<DownloadJob[]>('downloads') ?? []).map((job) => [job.song.id, true as const])),
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
    await this.importPaths(await platform.pick(kind))
  }

  setDragging(dragging: boolean) {
    if (this.state.dragging !== dragging) this.patch({ dragging })
  }

  /** Файлы и папки — из диалога или перетащенные из проводника; не-аудио Rust пропустит сам. */
  async importPaths(paths: string[]) {
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
    this.engine.forget(song.id)
    try {
      await platform.removeLocal(path)
      await this.loadOnDisk()
    } catch (error) {
      this.patch({ error: t('Не удалось удалить файл: {error}', { error: String(error) }) })
    }
  }

  /** Скачивает по одному: сервер домашний, и десяток параллельных потоков ему ни к чему. */
  isAutomatic(song: Song) {
    return this.diskDownloads.some((item) => item.id === song.id && item.automatic) && !(this.repository()?.read<string[]>('pinned') ?? []).includes(song.id)
  }

  async download(songs: Song[], automatic = false) {
    const repository = this.repository()
    if (!this.state.client || !repository) return
    const jobs = repository.read<DownloadJob[]>('downloads') ?? []
    for (const song of songs) {
      if (isLocalId(song.id)) continue
      const existing = jobs.find((job) => job.song.id === song.id)
      if (existing) { if (!automatic) existing.automatic = false; continue }
      if (this.state.downloads[song.id]) {
        if (!automatic) repository.write('pinned', [...new Set([...(repository.read<string[]>('pinned') ?? []), song.id])])
        continue
      }
      jobs.push({ song, quality: this.state.settings.quality, automatic })
    }
    if (!repository.write('downloads', jobs)) return this.patch({ error: t('Не удалось сохранить очередь загрузок.') })
    this.patch({ downloading: Object.fromEntries(jobs.map((job) => [job.song.id, true as const])), downloadedSongs: [...this.state.downloadedSongs] })
    await this.processDownloads()
  }

  private async processDownloads() {
    const client = this.state.client
    if (!client || !this.online || !platform.isDesktop() || this.runningDownloads) return
    const account = client.credentials.account
    const repository = this.repository(account)!
    this.runningDownloads = true
    try {
      while (this.state.client === client && this.online) {
        const jobs = repository.read<DownloadJob[]>('downloads') ?? []
        const job = jobs.find((one) => !one.automatic) ?? jobs[0]
        if (!job) break
        if (job.automatic && (!this.state.settings.prepareQueue || !await platform.unmeteredNetwork())) break
        const pins = new Set(repository.read<string[]>('pinned') ?? [])
        const cached = this.diskDownloads.filter((one) => one.automatic && !pins.has(one.id))
        const total = this.diskDownloads.reduce((sum, one) => sum + (one.size ?? 0), 0)
        const cacheSize = cached.reduce((sum, one) => sum + (one.size ?? 0), 0)
        const available = job.automatic ? Math.min(256 * 1024 * 1024 - cacheSize, this.state.settings.downloadLimitMB > 0 ? this.state.settings.downloadLimitMB * 1024 * 1024 - total : Infinity) : this.state.settings.downloadLimitMB > 0 ? this.state.settings.downloadLimitMB * 1024 * 1024 - total : undefined
        if (available !== undefined && available <= 0) break
        try {
          const url = await client.stream(job.song.id, job.quality)
          const cover = job.song.coverArt ? await client.cover(job.song.coverArt, 600) : undefined
          await platform.downloadTrack(url, job.song, account, cover, job.automatic, available)
        } catch {
          if (!job.automatic && this.state.client === client) this.patch({ error: t('Не удалось скачать «{title}». Задание сохранено для повтора.', { title: job.song.title }) })
          break
        }
        if (!repository.write('downloads', (repository.read<DownloadJob[]>('downloads') ?? []).filter((one) => one.song.id !== job.song.id))) break
        if (this.state.client !== client) break
        await this.loadOnDisk()
      }
    } finally {
      this.runningDownloads = false
      if (this.state.client !== client) void this.processDownloads()
    }
  }

  private async prepareOffline() {
    if (this.runningDownloads || !await platform.unmeteredNetwork()) return
    const queue = this.state.queue
    const client = this.state.client
    if (!queue || !client || !this.online || !this.state.settings.prepareQueue || !platform.isDesktop()) return
    const wanted = offlinePreparation(queue.upcoming.map((entry) => entry.song), true, true, true)
    const keep = new Set([queue.current?.song.id, ...wanted.map((song) => song.id)])
    const repository = this.repository()!
    const pins = new Set(repository.read<string[]>('pinned') ?? [])
    for (const item of this.diskDownloads) {
      if (item.automatic && !pins.has(item.id) && !keep.has(item.id)) {
        this.engine.forget(item.id)
        await platform.removeDownload(item.id, client.credentials.account).catch(() => {})
      }
    }
    if (this.state.client !== client) return
    await this.loadOnDisk()
    await this.download(wanted, true)
  }

  async removeDownload(song: Song) {
    this.engine.forget(song.id)
    try {
      const account = this.state.client?.credentials.account
      if (!account) return
      await platform.removeDownload(song.id, account)
      const repository = this.repository(account)!
      repository.write('downloads', (repository.read<DownloadJob[]>('downloads') ?? []).filter((job) => job.song.id !== song.id))
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

  /** Треки, брошенные в очередь: встают на место вставки среди тех, что играют дальше. */
  insertIntoQueue(songs: Song[], at?: number) {
    const queue = this.state.queue
    const playable = songs.filter((song) => this.isPlayable(song))
    if (!playable.length) return
    if (!queue) return void this.play(playable, 0)
    const before = queue.upcoming.length
    queue.append(playable)
    if (at !== undefined && at < before) {
      queue.moveUpcoming(playable.map((_, index) => before + index), at)
    }
    this.touchQueue()
    this.showNotice(playable.length === 1 ? t('Добавлено в очередь') : t('В очередь: {n}', { n: playable.length }))
  }

  /** Перетаскивание в очереди; позиции — среди тех, что играют дальше. */
  moveInQueue(from: number[], to: number) {
    // `to` — место среди всех строк, а moveUpcoming считает его уже без переносимых.
    this.state.queue?.moveUpcoming(from, to - from.filter((index) => index < to).length)
    this.touchQueue()
  }

  removeFromQueue(entryId: string) {
    this.state.queue?.remove(entryId)
    this.touchQueue()
  }

  private async sourceUrl(song: Song): Promise<string | undefined> {
    if (isRadio(song)) return this.online ? song.streamUrl : undefined
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

  private async startCurrent(autoplay: boolean, from = 0, restoredListening?: ListeningSession) {
    const { queue } = this.state
    const song = queue?.current?.song
    if (!song) return
    const current = this.epoch.capture()
    const attempt = ++this.loadAttempt
    const url = await this.sourceUrl(song)
    if (!current() || attempt !== this.loadAttempt || this.state.queue !== queue) return
    if (!url) {
      this.engine.pause()
      return this.showNotice(t('Трек не скачан — недоступен без сети'))
    }
    this.startedAt = restoredListening?.startedAt ?? Date.now()
    this.scrobbled = restoredListening?.submitted ?? false
    this.listening = restoredListening ?? { account: this.queueOwner ?? 'on-device', songId: song.id, playId: crypto.randomUUID(), startedAt: this.startedAt, submitted: false }
    await this.engine.load(url, song, this.replayGainFor(queue!.position), autoplay)
    if (!current() || this.state.queue !== queue) return
    if (from > 0) this.engine.seek(from)
    this.patch({ position: from, duration: song.duration ?? 0 })
    void this.updateNowPlaying(song)
    void this.loadPalette(song)
    void this.prepareNext()
    void this.prepareOffline()
    this.saveQueue()
  }

  /** Цвета обложки считаются один раз на обложку: альбом обычно играет подряд. */
  private palettes = new Map<string, CoverPalette | null>()

  private async loadPalette(song: Song) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const id = song.coverArt
    if (!id) return commit({ palette: undefined })
    if (this.state.palette?.coverArt === id) return
    let palette = this.palettes.get(id)
    if (palette === undefined) {
      const saved = id.startsWith('file:') ? id.slice('file:'.length) : this.state.coverFiles[id]
      const client = this.online ? this.state.client : undefined
      const found = saved
        ? await platform.coverPalette({ path: saved })
        : client
          ? await platform.coverPalette({ url: await client.cover(id, 300) })
          : undefined
      palette = found ? { coverArt: id, ...found } : null
      if (!validSession()) return
      this.palettes.set(id, palette)
    }
    // Пока цвета считались, мог заиграть другой трек — его цвета важнее.
    if (this.state.queue?.current?.song.coverArt !== id) return
    commit({ palette: palette ?? undefined })
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
    const entry = queue.current
    const client = this.state.client
    const url = await this.sourceUrl(song)
    if (this.state.queue !== queue || queue.current !== entry || this.state.client !== client) return
    if (url) this.engine.prepare(url, song, this.replayGainFor(next))
  }

  /** Явные «играть» и «пауза» — для системных кнопок: им нужен не переключатель, а команда. */
  resume() {
    if (this.state.queue?.current) void this.engine.play()
  }

  pause() {
    this.engine.pause()
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
      let next = queue.nextPosition(automatic)
      // Очередь кончилась сама собой — с бесконечным воспроизведением дальше играет похожее.
      if (next === null && automatic && (await this.extendWithSimilar())) next = queue.nextPosition(automatic)
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

  /** Дописывает в очередь похожие на последний трек, которых в ней ещё не было. true — дописало. */
  private async extendWithSimilar(): Promise<boolean> {
    const { queue, client, settings } = this.state
    const seed = queue?.current?.song
    if (!settings.autoplaySimilar || !queue || !client || !this.online || !seed || isLocalId(seed.id) || isRadio(seed)) return false
    try {
      const played = new Set(queue.items.map((entry) => entry.song.id))
      const fresh = (await client.similarSongs(seed.id, 40)).filter((song) => !played.has(song.id)).slice(0, 20)
      if (!fresh.length || this.state.queue !== queue || this.state.client !== client || queue.current?.song.id !== seed.id) return false
      queue.append(fresh)
      this.showNotice(t('Дальше — похожая музыка'))
      return true
    } catch {
      return false
    }
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
    // Последние полминуты музыка плавно затихает — тишина не будит резким обрывом.
    const fade = Math.min(SLEEP_FADE_SECONDS, minutes * 60)
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = undefined
      void this.engine.fadeOutAndPause(fade).then(() => this.patch({ sleepAt: undefined }))
    }, deadline - Date.now() - fade * 1000)
  }

  // MARK: - Текст песни

  /** Текст берётся с сервера по требованию: без него плеер работает точно так же. */
  /** force — искать заново, даже если текст уже загружен (включили LRCLIB). */
  async loadLyrics(force = false) {
    const validSession = this.epoch.capture()
    const commit = (change: Partial<State>) => { if (validSession()) this.patch(change) }
    const song = this.state.queue?.current?.song
    if (!song) return
    if (!force && this.state.lyrics?.songID === song.id && this.state.lyrics.state !== 'failed') return
    const client = this.state.client
    if (isLocalId(song.id) || isRadio(song) || !client || !this.online) {
      commit({ lyrics: { songID: song.id, state: 'ready', synced: false, lines: [] } })
      return
    }
    commit({ lyrics: { songID: song.id, state: 'loading', synced: false, lines: [] } })
    try {
      // Сервер не ответил — это ошибка с кнопкой «Попробовать снова», если искать больше негде.
      let found: StructuredLyrics | undefined
      try {
        found = await client.lyrics(song)
      } catch (error) {
        if (!this.state.settings.lrclib) throw error
      }
      if (!found && this.state.settings.lrclib) found = await lrclibLyrics(song).catch(() => undefined)
      if (this.state.queue?.current?.song.id !== song.id) return
      commit({
        lyrics: { songID: song.id, state: 'ready', synced: found?.synced ?? false, lines: found?.line ?? [] },
      })
    } catch {
      if (this.state.queue?.current?.song.id !== song.id) return
      commit({ lyrics: { songID: song.id, state: 'failed', synced: false, lines: [] } })
    }
  }

  // MARK: - Отметки о прослушивании

  private async scrobble() {
    const song = this.state.queue?.current?.song
    const account = this.queueOwner
    if (!song || !account || isLocalId(song.id) || isRadio(song) || this.state.serverless || !this.listening) return
    const pending = claimListening(this.listening, account, this.state.duration, this.state.position)
    if (!pending) return
    const repository = this.repository(account)!
    const kept = keepScrobble(repository.read<ScrobblePlay[]>('scrobbles') ?? [], pending)
    if (!repository.write('scrobbles', kept)) { this.listening.submitted = false; return }
    this.scrobbled = true
    this.saveQueue()
    await this.flushScrobbles()
  }

  private async flushScrobbles() {
    const client = this.state.client
    if (!client || !this.online || this.flushing) return
    const repository = this.repository(client.credentials.account)!
    this.flushing = true
    try {
      for (const item of orderedScrobbles(repository.read<ScrobblePlay[]>('scrobbles') ?? [])) {
        if (this.state.client !== client || item.account !== client.credentials.account) break
        try { await client.scrobble(item.id, item.time) } catch { break }
        repository.write('scrobbles', remainingScrobbles(repository.read<ScrobblePlay[]>('scrobbles') ?? [], [item]))
      }
    } finally {
      this.flushing = false
      if (this.state.client !== client) void this.flushScrobbles()
    }
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
      queueState: queue.snapshot(),
      currentId: queue.current?.song.id,
      shuffle: queue.shuffle,
      repeat: queue.repeatMode,
      position: this.engine.position,
      startedAt: this.startedAt,
      scrobbled: this.scrobbled,
      listening: this.listening,
    }
    try {
      this.repository()?.write('queue', snapshot)
    } catch {
      // Переполненное хранилище не должно ломать воспроизведение.
    }
  }

  /** Очередь возвращается на паузе, с того же места: включать звук самовольно при запуске нельзя. */
  private async restoreQueue() {
    const owner = this.queueOwner
    const raw = this.repository()?.read<QueueSnapshot>('queue') ?? localStorage.getItem(QUEUE_KEY)
    if (!owner || !raw) return
    try {
      const snapshot = (typeof raw === 'string' ? JSON.parse(raw) : raw) as QueueSnapshot
      if (snapshot.account !== owner || !snapshot.natural.length) return
      const index = Math.max(snapshot.natural.findIndex((song) => song.id === snapshot.currentId), 0)
      const queue = snapshot.queueState ? PlaybackQueue.restore(snapshot.queueState) : new PlaybackQueue(snapshot.natural, index, snapshot.shuffle)
      queue.repeatMode = snapshot.repeat
      const listening = snapshot.listening ?? { account: owner, songId: queue.current!.song.id, playId: crypto.randomUUID(), startedAt: snapshot.startedAt ?? Date.now(), submitted: snapshot.scrobbled ?? false }
      recoverListening(listening, this.repository()?.read<ScrobblePlay[]>('scrobbles') ?? [])
      this.listening = listening
      this.startedAt = listening.startedAt
      this.scrobbled = listening.submitted
      this.patch({ queue, queueVersion: this.state.queueVersion + 1 })
      this.saveQueue()
      if (!queue.current || !this.isPlayable(queue.current.song)) return
      await this.startCurrent(false, snapshot.position, listening)
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
    const client = this.state.client
    const artwork = await coverUrl(song.coverArt, this.online ? client : undefined, 512)
    if (this.state.client !== client || this.state.queue?.current?.song.id !== song.id) return
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
    this.engine.setRate(this.state.settings.playbackRate)
  }

  /** «Авто» выравнивания: по альбому, если альбом играет подряд, иначе по треку. */
  private replayGainFor(index: number) {
    const queue = this.state.queue
    if (!queue) return this.state.settings.replayGain
    return effectiveReplayGain(this.state.settings.replayGain, {
      songs: queue.items.map((entry) => entry.song),
      index,
      shuffled: queue.shuffle,
    })
  }

  // MARK: - Поделиться и пресеты эквалайзера

  /** Ссылка Navidrome на трек, альбом или плейлист — в буфер обмена. Её откроют и без аккаунта. */
  async share(id: string, title: string) {
    const client = this.state.client
    if (!client || !this.online) return
    try {
      const url = await client.createShare(id)
      if (!url) throw new Error('no url')
      await navigator.clipboard.writeText(url)
      this.showNotice(t('Ссылка на «{title}» скопирована', { title }))
    } catch {
      this.patch({ error: t('Не удалось создать ссылку. Включи «Поделиться» в настройках Navidrome (EnableSharing).') })
    }
  }

  saveEqPreset(name: string) {
    const title = name.trim()
    if (!title) return
    this.update({ eqPresets: { ...this.state.settings.eqPresets, [title]: [...this.state.settings.eq.gains] } })
    this.showNotice(t('Пресет «{name}» сохранён', { name: title }))
  }

  deleteEqPreset(name: string) {
    const { [name]: _removed, ...rest } = this.state.settings.eqPresets
    this.update({ eqPresets: rest })
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

export const isRadio = (song: Song) => song.id.startsWith('radio:')

function byAlbumThenTrack(a: Song, b: Song) {
  return (
    (a.album ?? '').localeCompare(b.album ?? '', 'ru') ||
    (a.track ?? 0) - (b.track ?? 0) ||
    a.title.localeCompare(b.title, 'ru')
  )
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
  return useSyncExternalStore(store.subscribeView, store.viewSnapshot, store.viewSnapshot)
}

export function useTransport() {
  return useSyncExternalStore(store.subscribeTransport, store.transportSnapshot, store.transportSnapshot)
}
