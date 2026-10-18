import { describe, expect, test } from 'bun:test'
import { AccountRepository, SessionEpoch } from '../state/persistence'

describe('account persistence', () => {
  test('одинаковые ID и очередь переживают создание нового хранилища раздельно по аккаунтам', () => {
    const data = new Map<string, string>()
    const disk = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    const a = new AccountRepository(disk, 'a@https://server')
    const b = new AccountRepository(disk, 'b@https://server')
    a.write('downloads', [{ song: { id: 'same', title: 'A' }, quality: 'mp3High' }])
    b.write('downloads', [{ song: { id: 'same', title: 'B' }, quality: 'original' }])
    expect(new AccountRepository(disk, 'a@https://server').read<unknown>('downloads')).toEqual([{ song: { id: 'same', title: 'A' }, quality: 'mp3High' }])
    expect(b.read<unknown>('downloads')).toEqual([{ song: { id: 'same', title: 'B' }, quality: 'original' }])
    expect([...data.values()].join('')).not.toMatch(/password|[?&][ts]=/)
  })

  test('повреждённый каталог и нехватка места не обрывают воспроизведение', () => {
    const disk = { getItem: () => '{broken', setItem: () => { throw new DOMException('quota', 'QuotaExceededError') } }
    const repository = new AccountRepository(disk, 'a')
    expect(repository.read('catalog')).toBeUndefined()
    expect(repository.write('downloads', [])).toBe(false)
  })

  test('запоздалый ответ не меняет новое подключение к тому же серверу', async () => {
    const epoch = new SessionEpoch()
    const current = epoch.capture()
    let resolve!: (value: string) => void
    let album = 'new'
    const request = new Promise<string>((done) => { resolve = done }).then((value) => { if (current()) album = value })
    epoch.next()
    resolve('old')
    await request
    expect(album).toBe('new')
  })
})
