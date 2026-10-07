// Переходы между треками на живом звуке: кроссфейд 3 с и стык без паузы. Нужен mock-сервер
// с короткими треками: python3 ../shared/mock-server/mock_navidrome.py 8
import { chromium } from 'playwright-core'
const exe = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const failures = []
const check = (ok, what) => { if (!ok) failures.push(what); console.log(ok ? 'ok  ' : 'FAIL', what) }
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' })
const wait = (ms) => page.waitForTimeout(ms)
const title = () => page.locator('footer .font-semibold').first().innerText()

await page.goto('http://localhost:1431/'); await wait(700)
const inputs = page.locator('input')
await inputs.nth(0).fill('http://127.0.0.1:4533'); await inputs.nth(1).fill('test'); await inputs.nth(2).fill('demo')
await page.locator('button[type=submit]').click()
await page.locator('nav button', { hasText: 'Альбомы' }).waitFor({ timeout: 15000 }); await wait(500)

async function setFade(seconds) {
  await page.locator('nav button', { hasText: 'Настройки' }).click(); await wait(300)
  await page.locator('.settings-tab', { hasText: 'Звук' }).click(); await wait(200)
  const slider = page.locator('input[aria-label="Плавные переходы, сек"]')
  await slider.focus(); await page.keyboard.press('Home')
  for (let index = 0; index < seconds; index++) await page.keyboard.press('ArrowRight')
  check((await slider.inputValue()) === String(seconds), `кроссфейд ${seconds} с в настройках`)
}

await setFade(3)
await page.locator('nav button', { hasText: 'Альбомы' }).click(); await wait(500)
await page.locator('main .group > button').first().click(); await wait(800)
const started = Date.now()
await page.locator('main .song-row').first().dblclick()
await page.waitForFunction(() => (window.__transitions ?? []).length >= 1, null, { timeout: 15000 })
const switchedAfter = (Date.now() - started) / 1000
const first = await page.evaluate(() => window.__transitions[0])
// Трек 8 с, поэтому кроссфейд ограничен третью трека — 2,67 с, а не 3 с из настроек.
check(Math.abs(first.overlap - 8 / 3) < 0.15, `кроссфейд длится ${first.overlap.toFixed(2)} с (не больше трети трека)`)
check(Math.abs(first.outgoingLeft - 8 / 3) < 0.15, `начался за ${first.outgoingLeft.toFixed(2)} с до конца трека`)
check(switchedAfter > 4 && switchedAfter < 7, `переход на ~5-й секунде восьмисекундного трека (${switchedAfter.toFixed(1)} с)`)
await wait(300)
check((await title()) === 'Тестовый трек 2', 'очередь перешла на трек 2 вместе со звуком')

// Встык: кроссфейд выключен, следующий переход — ровно в конце трека.
await setFade(0)
await page.waitForFunction(() => (window.__transitions ?? []).length >= 2, null, { timeout: 15000 })
const second = await page.evaluate(() => window.__transitions[1])
check(second.overlap === 0.03, `стык без паузы — микрокроссфейд ${second.overlap * 1000} мс`)
check(second.outgoingLeft < 0.09 && second.outgoingLeft > -0.02, `следующий трек стартовал за ${(second.outgoingLeft * 1000).toFixed(0)} мс до конца`)
await wait(300)
check((await title()) === 'Тестовый трек 3', 'играет трек 3')
const position = await page.locator('footer span.tabular-nums').first().innerText()
check(position === '0:00' || position === '0:01', 'новый трек с начала: ' + position)
console.log('\nИТОГ: провалов', failures.length)
await browser.close()
process.exit(failures.length ? 1 : 0)
