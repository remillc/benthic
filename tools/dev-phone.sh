#!/usr/bin/env bash
# Development only: reach the local Benthic development stack from an Android phone or emulator over USB, and try the
# Benthic+ flow with the simulated Google sign-in (docs/dev-accounts.md).
#
# Usage: tools/dev-phone.sh <adb-serial> [--no-start]
#
#   1. starts the development stack (unless --no-start); its folder is BENTHIC_SERVER_DIR, by default the folder
#      `benthic-server` next to this repository;
#   2. runs `adb reverse` for the API (8080) and the git front (3443), so that the device reaches both at 127.0.0.1;
#   3. copies the stack's development certificate authority to app/android/app/src/debug/assets/dev-ca.pem (git-ignored;
#      read only by debug builds);
#   4. prints the lines to put in app/.env.local.
#
# Stop the stack afterwards with: "$BENTHIC_SERVER_DIR/scripts/stop.sh".
set -euo pipefail
export MSYS_NO_PATHCONV=1

serial="${1:-}"
[ -n "$serial" ] || { echo "Usage: tools/dev-phone.sh <adb-serial> [--no-start]" >&2; exit 2; }
start=1; [ "${2:-}" = "--no-start" ] && start=0

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
server="${BENTHIC_SERVER_DIR:-$here/../benthic-server}"
[ -d "$server" ] || { echo "Development stack not found: set BENTHIC_SERVER_DIR (looked in $server)." >&2; exit 1; }

adb="adb"
command -v adb >/dev/null 2>&1 || adb="${ANDROID_HOME:-${LOCALAPPDATA:-$HOME}/Android/Sdk}/platform-tools/adb"

if [ "$start" = 1 ]; then "$server/scripts/start.sh" >/dev/null; fi
curl -fsS --max-time 5 http://127.0.0.1:8080/v1/health >/dev/null || { echo "The API does not answer on 127.0.0.1:8080." >&2; exit 1; }

"$adb" -s "$serial" reverse tcp:8080 tcp:8080
"$adb" -s "$serial" reverse tcp:3443 tcp:3443

ca="$server/.data/tls/ca.pem"
[ -f "$ca" ] || { echo "Certificate authority missing: $ca (the stack creates it on its first start)." >&2; exit 1; }
mkdir -p "$here/app/android/app/src/debug/assets"
cp "$ca" "$here/app/android/app/src/debug/assets/dev-ca.pem"

cat <<EOF

Ready for $serial. Put these lines in app/.env.local (not in git), then build and install a DEBUG build:

  VITE_SERVER_URL=http://127.0.0.1:8080
  VITE_DEV_ACCOUNTS=1

  cd app && npm run android:sync     # then gradlew assembleDebug and adb install -r, as in AGENTS.md

The reverse ports last until the device is unplugged or adb restarts: run this script again then.
EOF
