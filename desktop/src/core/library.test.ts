import { afterEach, describe, expect, test } from 'bun:test'
import { Credentials, NavidromeClient } from './client'

/**
 * Запросы медиатеки: что именно уходит на сервер. Ответы подставные — проверяется не Navidrome,
 * а то, что приложение спрашивает его правильно (повторяющиеся songId, индексы, границы оценки).
 */

const original = globalThis.fetch
let sent: URL[] = []

function answer(body: Record<string, unknown> = {}) {
  sent = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    sent.push(new URL(String(input)))
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } }))
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = original
})

const client = () => new NavidromeClient(new Credentials('https://music.example.com', 'anna', 'secret'), [])
const last = () => sent[sent.length - 1]!
const endpoint = (url: URL) => url.pathname.split('/').pop()

describe('плейлисты', () => {
  test('новый плейлист сразу с треками — songId повторяется', async () => {
    answer({ playlist: { id: 'pl9', name: 'Дорога' } })
    const created = await client().createPlaylist('Дорога', ['s1', 's2'])
    expect(endpoint(last())).toBe('createPlaylist.view')
    expect(last().searchParams.get('name')).toBe('Дорога')
    expect(last().searchParams.getAll('songId')).toEqual(['s1', 's2'])
    expect(created?.id).toBe('pl9')
  })

  test('перестановка заменяет состав одним запросом и сохраняет порядок', async () => {
    answer()
    await client().replacePlaylistSongs('pl1', ['s3', 's1', 's2'])
    expect(endpoint(last())).toBe('createPlaylist.view')
    expect(last().searchParams.get('playlistId')).toBe('pl1')
    expect(last().searchParams.get('name')).toBeNull()
    expect(last().searchParams.getAll('songId')).toEqual(['s3', 's1', 's2'])
  })

  test('добавление, удаление по позициям, переименование', async () => {
    answer()
    await client().addToPlaylist('pl1', ['s4', 's5'])
    expect(last().searchParams.getAll('songIdToAdd')).toEqual(['s4', 's5'])
    await client().removeFromPlaylist('pl1', [0, 3])
    expect(last().searchParams.getAll('songIndexToRemove')).toEqual(['0', '3'])
    await client().renamePlaylist('pl1', 'Новое имя')
    expect(last().searchParams.get('name')).toBe('Новое имя')
    await client().deletePlaylist('pl1')
    expect(endpoint(last())).toBe('deletePlaylist.view')
    expect(last().searchParams.get('id')).toBe('pl1')
  })
})

describe('оценки и сведения', () => {
  test('оценка держится в пределах 0–5', async () => {
    answer()
    await client().setRating('s1', 7)
    expect(last().searchParams.get('rating')).toBe('5')
    await client().setRating('s1', -1)
    expect(last().searchParams.get('rating')).toBe('0')
    await client().setRating('s1', 3.6)
    expect(last().searchParams.get('rating')).toBe('4')
  })

  test('жанры — самые большие сначала, альбомы жанра по имени', async () => {
    answer({ genres: { genre: [{ value: 'Jazz', albumCount: 2 }, { value: 'Rock', albumCount: 9 }] } })
    const genres = await client().genres()
    expect(genres.map((genre) => genre.value)).toEqual(['Rock', 'Jazz'])
    answer({ albumList2: { album: [{ id: 'a1', name: 'A' }] } })
    const albums = await client().albumsByGenre('Hip-Hop & Rap')
    expect(last().searchParams.get('type')).toBe('byGenre')
    expect(last().searchParams.get('genre')).toBe('Hip-Hop & Rap')
    expect(albums).toHaveLength(1)
  })

  test('пустые ответы не ломают приложение', async () => {
    answer()
    expect(await client().similarSongs('s1')).toEqual([])
    expect(await client().topSongs('Кино')).toEqual([])
    expect(await client().artistInfo('ar1')).toEqual({})
    expect(await client().albumNotes('al1')).toBeUndefined()
    expect(await client().radioStations()).toEqual([])
  })
})

describe('очередь на сервере', () => {
  test('сохранение: id повторяются, позиция в миллисекундах', async () => {
    answer()
    await client().savePlayQueue(['s1', 's2', 's3'], 's2', 83.456)
    expect(endpoint(last())).toBe('savePlayQueue.view')
    expect(last().searchParams.getAll('id')).toEqual(['s1', 's2', 's3'])
    expect(last().searchParams.get('current')).toBe('s2')
    expect(last().searchParams.get('position')).toBe('83456')
  })

  test('чтение: секунды, время изменения и кто менял', async () => {
    answer({
      playQueue: {
        entry: [{ id: 's1', title: 'Один' }, { id: 's2', title: 'Два' }],
        current: 's2',
        position: 61500,
        changed: '2026-10-07T20:15:00Z',
        changedBy: 'Nocturne',
      },
    })
    const queue = await client().playQueue()
    expect(queue?.songs).toHaveLength(2)
    expect(queue?.currentId).toBe('s2')
    expect(queue?.position).toBe(61.5)
    expect(queue?.changed).toBe(Date.parse('2026-10-07T20:15:00Z'))
    expect(queue?.changedBy).toBe('Nocturne')
  })

  test('пустая очередь — нечего предлагать', async () => {
    answer({ playQueue: {} })
    expect(await client().playQueue()).toBeUndefined()
    answer()
    expect(await client().playQueue()).toBeUndefined()
  })
})
