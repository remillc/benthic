#!/bin/bash
# Signs the app for the App Store and sends it to TestFlight (run on the CI's macOS runner, after
# build-ios.sh and prepare-app.sh). Reads the signing material from the environment (GitHub secrets):
#   IOS_DIST_P12_BASE64, IOS_DIST_P12_PASSWORD  the Apple Distribution certificate and its key
#   IOS_PROFILE_BASE64                           the « Benthic App Store » provisioning profile
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64 the App Store Connect API key that uploads
#   BUILD_NUMBER                                 CFBundleVersion: must grow with every upload
# The certificate, profile and key live in F:\projets\benthic-keys\ios on Christian's computer, never in git.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TEAM=Q9555WKT28
PROFILE_NAME="Benthic App Store"
WORK=$ROOT/build/ios/testflight
rm -rf "$WORK"
mkdir -p "$WORK"

# A keychain of its own, deleted at the end.
KEYCHAIN=$WORK/signing.keychain-db
KEYCHAIN_PASSWORD=$(uuidgen)
cleanup() { security delete-keychain "$KEYCHAIN" 2>/dev/null || true; rm -f "$WORK/AuthKey.p8" "$WORK/dist.p12"; }
trap cleanup EXIT
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
echo "$IOS_DIST_P12_BASE64" | base64 --decode > "$WORK/dist.p12"
security import "$WORK/dist.p12" -k "$KEYCHAIN" -P "$IOS_DIST_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
security find-identity -v -p codesigning "$KEYCHAIN"

# The provisioning profile, where Xcode looks for it.
PROFILES="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILES"
echo "$IOS_PROFILE_BASE64" | base64 --decode > "$WORK/profile.mobileprovision"
UUID=$(security cms -D -i "$WORK/profile.mobileprovision" | plutil -extract UUID raw -o - -)
cp "$WORK/profile.mobileprovision" "$PROFILES/$UUID.mobileprovision"
mkdir -p "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
cp "$WORK/profile.mobileprovision" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$UUID.mobileprovision"

# The App target signs by hand with that profile (the repository keeps Xcode's automatic signing for development),
# and push notifications use the production environment, as the distribution profile says.
PBX=$ROOT/app/ios/App/App.xcodeproj/project.pbxproj
perl -0pi -e "s/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = $TEAM;\n\t\t\t\tCODE_SIGN_IDENTITY = \"Apple Distribution\";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = \"$PROFILE_NAME\";/g" "$PBX"
/usr/libexec/PlistBuddy -c "Set :aps-environment production" "$ROOT/app/ios/App/App/App.entitlements"

ARCHIVE=$WORK/Benthic.xcarchive
xcodebuild -workspace "$ROOT/app/ios/App/App.xcworkspace" -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" archive > "$WORK/archive.log" 2>&1 || {
  grep -E ': (error|fatal error):|error: ' "$WORK/archive.log" | sort -u | head -100
  tail -40 "$WORK/archive.log"
  exit 1
}
tail -5 "$WORK/archive.log"

# Export signs for the App Store and uploads to App Store Connect (TestFlight) with the API key.
echo "$ASC_KEY_P8_BASE64" | base64 --decode > "$WORK/AuthKey.p8"
cat > "$WORK/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict><key>app.benthicdivelog</key><string>$PROFILE_NAME</string></dict>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
EOF
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$WORK/ExportOptions.plist" \
  -exportPath "$WORK/export" -authenticationKeyPath "$WORK/AuthKey.p8" \
  -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" | tail -40
test "${PIPESTATUS[0]}" = 0
echo "sent build $BUILD_NUMBER to App Store Connect"
