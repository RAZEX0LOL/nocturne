import { chromium } from 'playwright-core'
// Сквозная проверка интерфейса как пользователь: разделы, плеер, повтор, очередь, текст,
// полноэкранный плеер, поиск, «назад», настройки и перевод. Нужны запущенные mock-сервер и vite:
//   python3 ../shared/mock-server/mock_navidrome.py 600 & bunx vite --port 1431 &
//   CHROME=<путь к Chromium> bun e2e/smoke.mjs mac|win
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
const page = await browser.newPage({ userAgent: ua, viewport: { width: 1280, height: 800 }, locale: 'ru-RU' })
page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text().slice(0, 200)) })
const wait = (ms) => page.waitForTimeout(ms)
const pressed = (loc) => loc.getAttribute('aria-pressed')

await page.goto('http://localhost:1431/'); await wait(700)
const inputs = page.locator('input')
await inputs.nth(0).fill('http://127.0.0.1:4533'); await inputs.nth(1).fill('test'); await inputs.nth(2).fill('demo')
await page.locator('button[type=submit]').click()
await page.locator('nav button', { hasText: 'Альбомы' }).waitFor({ timeout: 15000 }); await wait(500)
check(await page.locator('nav button', { hasText: 'Альбомы' }).count() === 1, 'вход в mock-сервер')

for (const name of ['Поиск', 'На компьютере', 'Загрузки', 'Альбомы', 'Артисты', 'Плейлисты', 'Избранное', 'Главная']) {
  await page.locator('nav button', { hasText: name }).click(); await wait(500)
  const current = await page.locator('nav button[aria-current=page]').innerText()
  check(current.includes(name), `раздел «${name}» открывается и подсвечен`)
}
// альбом и воспроизведение
await page.locator('nav button', { hasText: 'Альбомы' }).click(); await wait(600)
await page.locator('main .group > button').first().click(); await wait(800)
check(await page.locator('main h1').innerText() === 'Mock Album', 'страница альбома')
await page.locator('main .song-row').first().dblclick(); await wait(1500)
check(await page.locator('footer').count() === 1, 'нижний плеер появился')
const playBtn = page.locator('footer button[aria-label="Пауза"], footer button[aria-label="Воспроизвести"]').first()
check((await playBtn.getAttribute('aria-label')) === 'Пауза', 'трек играет')
const pos1 = await page.locator('footer span.tabular-nums').first().innerText(); await wait(1500)
const pos2 = await page.locator('footer span.tabular-nums').first().innerText()
check(pos1 !== pos2, `время идёт (${pos1} → ${pos2})`)
await page.keyboard.press('Space'); await wait(400)
check((await playBtn.getAttribute('aria-label')) === 'Воспроизвести', 'пробел ставит паузу')
await page.keyboard.press('Space'); await wait(400)
// повтор
const repeat = page.locator('footer button[aria-label="Режим повтора"]')
const titles = []
for (let i = 0; i < 3; i++) { titles.push(await repeat.getAttribute('title') + '/' + await pressed(repeat)); await repeat.click(); await wait(150) }
check(titles.join(',') === 'Повтор: откл./false,Повтор: все/true,Повтор: один трек/true', 'повтор: ' + titles.join(', '))
const bg = async (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
const offBg = await bg(repeat); await repeat.click(); await wait(150); const onBg = await bg(repeat)
check(offBg !== onBg, `включённый повтор отличается фоном (${offBg} vs ${onBg})`)
await repeat.click(); await repeat.click(); await wait(100)
// перемешивание
const shuffle = page.locator('footer button[aria-label="Перемешивать"]')
await shuffle.click(); await wait(150); check(await pressed(shuffle) === 'true', 'перемешивание включается')
await shuffle.click(); await wait(150); check(await pressed(shuffle) === 'false', 'перемешивание выключается')
// следующий/предыдущий
const title0 = await page.locator('footer .font-semibold').first().innerText()
await page.locator('footer button[aria-label="Следующий трек"]').click(); await wait(800)
const title1 = await page.locator('footer .font-semibold').first().innerText()
check(title0 !== title1, `следующий трек (${title0} → ${title1})`)
await page.locator('footer button[aria-label="Предыдущий трек"]').click(); await wait(800)
check((await page.locator('footer .font-semibold').first().innerText()) === title0, 'предыдущий трек')
// панели очереди и текста
await page.locator('footer button[aria-label="Очередь"]').click(); await wait(300)
check(await page.locator('aside h2', { hasText: 'Очередь' }).count() === 1, 'панель очереди')
const before = await page.locator('aside .list-row').count()
await page.locator('aside .list-row').first().hover(); await page.locator('aside button[aria-label="Убрать из очереди"]').first().click(); await wait(200)
check(await page.locator('aside .list-row').count() === before - 1, 'трек убирается из очереди')
await page.locator('footer button[aria-label="Текст песни"]').click(); await wait(800)
check(await page.locator('aside p[data-line]').count() > 0, 'панель текста показывает строки')
await page.keyboard.press('Escape'); await wait(200)
check(await page.locator('aside').count() === 0, 'Esc закрывает панель')
// полноэкранный
await page.locator('footer button[aria-label="Сейчас играет"]').first().click(); await wait(900)
check(await page.locator('[role=dialog]').count() === 1, 'полноэкранный плеер открывается')
const tab = (n) => page.locator('[role=tab]', { hasText: n })
await tab('Очередь').click(); await wait(300)
check(await tab('Очередь').getAttribute('aria-selected') === 'true', 'вкладка «Очередь»')
await tab('Текст').click(); await wait(500)
check(await tab('Текст').getAttribute('aria-selected') === 'true' && await page.locator('[role=dialog] p[data-line]').count() > 0, 'обратно на вкладку «Текст»')
const bigRepeat = page.locator('[role=dialog] button[aria-label="Режим повтора"]')
const b1 = await bg(bigRepeat); await bigRepeat.click(); await wait(150); const b2 = await bg(bigRepeat)
check(b1 !== b2, 'повтор на полном экране заметно включается')
await bigRepeat.click(); await bigRepeat.click()
await page.screenshot({ path: `${S}/e2e-${tag}-np.png` })
await page.keyboard.press('Escape'); await wait(300)
check(await page.locator('[role=dialog]').count() === 0, 'Esc закрывает полноэкранный плеер')
// громкость
const mute = page.locator('footer button[aria-label="Выключить звук"]')
await mute.click(); await wait(150)
check(await page.locator('footer button[aria-label="Включить звук"]').count() === 1, 'звук выключается')
await page.locator('footer button[aria-label="Включить звук"]').click(); await wait(150)
check(await page.locator('footer button[aria-label="Выключить звук"]').count() === 1, 'звук включается обратно')
// поиск
await page.keyboard.press('Control+f'); await wait(300)
await page.locator('main input').fill('трек'); await wait(900)
check(await page.locator('main ol li').count() >= 1, 'поиск находит треки')
await page.locator('main input').fill('zzzz'); await wait(900)
check(await page.locator('main p', { hasText: 'ничего не нашлось' }).count() === 1, 'поиск без результатов')
// назад
await page.locator('nav button', { hasText: 'Артисты' }).click(); await wait(500)
await page.locator('main ul button').first().click(); await wait(600)
await page.mouse.click(700, 400, { button: 'left' })
await page.keyboard.press('Backspace'); await wait(400)
check((await page.locator('main h1').innerText()) === 'Артисты', 'Backspace возвращает назад')
// избранное: снять и поставить лайк
await page.locator('nav button', { hasText: 'Избранное' }).click(); await wait(600)
const favCount = await page.locator('main ol li').count()
check(favCount > 0, `избранное не пустое (${favCount})`)
// настройки
await page.locator('nav button', { hasText: 'Настройки' }).click(); await wait(400)
check(await page.locator('main h1', { hasText: 'Настройки' }).count() === 1, 'страница настроек')
await page.locator('input.toggle[aria-label="Эквалайзер"]').click(); await wait(100)
check(await page.locator('input.toggle[aria-label="Эквалайзер"]').isChecked(), 'эквалайзер включается')
await page.locator('input.toggle[aria-label="Эквалайзер"]').click()
const selects = page.locator('main select')
await selects.nth(2).selectOption('cover'); await wait(200)
await selects.nth(3).selectOption('en'); await wait(400)
const visibleText = (selector) => page.evaluate((selector) => { const copy = document.querySelector(selector).cloneNode(true); copy.querySelectorAll('[data-user-content]').forEach((node) => node.remove()); document.body.appendChild(copy); const text = copy.innerText; copy.remove(); return text }, selector)
const navText = await visibleText('nav')
check(!/[а-яА-Я]/.test(navText), 'английский язык в меню: ' + navText.replace(/\n/g, ' | '))
const bodyText = await visibleText('body')
const ru = bodyText.split('\n').filter((l) => /[а-яА-Я]/.test(l) && !/Русский|Строка|Тестовый трек|Mock/.test(l))
check(ru.length === 0, 'нет непереведённых строк на странице настроек: ' + ru.join(' | '))
await page.locator('nav button', { hasText: 'Home' }).click(); await wait(800)
const homeRu = (await visibleText('body')).split('\n').filter((l) => /[а-яА-Я]/.test(l) && !/Строка|Тестовый трек|Mock/.test(l))
check(homeRu.length === 0, 'нет непереведённых строк на главной: ' + homeRu.join(' | '))
await page.locator('nav button', { hasText: 'Settings' }).click(); await wait(300)
await page.locator('main select').nth(3).selectOption('ru'); await wait(200)
check(errors.length === 0, 'ошибок в консоли нет: ' + errors.join(' || '))
console.log('\nИТОГ: провалов', failures.length)
await browser.close()
process.exit(failures.length ? 1 : 0)
