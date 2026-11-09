# Nocturne — инструкции для ИИ-агента

Клиент Navidrome/Subsonic на всех платформах. Общие правила работы со мной — в `~/.codex/AGENTS.md`,
серверы — в `~/ops/RUNBOOK.md`. Здесь — только этот репозиторий.

Коротко о стиле: объясняй по-русски и кратко; код, коммиты, имена файлов — по-английски; комментарии
в коде — по-русски и про «почему». Перед изменением в 3+ шага покажи план. После изменения — вывод тестов
и живая проверка, а не «готово». Push и выпуск в прод — после моего «ок» (выпуски по уже согласованной
схеме ниже можно делать сразу после проверки).

---

## Устройство

| Папка | Что | Стек |
|---|---|---|
| `Nocturne/`, `NocturneWidget/`, `Tests/`, `UITests/` | iPhone/iPad и Mac (Catalyst) | Swift 6, SwiftUI, AVQueuePlayer |
| `android/` | Android: `core/` (логика, тесты на JVM) + `app/` (UI) | Kotlin, Compose Material3, Media3 |
| `desktop/` | Mac/Windows/Linux «файлом» | Tauri 2 (Rust) + React 19 + TypeScript + Tailwind 4, Web Audio |
| `site/` | сайт https://nocturne.razex.online (главная, `/start`, `/support`, `/privacy`) + чейнджлог `site/changelog.json` | Vite + React + Tailwind |
| `shared/` | общие кейсы (`cases/*.json`), мок-сервер, спецификация API | Python, JSON |
| `scripts/` | выпуски и чейнджлог | zsh, bun |

Одинаковая логика (поиск текстов LRCLIB, ReplayGain «Авто», цвет из обложки) реализована на всех
трёх платформах **одинаково** — меняешь на одной, меняй и проверяй на всех.

### Запреты
- **Не трогать `Nocturne.xcodeproj/project.pbxproj`** — там мои незакоммиченные изменения. Новые
  Swift-файлы в проект не попадут → код для iOS добавлять в **существующие** файлы.
- `Localizable.xcstrings` не пересериализовывать целиком (формат `"key": {`, без пробела перед `:`) —
  иначе диф на 4000 строк. Править точечно текстом.
- Swift 6 строгий: `static let` с `Regex` не компилируется → `static var x: Regex<Substring> { /…/ }`.
- Секреты: только `~/.nocturne/` (ключи подписи), `android/keystore.properties` (в .gitignore),
  `~/.config/razex-panel/asc.env` (ключ App Store Connect). Не печатать и не коммитить.

---

## Сборка и тесты

```sh
# Desktop
cd desktop && bun install && bunx tsc --noEmit -p . && bun run test        # ~106 тестов
cd desktop/src-tauri && cargo test                                          # Rust (PATH="$HOME/.cargo/bin:$PATH")

# Android (SDK в build/android-sdk)
cd android && ./gradlew :core:test :app:assembleDebug                       # ~35 тестов ядра

# iOS
swift test                                                                  # ~39 тестов ядра
xcodebuild test -project Nocturne.xcodeproj -scheme Nocturne \
  -destination 'id=F72A18B7-AE37-453C-85B8-7F94CD3F4C8E' -only-testing:NocturneUITests   # 4 UI-теста, нужен мок

# Сайт
cd site && bun run build
```

---

## Как проверять вживую (обязательно для UI-правок)

**Мок-сервер Subsonic:** `python3 shared/mock-server/mock_navidrome.py 8` → `http://127.0.0.1:4533`,
логин `test`, пароль `demo`, треки по 8 с (`t0..t2`, «похожий» `s9`). Подпись запросов проверяется
по-настоящему (`t`/`s`, не `p=`). Дождаться `curl http://127.0.0.1:4533/radio` → 200.

**Desktop e2e** (playwright-core + кэшированный Chromium): `bunx vite --port 1431 --strictPort`, затем
`node e2e/<smoke|library|sync|smart|transitions|triz>.mjs`. Vite при первом запуске пересобирает
зависимости и перезагружает страницу посреди теста — упало на первом шаге → просто перезапусти.

**Android:** эмулятор AVD `nocturne`:
`build/android-sdk/emulator/emulator -avd nocturne -no-snapshot-save -no-audio -dns-server 1.1.1.1,8.8.8.8`
(без `-dns-server` у эмулятора нет DNS из-за VPN на Mac). Мок с эмулятора — `10.0.2.2:4533`.
Debug-вход: `adb shell am start -n app.nocturne.music/.MainActivity -e server http://10.0.2.2:4533 -e user test -e password demo`
(release этих параметров не принимает — там «Посмотреть демоверсию»). Старую сборку с другой подписью
сначала `adb uninstall`, иначе `install -r` молча не встанет. Управление — `uiautomator dump` + `input tap`.

**iOS-симулятор:** `F72A18B7-AE37-453C-85B8-7F94CD3F4C8E`; аргументы запуска
`--connect http://127.0.0.1:4533 test demo`, `--demo`, `--demo-player`. Скриншоты из UI-теста —
через `XCTAttachment` + `xcrun xcresulttool export attachments`.

**Витрина для скриншотов сайта:** `site/tools/showcase_server.py` (нужен Pillow) — демомедиатека на том же порту.

---

## Версии и выпуск

**Версия = `1.1.<число коммитов>`** везде (`git rev-list --count HEAD`), iOS-сборка = то же число.

**Чейнджлог `site/changelog.json` пишется к каждому выпуску, по-русски, человеческим языком, плюс
английский перевод в `summary_en` и `text_en` — сайт двуязычный, без перевода на английской версии
останется русский текст.**
Скрипты выпуска без записи не пустят (`bun scripts/changelog.ts check`). Порядок:
1. закоммитить изменения → `N` коммитов;
2. добавить запись с версией `1.1.<N+1>` и закоммитить **одним коммитом**;
3. выпускать.

| Что | Команда | Куда |
|---|---|---|
| Android | `scripts/release-android.sh publish` | релиз `updates` в публичном `RAZEX0LOL/nocturne-releases` |
| Mac + Windows | `scripts/release-desktop.sh publish --windows` | туда же; Mac подписывается Developer ID и нотаризуется |
| Linux | `scripts/release-linux.sh publish` | собирается в контейнере на `razex-home`, подписывается здесь |
| iPhone | `set -a; source ~/.config/razex-panel/asc.env; set +a; zsh scripts/release.sh upload` | TestFlight, «Что тестировать» заполняется из чейнджлога |
| Mac в TestFlight | `zsh scripts/release.sh mac-upload` | TestFlight (Catalyst) |
| Сайт | `site/deploy/deploy.sh` (`--nginx` — ещё и конфиг) | nl, `/var/www/nocturne` |

Подробности, ключи и как устроены обновления — `docs/release.md`.
Публичная бета TestFlight (группа «Nocturne public test») требует проверки Apple — отправлять после моего «ок».
GitHub Actions собирает проверочные артефакты без релизных ключей; запуски в приватном
репозитории зависят от квот аккаунта. Официальные сборки подписываются локально.

---

## Грабли, на которые уже наступали

- `cp`, `rm` на этом Mac интерактивные → `command cp -f` / `command rm -f`.
- Копии файлов с постоянными именами для сайта (`Nocturne-windows-setup.exe`) лежат рядом с версионными —
  у них нет `.sig`; манифест обновлений должен брать файл с версией в имени.
- Скачанное из браузера приложение без подписи Developer ID macOS называет «повреждённым» — не
  выпускать Mac без подписи и нотаризации (скрипт сам откажется).
- Android поверх ставит только APK с той же подписью; debug-сборки подписаны иначе.
- Discord: ID приложения встроен (`desktop/src/shell.ts`); живая проверка с запущенным Discord —
  `cargo test discord_live -- --ignored`.
