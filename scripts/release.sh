#!/bin/zsh
# Archive a signed Release build and export it for App Store Connect.
#   scripts/release.sh          → build/release/Nocturne.ipa (local only)
#   scripts/release.sh upload   → also uploads to App Store Connect / TestFlight
#   scripts/release.sh mac      → build/release/Nocturne.app for this Mac (Mac Catalyst)
#   scripts/release.sh mac-upload → Mac Catalyst .pkg to App Store Connect / TestFlight for Mac
# The build number is the git commit count, so every upload gets a new one.
set -euo pipefail
cd "$(dirname "$0")/.."
# Build numbers must keep growing; outside git the timestamp does that on its own.
BUILD_NUMBER=${BUILD_NUMBER:-$(git rev-list --count HEAD 2>/dev/null || date +%y%m%d%H%M)}
# With an App Store Connect API key (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH) signing and upload
# work without an account signed in to Xcode — handy on a headless machine or from a script.
AUTH=()
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_KEY_PATH:-}" ]]; then
  AUTH=(-authenticationKeyPath "${ASC_KEY_PATH/#\~/$HOME}" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

if [[ "${1:-}" == "mac-upload" ]]; then
  # The Mac build ships under the same App Store Connect record as iOS (same bundle id),
  # as its macOS platform, so its build numbers are counted separately from the iOS ones.
  bun scripts/changelog.ts check "1.1.$BUILD_NUMBER" mac
  OUT=build/release-mac
  rm -rf "$OUT" && mkdir -p "$OUT"
  xcodebuild -project Nocturne.xcodeproj -scheme Nocturne -configuration Release \
    -destination 'generic/platform=macOS,variant=Mac Catalyst' -archivePath "$OUT/Nocturne.xcarchive" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" MARKETING_VERSION="1.1.$BUILD_NUMBER" -allowProvisioningUpdates "${AUTH[@]}" archive
  sed 's|<string>export</string>|<string>upload</string>|' scripts/ExportOptions.plist > "$OUT/ExportOptions.plist"
  xcodebuild -exportArchive -archivePath "$OUT/Nocturne.xcarchive" -exportPath "$OUT" \
    -exportOptionsPlist "$OUT/ExportOptions.plist" -allowProvisioningUpdates "${AUTH[@]}"
  bun scripts/changelog.ts testflight "$BUILD_NUMBER" mac
  echo "Mac build $BUILD_NUMBER sent to App Store Connect"
  exit 0
fi

if [[ "${1:-}" == "mac" ]]; then
  OUT=build/release
  rm -rf "$OUT/Nocturne.app" && mkdir -p "$OUT"
  xcodebuild -project Nocturne.xcodeproj -scheme Nocturne -configuration Release \
    -destination 'platform=macOS,arch=arm64,variant=Mac Catalyst' -derivedDataPath build/mac \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" MARKETING_VERSION="1.1.$BUILD_NUMBER" -allowProvisioningUpdates "${AUTH[@]}" build
  cp -R build/mac/Build/Products/Release-maccatalyst/Nocturne.app "$OUT/"
  echo "Mac build $BUILD_NUMBER ready: $OUT/Nocturne.app — drag it into Applications"
  exit 0
fi
OUT=build/release
# В TestFlight — только с записью в чейнджлоге: она же уходит в «Что тестировать».
[[ "${1:-}" == "upload" ]] && bun scripts/changelog.ts check "1.1.$BUILD_NUMBER" ios
rm -rf "$OUT" && mkdir -p "$OUT"
xcodebuild -project Nocturne.xcodeproj -scheme Nocturne -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/Nocturne.xcarchive" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" MARKETING_VERSION="1.1.$BUILD_NUMBER" -allowProvisioningUpdates "${AUTH[@]}" archive
if [[ "${1:-}" == "upload" ]]; then
  sed 's|<string>export</string>|<string>upload</string>|' scripts/ExportOptions.plist > "$OUT/ExportOptions.plist"
else
  cp scripts/ExportOptions.plist "$OUT/ExportOptions.plist"
fi
xcodebuild -exportArchive -archivePath "$OUT/Nocturne.xcarchive" -exportPath "$OUT" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -allowProvisioningUpdates "${AUTH[@]}"
echo "Build $BUILD_NUMBER ready in $OUT"
if [[ "${1:-}" == "upload" ]]; then
  # «Что тестировать» — из чейнджлога; ждёт, пока App Store Connect покажет сборку.
  bun scripts/changelog.ts testflight "$BUILD_NUMBER"
fi
