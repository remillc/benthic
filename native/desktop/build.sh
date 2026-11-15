#!/bin/bash
# Builds the dependencies, then the core: libopendives_core.a and the test
# executables (and opendives-host when desktop/host/ exists).
# usage: [TARGET=linux-x64|win-x64|mac-arm64|mac-x64] native/desktop/build.sh [TARGET]
# Output: build/desktop/<target>/{deps,lib,bin}
set -euo pipefail
[ $# -ge 1 ] && export TARGET=$1
source "$(dirname "$0")/env.sh"
"$ROOT/native/desktop/build-deps.sh"
B=$OUT/cmake
cmake -S "$ROOT/native/desktop" -B "$B" -G Ninja -Wno-dev "${CMAKE_TARGET_ARGS[@]}" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release -DDEPS="$DEPS" -DSS="$SS" \
  -DCMAKE_ARCHIVE_OUTPUT_DIRECTORY="$OUT/lib" -DOD_BIN_DIR="$OUT/bin"
cmake --build "$B" -j"$JOBS"
echo "built $OUT/lib/libopendives_core.a and the programs in $OUT/bin"
