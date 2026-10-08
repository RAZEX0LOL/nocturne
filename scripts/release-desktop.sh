#!/bin/zsh
# Настольная сборка и обновление.
#   scripts/release-desktop.sh                    → установщик и обновление для этого Мака
#   scripts/release-desktop.sh --windows          → ещё и Windows (NSIS, через cargo-xwin)
#   scripts/release-desktop.sh publish [--windows] → и выложить: приложения обновятся сами
#
# Обновления лежат в релизе «updates» публичного репозитория NOCTURNE_RELEASES_REPO
# (по умолчанию RAZEX0LOL/nocturne-releases): у каждой системы свой манифест
# darwin-aarch64.json / windows-x86_64.json, его и спрашивает приложение (tauri.conf.json).
#
# Секреты в репозитории не лежат. Ключ подписи обновлений и пароль к нему — в ~/.nocturne/updater.env
# (права 600). Подпись Apple не обязательна: APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID.
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=0
WINDOWS=0
for arg in "$@"; do
  case $arg in
    publish) PUBLISH=1 ;;
    --windows) WINDOWS=1 ;;
    *) echo "Неизвестный параметр: $arg" >&2; exit 2 ;;
  esac
done

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
export PATH="$HOME/.cargo/bin:$PATH"

# Версия растёт с каждым коммитом — как номер сборки iOS. Обновлялка сравнивает версии,
# и с неизменной «1.0.0» новая сборка для неё ничем не отличалась от старой.
VERSION="1.1.$(git rev-list --count HEAD)"
REPO=${NOCTURNE_RELEASES_REPO:-RAZEX0LOL/nocturne-releases}
BASE="https://github.com/$REPO/releases/download/updates"
# Без записи в чейнджлоге не выпускаем: «что нового» видят и на сайте, и в плашке обновления.
bun scripts/changelog.ts check "$VERSION" mac
(( WINDOWS )) && bun scripts/changelog.ts check "$VERSION" windows
echo "{\"version\":\"$VERSION\"}" > desktop/src-tauri/tauri.version.json
trap 'rm -f desktop/src-tauri/tauri.version.json' EXIT

# Mac: подпись Developer ID и нотаризация Apple. Без них скачанное из браузера приложение macOS
# объявляет «повреждённым» (у бандла только подпись компоновщика) — и открыть его нельзя вовсе.
# Сертификат — из связки ключей, нотаризация — ключом App Store Connect, тем же, что у TestFlight
# (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH; по умолчанию из ~/.config/razex-panel/asc.env).
if [[ "$(uname)" == "Darwin" ]]; then
  if [[ -z "${ASC_KEY_ID:-}" && -f "$HOME/.config/razex-panel/asc.env" ]]; then
    set -a; source "$HOME/.config/razex-panel/asc.env"; set +a
  fi
  export APPLE_SIGNING_IDENTITY=${APPLE_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)}
  if [[ -z "$APPLE_SIGNING_IDENTITY" || -z "${ASC_KEY_ID:-}" ]]; then
    echo "Нет сертификата Developer ID или ключа App Store Connect: Mac-версию людям выпускать нельзя — macOS назовёт её повреждённой." >&2
    exit 1
  fi
  export APPLE_API_KEY=$ASC_KEY_ID APPLE_API_ISSUER=$ASC_ISSUER_ID APPLE_API_KEY_PATH=${ASC_KEY_PATH/#\~/$HOME}
fi

OUT=build/desktop-release
rm -rf "$OUT" && mkdir -p "$OUT"
(cd desktop && bun install --frozen-lockfile)

# Мак: архив .app.tar.gz для обновлялки и .dmg для первой установки.
(cd desktop && bun run tauri build --config src-tauri/tauri.version.json --bundles app,dmg)
BUNDLE=desktop/src-tauri/target/release/bundle
ARCH=$(uname -m)
# Приложение Tauri уже подписал и нотаризовал; образ .dmg — отдельный файл: подписываем, отправляем
# Apple и вшиваем ответ (staple), чтобы проверка проходила и без сети.
DMG=$(find "$BUNDLE/dmg" -name '*.dmg' ! -name 'rw.*' | head -1)
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"
# Проверка глазами Gatekeeper — та же, что у Mac, на который приложение скачали из браузера.
spctl -a -vv -t install "$DMG"
spctl -a -vv "$BUNDLE/macos/Nocturne.app"
# В имени архива версия: файл на сервере не подменяется под тем же именем посреди чьей-то загрузки.
cp "$BUNDLE/macos/Nocturne.app.tar.gz" "$OUT/Nocturne_${VERSION}_${ARCH}.app.tar.gz"
cp "$BUNDLE/macos/Nocturne.app.tar.gz.sig" "$OUT/Nocturne_${VERSION}_${ARCH}.app.tar.gz.sig"
find "$BUNDLE/dmg" -name '*.dmg' ! -name 'rw.*' -exec cp {} "$OUT/" \;
# Постоянные имена — для сайта: кнопка «Скачать» всегда ведёт на последнюю версию.
find "$BUNDLE/dmg" -name '*.dmg' ! -name 'rw.*' -exec cp {} "$OUT/Nocturne-mac.dmg" \;
NOTES=$(bun scripts/changelog.ts notes "$VERSION" mac) python3 scripts/updater_manifest.py "$VERSION" "$OUT" "$BASE" darwin "$ARCH"

# Windows с Мака: NSIS-установщик он же и обновление (ставится поверх в тихом режиме).
if (( WINDOWS )); then
  (cd desktop && PATH=/opt/homebrew/opt/llvm/bin:$PATH bun run tauri build --config src-tauri/tauri.version.json \
    --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis)
  WIN=desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis
  cp "$WIN"/Nocturne_${VERSION}_x64-setup.exe "$WIN"/Nocturne_${VERSION}_x64-setup.exe.sig "$OUT/"
  cp "$WIN"/Nocturne_${VERSION}_x64-setup.exe "$OUT/Nocturne-windows-setup.exe"
  NOTES=$(bun scripts/changelog.ts notes "$VERSION" windows) python3 scripts/updater_manifest.py "$VERSION" "$OUT" "$BASE" windows x86_64
fi
echo "Готово: $OUT (версия $VERSION)"
ls -1 "$OUT"

if (( PUBLISH )); then
  gh release view updates -R "$REPO" >/dev/null 2>&1 || gh release create updates -R "$REPO" \
    --title "Nocturne — обновления" --notes "Файлы, которые приложение Nocturne скачивает само. Установщики для первой установки — тоже здесь."
  # Сначала файлы, потом манифесты: иначе приложение могло бы увидеть версию раньше её файла.
  gh release upload updates -R "$REPO" --clobber $(find "$OUT" -type f ! -name '*.json')
  gh release upload updates -R "$REPO" --clobber "$OUT"/*.json
  # Описание релиза — чейнджлог: его читает сайт.
  bun scripts/changelog.ts release-body > build/release-body.md
  gh release edit updates -R "$REPO" --notes-file build/release-body.md
  echo "Выложено: $BASE"
fi
