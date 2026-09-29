#!/bin/zsh
# Настольная сборка и обновление.
#   scripts/release-desktop.sh          → установщики для этой системы
#   scripts/release-desktop.sh publish  → ещё и выкладывает их на сервер обновлений
#
# Секреты в репозитории не лежат. Ключ подписи обновлений и пароль к нему — в ~/.nocturne/updater.env
# (права 600), остальное — переменные окружения:
#   NOCTURNE_UPDATE_URL  адрес файла обновлений, например https://music.example.com/nocturne/latest.json
#   NOCTURNE_UPDATE_SSH  куда класть файлы, например nocturne@vps:/srv/nocturne
#   APPLE_SIGNING_IDENTITY  «Developer ID Application: Имя (TEAMID)» — подпись для macOS
#   APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID  пароль приложения для нотаризации
set -euo pipefail
cd "$(dirname "$0")/.."

SECRETS=${NOCTURNE_SECRETS:-$HOME/.nocturne/updater.env}
if [[ -f "$SECRETS" ]]; then
  set -a; source "$SECRETS"; set +a
else
  echo "Нет $SECRETS — обновления собрать без ключа подписи нельзя." >&2
  exit 1
fi

# Сборщик ждёт сам ключ, а не путь к нему.
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH")"
fi

VERSION=$(python3 -c "import json;print(json.load(open('desktop/src-tauri/tauri.conf.json'))['version'])")
ARGS=()
# Адрес обновлений не хранится в репозитории: подставляется здесь, при сборке.
# Проверка не лишняя: обновлялка принимает только https и роняет приложение при запуске,
# если адрес оказался другим — ошибка вылезла бы уже у людей.
if [[ -n "${NOCTURNE_UPDATE_URL:-}" && "${NOCTURNE_UPDATE_URL}" != https://* && "${NOCTURNE_ALLOW_INSECURE_UPDATES:-}" != "1" ]]; then
  echo "NOCTURNE_UPDATE_URL должен начинаться с https:// — иначе приложение не запустится." >&2
  exit 1
fi
if [[ -n "${NOCTURNE_UPDATE_URL:-}" ]]; then
  INSECURE=false
  [[ "${NOCTURNE_ALLOW_INSECURE_UPDATES:-}" == "1" ]] && INSECURE=true
  echo "{\"plugins\":{\"updater\":{\"endpoints\":[\"$NOCTURNE_UPDATE_URL\"],\"dangerousInsecureTransportProtocol\":$INSECURE}}}" > desktop/src-tauri/tauri.endpoint.json
  ARGS+=(--config src-tauri/tauri.endpoint.json)
fi
if [[ "$(uname)" == "Darwin" && -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "APPLE_SIGNING_IDENTITY не задан: приложение соберётся без подписи, и macOS откроет его только через «Всё равно открыть»." >&2
fi

(cd desktop && bun install --frozen-lockfile && bun run tauri build "${ARGS[@]}")
rm -f desktop/src-tauri/tauri.endpoint.json

BUNDLE=desktop/src-tauri/target/release/bundle
OUT=build/desktop-release
rm -rf "$OUT" && mkdir -p "$OUT"
# Установщики — людям, архивы с подписью — обновлялке.
find "$BUNDLE" -type f \( -name '*.dmg' -o -name '*.msi' -o -name '*.exe' -o -name '*.deb' -o -name '*.AppImage' \
  -o -name '*.tar.gz' -o -name '*.zip' -o -name '*.sig' \) -exec cp {} "$OUT/" \;
# Пустой latest.json хуже отсутствующего: обновлялка приняла бы его за «обновлений нет».
python3 scripts/updater_manifest.py "$VERSION" "$OUT" "${NOCTURNE_UPDATE_URL:-}" "$(uname -m)" > "$OUT/latest.json" \
  || { rm -f "$OUT/latest.json"; exit 1; }
echo "Готово: $OUT (версия $VERSION)"

if [[ "${1:-}" == "publish" ]]; then
  : "${NOCTURNE_UPDATE_SSH:?нужен NOCTURNE_UPDATE_SSH, например nocturne@vps:/srv/nocturne}"
  scp "$OUT"/* "$NOCTURNE_UPDATE_SSH/"
  echo "Выложено на $NOCTURNE_UPDATE_SSH"
fi
