import { useSyncExternalStore } from 'react'
import { AudioEngine, EQ_PRESETS, type EqSettings } from '../audio/engine'
import { Credentials, NavidromeClient, type StreamQuality } from '../core/client'
import { MusicError, type Album, type Song } from '../core/models'
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

const SETTINGS_KEY = 'nocturne.settings'

const defaultSettings: Settings = {
  quality: 'mp3High',
  replayGain: 'off',
  fadeSeconds: 0,
  eq: { enabled: false, gains: [...EQ_PRESETS.flat!] },
  volume: 1,
}

export interface State {
  status: 'connecting' | 'signed-out' | 'ready'
  client?: NavidromeClient
  error?: string
  notice?: string
  albums: Album[]
  starred: Song[]
  albumSongs: Record<string, Song[]>
  openAlbum?: Album
  queue?: PlaybackQueue
  playing: boolean
  buffering: boolean
  position: number
  duration: number
  settings: Settings
}

/**
 * Маленький стор поверх useSyncExternalStore: состояние плеера живёт вне React,
 * потому что аудиодвижок обновляет позицию по нескольку раз в секунду.
 */
class Store {
  private state: State = {
    status: 'connecting',
    albums: [],
    starred: [],
    albumSongs: {},
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

  constructor() {
    this.engine.onEnded = () => this.advance(true)
    this.engine.onTimeUpdate = (position, duration) => {
      this.patch({ position, duration })
      // Прослушивание засчитывается после половины трека или четырёх минут — как у Navidrome.
      if (!this.scrobbled && position > Math.min(duration / 2, 240)) this.scrobble()
    }
    this.engine.onStateChange = (playing, buffering) => this.patch({ playing, buffering })
    this.engine.onError = (message) => this.patch({ error: message })
    this.applySettings()
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

  // MARK: - Подключение

  async restore() {
    const saved = await loadCredentials()
    if (!saved) return this.patch({ status: 'signed-out' })
    try {
      const client = new NavidromeClient(new Credentials(saved.server, saved.username, saved.password))
      await client.ping()
      this.patch({ client, status: 'ready' })
      await this.refresh()
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
    this.patch({ client: undefined, status: 'signed-out', albums: [], starred: [], queue: undefined })
  }

  // MARK: - Библиотека

  async refresh() {
    const client = this.state.client
    if (!client) return
    try {
      const [albums, starred] = await Promise.all([client.albums('newest'), client.starred()])
      this.patch({ albums, starred: starred.songs, error: undefined })
    } catch (error) {
      this.patch({ error: error instanceof MusicError ? error.message : 'Библиотека недоступна.' })
    }
  }

  async openAlbum(album: Album) {
    this.patch({ openAlbum: album })
    if (this.state.albumSongs[album.id] || !this.state.client) return
    const songs = await this.state.client.albumSongs(album.id)
    this.patch({ albumSongs: { ...this.state.albumSongs, [album.id]: songs } })
  }

  closeAlbum() {
    this.patch({ openAlbum: undefined })
  }

  // MARK: - Воспроизведение

  async play(songs: Song[], at: number, shuffle = false) {
    if (!songs.length) return
    const queue = new PlaybackQueue(songs, at, shuffle)
    this.patch({ queue })
    await this.startCurrent(true)
  }

  private async startCurrent(autoplay: boolean) {
    const { queue, client, settings } = this.state
    const song = queue?.current?.song
    if (!song || !client) return
    const url = await client.stream(song.id, settings.quality)
    this.startedAt = Date.now()
    this.scrobbled = false
    await this.engine.load(url, song, settings.replayGain, autoplay)
    this.patch({ position: 0, duration: song.duration ?? 0 })
  }

  toggle() {
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
    this.patch({ queue })
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
    this.patch({ queue })
    await this.startCurrent(true)
  }

  async select(position: number) {
    const queue = this.state.queue
    if (!queue) return
    queue.jump(position)
    this.patch({ queue })
    await this.startCurrent(true)
  }

  seek(position: number) {
    this.engine.seek(position)
    this.patch({ position })
  }

  setShuffle(enabled: boolean) {
    const queue = this.state.queue
    if (!queue) return
    queue.setShuffle(enabled)
    this.patch({ queue })
  }

  cycleRepeat() {
    const queue = this.state.queue
    if (!queue) return
    const order: RepeatMode[] = ['off', 'all', 'one']
    queue.repeatMode = order[(order.indexOf(queue.repeatMode) + 1) % order.length]!
    this.patch({ queue })
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
    setTimeout(() => this.patch({ notice: undefined }), 2500)
  }

  dismissError() {
    this.patch({ error: undefined })
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
