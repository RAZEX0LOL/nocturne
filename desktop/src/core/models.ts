/** Модели библиотеки. Поля повторяют ответ OpenSubsonic: необязательное здесь действительно необязательное. */

export interface ReplayGain {
  trackGain?: number
  albumGain?: number
  trackPeak?: number
  albumPeak?: number
}

export interface Song {
  id: string
  title: string
  artist?: string
  /** Есть у треков с сервера: по нему из плеера открывается страница исполнителя. */
  artistId?: string
  album?: string
  albumId?: string
  coverArt?: string
  /** Секунды, дробные: сервер отдаёт длительность с долями. */
  duration?: number
  track?: number
  starred?: string
  userRating?: number
  genre?: string
  replayGain?: ReplayGain
}

export interface Album {
  id: string
  name: string
  artist?: string
  artistId?: string
  coverArt?: string
  songCount?: number
  year?: number
  starred?: string
  genre?: string
}

export interface Artist {
  id: string
  name: string
  albumCount?: number
  coverArt?: string
}

export interface Playlist {
  id: string
  name: string
  songCount?: number
  coverArt?: string
}

export interface RadioStation {
  id: string
  name: string
  streamUrl: string
}

export interface LyricLine {
  start?: number
  value: string
}

export interface StructuredLyrics {
  lang?: string
  synced: boolean
  line?: LyricLine[]
}

/** Ошибка, которую не стыдно показать человеку: подробности сервера наружу не выносим. */
export class MusicError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'server' | 'network' | 'address' = 'server') {
    super(message)
    this.name = 'MusicError'
  }
}
