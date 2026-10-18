// Реальный store, сохранение в браузере и HTTP: перезапуск, чужой аккаунт и запоздалые ответы.
import { chromium } from 'playwright-core'
const executablePath = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ locale: 'ru-RU' })
const page = await context.newPage()
const failures = []
const errors = []
const check = (ok, name) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) failures.push(name) }
page.on('pageerror', (error) => errors.push(error.message))
const marks = []
await page.route('**/rest/scrobble.view?**', async (route) => {
  const query = new URL(route.request().url()).searchParams
  if (query.get('submission') === 'true') marks.push({ owner: query.get('u'), time: query.get('time') })
  await route.continue()
})
const storeCall = (fn, arg) => page.evaluate(async ({ fn, arg }) => {
  const { store } = await import('/src/state/store.ts')
  return Function('store', 'arg', `return (${fn})(store, arg)`)(store, arg)
}, { fn: fn.toString(), arg })
const connect = (user = 'a') => storeCall((store, user) => store.connect('http://127.0.0.1:4533', user, 'demo'), user)
try {
  await page.goto('http://localhost:1431/')
  await page.locator('button[type=submit]').waitFor()
  await connect()
  await storeCall(async (store) => {
    await store.play([{ id: 't0', title: 'Session test', duration: 300, albumId: 'al-1' }], 0)
    store.pause()
    window.__engine.onTimeUpdate(151, 300)
  })
  for (let i = 0; i < 30 && marks.length < 1; i++) await page.waitForTimeout(100)
  check(marks.length === 1 && marks[0].owner === 'a', 'прослушивание отправлено один раз своему аккаунту')
  const initial = await storeCall((store) => store.snapshot().queue.current.song.id)
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('v2.queue.')).map(([, value]) => JSON.parse(value)).find((one) => one.account.startsWith('a@'))?.data)
  check(saved?.listening?.submitted === true && saved.listening.startedAt === Number(marks[0]?.time), 'снимок сохраняет playId, исходное время и отправленную отметку')
  await page.reload()
  await page.locator('button[type=submit]').waitFor()
  await connect()
  check(await storeCall((store) => store.snapshot().queue?.current?.song.id) === initial, 'очередь восстановилась после перезапуска')
  await storeCall((store) => { store.pause(); window.__engine.onTimeUpdate(152, 300) })
  await page.waitForTimeout(400)
  check(marks.length === 1, 'перезапуск после порога не отправляет скроббл повторно')

  const renders = await storeCall((store) => {
    let views = 0, transport = 0
    const offView = store.subscribeView(() => views++)
    const offTransport = store.subscribeTransport(() => transport++)
    for (let i = 0; i < 20; i++) window.__engine.onTimeUpdate(155 + i / 10, 300)
    offView(); offTransport()
    return { views, transport }
  })
  check(renders.views === 0 && renders.transport === 20, `20 тиков: общих обновлений ${renders.views}, обновлений транспорта ${renders.transport}`)

  const recoveredAt = saved.listening.startedAt + 1000
  await page.evaluate(async ({ account, time }) => {
    const { AccountRepository } = await import('/src/state/persistence.ts')
    new AccountRepository(localStorage, account).write('scrobbles', [{ account, id: 't1', playId: 'recovered', time }])
    const other = account.replace(/^a@/, 'b@')
    new AccountRepository(localStorage, other).write('scrobbles', [{ account: other, id: 't1', playId: 'other-owner', time: time + 1000 }])
  }, { account: saved.listening.account, time: recoveredAt })
  await storeCall((store) => store.disconnect())
  await connect()
  for (let i = 0; i < 30 && !marks.some((mark) => Number(mark.time) === recoveredAt); i++) await page.waitForTimeout(100)
  check(marks.filter((mark) => Number(mark.time) === recoveredAt && mark.owner === 'a').length === 1, 'после входа отправляется сохранённая отметка без нового прослушивания')
  check(!marks.some((mark) => Number(mark.time) === recoveredAt + 1000), 'чужая отложенная отметка остаётся своему аккаунту')

  await page.route('**/rest/getAlbumList2.view?**', async (route) => {
    const query = new URL(route.request().url()).searchParams
    if (query.get('type') === 'frequent') return route.fulfill({ status: 500, body: 'optional shelf unavailable' })
    await route.continue()
  })
  await storeCall((store) => store.refresh())
  check(await storeCall((store) => !store.snapshot().offline && store.snapshot().recent.length > 0), 'ошибка необязательной полки не переводит приложение в офлайн')
  await page.unroute('**/rest/getAlbumList2.view?**')

  let release, entered
  const gate = new Promise((resolve) => { release = resolve })
  const seen = new Promise((resolve) => { entered = resolve })
  let captured = false
  await page.route('**/rest/getAlbumList2.view?**', async (route) => {
    const query = new URL(route.request().url()).searchParams
    if (!captured && query.get('type') === 'newest') {
      captured = true; entered(); await gate
      return route.fulfill({ json: { 'subsonic-response': { status: 'ok', albumList2: { album: [{ id: 'old-only', name: 'Old Account Album' }] } } } })
    }
    await route.continue()
  })
  await storeCall((store) => { void store.refresh() })
  await seen
  await storeCall((store) => store.disconnect())
  await connect('b')
  release()
  await page.waitForTimeout(400)
  check(await storeCall((store) => store.snapshot().client.credentials.username === 'b' && !store.snapshot().recent.some((album) => album.id === 'old-only')), 'ответ старого аккаунта не меняет новый')
  await page.unroute('**/rest/getAlbumList2.view?**')
  await page.waitForTimeout(250)
  await context.setOffline(true)
  await storeCall((store) => store.reconnect())
  check(await storeCall((store) => store.snapshot().offline && store.snapshot().recent.length > 0), 'после потери сети сохранённый каталог остаётся доступен')
  await context.setOffline(false)
  check(errors.length === 0, 'ошибок JavaScript нет: ' + errors.join(' | '))
  console.log('\nИТОГ: провалов', failures.length)
} finally { await browser.close() }
process.exitCode = failures.length || errors.length ? 1 : 0
