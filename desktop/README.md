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
