import { useSyncExternalStore } from 'react'
import { AudioEngine, EQ_PRESETS, type EqSettings } from '../audio/engine'
import { Credentials, NavidromeClient, type StreamQuality } from '../core/client'
import { MusicError, type Album, type Artist, type Playlist, type Song } from '../core/models'
import { PlaybackQueue, type RepeatMode } from '../core/queue'
import type { ReplayGainMode } from '../core/replaygain'
import { forgetCredentials, loadCredentials, saveCredentials } from './vault'

export interface Settings {
  quality: StreamQuality
  replayGain: ReplayGainMode
  fadeSeconds: number
  eq: EqSettings
  volume: number
}

/** Что открыто в основной области окна. */
export type View =
  | { kind: 'home' }
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
  queue?: PlaybackQueue
  /** Меняется на каждую правку очереди: сама очередь мутабельна, и React иначе не заметит изменений. */
  queueVersion: number
  playing: boolean
  buffering: boolean
  position: number
  duration: number
  settings: Settings
}

const SETTINGS_KEY = 'nocturne.settings'
const QUEUE_KEY = 'nocturne.queue'
const PAGE = 60

const defaultSettings: Settings = {
  quality: 'mp3High',
  replayGain: 'off',
  fadeSeconds: 0,
  eq: { enabled: false, gains: [...EQ_PRESETS.flat!] },
  volume: 1,
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
    queueVersion: 0,
    playing: false,
    buffering: false,
    position: 0,
    duration: 0,
    settings: readSettings(),
  }

  private listeners = new Set<() => void>()
  private engine = new AudioEngine()
  /** Время начала прослушивания: по нему отправляется отметка, как требует протокол. */
  private startedAt = 0
  private scrobbled = false
  private lastSavedSecond = -1

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
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }

  private touchQueue() {
    this.patch({ queueVersion: this.state.queueVersion + 1 })
    this.saveQueue()
  }

  // MARK: - Подключение

  async restore() {
    const saved = await loadCredentials()
    if (!saved) return this.patch({ status: 'signed-out' })
    try {
      const client = new NavidromeClient(new Credentials(saved.server, saved.username, saved.password))
      await client.ping()
      this.patch({ client, status: 'ready' })
      await this.refresh()
      await this.restoreQueue()
    } catch {
      // Сервер может быть просто выключен: не разлогиниваем, а показываем экран входа с сообщением.
      this.patch({ status: 'signed-out', error: 'Не удалось связаться с сервером.' })
    }
  }

  async connect(server: string, username: string, password: string) {
    try {
      const client = new NavidromeClient(new Credentials(server, username, password))
      await client.ping()
      await saveCredentials(client.credentials.account, { server, username, password })
      this.patch({ client, status: 'ready', error: undefined })
      await this.refresh()
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : 'Не удалось подключиться.' })
    }
  }

  async disconnect() {
    this.engine.pause()
    await forgetCredentials()
    localStorage.removeItem(QUEUE_KEY)
    this.patch({
      client: undefined,
      status: 'signed-out',
      recent: [],
      albums: [],
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

  private async load(view: View) {
    const client = this.state.client
    if (!client) return
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
      this.patch({ error: error instanceof MusicError ? error.message : 'Не удалось загрузить раздел.' })
    }
  }

  private putSongs(id: string, songs: Song[]) {
    this.patch({ songs: { ...this.state.songs, [id]: songs } })
  }

  // MARK: - Библиотека

  async refresh() {
    const client = this.state.client
    if (!client) return
    try {
      const [recent, starred] = await Promise.all([client.albums('newest', 0, 24), client.starred()])
      this.patch({
        recent,
        starred: starred.songs,
        starredIds: new Set(starred.songs.map((song) => song.id)),
        error: undefined,
      })
      void this.load(this.state.view)
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : 'Библиотека недоступна.' })
    }
  }

  /** Все альбомы по алфавиту, порциями: большие библиотеки иначе грузились бы минуту. */
  async moreAlbums() {
    const client = this.state.client
    if (!client || this.state.albumsComplete) return
    const page = await client.albums('alphabeticalByName', this.state.albums.length, PAGE)
    this.patch({ albums: [...this.state.albums, ...page], albumsComplete: page.length < PAGE })
  }

  async search(query: string) {
    const client = this.state.client
    const text = query.trim()
    if (!client) return
    if (!text) return this.patch({ search: undefined })
    try {
      const result = await client.search(text)
      // Пока шёл запрос, человек мог допечатать — показываем только ответ на последний.
      if (this.pendingQuery === query) this.patch({ search: { query: text, ...result } })
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : 'Поиск не удался.' })
    }
  }

  pendingQuery = ''

  isStarred(song: Song) {
    return this.state.starredIds.has(song.id)
  }

  async toggleStar(song: Song) {
    const client = this.state.client
    if (!client) return
    const starred = !this.isStarred(song)
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
      this.patch({ error: 'Не удалось изменить избранное.' })
    }
  }

  // MARK: - Воспроизведение

  async play(songs: Song[], at: number, shuffle = false) {
    if (!songs.length) return
    const queue = new PlaybackQueue(songs, at, shuffle)
    this.patch({ queue })
    this.touchQueue()
    await this.startCurrent(true)
  }

  playNext(songs: Song[]) {
    const queue = this.state.queue
    if (!queue) return void this.play(songs, 0)
    queue.insertNext(songs)
    this.touchQueue()
    this.showNotice(songs.length === 1 ? 'Сыграет следующим' : `Следующими: ${songs.length}`)
  }

  append(songs: Song[]) {
    const queue = this.state.queue
    if (!queue) return void this.play(songs, 0)
    queue.append(songs)
    this.touchQueue()
    this.showNotice(songs.length === 1 ? 'Добавлено в очередь' : `В очередь: ${songs.length}`)
  }

  removeFromQueue(entryId: string) {
    this.state.queue?.remove(entryId)
    this.touchQueue()
  }

  private async startCurrent(autoplay: boolean, from = 0) {
    const { queue, client, settings } = this.state
    const song = queue?.current?.song
    if (!song || !client) return
    const url = await client.stream(song.id, settings.quality)
    this.startedAt = Date.now()
    this.scrobbled = false
    await this.engine.load(url, song, settings.replayGain, autoplay)
    if (from > 0) this.engine.seek(from)
    this.patch({ position: from, duration: song.duration ?? 0 })
    void this.updateNowPlaying(song)
  }

  toggle() {
    if (!this.state.queue?.current) return
    if (this.engine.playing) this.engine.pause()
    else void this.engine.play()
  }

  async advance(automatic = false) {
    const queue = this.state.queue
    if (!queue) return
    const next = queue.nextPosition(automatic)
    if (next === null) {
      this.engine.pause()
      return
    }
    queue.jump(next)
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

  private async scrobble() {
    const song = this.state.queue?.current?.song
    if (!song || !this.state.client) return
    this.scrobbled = true
    try {
      await this.state.client.scrobble(song.id, this.startedAt)
    } catch {
      // Отметка не дошла — не повод прерывать музыку.
    }
  }

  // MARK: - Сохранение очереди

  private saveQueue() {
    const { queue, client } = this.state
    if (!queue || !client) return
    const snapshot: QueueSnapshot = {
      account: client.credentials.account,
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
    const client = this.state.client
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!client || !raw) return
    try {
      const snapshot = JSON.parse(raw) as QueueSnapshot
      if (snapshot.account !== client.credentials.account || !snapshot.natural.length) return
      const index = Math.max(snapshot.natural.findIndex((song) => song.id === snapshot.currentId), 0)
      const queue = new PlaybackQueue(snapshot.natural, index, snapshot.shuffle)
      queue.repeatMode = snapshot.repeat
      this.patch({ queue })
      this.touchQueue()
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
    const artwork = await this.state.client?.cover(song.coverArt, 512)
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
    const { eq, fadeSeconds, volume } = this.state.settings
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
