import { describe, expect, test } from 'bun:test'
import { lrclibLyrics, parseLrc } from './lrc'

describe('LRC', () => {
  test('время в миллисекундах, метаданные пропускаются', () => {
    const lines = parseLrc('[ar: Кино]\n[00:12.34] Белый снег\n[01:02.5]Серый лёд\n[02:00] ')
    expect(lines).toEqual([
      { start: 12340, value: 'Белый снег' },
      { start: 62500, value: 'Серый лёд' },
      { start: 120000, value: '' },
    ])
  })

  test('несколько отметок у одной строки — припев', () => {
    const lines = parseLrc('[00:10.00][00:40.00] Группа крови\n[00:20.00] На рукаве')
    expect(lines.map((line) => [line.start, line.value])).toEqual([
      [10000, 'Группа крови'],
      [20000, 'На рукаве'],
      [40000, 'Группа крови'],
    ])
  })
})

describe('LRCLIB', () => {
  const song = { id: 's1', title: 'Кукушка', artist: 'Кино', album: 'Чёрный альбом', duration: 397.4 }

  test('спрашивает по названию, исполнителю, альбому и длительности; синхронный текст важнее', async () => {
    let asked = ''
    const lyrics = await lrclibLyrics(song, (async (url: string) => {
      asked = url
      return new Response(JSON.stringify({ syncedLyrics: '[00:01.00] Песен ещё ненаписанных', plainLyrics: 'Песен ещё ненаписанных' }))
    }) as unknown as typeof fetch)
    const query = new URL(asked).searchParams
    expect(query.get('track_name')).toBe('Кукушка')
    expect(query.get('artist_name')).toBe('Кино')
    expect(query.get('album_name')).toBe('Чёрный альбом')
    expect(query.get('duration')).toBe('397')
    expect(lyrics).toEqual({ synced: true, line: [{ start: 1000, value: 'Песен ещё ненаписанных' }] })
  })

  test('простой текст, если синхронного нет; 404 — ничего', async () => {
    const plain = await lrclibLyrics(song, (async () => new Response(JSON.stringify({ plainLyrics: 'раз\nдва' }))) as unknown as typeof fetch)
    expect(plain).toEqual({ synced: false, line: [{ value: 'раз' }, { value: 'два' }] })
    const none = await lrclibLyrics(song, (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch)
    expect(none).toBeUndefined()
  })
})
