// Сквозная проверка медиатеки (этап 2): выделение, меню, плейлисты, перетаскивание, оценки,
// жанры, радио, страница исполнителя, очередь. Условия те же, что у smoke.mjs.
import { chromium } from 'playwright-core'
const exe = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const tag = process.argv[2] ?? 'mac'
const ua = tag === 'mac'
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
const S = process.env.S ?? '/tmp'
const failures = []
const errors = []
const check = (ok, what) => { if (!ok) failures.push(what); console.log(ok ? 'ok  ' : 'FAIL', what) }
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ userAgent: ua, viewport: { width: 1400, height: 900 }, locale: 'ru-RU' })
page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text().slice(0, 200)) })
const wait = (ms) => page.waitForTimeout(ms)
// Тесты идут на Mac: там Ctrl+клик — это правый клик, поэтому для обоих оформлений — ⌘.
const mod = 'Meta'

/** Пункт последнего показанного меню по тексту (в браузере меню не рисуется, пункты лежат в window). */
async function menu(...path) {
  return page.evaluate((path) => {
    let items = window.__lastMenu
    for (const [index, text] of path.entries()) {
      const entry = items.find((item) => item && item !== 'separator' && item.text.startsWith(text))
      if (!entry) return 'нет пункта ' + text
      if (index === path.length - 1) { entry.action(); return 'ok' }
      items = entry.items
    }
  }, path)
}
async function dragTo(from, to, toPosition = 'center') {
  const a = await from.boundingBox(); const b = await to.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, { steps: 3 })
  const y = toPosition === 'below' ? b.y + b.height - 3 : toPosition === 'above' ? b.y + 3 : b.y + b.height / 2
  await page.mouse.move(b.x + b.width / 2, y, { steps: 8 }); await wait(100)
  await page.mouse.up(); await wait(500)
}
const titles = () => page.locator('main .song-row .block.truncate:not(.text-xs)').allInnerTexts()

await page.goto('http://localhost:1431/'); await wait(700)
const inputs = page.locator('input')
await inputs.nth(0).fill('http://127.0.0.1:4533'); await inputs.nth(1).fill('test'); await inputs.nth(2).fill('demo')
await page.locator('button[type=submit]').click()
await page.locator('nav button', { hasText: 'Альбомы' }).waitFor({ timeout: 15000 }); await wait(500)

// Альбом: выделение и меню
await page.locator('nav button', { hasText: 'Альбомы' }).click(); await wait(600)
await page.locator('main .group > button').first().click(); await wait(900)
check((await page.locator('main section p').first().innerText().catch(() => '')).includes('синусоиды'), 'описание альбома из getAlbumInfo2')
const rows = page.locator('main .song-row')
await rows.nth(0).click(); await rows.nth(2).click({ modifiers: ['Shift'] }); await wait(150)
check(await page.locator('main .song-row[aria-selected=true]').count() === 3, 'Shift выделяет диапазон')
check(await page.locator('main', { hasText: 'Выбрано: 3' }).count() === 1, 'счётчик выбранного')
await rows.nth(1).click({ modifiers: [mod] }); await wait(100)
check(await page.locator('main .song-row[aria-selected=true]').count() === 2, `${mod} снимает выделение строки`)
await rows.nth(1).dblclick(); await wait(1200)
check((await page.locator('footer .font-semibold').first().innerText()) === 'Тестовый трек 2', 'двойной клик играет трек')
await rows.nth(0).click({ button: 'right' }); await wait(200)
const menuTexts = await page.evaluate(() => window.__lastMenu.filter((x) => x && x !== 'separator').map((x) => x.text))
check(['Играть', 'Сыграть следующим', 'Добавить в плейлист', 'Микс по треку', 'Перейти к исполнителю', 'Оценка'].every((x) => menuTexts.some((m) => m.startsWith(x))), 'меню трека: ' + menuTexts.join(', '))

// Новый плейлист из меню
check(await menu('Добавить в плейлист', 'Новый плейлист') === 'ok', 'пункт «Новый плейлист…»')
await wait(200)
check(await page.locator('[role=dialog][aria-label="Новый плейлист"]').count() === 1, 'диалог названия')
await page.keyboard.type('Дорога'); await page.keyboard.press('Enter'); await wait(800)
check(await page.locator('nav button[title="Дорога"]').count() === 1, 'плейлист появился в боковой панели')

// Перетаскивание треков в плейлист боковой панели
await rows.nth(1).click(); await rows.nth(2).click({ modifiers: ['Shift'] })
await dragTo(rows.nth(1), page.locator('nav button[title="Дорога"]'))
check(await page.locator('text=Добавлено в «Дорога»').count() >= 1, 'перетаскивание в плейлист добавляет треки')

// Страница плейлиста: порядок, удаление, переименование
await page.locator('nav button[title="Дорога"]').click(); await wait(900)
const before = await titles()
check(before.length === 3, 'в плейлисте 3 трека: ' + before.join(', '))
await dragTo(page.locator('main .song-row').nth(0), page.locator('main .song-row').nth(2), 'below'); await wait(600)
const after = await titles()
check(after.join() === [before[1], before[2], before[0]].join(), `перестановка перетаскиванием: ${after.join(', ')}`)
await page.locator('main .song-row').nth(0).click(); await page.keyboard.press('Delete'); await wait(800)
check((await titles()).length === 2, 'Delete убирает трек из плейлиста')
await page.locator('main button[aria-label="Ещё"]').first().click(); await wait(200)
check(await menu('Переименовать') === 'ok', 'пункт «Переименовать…»'); await wait(200)
await page.keyboard.press(`${mod}+a`); await page.keyboard.type('Дорога домой'); await page.keyboard.press('Enter'); await wait(900)
check((await page.locator('main h1').innerText()) === 'Дорога домой', 'плейлист переименован')

// Оценка звёздами
await page.locator('main .song-row').nth(0).hover()
await page.locator('main .song-row').nth(0).locator('button[aria-label="Оценка 4"]').click(); await wait(300)
check(await page.locator('main .song-row').nth(0).locator('button.text-accent-text').count() === 4, 'оценка 4 звезды')

// Удаление плейлиста
await page.locator('main button[aria-label="Ещё"]').first().click(); await wait(200)
await menu('Удалить плейлист'); await wait(200)
check(await page.locator('[role=dialog] .btn-danger').count() === 1, 'подтверждение удаления')
await page.locator('[role=dialog] .btn-danger').click(); await wait(900)
check(await page.locator('nav button[title="Дорога домой"]').count() === 0, 'плейлист удалён')

// Жанры
await page.locator('nav button', { hasText: 'Жанры' }).click(); await wait(700)
await page.locator('main .genre-tile', { hasText: 'Ambient' }).click(); await wait(700)
check((await page.locator('main h1').innerText()) === 'Ambient' && (await page.locator('main .group').count()) >= 1, 'страница жанра с альбомами')

// Исполнитель
await page.locator('nav button', { hasText: 'Артисты' }).click(); await wait(600)
await page.locator('main ul button').first().click(); await wait(1000)
const artistText = await page.locator('main').innerText()
check(artistText.includes('Популярные треки') && artistText.includes('Похожие исполнители'), 'страница исполнителя: популярное и похожие')
check(artistText.includes('вымышленный') && !artistText.includes('Read more'), 'биография без ссылки Last.fm')

// Микс по треку
await page.locator('main .song-row').nth(0).click({ button: 'right' }); await wait(200)
await menu('Микс по треку'); await wait(1200)
check(await page.locator('footer').count() === 1, 'микс запускается')

// Очередь: перестановка
await page.locator('footer button[aria-label="Очередь"]').click(); await wait(400)
const q = page.locator('aside [data-drop-row]')
const qBefore = await q.locator('.text-sm').allInnerTexts()
if (qBefore.length >= 2) {
  await dragTo(q.nth(0), q.nth(1), 'below'); await wait(300)
  const qAfter = await q.locator('.text-sm').allInnerTexts()
  check(qAfter[0] === qBefore[1] && qAfter[1] === qBefore[0], `перестановка в очереди: ${qAfter.join(', ')}`)
} else check(false, 'в очереди меньше двух треков: ' + qBefore.join(', '))
await page.keyboard.press('Escape')

// Радио
await page.locator('nav button', { hasText: 'Радио' }).click(); await wait(700)
await page.locator('main button', { hasText: 'Тестовое радио' }).click(); await wait(2000)
check((await page.locator('footer .font-semibold').first().innerText()) === 'Тестовое радио', 'радиостанция в плеере')
check((await page.locator('footer button[aria-label="Пауза"]').count()) === 1, 'радио играет (поток без CORS)')
await page.screenshot({ path: `${S}/lib-${tag}-radio.png` })

check(errors.length === 0, 'ошибок в консоли нет: ' + errors.join(' || '))
console.log('\nИТОГ: провалов', failures.length)
await browser.close()
process.exit(failures.length ? 1 : 0)
