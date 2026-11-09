# Выпуск

Секреты в репозитории не лежат. Всё, что нужно для подписи, живёт в `~/.nocturne` с правами 600
и попадает в сборку через переменные окружения.

| Что | Где |
|---|---|
| Ключ подписи Android | `~/.nocturne/nocturne-release.jks`, пароли — в `android/keystore.properties` |
| Ключ подписи обновлений (desktop) | `~/.nocturne/nocturne-updater.key`, пароль — в `~/.nocturne/updater.env` |
| Подпись macOS | сертификат «Developer ID Application» в связке ключей (скрипт находит его сам) |
| App Store Connect (TestFlight, нотаризация) | `~/.config/razex-panel/asc.env`: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` |

Потеря ключа Android означает, что обновить установленное приложение уже нельзя — его придётся
ставить заново. Потеря ключа обновлений означает то же самое для настольной версии. Обе копии
стоит держать в менеджере паролей.

GitHub Actions собирает проверочные артефакты без ключей официальной подписи.
Доступность запусков в приватном репозитории зависит от квот аккаунта.
Официальные релизы собираются и подписываются локально. Проверочные установщики
в Actions сохраняются по ручному `workflow_dispatch` на 7 дней; обычный push / PR
проверяет сборку без накопления установщиков.

## Версия и чейнджлог

Версия — `1.1.<число коммитов>` (`git rev-list --count HEAD`); номер сборки iOS — то же число.

К каждой версии пишется запись в `site/changelog.json` — по-русски, для людей: что появилось
(`new`), что стало лучше (`better`), что исправлено (`fix`), для каких платформ. Без записи скрипты
выпуска остановятся (`bun scripts/changelog.ts check <версия> <платформа>`). Запись — отдельный
коммит, поэтому её версия = текущее число коммитов + 1.

Из чейнджлога `scripts/changelog.ts` делает:
- заметки в манифестах обновлений → их показывает плашка «Доступно обновление» (Android, desktop);
- описание релиза на GitHub → его читает сайт, раздел «Что нового» (без пересборки сайта);
- «Что тестировать» в TestFlight.

## iPhone, iPad и Mac (App Store / TestFlight)

```
set -a; source ~/.config/razex-panel/asc.env; set +a
zsh scripts/release.sh upload      # iOS и iPadOS в TestFlight (+ «Что тестировать» из чейнджлога)
zsh scripts/release.sh mac-upload  # Mac Catalyst туда же, в ту же запись
```

Внутренняя группа «Noсturne test» получает все сборки сразу. Публичная «Nocturne public test»
`https://testflight.apple.com/join/PHtXMJ1u` — только после проверки Apple: добавить сборку в группу и отправить
`betaAppReviewSubmissions` через API App Store Connect.

### Полный доступ для App Review

После повторного отказа 2.1(a) для проверки используется обычный вход на отдельный Navidrome:
`https://nocturne.razex.online/review-server`. Встроенная демомедиатека не заменяет этот доступ:
в ней нет серверных операций с избранным, плейлистами и загрузками.

- VPS `nl`, `/opt/nocturne-review/compose.yml`, контейнер `nocturne-review`; собственные data/music,
  порт только `127.0.0.1:4534`. Личная медиатека не подключается.
- Конфигурация: `deploy/review-server/compose.yml`; HTTPS-прокси — `site/deploy/nginx.conf`.
  При выкладке сайта сохранять блок `/review-server/` и сертификаты.
- Учётные данные: `~/.nocturne/review-server.env` (`600`). `REVIEW_USERNAME`/`REVIEW_PASSWORD` —
  обычный пользователь; отдельный администратор — только для обслуживания. Значения не печатать.
- Логин/пароль ревьюера заносятся в **App Review Information** для обеих платформ и в сведения
  **TestFlight App Review**; `demoAccountRequired=true`. В Notes — адрес и шаги обычного входа,
  без пароля. Сервер и учётку держать доступными весь срок проверки.
- Медиатека: `python3 scripts/generate-review-library.py build/review-music`, затем rsync на VPS.
  6 альбомов / 30 треков из пяти оригинальных встроенных фонограмм, без чужих записей.
- Проверка снаружи: `python3 scripts/check-review-server.py`. Проверяет авторизацию, каталог,
  поиск, избранное, временный плейлист с удалением, все потоки, Range и скачивание.
  Использует User-Agent приложения: Cloudflare Browser Integrity Check отклоняет Python-агент.
- UI-регрессия: `testAppReviewServerLoginAndPlayback` проходит форму в Release, без `--connect`.
  `REVIEW_SERVER_URL`, `REVIEW_USERNAME`, `REVIEW_PASSWORD` передаются в окружение тестового
  runner через защищённый `.xctestrun` в `~/.nocturne/`, не в репозиторий и не в аргументы команды.
  Если DNS симулятора возвращает CFNetwork `-1003`, для UI-проверки используется SSH-туннель
  `14534 → nl:127.0.0.1:4534` и локальный адрес `http://127.0.0.1:14534/review-server` только
  в окружении runner. Публичный HTTPS проверяется отдельно; это ограничение нужно указывать
  в отчёте. DNS/proxy всего Mac ради теста не менять.
  На iPadOS 27 при холодном старте XCTest завершался в `handleStalledWait` ещё до тестов.
  После отдельной установки целевого `Nocturne.app` через `simctl install` и проверки его
  запуска повторный прогон завершился успешно. Не путать падение runner с ошибкой приложения.

Отказ 2026-10-29 относится к 1.1.81 (81), iPad Air 11-inch M3 / iPadOS 27.0.1.
Наличие аудио в архиве и движение таймера сами по себе не доказывают слышимый звук на устройстве.
Не объявлять проблему демоплеера исправленной без воспроизведения причины и повторной проверки.

## Android

```
scripts/release-android.sh          # build/android-release/Nocturne-1.1.N.apk + android.json
scripts/release-android.sh publish  # и выложить: установленные приложения предложат обновиться
```

Скрипт проверяет подпись (`apksigner verify`), считает SHA-256 и пишет `android.json`
(`versionCode`, `url`, `sha256`, `notes`). Приложение скачивает APK, сверяет сумму и подпись и
ставит поверх через системный установщик.

## Linux

```
scripts/release-linux.sh          # AppImage и .deb в build/linux-release
scripts/release-linux.sh publish  # и выложить
```

Tauri для Linux нужен сам Linux, поэтому исходники уезжают на домашний сервер (`razex-home`) и
собираются там в контейнере `razex-builder` — том же, которым пользуется razex-panel. Сборка идёт
без подписи; AppImage подписывает уже Mac, когда файл вернулся, так что ключ обновлений никуда не
уходит. Контейнеру нужны явные `--dns`: на домашнем сервере `resolv.conf` указывает на локальный
stub, которого внутри контейнера нет.

## Mac, Windows (файлом)

```
scripts/release-desktop.sh                     # Mac: .dmg + архив обновления
scripts/release-desktop.sh publish --windows   # + Windows (NSIS через cargo-xwin) и выкладка
```

- Mac подписывается Developer ID и нотаризуется: приложение — Tauri, образ .dmg — скрипт
  (`notarytool` + `stapler`), затем проверка `spctl`. Без сертификата или ключа ASC скрипт откажется:
  неподписанное приложение macOS называет «повреждённым».
- Windows не подписан (сертификат платный) — SmartScreen предупреждает при первом запуске.
- Linux собирается только в CI, который сейчас не работает.

## Где лежат обновления

Публичный репозиторий `RAZEX0LOL/nocturne-releases`, релиз с тегом `updates` (файлы перезаписываются):

- `darwin-aarch64.json`, `windows-x86_64.json` — манифесты обновлений Tauri, у каждой системы свой
  (адрес в `desktop/src-tauri/tauri.conf.json`: `…/updates/{{target}}-{{arch}}.json`). Общий
  `latest.json` с одной версией на всех ломался: система, чья запись ещё указывала на старый файл,
  обновлялась по кругу.
- `android.json` — манифест Android.
- версионные файлы (`Nocturne_1.1.N_…`) — их скачивают обновлялки;
- копии с постоянными именами (`Nocturne-mac.dmg`, `Nocturne-windows-setup.exe`, `Nocturne-android.apk`) —
  на них ведут кнопки сайта. Подписей у копий нет — манифест берёт только файл с версией в имени.

## Сайт

`site/deploy/deploy.sh` — сборка и rsync на nl (`/var/www/nocturne`), `--nginx` — ещё и конфиг nginx.
Конфиг в репозитории содержит строки certbot — не выкладывать старую версию поверх.
