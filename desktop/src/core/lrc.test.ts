import { describe, expect, test } from 'bun:test'
import { cleanTitle, lrclibLyrics, parseLrc, pickLyrics, primaryArtist } from './lrc'

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

  test('спрашивает по названию, исполнителю и длительности — без альбома; синхронный текст важнее', async () => {
    let asked = ''
    const lyrics = await lrclibLyrics(song, (async (url: string) => {
      asked = url
      return new Response(JSON.stringify({ syncedLyrics: '[00:01.00] Песен ещё ненаписанных', plainLyrics: 'Песен ещё ненаписанных' }))
    }) as unknown as typeof fetch)
    const query = new URL(asked).searchParams
    expect(query.get('track_name')).toBe('Кукушка')
    expect(query.get('artist_name')).toBe('Кино')
    expect(query.get('album_name')).toBeNull()
    expect(query.get('duration')).toBe('397')
    expect(lyrics).toEqual({ synced: true, line: [{ start: 1000, value: 'Песен ещё ненаписанных' }] })
  })

  test('простой текст, если синхронного нет; 404 и пустой поиск — ничего', async () => {
    const plain = await lrclibLyrics(song, (async () => new Response(JSON.stringify({ plainLyrics: 'раз\nдва', duration: 397 }))) as unknown as typeof fetch)
    expect(plain).toEqual({ synced: false, line: [{ value: 'раз' }, { value: 'два' }] })
    const none = await lrclibLyrics(song, (async (url: string) =>
      url.includes('/search') ? new Response('[]') : new Response('{}', { status: 404 })) as unknown as typeof fetch)
    expect(none).toBeUndefined()
  })

  test('точного нет — ищет по очищенному названию и первому исполнителю', async () => {
    const asked: string[] = []
    const vk = { id: 'v1', title: 'Scars (feat. mishaal)', artist: 'Ondi vil & Mishaal', album: 'VK', duration: 96 }
    const lyrics = await lrclibLyrics(vk, (async (url: string) => {
      asked.push(url)
      if (url.includes('/get')) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify([
        { trackName: 'Scars', artistName: 'Ondi Vil', duration: 140, syncedLyrics: '[00:01.00] чужая версия' },
        { trackName: 'Scars (feat. Mishaal)', artistName: 'Ondi Vil/Mishaal', duration: 96, syncedLyrics: '[00:02.00] та самая' },
      ]))
    }) as unknown as typeof fetch)
    const search = new URL(asked[1]!).searchParams
    expect(search.get('track_name')).toBe('Scars')
    expect(search.get('artist_name')).toBe('Ondi vil')
    expect(lyrics).toEqual({ synced: true, line: [{ start: 2000, value: 'та самая' }] })
  })

  test('исполнитель неизвестен — свободный поиск по названию', async () => {
    const asked: string[] = []
    await lrclibLyrics({ id: 'u', title: 'ALL TIME LOW - Jon Bellion (Version SAD)', artist: 'Неизвестен' }, (async (url: string) => {
      asked.push(url)
      return new Response('[]')
    }) as unknown as typeof fetch)
    expect(asked).toHaveLength(1)
    expect(new URL(asked[0]!).searchParams.get('q')).toBe('ALL TIME LOW - Jon Bellion')
  })
})

describe('поиск текста: разбор названий', () => {
  test('из названия уходят feat, sped up, ремастеры и бонус-треки', () => {
    expect(cleanTitle('Another Love (Sped Up)')).toBe('Another Love')
    expect(cleanTitle('Experience (Starkey Remix / Remastered 2020) (Slowed)')).toBe('Experience')
    expect(cleanTitle('Arcade - Bonus Track')).toBe('Arcade')
    expect(cleanTitle('Scars feat. Mishaal')).toBe('Scars')
    expect(cleanTitle('Кукушка (Live)')).toBe('Кукушка (Live)')
  })

  test('первый исполнитель из списка', () => {
    expect(primaryArtist('Lil Wayne, Ty Dolla $ign, XXXTentacion')).toBe('Lil Wayne')
    expect(primaryArtist('Duncan Laurence feat. FLETCHER')).toBe('Duncan Laurence')
    expect(primaryArtist('Lowx & TTM')).toBe('Lowx')
    expect(primaryArtist('Кино')).toBe('Кино')
  })

  test('длительность не совпала ни у кого — только текст без таймингов', () => {
    const lyrics = pickLyrics([{ duration: 244, syncedLyrics: '[00:01.00] раз\n[00:02.00] два' }], 203)
    expect(lyrics).toEqual({ synced: false, line: [{ value: 'раз' }, { value: 'два' }] })
  })
})
