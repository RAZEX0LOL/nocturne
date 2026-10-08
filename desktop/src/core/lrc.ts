import type { LyricLine, Song, StructuredLyrics } from './models'

/**
 * Формат LRC: «[мм:сс.сс] строка», у одной строки может быть несколько отметок времени.
 * Строки без отметок (метаданные вроде «[ar: …]») пропускаются.
 */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const value = raw.slice(stamps[stamps.length - 1]!.index! + stamps[stamps.length - 1]![0].length).trim()
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(stamp[3].padEnd(3, '0')) : 0
      lines.push({ start: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000 + fraction, value })
    }
  }
  return lines.sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
}

/**
 * Название для поиска: без «(feat. …)», «(Sped Up)», «[Remastered 2020]», « - Bonus Track» —
 * в LRCLIB трек обычно записан без этих хвостов.
 */
export function cleanTitle(title: string): string {
  const noise = /feat\.?|ft\.|prod\.|sped|slowed|reverb|remaster|version|edit|bonus|explicit|official|audio|video|lyrics/i
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, (group) => (noise.test(group) ? '' : group))
    .replace(/\s+-\s+(?:bonus track|single version|radio edit|remaster(?:ed)?(?: \d{4})?)$/i, '')
    .replace(/\s+(?:feat\.?|ft\.)\s.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Первый исполнитель: «Lil Wayne, Ty Dolla $ign» → «Lil Wayne», «Ondi vil & Mishaal» → «Ondi vil». */
export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:,|\/|;|\s&\s|\sx\s|\sfeat\.?\s|\sft\.\s|\sи\s)\s*/i)[0]!.trim()
}

const ALTERED = /sped\s*up|slowed|nightcore|speed\s*up/i

/** «Неизвестен», «Unknown Artist» — исполнителя нет, искать только по названию. */
const UNKNOWN_ARTIST = /^(?:неизвестен|неизвестный исполнитель|unknown(?: artist)?|various artists|\[unknown\])$/i

interface LrclibRecord {
  trackName?: string
  artistName?: string
  duration?: number
  instrumental?: boolean
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

function fromRecord(found: LrclibRecord, synced: boolean): StructuredLyrics | undefined {
  if (synced && found.syncedLyrics) {
    const line = parseLrc(found.syncedLyrics)
    if (line.length) return { synced: true, line }
  }
  const plain = found.plainLyrics?.trim() || (found.syncedLyrics ? parseLrc(found.syncedLyrics).map((line) => line.value).join('\n') : '')
  if (plain.trim()) return { synced: false, line: plain.split('\n').map((value) => ({ value })) }
  return undefined
}

/**
 * Лучший из найденных: длительность в пределах 5 секунд, синхронный важнее. Если длительность
 * не совпала ни у кого (ускоренная или замедленная версия) — только простой текст: тайминги
 * чужой записи разъехались бы со звуком.
 */
export function pickLyrics(records: LrclibRecord[], duration?: number): StructuredLyrics | undefined {
  const usable = records.filter((record) => !record.instrumental && (record.syncedLyrics || record.plainLyrics))
  if (!usable.length) return undefined
  const distance = (record: LrclibRecord) => (duration && record.duration ? Math.abs(record.duration - duration) : 0)
  const close = usable.filter((record) => distance(record) <= 5)
  if (close.length) {
    const best = [...close].sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || distance(a) - distance(b))[0]!
    return fromRecord(best, true)
  }
  return fromRecord([...usable].sort((a, b) => distance(a) - distance(b))[0]!, false)
}

/**
 * Текст из LRCLIB (lrclib.net) — открытой базы синхронных текстов. Спрашивается, только если
 * у Navidrome текста нет и человек включил это в настройках: названия треков уходят стороннему сервису.
 *
 * Альбом в запрос не идёт: LRCLIB сверяет его буквально, а у треков из ВК, Telegram и сборников
 * он «VK», «Неизвестен» или название плейлиста — и точный запрос всегда давал 404.
 */
export async function lrclibLyrics(song: Song, request: typeof fetch = fetch): Promise<StructuredLyrics | undefined> {
  if (!song.title) return undefined
  const ask = async (path: string, params: Record<string, string>) => {
    const response = await request(`https://lrclib.net/api/${path}?${new URLSearchParams(params)}`)
    return response.ok ? ((await response.json()) as unknown) : undefined
  }
  const artist = song.artist && !UNKNOWN_ARTIST.test(song.artist.trim()) ? song.artist : ''
  const title = cleanTitle(song.title) || song.title

  if (artist) {
    const exact: Record<string, string> = { track_name: song.title, artist_name: artist }
    if (song.duration) exact.duration = String(Math.round(song.duration))
    const found = (await ask('get', exact)) as LrclibRecord | undefined
    const lyrics = found && pickLyrics([found], song.duration)
    if (lyrics) return lyrics
  }

  const searches: Array<Record<string, string>> = artist
    ? [{ track_name: title, artist_name: primaryArtist(artist) }, { q: `${primaryArtist(artist)} ${title}` }]
    : [{ q: title }]
  // Ускоренная или замедленная версия — обычно чужой песни: текст оригинала ищем по одному названию.
  if (artist && ALTERED.test(song.title)) searches.push({ track_name: title })
  for (const params of searches) {
    const records = await ask('search', params)
    const lyrics = Array.isArray(records) ? pickLyrics(records as LrclibRecord[], song.duration) : undefined
    if (lyrics) return lyrics
  }
  return undefined
}
