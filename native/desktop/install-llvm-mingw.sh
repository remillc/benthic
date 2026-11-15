#!/bin/bash
# Downloads llvm-mingw (clang + UCRT, targets Windows from Linux), used by WSL or a
# Linux runner for TARGET=win-x64. Nothing is installed in the repository.
set -euo pipefail
source "$(dirname "$0")/env.sh"
[ -x "$LLVM_MINGW_DIR/bin/x86_64-w64-mingw32-clang" ] && { echo "llvm-mingw already present: $LLVM_MINGW_DIR"; exit 0; }
tgz=$(mktemp --suffix=.tar.xz)
curl -fL --retry 3 -o "$tgz" "https://github.com/mstorsjo/llvm-mingw/releases/download/$LLVM_MINGW_VERSION/$(basename "$LLVM_MINGW_DIR").tar.xz"
tar xJf "$tgz" -C "$(dirname "$LLVM_MINGW_DIR")"
rm -f "$tgz"
echo "llvm-mingw installed: $LLVM_MINGW_DIR"
