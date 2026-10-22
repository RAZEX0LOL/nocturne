#!/bin/zsh
# Linux-сборка: AppImage и .deb.
#   scripts/release-linux.sh          → файлы в build/linux-release
#   scripts/release-linux.sh publish  → и выложить: установленные приложения обновятся сами
#
# Собирается не здесь: Tauri для Linux нужен сам Linux. Сборка идёт в контейнере на домашнем
# сервере (NOCTURNE_LINUX_HOST, по умолчанию razex-home) — там уже лежит образ `razex-builder`
# от razex-panel со всем нужным (webkit2gtk, rust, bun).
#
# Ключ подписи обновлений на сервер НЕ уезжает: контейнер собирает без подписи, а подписывает
# уже этот Mac, когда файлы вернулись (`tauri signer sign`).
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=0
[[ "${1:-}" == "publish" ]] && PUBLISH=1

SECRETS=${NOCTURNE_SECRETS:-$HOME/.nocturne/updater.env}
if [[ -f "$SECRETS" ]]; then
  set -a; source "$SECRETS"; set +a
else
  echo "Нет $SECRETS — без ключа подписи обновление собрать нельзя." >&2
  exit 1
fi
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH")"
fi
# «signer sign» отказывается работать, если видит и ключ, и путь к нему: оставляем только ключ.
unset TAURI_SIGNING_PRIVATE_KEY_PATH

HOST=${NOCTURNE_LINUX_HOST:-razex-home}
REMOTE=${NOCTURNE_LINUX_DIR:-/home/razex/nocturne-build}
IMAGE=${NOCTURNE_LINUX_IMAGE:-razex-builder:latest}
VERSION="1.1.$(git rev-list --count HEAD)"
REPO=${NOCTURNE_RELEASES_REPO:-RAZEX0LOL/nocturne-releases}
BASE="https://github.com/$REPO/releases/download/updates"
OUT=build/linux-release

# Без записи в чейнджлоге не выпускаем: «что нового» видят и на сайте, и в плашке обновления.
bun scripts/changelog.ts check "$VERSION" linux

echo "==> Исходники на $HOST"
ssh "$HOST" "mkdir -p $REMOTE/src $REMOTE/out"
OWNER=$(ssh "$HOST" 'echo $(id -u):$(id -g)')
# node_modules и target остаются на сервере между сборками (кэш Rust): без --delete-excluded
# rsync их не трогает, иначе каждая сборка шла бы с нуля.
rsync -az --delete \
  --exclude 'node_modules' --exclude 'target' --exclude 'dist' \
  desktop/ "$HOST:$REMOTE/src/"
echo "{\"version\":\"$VERSION\",\"bundle\":{\"createUpdaterArtifacts\":false}}" \
  | ssh "$HOST" "cat > $REMOTE/src/src-tauri/tauri.linux.json"

echo "==> Сборка в контейнере (несколько минут)"
# Файлы в контейнере создаёт root; на выходе отдаём их хозяину каталога, иначе их потом не забрать.
# --dns обязателен: на домашнем сервере resolv.conf указывает на локальный stub (127.0.0.53),
# внутри контейнера его нет, и bun не может скачать зависимости (DNSResolveFailed).
ssh "$HOST" "docker run --rm --dns 1.1.1.1 --dns 8.8.8.8 -v $REMOTE/src:/src -v $REMOTE/out:/out -w /src $IMAGE bash -lc '
  set -e
  bun install --frozen-lockfile
  bunx tauri build --config src-tauri/tauri.linux.json --bundles deb,appimage
  rm -f /out/*
  cp src-tauri/target/release/bundle/appimage/*.AppImage /out/
  cp src-tauri/target/release/bundle/deb/*.deb /out/
  chown -R $OWNER /out
'"

rm -rf "$OUT" && mkdir -p "$OUT"
scp -q "$HOST:$REMOTE/out/*" "$OUT/"

# Обновлялка Linux берёт AppImage. Подписываем здесь — ключ дальше этого Mac не уходит.
APPIMAGE=$(find "$OUT" -name '*.AppImage' | head -1)
[[ -n "$APPIMAGE" ]] || { echo "Сборка не отдала AppImage" >&2; exit 1; }
# Имя с версией: файл на сервере не подменяется под тем же именем посреди чьей-то загрузки.
VERSIONED="$OUT/Nocturne_${VERSION}_amd64.AppImage"
[[ "$APPIMAGE" == "$VERSIONED" ]] || mv "$APPIMAGE" "$VERSIONED"
(cd desktop && bunx tauri signer sign "../$VERSIONED")
# Постоянное имя — для кнопки на сайте.
cp "$VERSIONED" "$OUT/Nocturne-linux.AppImage"
DEB=$(find "$OUT" -name '*.deb' | head -1)
[[ -n "$DEB" ]] && cp "$DEB" "$OUT/Nocturne-linux.deb"

NOTES=$(bun scripts/changelog.ts notes "$VERSION" linux) python3 scripts/updater_manifest.py "$VERSION" "$OUT" "$BASE" linux x86_64
echo "Готово: $OUT (версия $VERSION)"
command ls -1 "$OUT"

if (( PUBLISH )); then
  gh release view updates -R "$REPO" >/dev/null 2>&1 || gh release create updates -R "$REPO" \
    --title "Nocturne — обновления" --notes "Файлы, которые приложение Nocturne скачивает само. Установщики для первой установки — тоже здесь."
  # Сначала файлы, потом манифест: иначе приложение увидело бы версию раньше её файла.
  gh release upload updates -R "$REPO" --clobber $(find "$OUT" -type f ! -name '*.json')
  gh release upload updates -R "$REPO" --clobber "$OUT"/*.json
  bun scripts/changelog.ts release-body > build/release-body.md
  gh release edit updates -R "$REPO" --notes-file build/release-body.md
  echo "Выложено: $BASE/linux-x86_64.json"
fi
