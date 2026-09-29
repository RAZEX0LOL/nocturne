# Выпуск

Секреты в репозитории не лежат. Всё, что нужно для подписи, живёт в `~/.nocturne` с правами 600
и попадает в сборку через переменные окружения.

| Что | Где |
|---|---|
| Ключ подписи Android | `~/.nocturne/nocturne-release.jks`, пароли — в `android/keystore.properties` |
| Ключ подписи обновлений | `~/.nocturne/nocturne-updater.key`, пароль — в `~/.nocturne/updater.env` |
| Подпись macOS | сертификат «Developer ID Application» в связке ключей |

Потеря ключа Android означает, что обновить установленное приложение уже нельзя — его придётся
ставить заново. Потеря ключа обновлений означает то же самое для настольной версии. Обе копии
стоит держать в менеджере паролей.

## iPhone, iPad и Mac (App Store)

```
scripts/release.sh upload      # iOS и iPadOS в TestFlight
scripts/release.sh mac-upload  # Mac Catalyst туда же, в ту же запись
```

## Android

```
cd android && ./gradlew :app:assembleRelease   # app/build/outputs/apk/release/app-release.apk
```

Сборка подписывается, если рядом есть `keystore.properties` (см. `keystore.properties.example`)
или заданы `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`. Без них получится неподписанный apk — им нельзя обновить установленное
приложение, но можно проверить, что R8 ничего лишнего не выбросил.

Для магазина нужен `:app:bundleRelease` (`.aab`), для раздачи файлом — `assembleRelease` (`.apk`).

## Windows, Linux, macOS (файлом)

```
scripts/release-desktop.sh          # установщики в build/desktop-release
scripts/release-desktop.sh publish  # и выкладка на сервер обновлений
```

Переменные окружения:

- `NOCTURNE_UPDATE_URL` — адрес `latest.json`, например `https://music.example.com/nocturne/latest.json`.
  Он подставляется в сборку: в репозитории домена нет.
- `NOCTURNE_UPDATE_SSH` — куда класть файлы, например `nocturne@vps:/srv/nocturne`.
- `APPLE_SIGNING_IDENTITY` — `Developer ID Application: Имя (TEAMID)`; без неё macOS открывает
  приложение только через «Всё равно открыть».
- `APPLE_ID`, `APPLE_PASSWORD` (пароль приложения), `APPLE_TEAM_ID` — нотаризация.

Windows-установщик не подписан: сертификат для подписи кода стоит денег, а SmartScreen ругается
только на первые запуски. Linux-пакеты тоже идут без подписи — там доверие обеспечивает источник.

### Сервер обновлений

Обновлялка спрашивает один статический файл и сама выбирает строку под свою систему, поэтому на
сервере достаточно nginx и папки:

```nginx
location /nocturne/ {
    alias /srv/nocturne/;
    add_header Cache-Control "no-cache";
}
```

`scripts/release-desktop.sh publish` кладёт туда установщики, архивы обновлений, их подписи и
`latest.json`. Версию приложение берёт из `desktop/src-tauri/tauri.conf.json` — её и надо поднять
перед выпуском.
