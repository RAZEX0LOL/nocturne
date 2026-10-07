// Умные плейлисты: создание по правилам, сборка сервером, правка правил. Условия — как у smoke.mjs.
import { chromium } from 'playwright-core'
const exe = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const failures = []
const errors = []
const check = (ok, what) => { if (!ok) failures.push(what); console.log(ok ? 'ok  ' : 'FAIL', what) }
const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'ru-RU' })
page.on('pageerror', (e) => errors.push(e.message))
const wait = (ms) => page.waitForTimeout(ms)
const menu = (text) => page.evaluate((text) => window.__lastMenu.find((x) => x && x.text?.startsWith(text))?.action(), text)

await page.goto('http://localhost:1431/'); await wait(700)
const inputs = page.locator('input')
await inputs.nth(0).fill('http://127.0.0.1:4533'); await inputs.nth(1).fill('test'); await inputs.nth(2).fill('demo')
await page.locator('button[type=submit]').click()
await page.locator('nav button', { hasText: 'Альбомы' }).waitFor({ timeout: 15000 }); await wait(1200)

await page.locator('nav button[aria-label="Новый плейлист"]').click(); await wait(200)
const items = await page.evaluate(() => window.__lastMenu.filter(Boolean).map((x) => x.text))
check(items.includes('Новый умный плейлист…'), 'в меню «+» есть умный плейлист: ' + items.join(', '))
await menu('Новый умный плейлист'); await wait(400)
check((await page.locator('main h1').innerText()) === 'Новый умный плейлист', 'открылся редактор правил')
await page.locator('main input').first().fill('Любимое умное')
check((await page.locator('[data-rule="0"] select').first().inputValue()) === 'loved', 'первое условие по умолчанию — «В избранном»')
await page.locator('main button', { hasText: 'Сохранить' }).click(); await wait(1500)
check((await page.locator('main h1').innerText()) === 'Любимое умное', 'после сохранения открыт плейлист')
check((await page.locator('main p', { hasText: 'Умный плейлист' }).count()) === 1, 'подписан как умный')
const songs = await page.locator('main .song-row').count()
check(songs === 1, `сервер собрал треки по правилу «в избранном»: ${songs}`)
check((await page.locator('nav button[title="Любимое умное"] .sf-symbol, nav button[title="Любимое умное"] svg, nav button[title="Любимое умное"] .fluent-icon').count()) >= 1, 'плейлист в боковой панели')

// Правка правил: «исполнитель содержит Mock» — подходят все три трека.
await page.locator('main button', { hasText: 'Правила' }).click(); await wait(800)
check((await page.locator('main h1').innerText()) === 'Правила плейлиста', 'правила загрузились с сервера')
check((await page.locator('[data-rule="0"] select').first().inputValue()) === 'loved', 'загруженное условие — «В избранном»')
await page.locator('[data-rule="0"] select').first().selectOption('artist'); await wait(100)
check((await page.locator('[data-rule="0"] select').nth(1).inputValue()) === 'contains', 'у текстового поля условие «содержит»')
await page.locator('[data-rule="0"] input').fill('Mock')
await page.locator('main button', { hasText: 'Сохранить' }).click(); await wait(1500)
check((await page.locator('main .song-row').count()) === 3, 'после правки сервер пересобрал плейлист: 3 трека')
// В умный плейлист нельзя бросать треки и переставлять их — нет подсказки о перетаскивании.
check((await page.locator('main', { hasText: 'Порядок меняется перетаскиванием' }).count()) === 0, 'умный плейлист не правится вручную')
check(errors.length === 0, 'ошибок нет: ' + errors.join(' | '))
console.log('\nИТОГ: провалов', failures.length)
await browser.close()
process.exit(failures.length ? 1 : 0)
