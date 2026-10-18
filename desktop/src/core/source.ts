/** Откуда играть трек — правило из shared/spec/offline.md, проверяется shared/cases/source.json. */

export type SourceKind = 'local' | 'download' | 'stream' | 'unavailable'

export interface Availability {
  local: ReadonlySet<string>
  downloaded: ReadonlySet<string>
  online: boolean
}

export const isLocalId = (id: string) => id.startsWith('local:')

export function chooseSource(id: string, { local, downloaded, online }: Availability): SourceKind {
  if (isLocalId(id)) return local.has(id) ? 'local' : 'unavailable'
  if (downloaded.has(id)) return 'download'
  return online ? 'stream' : 'unavailable'
}

/** Общий горизонт подготовки: три трека, не более 15 минут, только безлимитная сеть. */
export function offlinePreparation<T extends { id: string; duration?: number }>(songs: T[], enabled: boolean, online: boolean, unmetered: boolean): T[] {
  if (!enabled || !online || !unmetered) return []
  const wanted: T[] = []
  let seconds = 0
  for (const song of songs) {
    if (isLocalId(song.id) || song.id.startsWith('radio:') || song.id.startsWith('radio-')) continue
    const duration = Number.isFinite(song.duration) && (song.duration ?? 0) > 0 ? song.duration! : 300
    if (wanted.length >= 3 || seconds + duration > 900) break
    wanted.push(song); seconds += duration
  }
  return wanted
}
