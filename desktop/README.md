# Nocturne для Windows, Linux и macOS

Tauri 2: интерфейс на React и TypeScript, звук через `<audio>` и Web Audio, работа с файлами,
загрузки и хранение пароля — на стороне Rust.

## Запуск

```sh
bun install
bun run tauri dev      # окно с горячей перезагрузкой
bun run tauri build    # установщик для текущей системы
```

Нужны Bun и Rust (`rustup`). На Linux ещё WebKitGTK:
`sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
Установщики под Windows и Linux собирает CI (`.github/workflows/desktop.yml`) — с Mac их не собрать.

## Проверки

```sh
bun test                 # общий контракт из shared/cases
bun run typecheck
cd src-tauri && cargo test
```

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
NOCTURNE_DEV_CREDENTIALS='{"server":"http://127.0.0.1:4533","username":"test","password":"test"}' \
  src-tauri/target/debug/bundle/macos/Nocturne.app/Contents/MacOS/nocturne
```

В релизной сборке этого пути нет. Там же, в отладочной сборке, в терминал пишется журнал событий
звука, включая уровень сигнала на выходе эквалайзера: по нему видно, что играет не тишина.
