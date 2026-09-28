import type { Song } from './core/models'
import { t } from './i18n'

/**
 * Всё, что умеет только окно Tauri: файлы на диске, системные диалоги, загрузки.
 * В обычном браузере (при разработке интерфейса) эти возможности просто отсутствуют.
 */

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}

export interface LocalTrack {
  id: string
  path: string
  title: string
  artist?: string
  album?: string
  track?: number
  duration?: number
  cover?: string
}

export interface DownloadedTrack {
  id: string
  path: string
  song: Song
  /** Обложка, сохранённая рядом с треком: она открывается и без сети. */
  cover?: string
}

/** Адрес, по которому окно может прочитать файл с диска (протокол asset). */
export async function fileSource(path: string): Promise<string> {
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  return convertFileSrc(path)
}

export async function localLibrary(): Promise<{ folder?: string; tracks: LocalTrack[] }> {
  if (!isDesktop()) return { tracks: [] }
  return invoke('local_library')
}

export async function importItems(paths: string[]): Promise<number> {
  return invoke('import_items', { paths })
}

export async function removeLocal(path: string) {
  await invoke('remove_local', { path })
}

/** Системный выбор файлов или папки; пустой список, если человек передумал. */
export async function pick(kind: 'files' | 'folder'): Promise<string[]> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const result = await open(
    kind === 'folder'
      ? { directory: true, multiple: false }
      : {
          multiple: true,
          filters: [{ name: t('Музыка'), extensions: ['mp3', 'm4a', 'aac', 'flac', 'wav', 'aif', 'aiff', 'ogg', 'opus'] }],
        },
  )
  if (!result) return []
  return Array.isArray(result) ? result : [result]
}

export async function openFolder(path: string) {
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(path)
}

export async function downloadTrack(url: string, song: Song, coverUrl?: string): Promise<DownloadedTrack> {
  return invoke('download_track', { url, id: song.id, song, coverUrl })
}

export async function downloads(): Promise<DownloadedTrack[]> {
  if (!isDesktop()) return []
  return invoke('downloads')
}

export async function removeDownload(id: string) {
  await invoke('remove_download', { id })
}
