import { describe, expect, test } from 'bun:test'
import type { Song } from './models'
import { effectiveReplayGain } from './replaygain'

const song = (id: string, albumId?: string): Song => ({ id, title: id, albumId })

describe('ReplayGain «Авто»', () => {
  const album = [song('a1', 'A'), song('a2', 'A'), song('a3', 'A')]
  test('альбом подряд — по альбому', () => {
    expect(effectiveReplayGain('auto', { songs: album, index: 1, shuffled: false })).toBe('album')
    expect(effectiveReplayGain('auto', { songs: album, index: 0, shuffled: false })).toBe('album')
  })
  test('перемешано или соседи с разных альбомов — по треку', () => {
    expect(effectiveReplayGain('auto', { songs: album, index: 1, shuffled: true })).toBe('track')
    const mix = [song('x', 'A'), song('y', 'B'), song('z', 'C')]
    expect(effectiveReplayGain('auto', { songs: mix, index: 1, shuffled: false })).toBe('track')
    expect(effectiveReplayGain('auto', { songs: [song('solo')], index: 0, shuffled: false })).toBe('track')
  })
  test('ручной режим не трогается', () => {
    expect(effectiveReplayGain('album', { songs: album, index: 1, shuffled: true })).toBe('album')
    expect(effectiveReplayGain('off', { songs: album, index: 1, shuffled: false })).toBe('off')
  })
})
