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
 * Текст из LRCLIB (lrclib.net) — открытой базы синхронных текстов. Спрашивается, только если
 * у Navidrome текста нет и человек включил это в настройках: названия треков уходят стороннему сервису.
 */
export async function lrclibLyrics(song: Song, request: typeof fetch = fetch): Promise<StructuredLyrics | undefined> {
  if (!song.artist || !song.title) return undefined
  const query = new URLSearchParams({ track_name: song.title, artist_name: song.artist })
  if (song.album) query.set('album_name', song.album)
  if (song.duration) query.set('duration', String(Math.round(song.duration)))
  const response = await request(`https://lrclib.net/api/get?${query}`)
  if (!response.ok) return undefined
  const found = (await response.json()) as { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean }
  if (found.syncedLyrics) {
    const line = parseLrc(found.syncedLyrics)
    if (line.length) return { synced: true, line }
  }
  if (found.plainLyrics?.trim()) return { synced: false, line: found.plainLyrics.split('\n').map((value) => ({ value })) }
  return undefined
}
