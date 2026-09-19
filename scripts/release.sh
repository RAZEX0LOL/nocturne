#!/bin/zsh
# Archive a signed Release build and export it for App Store Connect.
#   scripts/release.sh          → build/release/Nocturne.ipa (local only)
#   scripts/release.sh upload   → also uploads to App Store Connect / TestFlight
# The build number is the git commit count, so every upload gets a new one.
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD_NUMBER=${BUILD_NUMBER:-$(git rev-list --count HEAD)}
OUT=build/release
rm -rf "$OUT" && mkdir -p "$OUT"
xcodebuild -project Nocturne.xcodeproj -scheme Nocturne -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/Nocturne.xcarchive" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" -allowProvisioningUpdates archive
if [[ "${1:-}" == "upload" ]]; then
  sed 's|<string>export</string>|<string>upload</string>|' scripts/ExportOptions.plist > "$OUT/ExportOptions.plist"
else
  cp scripts/ExportOptions.plist "$OUT/ExportOptions.plist"
fi
xcodebuild -exportArchive -archivePath "$OUT/Nocturne.xcarchive" -exportPath "$OUT" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -allowProvisioningUpdates
echo "Build $BUILD_NUMBER ready in $OUT"
