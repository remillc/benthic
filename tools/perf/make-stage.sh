#!/bin/bash
# Builds a stage folder for the production start-up measure: the main checkout's helper files (read only) and a Vite build as web/.
# usage: tools/perf/make-stage.sh <dist folder> <stage name>     (result: build/perf/<stage name>)
MAIN=${MAIN:-/f/projets/OpenDives}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAGE=$ROOT/build/perf/$2
rm -rf "$STAGE"; mkdir -p "$STAGE"
for d in bin i18n xslt SampleDivesV2.ssrf; do cp -r "$MAIN/build/desktop/stage/$d" "$STAGE/"; done
cp -r "$1" "$STAGE/web"
