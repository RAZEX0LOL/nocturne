import type { Song } from './models'

export type ReplayGainMode = 'off' | 'track' | 'album'

/**
 * Линейная громкость трека по тегам ReplayGain. Усиливать выше 1 нельзя — плеер этого не умеет
 * без искажений, — а пик дополнительно защищает от перегрузки.
 */
export function replayGainVolume(mode: ReplayGainMode, song: Song, preamp = 0): number {
  if (mode === 'off') return 1
  const gain = song.replayGain
  if (!gain) return 1
  const decibels = (mode === 'album' ? gain.albumGain ?? gain.trackGain : gain.trackGain ?? gain.albumGain) ?? 0
  const peak = (mode === 'album' ? gain.albumPeak ?? gain.trackPeak : gain.trackPeak ?? gain.albumPeak) ?? 0
  let linear = Math.pow(10, (decibels + preamp) / 20)
  if (peak > 0) linear = Math.min(linear, 1 / peak)
  return Math.min(Math.max(linear, 0), 1)
}
