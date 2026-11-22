#!/bin/bash
# Starts the desktop app against the audit's Vite (5241) with CDP on 9391, one logbook file.
# usage: tools/perf/start-electron.sh <logbook.ssrf> [userdata-dir]
# Needs the main checkout's electron and helper builds (read only): set MAIN to override.
MAIN=${MAIN:-/f/projets/benthic}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export BC_DEV_URL=http://localhost:${VITE_PORT:-5241}
export BC_HOST=$MAIN/build/desktop/win-x64/bin/benthic-host.exe
export BC_STAGE=$MAIN/build/desktop/stage
export BC_USER_DATA=${2:-$ROOT/build/perf/userdata}
unset ELECTRON_RUN_AS_NODE
"$MAIN/desktop/node_modules/electron/dist/electron.exe" "$ROOT/desktop" --remote-debugging-port=${CDP_PORT:-9391} "$1"
