import { describe, expect, test } from 'bun:test'
import { Credentials, NavidromeClient } from './client'

/**
 * Проверка против настоящего сервера — того самого мока, который используют все платформы
 * (`shared/mock-server`). Контрактные тесты разбирают готовые ответы, а здесь запрос и правда
 * уходит по сети: подпись, сборка адреса и разбор ответа проверяются вместе.
 *
 * Без NOCTURNE_MOCK тесты пропускаются: обычный прогон не должен зависеть от запущенного сервера.
 */
const server = process.env.NOCTURNE_MOCK
const live = server ? describe : describe.skip

live('живой сервер', () => {
  const client = () => new NavidromeClient(new Credentials(server!, 'demo', 'demo'))

  test('сервер отвечает на ping', async () => {
    await client().ping()
  })

  test('альбом приходит вместе с треками', async () => {
    const albums = await client().albums()
    expect(albums.length).toBeGreaterThan(0)
    const songs = await client().albumSongs(albums[0]!.id)
    expect(songs.length).toBeGreaterThan(0)
    expect(songs[0]!.title).toBeTruthy()
  })

  test('поток отдаётся целиком и это звук', async () => {
    const albums = await client().albums()
    const songs = await client().albumSongs(albums[0]!.id)
    const response = await fetch(await client().stream(songs[0]!.id))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('audio')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  test('отметка о прослушивании принимается', async () => {
    const albums = await client().albums()
    const songs = await client().albumSongs(albums[0]!.id)
    await client().scrobble(songs[0]!.id, Date.now())
  })

  test('неверный пароль отличается от обрыва связи', async () => {
    const wrong = new NavidromeClient(new Credentials(server!, 'demo', 'не тот пароль'))
    expect(wrong.ping()).rejects.toMatchObject({ kind: 'auth' })
  })
})
