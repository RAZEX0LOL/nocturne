// Сквозная проверка синхронизации очереди: «телефон» сохраняет очередь на сервере, компьютер
// предлагает продолжить с того же трека и места. Условия те же, что у smoke.mjs.
import { createHash, randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
const exe = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const failures = []
const check = (ok, what) => { if (!ok) failures.push(what); console.log(ok ? 'ok  ' : 'FAIL', what) }
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' })
const wait = (ms) => page.waitForTimeout(ms)

await page.goto('http://localhost:1431/'); await wait(700)
const inputs = page.locator('input')
await inputs.nth(0).fill('http://127.0.0.1:4533'); await inputs.nth(1).fill('test'); await inputs.nth(2).fill('demo')
await page.locator('button[type=submit]').click()
await page.locator('nav button', { hasText: 'Альбомы' }).waitFor({ timeout: 15000 }); await wait(800)

// Компьютер играет трек 1 и сохраняет очередь на сервер при паузе.
await page.locator('nav button', { hasText: 'Альбомы' }).click(); await wait(500)
await page.locator('main .group > button').first().click(); await wait(800)
await page.locator('main .song-row').first().dblclick(); await wait(2500)
await page.keyboard.press('Space'); await wait(1500)
const saved = await (await fetch(sign('getPlayQueue', 'Nocturne'))).json()
check(saved['subsonic-response'].playQueue?.changedBy === 'NocturneDesktop', 'компьютер сохранил очередь на сервер при паузе')

// «Телефон» сохраняет свою очередь: трек 3, позиция 1:05.
function sign(endpoint, client, extra = '') {
  const salt = randomUUID(); const token = createHash('md5').update('demo' + salt).digest('hex')
  return `http://127.0.0.1:4533/rest/${endpoint}.view?u=test&t=${token}&s=${salt}&v=1.16.1&c=${client}&f=json${extra}`
}
await new Promise((resolve) => setTimeout(resolve, 2500))
await fetch(sign('savePlayQueue', 'Nocturne', '&id=t0&id=t1&id=t2&current=t2&position=65000'))
// Окно снова стало видимым — повод спросить сервер.
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await wait(16000)
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await wait(1200)
const banner = page.locator('[role=status]', { hasText: 'Играло на телефоне' })
check(await banner.count() === 1, 'предложение продолжить: «Играло на телефоне»')
check((await banner.innerText()).includes('Тестовый трек 3') && (await banner.innerText()).includes('1:05'), 'в предложении трек и место: ' + (await banner.innerText()).replace(/\n/g, ' '))
await banner.locator('button', { hasText: 'Продолжить' }).click(); await wait(2000)
check((await page.locator('footer .font-semibold').first().innerText()) === 'Тестовый трек 3', 'играет трек с телефона')
const at = await page.locator('footer span.tabular-nums').first().innerText()
check(at >= '1:05' && at < '1:15', 'с того же места: ' + at)
check(await banner.count() === 0, 'предложение исчезло')
console.log('\nИТОГ: провалов', failures.length)
await browser.close()
process.exit(failures.length ? 1 : 0)
