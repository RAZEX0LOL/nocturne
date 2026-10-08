#!/bin/zsh
# Android: подписанный APK и обновление для приложения.
#   scripts/release-android.sh          → build/android-release/Nocturne-1.1.N.apk + android.json
#   scripts/release-android.sh publish  → и выложить: установленное приложение предложит обновиться
#
# Подпись — из android/keystore.properties (в репозитории его нет) или переменных ANDROID_KEYSTORE*.
# Поверх установленного встаёт только APK с той же подписью: ключ менять нельзя.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=${NOCTURNE_RELEASES_REPO:-RAZEX0LOL/nocturne-releases}
BASE="https://github.com/$REPO/releases/download/updates"
BUILD=$(git rev-list --count HEAD)
VERSION="1.1.$BUILD"
OUT=build/android-release

(cd android && NOCTURNE_BUILD_NUMBER=$BUILD ./gradlew -q :app:assembleRelease)
APK=android/app/build/outputs/apk/release/app-release.apk
# Неподписанный APK поверх не встанет — лучше узнать это здесь, чем от людей.
SDK=${ANDROID_HOME:-$PWD/build/android-sdk}
APKSIGNER=$(ls -d "$SDK"/build-tools/*/apksigner | sort -V | tail -1)
"$APKSIGNER" verify "$APK" || { echo "APK не подписан: нет android/keystore.properties?" >&2; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"
NAME="Nocturne-$VERSION.apk"
cp "$APK" "$OUT/$NAME"
SUM=$(shasum -a 256 "$OUT/$NAME" | cut -d' ' -f1)
cat > "$OUT/android.json" <<JSON
{
  "versionCode": $BUILD,
  "versionName": "$VERSION",
  "url": "$BASE/$NAME",
  "sha256": "$SUM"
}
JSON
echo "Готово: $OUT/$NAME (версия $VERSION)"

if [[ "${1:-}" == "publish" ]]; then
  gh release view updates -R "$REPO" >/dev/null 2>&1 || gh release create updates -R "$REPO" \
    --title "Nocturne — обновления" --notes "Файлы, которые приложение Nocturne скачивает само. Установщики для первой установки — тоже здесь."
  # Сначала APK, потом манифест: иначе приложение увидело бы версию раньше её файла.
  gh release upload updates -R "$REPO" --clobber "$OUT/$NAME"
  gh release upload updates -R "$REPO" --clobber "$OUT/android.json"
  echo "Выложено: $BASE/android.json"
fi
