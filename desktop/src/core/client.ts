import { MusicError, type Album, type Artist, type Playlist, type Song } from './models'

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
      throw new MusicError('Укажи адрес сервера целиком, вместе с https://', 'address')
    }
    const scheme = url.protocol.replace(':', '').toLowerCase()
    const secure = scheme === 'https' || (scheme === 'http' && isLocalNetworkHost(url.hostname))
    if (!secure || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new MusicError('Укажи адрес сервера по HTTPS без логина и параметров.', 'address')
    }
    const login = username.trim()
    if (!login || !password) throw new MusicError('Введи логин и пароль.', 'address')
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

/** MD5 нужен самим протоколом Subsonic; пароль уходит только как соль с хешем и только по HTTPS. */
export async function md5(text: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(text, 'utf8').digest('hex')
}

export class NavidromeClient {
  constructor(readonly credentials: Credentials) {}

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
    const token = await md5(this.credentials.password + salt)
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
      throw new MusicError('Сервер вернул неожиданный ответ.')
    }
    const response = parsed?.['subsonic-response']
    if (!response || typeof response !== 'object') throw new MusicError('Сервер вернул неожиданный ответ.')
    if (response.status !== 'ok') {
      const code = response.error?.code
      throw code === 40
        ? new MusicError('Неверный логин или пароль.', 'auth')
        : new MusicError(`Ошибка Navidrome (${code ?? '?'}).`)
    }
    return response
  }

  private async request(endpoint: string, parameters: Record<string, string> = {}, repeated: Array<[string, string]> = []) {
    // Чтения идемпотентны, поэтому сетевой сбой можно повторить; ошибки протокола не повторяем.
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(await this.url(endpoint, parameters, repeated))
        if (!response.ok) throw new MusicError(`Сервер вернул HTTP ${response.status}.`)
        return NavidromeClient.decode(await response.text())
      } catch (error) {
        if (error instanceof MusicError || attempt >= 2) throw error
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
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

  async lyrics(id: string) {
    const response = await this.request('getLyricsBySongId', { id })
    return response.lyricsList?.structuredLyrics ?? []
  }

  stream(id: string, quality: StreamQuality = 'mp3High') {
    return this.url('stream', { id, ...streamParameters[quality] })
  }

  cover(id: string | undefined, size = 600) {
    return id ? this.url('getCoverArt', { id, size: String(size) }) : Promise.resolve(undefined)
  }
}
