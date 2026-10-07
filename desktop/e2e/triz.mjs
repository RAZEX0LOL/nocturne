// Всё из ТРИЗ-раунда: темы и кастомизация вида, палитра ⌘K, скорость, «Поделиться», история очереди,
// пресеты эквалайзера, бесконечное воспроизведение, затухание. Mock с короткими треками:
//   python3 ../shared/mock-server/mock_navidrome.py 8
import { chromium } from 'playwright-core'
const exe = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const failures = []
const errors = []
const check = (ok, what) => { if (!ok) failures.push(what); console.log(ok ? 'ok  ' : 'FAIL', what) }
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ru-RU', permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(e.message))
const wait = (ms) => page.waitForTimeout(ms)
const html = (expression) => page.evaluate(expression)
const menu = (text) => page.evaluate((text) => window.__lastMenu.find((x) => x && x.text?.startsWith(text))?.action(), text)
const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.settings') ?? '{}'))

await page.goto('http://localhost:1431/'); await wait(700)
const inputs = page.locator('input')
await inputs.nth(0).fill('http://127.0.0.1:4533'); await inputs.nth(1).fill('test'); await inputs.nth(2).fill('demo')
await page.locator('button[type=submit]').click()
await page.locator('nav button', { hasText: 'Альбомы' }).waitFor({ timeout: 15000 }); await wait(800)

// Оформление
await page.locator('nav button', { hasText: 'Настройки' }).click(); await wait(300)
await page.locator('.theme-tile', { hasText: 'Светлая' }).click(); await wait(150)
check(await html(() => document.documentElement.dataset.theme) === 'light', 'светлая тема')
check(await html(() => getComputedStyle(document.body).backgroundColor) !== 'rgb(11, 11, 16)', 'фон окна посветлел')
await page.locator('.theme-tile', { hasText: 'OLED' }).click(); await wait(150)
check(await html(() => getComputedStyle(document.body).backgroundColor) === 'rgb(0, 0, 0)', 'OLED-чёрная — настоящий #000')
await page.locator('.theme-tile', { hasText: 'Тёмная' }).click(); await wait(150)
await page.locator('.segment', { hasText: 'Свой' }).click(); await wait(100)
await page.locator('.swatch[title="#4ade80"]').click(); await wait(100)
check(await html(() => document.documentElement.style.getPropertyValue('--accent')) === '#4ade80', 'свой цвет акцента')
await page.locator('.segment', { hasText: '110%' }).click(); await wait(100)
check(await html(() => document.documentElement.style.zoom) === '1.1', 'масштаб 110%')
await page.locator('.segment', { hasText: '100%' }).click()
await page.locator('.segment', { hasText: 'Компактная' }).click(); await wait(100)
check(await html(() => document.documentElement.classList.contains('compact')), 'компактная плотность')
await page.locator('input[aria-label="Размер обложек"]').focus(); await page.keyboard.press('End'); await wait(100)
check(await html(() => document.documentElement.style.getPropertyValue('--card')) === '256px', 'размер обложек 256')
await page.locator('.segment', { hasText: 'Однотонный' }).click()
await page.locator('.segment', { hasText: 'Волна' }).click(); await wait(100)
const s1 = await settings()
check(s1.playerBackground === 'solid' && s1.visualizerStyle === 'wave', 'фон плеера и стиль визуализатора сохранены')
await page.locator('[data-shelf="random"] input.toggle').click()
await page.locator('[data-shelf="starred"] button[aria-label="Выше"]').click(); await wait(100)
check(JSON.stringify((await settings()).homeShelves) === JSON.stringify(['played', 'starred', 'recent', 'frequent']), 'полки главной: порядок и видимость ' + JSON.stringify((await settings()).homeShelves))
await page.locator('label', { hasText: 'Радио' }).locator('input.toggle').click(); await wait(100)
check(await page.locator('nav button', { hasText: 'Радио' }).count() === 0, 'раздел «Радио» скрыт из меню')
await page.locator('nav button', { hasText: 'Главная' }).click(); await wait(800)
const shelves = await page.locator('main h2').allInnerTexts()
check(!shelves.includes('Случайные альбомы') && shelves.indexOf('Любимые треки') < shelves.indexOf('Недавно добавленные'), 'главная следует настройкам: ' + shelves.join(' | '))

// Звук: ReplayGain «Авто», пресеты эквалайзера
await page.locator('nav button', { hasText: 'Настройки' }).click(); await wait(200)
await page.locator('.settings-tab', { hasText: 'Звук' }).click(); await wait(200)
await page.locator('main select').nth(1).selectOption('auto')
check((await settings()).replayGain === 'auto', 'ReplayGain «Авто»')
await page.locator('main button', { hasText: 'Сохранить как пресет' }).click(); await wait(150)
await page.keyboard.type('Мои наушники'); await page.keyboard.press('Enter'); await wait(200)
check(await page.locator('[data-eq-preset="Мои наушники"]').count() === 1, 'свой пресет эквалайзера сохранён')
await page.locator('[data-eq-preset="Мои наушники"] button[aria-label^="Удалить"]').click(); await wait(100)
check(await page.locator('[data-eq-preset="Мои наушники"]').count() === 0, 'пресет удаляется')

// Командная палитра
await page.keyboard.press('Meta+k'); await wait(200)
check(await page.locator('[role=dialog][aria-label="Командная палитра"]').count() === 1, '⌘K открывает палитру')
await page.keyboard.type('тем свет'); await wait(100); await page.keyboard.press('Enter'); await wait(150)
check(await html(() => document.documentElement.dataset.theme) === 'light', 'палитра: «Тема: светлая» выполнена')
await page.keyboard.press('Meta+k'); await wait(150)
await page.keyboard.type('Mock Album'); await wait(700)
const options = await page.locator('[role=option]').allInnerTexts()
check(options.some((x) => x.includes('Mock Album')), 'палитра ищет по медиатеке: ' + options.map((x) => x.split('\n')[0]).join(', '))
const index = options.findIndex((x) => x.includes('Mock Album'))
for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter'); await wait(800)
check((await page.locator('main h1').innerText()) === 'Mock Album', 'Enter открывает найденный альбом')

// Скорость, «Поделиться», история
await page.locator('main .song-row').nth(0).dblclick(); await wait(1200)
await page.locator('footer button[aria-label^="Скорость"]').click(); await wait(100)
await menu('1,5×'); await wait(200)
check((await page.locator('footer button[aria-label^="Скорость"]').innerText()) === '1,5×', 'скорость 1,5× на кнопке')
check(await html(() => window.__engine.decks[window.__engine.active].element.playbackRate) === 1.5, 'звук играет на 1,5×')
await page.locator('footer button[aria-label^="Скорость"]').click(); await menu('1×'); await wait(100)
await page.locator('main .song-row').nth(1).click({ button: 'right' }); await wait(100)
await menu('Поделиться ссылкой'); await wait(500)
check((await page.evaluate(() => navigator.clipboard.readText())).includes('/share/t1'), 'ссылка в буфере обмена')
await page.locator('footer button[aria-label="Следующий трек"]').click(); await wait(800)
await page.locator('footer button[aria-label="Очередь"]').click(); await wait(300)
check((await page.locator('aside').innerText()).includes('Ранее') && (await page.locator('aside').innerText()).includes('Тестовый трек 1'), 'в очереди видно «Ранее»')
await page.keyboard.press('Escape')

// Бесконечное воспроизведение: после последнего трека альбома — похожий не из альбома
await page.locator('main .song-row').nth(2).dblclick(); await wait(1000)
await html(() => { const e = window.__engine.decks[window.__engine.active].element; e.currentTime = e.duration - 1 })
await page.waitForFunction(() => document.querySelector('footer .font-semibold')?.textContent === 'Похожий трек', null, { timeout: 12000 }).catch(() => {})
check((await page.locator('footer .font-semibold').first().innerText()) === 'Похожий трек', 'очередь кончилась — заиграла похожая музыка')

// Затухание (таймер сна использует то же): звук гаснет и встаёт на паузу, громкость возвращается
await html(() => window.__engine.fadeOutAndPause(1)); await wait(1600)
check(await html(() => window.__engine.decks[window.__engine.active].element.paused), 'после затухания — пауза')
check(await html(() => Math.abs(window.__engine.decks[window.__engine.active].level.gain.value - window.__engine.decks[window.__engine.active].trackVolume) < 0.01), 'громкость трека вернулась для следующего «играть»')

check(errors.length === 0, 'ошибок нет: ' + errors.join(' | '))
console.log('\nИТОГ: провалов', failures.length)
await browser.close()
process.exit(failures.length ? 1 : 0)
