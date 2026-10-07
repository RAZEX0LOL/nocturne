import type { Song } from './models'

export type ReplayGainMode = 'off' | 'track' | 'album' | 'auto'

/**
 * Линейная громкость трека по тегам ReplayGain. Усиливать выше 1 нельзя — плеер этого не умеет
 * без искажений, — а пик дополнительно защищает от перегрузки.
 */
export function replayGainVolume(mode: ReplayGainMode, song: Song, preamp = 0): number {
  if (mode === 'off') return 1
  // «Авто» решается снаружи (effectiveReplayGain); здесь без контекста — как по треку.
  if (mode === 'auto') mode = 'track'
  const gain = song.replayGain
  if (!gain) return 1
  const decibels = (mode === 'album' ? gain.albumGain ?? gain.trackGain : gain.trackGain ?? gain.albumGain) ?? 0
  const peak = (mode === 'album' ? gain.albumPeak ?? gain.trackPeak : gain.trackPeak ?? gain.albumPeak) ?? 0
  let linear = Math.pow(10, (decibels + preamp) / 20)
  if (peak > 0) linear = Math.min(linear, 1 / peak)
  return Math.min(Math.max(linear, 0), 1)
}

/**
 * «Авто»: альбом подряд звучит как задумано (по альбому), а перемешанная очередь — ровно
 * (по треку). Альбом подряд — когда не перемешано и сосед по очереди с того же альбома.
 */
export function effectiveReplayGain(
  mode: ReplayGainMode,
  queue: { songs: Song[]; index: number; shuffled: boolean },
): Exclude<ReplayGainMode, 'auto'> {
  if (mode !== 'auto') return mode
  const song = queue.songs[queue.index]
  if (queue.shuffled || !song?.albumId) return 'track'
  const sameAlbum = (other?: Song) => !!other && other.albumId === song.albumId
  return sameAlbum(queue.songs[queue.index - 1]) || sameAlbum(queue.songs[queue.index + 1]) ? 'album' : 'track'
}
