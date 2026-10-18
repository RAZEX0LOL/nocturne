import { md5 } from './md5'
import {
  MusicError,
  type Album,
  type Artist,
  type ArtistInfo,
  type Genre,
  type Playlist,
  type RadioStation,
  type Song,
  type StructuredLyrics,
} from './models'
import { t } from '../i18n'

/** Правила адресов и подписи описаны в shared/spec/api.md и проверяются shared/cases. */

const API_VERSION = '1.16.1'
const CLIENT_NAME = 'NocturneDesktop'

export type StreamQuality = 'original' | 'mp3High' | 'mp3Medium' | 'mp3Low'

export const streamParameters: Record<StreamQuality, Record<string, string>> = {
  original: { format: 'raw' },
  mp3High: { format: 'mp3', maxBitRate: '320' },
  mp3Medium: { format: 'mp3', maxBitRate: '192' },
  mp3Low: { format: 'mp3', maxBitRate: '128' },
}

/** Обычный HTTP разрешён только в домашней сети: пароль не должен уходить в интернет открытым. */
export function isLocalNetworkHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.home.arpa')) return true
  if (host.includes(':')) return host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')
  const labels = host.split('.')
  if (labels.length === 1) return true
  if (labels.length !== 4) return false
  const octets = labels.map((label) => (/^\d{1,3}$/.test(label) ? Number(label) : NaN))
  if (octets.some((value) => Number.isNaN(value) || value > 255)) return false
  const [first, second] = octets as [number, number, number, number]
  if (first === 10 || first === 127) return true
  if (first === 192 && second === 168) return true
  if (first === 169 && second === 254) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  return false
}

export class Credentials {
  readonly server: URL
  readonly username: string
  readonly password: string

  constructor(server: string, username: string, password: string) {
    let url: URL
    try {
      url = new URL(server.trim())
    } catch {
      throw new MusicError(t('Укажи адрес сервера целиком, вместе с https://'), 'address')
    }
    const scheme = url.protocol.replace(':', '').toLowerCase()
    const secure = scheme === 'https' || (scheme === 'http' && isLocalNetworkHost(url.hostname))
    if (!secure || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new MusicError(t('Укажи адрес сервера по HTTPS без логина и параметров.'), 'address')
    }
    const login = username.trim()
    if (!login || !password) throw new MusicError(t('Введи логин и пароль.'), 'address')
    this.server = url
    this.username = login
    this.password = password
  }

  get isInsecure(): boolean {
    return this.server.protocol === 'http:'
  }

  /** Устойчивое имя пары «сервер и пользователь», без секретов. */
  get account(): string {
    return `${this.username}@${this.server.toString().replace(/\/$/, '')}`
  }
}

/** Очередь, сохранённая на сервере каким-то из устройств. */
export interface RemoteQueue {
  songs: Song[]
  currentId?: string
  /** Секунды от начала текущего трека. */
  position: number
  /** Когда сохранена, мс с 1970 года. */
  changed: number
  /** Каким приложением: у каждого клиента своё имя в параметре `c`. */
  changedBy: string
}

export class NavidromeClient {
  /** Паузы перед повторами; в тестах их обнуляют, чтобы не ждать по-настоящему. */
  constructor(readonly credentials: Credentials, private readonly retryDelaysSeconds = [0.5, 2]) {}

  /** `repeated` — параметры, встречающиеся несколько раз, например songId в createPlaylist. */
  async url(
    endpoint: string,
    parameters: Record<string, string> = {},
    repeated: Array<[string, string]> = [],
    salt: string = crypto.randomUUID(),
  ): Promise<string> {
    const base = this.credentials.server
    const path = `${base.pathname.replace(/\/$/, '')}/rest/${endpoint}.view`
    const url = new URL(path, base.origin)
    const token = md5(this.credentials.password + salt)
    // Строку запроса собираем сами: URLSearchParams кодирует пробел как «+», и сервер потом не
    // отличит его от настоящего плюса в названии трека. encodeURIComponent даёт %20 и %2B.
    const query: string[] = []
    const add = (key: string, value: string) => query.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    add('u', this.credentials.username)
    add('t', token)
    add('s', salt)
    add('v', API_VERSION)
    add('c', CLIENT_NAME)
    add('f', 'json')
    for (const key of Object.keys(parameters).sort()) add(key, parameters[key]!)
    for (const [key, value] of repeated) add(key, value)
    url.search = query.join('&')
    return url.toString()
  }

  /** Subsonic отвечает 200 даже на ошибку, поэтому статус внутри тела важнее кода ответа. */
  static decode(text: string): Record<string, any> {
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new MusicError(t('Сервер вернул неожиданный ответ.'))
    }
    const response = parsed?.['subsonic-response']
    if (!response || typeof response !== 'object') throw new MusicError(t('Сервер вернул неожиданный ответ.'))
    if (response.status !== 'ok') {
      const code = response.error?.code
      throw code === 40
        ? new MusicError(t('Неверный логин или пароль.'), 'auth')
        : new MusicError(t('Ошибка Navidrome ({code}).', { code: code ?? '?' }))
    }
    return response
  }

  /**
   * Чтения идемпотентны, поэтому оборванную связь переспрашиваем с растущей паузой.
   * Ответ сервера (неверный пароль, 500) не повторяем: второй раз он будет таким же.
   */
  private async request(endpoint: string, parameters: Record<string, string> = {}, repeated: Array<[string, string]> = []) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(await this.url(endpoint, parameters, repeated))
        if (!response.ok) throw new MusicError(t('Сервер вернул HTTP {status}.', { status: response.status }))
        return NavidromeClient.decode(await response.text())
      } catch (error) {
        if (error instanceof MusicError) throw error
        if (attempt >= this.retryDelaysSeconds.length || !(endpoint === 'ping' || endpoint.startsWith('get') || endpoint.startsWith('search'))) {
          throw new MusicError(t('Не удалось связаться с сервером. Проверь сеть и адрес Navidrome.'), 'network')
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelaysSeconds[attempt]! * 1000))
      }
    }
  }

  async ping() {
    await this.request('ping')
  }

  async albums(type = 'newest', offset = 0, size = 40): Promise<Album[]> {
    const response = await this.request('getAlbumList2', { type, size: String(size), offset: String(offset) })
    return response.albumList2?.album ?? []
  }

  async albumSongs(id: string): Promise<Song[]> {
    const response = await this.request('getAlbum', { id })
    return response.album?.song ?? []
  }

  async artists(): Promise<Artist[]> {
    const response = await this.request('getArtists')
    return (response.artists?.index ?? []).flatMap((index: any) => index.artist ?? [])
  }

  async artist(id: string): Promise<{ artist?: Artist; albums: Album[] }> {
    const response = await this.request('getArtist', { id })
    return { artist: response.artist, albums: response.artist?.album ?? [] }
  }

  async playlists(): Promise<Playlist[]> {
    const response = await this.request('getPlaylists')
    return response.playlists?.playlist ?? []
  }

  async playlistSongs(id: string): Promise<Song[]> {
    const response = await this.request('getPlaylist', { id })
    return response.playlist?.entry ?? []
  }

  async starred(): Promise<{ songs: Song[]; albums: Album[]; artists: Artist[] }> {
    const response = await this.request('getStarred2')
    return {
      songs: response.starred2?.song ?? [],
      albums: response.starred2?.album ?? [],
      artists: response.starred2?.artist ?? [],
    }
  }

  async search(query: string): Promise<{ songs: Song[]; albums: Album[]; artists: Artist[] }> {
    const response = await this.request('search3', { query, songCount: '50', albumCount: '30', artistCount: '20' })
    return {
      songs: response.searchResult3?.song ?? [],
      albums: response.searchResult3?.album ?? [],
      artists: response.searchResult3?.artist ?? [],
    }
  }

  async setStarred(id: string, starred: boolean, kind: 'song' | 'album' = 'song') {
    await this.request(starred ? 'star' : 'unstar', { [kind === 'album' ? 'albumId' : 'id']: id })
  }

  /** Отметка о прослушивании: время начала в миллисекундах, как требует протокол. */
  async scrobble(id: string, startedAt: number) {
    await this.request('scrobble', { id, submission: 'true', time: String(startedAt) })
  }

  /** Предпочитаем синхронный текст OpenSubsonic; если его нет — старый простой запрос, как на iPhone. */
  async lyrics(song: Song): Promise<StructuredLyrics | undefined> {
    const list = await this.request('getLyricsBySongId', { id: song.id })
      .then((response) => (response.lyricsList?.structuredLyrics as StructuredLyrics[] | undefined) ?? [])
      .catch(() => [] as StructuredLyrics[])
    const best = list.find((one) => one.synced) ?? list[0]
    if (best && (best.line ?? []).length) return best
    const plain = await this.request('getLyrics', { artist: song.artist ?? '', title: song.title })
    const text = (plain.lyrics?.value as string | undefined) ?? ''
    if (!text.trim()) return undefined
    return { synced: false, line: text.split('\n').map((value) => ({ value })) }
  }

  // MARK: - Плейлисты

  /** Новый плейлист сразу с треками; возвращает его, чтобы открыть без перезагрузки списка. */
  async createPlaylist(name: string, songIds: string[] = []): Promise<Playlist | undefined> {
    const response = await this.request('createPlaylist', { name }, songIds.map((id) => ['songId', id]))
    return response.playlist
  }

  /**
   * Новый порядок или состав плейлиста целиком: createPlaylist с playlistId заменяет его треки.
   * Так перестановка — один запрос, а не удаление и добавление по одному.
   */
  async replacePlaylistSongs(id: string, songIds: string[]) {
    await this.request('createPlaylist', { playlistId: id }, songIds.map((songId) => ['songId', songId]))
  }

  async addToPlaylist(id: string, songIds: string[]) {
    await this.request('updatePlaylist', { playlistId: id }, songIds.map((songId) => ['songIdToAdd', songId]))
  }

  /** Индексы — позиции в плейлисте: один и тот же трек может стоять в нём дважды. */
  async removeFromPlaylist(id: string, indexes: number[]) {
    await this.request('updatePlaylist', { playlistId: id }, indexes.map((index) => ['songIndexToRemove', String(index)]))
  }

  async renamePlaylist(id: string, name: string) {
    await this.request('updatePlaylist', { playlistId: id, name })
  }

  async deletePlaylist(id: string) {
    await this.request('deletePlaylist', { id })
  }

  // MARK: - Оценки, похожее, сведения

  /** Оценка от 1 до 5; 0 снимает её. */
  async setRating(id: string, rating: number) {
    await this.request('setRating', { id, rating: String(Math.min(Math.max(Math.round(rating), 0), 5)) })
  }

  /** «Микс по треку»: похожие треки от Last.fm через Navidrome. */
  async similarSongs(id: string, count = 50): Promise<Song[]> {
    const response = await this.request('getSimilarSongs2', { id, count: String(count) })
    return response.similarSongs2?.song ?? []
  }

  async topSongs(artist: string, count = 10): Promise<Song[]> {
    const response = await this.request('getTopSongs', { artist, count: String(count) })
    return response.topSongs?.song ?? []
  }

  async artistInfo(id: string): Promise<ArtistInfo> {
    const response = await this.request('getArtistInfo2', { id, count: '12' })
    return response.artistInfo2 ?? {}
  }

  async albumNotes(id: string): Promise<string | undefined> {
    const response = await this.request('getAlbumInfo2', { id })
    return response.albumInfo?.notes
  }

  async genres(): Promise<Genre[]> {
    const response = await this.request('getGenres')
    const list: Genre[] = response.genres?.genre ?? []
    return list.sort((a, b) => (b.albumCount ?? 0) - (a.albumCount ?? 0))
  }

  async albumsByGenre(genre: string, offset = 0, size = 60): Promise<Album[]> {
    const response = await this.request('getAlbumList2', { type: 'byGenre', genre, size: String(size), offset: String(offset) })
    return response.albumList2?.album ?? []
  }

  /** Публичная ссылка Navidrome (нужно EnableSharing на сервере); её откроют без аккаунта. */
  async createShare(id: string): Promise<string | undefined> {
    const response = await this.request('createShare', { id })
    return response.shares?.share?.[0]?.url
  }

  async radioStations(): Promise<RadioStation[]> {
    const response = await this.request('getInternetRadioStations')
    return response.internetRadioStations?.internetRadioStation ?? []
  }

  // MARK: - Очередь на сервере

  /**
   * Очередь на сервере — общая для всех устройств: начал слушать на телефоне, продолжил здесь.
   * Позиция в миллисекундах, как требует протокол.
   */
  async savePlayQueue(songIds: string[], currentId: string | undefined, positionSeconds: number) {
    const parameters: Record<string, string> = { position: String(Math.max(0, Math.round(positionSeconds * 1000))) }
    if (currentId) parameters.current = currentId
    await this.request('savePlayQueue', parameters, songIds.map((id) => ['id', id]))
  }

  async playQueue(): Promise<RemoteQueue | undefined> {
    const response = await this.request('getPlayQueue')
    const queue = response.playQueue
    if (!queue?.entry?.length) return undefined
    return {
      songs: queue.entry,
      currentId: queue.current !== undefined ? String(queue.current) : undefined,
      position: (Number(queue.position) || 0) / 1000,
      changed: queue.changed ? Date.parse(queue.changed) : 0,
      changedBy: queue.changedBy ?? '',
    }
  }

  static readonly clientName = CLIENT_NAME

  stream(id: string, quality: StreamQuality = 'mp3High') {
    return this.url('stream', { id, ...streamParameters[quality] })
  }

  cover(id: string | undefined, size = 600) {
    return id ? this.url('getCoverArt', { id, size: String(size) }) : Promise.resolve(undefined)
  }
}
