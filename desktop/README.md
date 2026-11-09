# Nocturne для Windows, Linux и macOS

Tauri 2: интерфейс на React и TypeScript, звук через `<audio>` и Web Audio, работа с файлами,
загрузки и хранение пароля — на стороне Rust.

## Запуск

```sh
bun install --frozen-lockfile
bun run tauri dev      # окно с горячей перезагрузкой
bun run tauri build    # установщик для текущей системы
```

Нужны Bun и Rust (`rustup`). На Linux ещё WebKitGTK:
`sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
Windows собирается с Mac через cargo-xwin и NSIS. Linux требует Linux-окружения.
CI описан в [desktop.yml](../.github/workflows/desktop.yml) и собирает проверочные установщики
без релизных ключей. Официальный подписанный выпуск выполняется отдельно
(см. [выпуск](../docs/release.md)).

## Проверки

```sh
bun test                 # общий контракт из shared/cases
bun run typecheck
cd src-tauri && cargo test
```

## Браузер для e2e

В папке `desktop` установи Chromium для текущего Playwright и задай путь:

```sh
bunx playwright-core install chromium
export CHROME="$(bun -e 'import { chromium } from "playwright-core"; console.log(chromium.executablePath())')"
```

Все скрипты `e2e/*.mjs` принимают `CHROME`. После этого из корня репозитория можно
запускать `python3 scripts/verify.py`. Тесты используют только локальный мок и
отдельный профиль браузера; данные пользовательского браузера им не нужны.

## Windows

На Windows приложение оформлено как родное для Windows 11 (Fluent): фон Mica, значки Segoe Fluent Icons,
цвет акцента из «Параметров», шрифт Segoe UI Variable, элементы управления в духе WinUI. На Windows 10
вместо Mica непрозрачный фон. Всё это включается по `data-platform="windows"` в `src/styles.css`,
а настройки окна лежат в `src-tauri/tauri.windows.conf.json`.

Со стороны системы (`src-tauri/src/windows_shell.rs`):
- системный плеер (SMTC): медиаклавиши, плашка над регулятором громкости с обложкой и перемоткой;
  встроенная обработка медиаклавиш в WebView2 выключена, чтобы не было двух плееров;
- кнопки «назад / играть / вперёд» в превью окна на панели задач;
- в релизе выключены браузерные клавиши WebView2 (F5, Ctrl+R, Ctrl+P…) и меню по правому клику;
- второй запуск разворачивает уже открытое окно, размер и положение окна запоминаются.

Проверить сборку под Windows можно и с Mac — нужны `cargo install cargo-xwin` и `brew install nsis llvm`:

```sh
cd src-tauri && cargo xwin clippy --target x86_64-pc-windows-msvc
cd .. && PATH="/opt/homebrew/opt/llvm/bin:$PATH" bun run tauri build --runner cargo-xwin \
  --target x86_64-pc-windows-msvc --bundles nsis
```

MSI так не собрать (нужен WiX), он собирается в CI.

## Где что лежит

- Своя музыка — `Музыка/Nocturne` (`~/Music/Nocturne` на Mac и Linux, `Музыка\Nocturne` на
  Windows). Файлы можно класть туда проводником: раздел «На компьютере» пересканирует папку.
- Загрузки с сервера — в данных приложения, рядом с каждой лежат её метаданные.
- Пароль — в системном хранилище: Связка ключей, Диспетчер учётных данных, Secret Service.

## Проверка без настоящего сервера

Отладочная сборка берёт учётные данные из переменной окружения, чтобы не вводить их руками:

```sh
python3 ../shared/mock-server/mock_navidrome.py &
bun run tauri build --debug --bundles app
NOCTURNE_DEV_CREDENTIALS='{"server":"http://127.0.0.1:4533","username":"test","password":"demo"}' \
  src-tauri/target/debug/bundle/macos/Nocturne.app/Contents/MacOS/nocturne
```

В релизной сборке этого пути нет. Там же, в отладочной сборке, в терминал пишется журнал событий
звука, включая уровень сигнала на выходе эквалайзера: по нему видно, что играет не тишина.

## Устойчивость

Каталог, очередь, сеансы и задания загрузки разделены по серверу и пользователю. Каталог
сначала читается с диска, затем обновляется из сети. Запоздалые ответы прежнего подключения
игнорируются. Задания сохраняют метаданные и качество без подписанных URL и возобновляются
при следующем запуске. Автоподготовка выключена по умолчанию; ограничения и миграция описаны
в [`docs/reliability.md`](../docs/reliability.md).

Лицензия собственного кода — [PolyForm Noncommercial 1.0.0](../LICENSE).
Сторонние библиотеки сохраняют свои лицензии: [уведомления](../THIRD_PARTY_NOTICES.md).
