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
