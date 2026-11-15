# Common settings for the desktop build. To be sourced, under Linux, WSL or macOS.
# TARGET: linux-x64 | win-x64 | mac-arm64 | mac-x64 (default: the host's own).
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SS=${SS:-$ROOT/third_party/subsurface}

if [ -z "${TARGET:-}" ]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) TARGET=linux-x64 ;;
    Darwin-arm64) TARGET=mac-arm64 ;;
    Darwin-x86_64) TARGET=mac-x64 ;;
    *) echo "set TARGET=linux-x64|win-x64|mac-arm64|mac-x64"; exit 1 ;;
  esac
fi
OUT=$ROOT/build/desktop/$TARGET
DEPS=$OUT/deps
JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Same versions as native/env.sh (Android) and Subsurface's scripts/get-dep-lib.sh;
# zlib is built from source here (the NDK provided it on Android).
ZLIB_TAG=v1.3.1
LIBGIT2_TAG=v1.8.1
LIBXML2_TAG=v2.15.1
LIBXSLT_TAG=v1.1.45
LIBZIP_TAG=rel-1-5-1
MBEDTLS_TAG=mbedtls-3.6.7   # used under GPL-2.0-or-later; OpenSSL's Apache 2.0 is not GPL v2 compatible
SQLITE_VERSION=3190200
SQLITE_YEAR=2017

LLVM_MINGW_VERSION=20261104
LLVM_MINGW_DIR=${LLVM_MINGW_DIR:-$HOME/llvm-mingw-$LLVM_MINGW_VERSION-ucrt-ubuntu-22.04-x86_64}

# Compilers and cross settings per target.
CMAKE_TARGET_ARGS=()
CONFIGURE_HOST_ARGS=()
case $TARGET in
  linux-x64)
    CC=${CC:-gcc}; CXX=${CXX:-g++}; AR=${AR:-ar}; RANLIB=${RANLIB:-ranlib}
    ;;
  win-x64)
    MINGW_BIN=$LLVM_MINGW_DIR/bin
    export PATH=$MINGW_BIN:$PATH
    CC=x86_64-w64-mingw32-clang; CXX=x86_64-w64-mingw32-clang++
    AR=llvm-ar; RANLIB=llvm-ranlib
    CMAKE_TARGET_ARGS=(-DCMAKE_TOOLCHAIN_FILE="$ROOT/native/desktop/toolchain-mingw.cmake")
    CONFIGURE_HOST_ARGS=(--host=x86_64-w64-mingw32)
    ;;
  mac-arm64|mac-x64)
    CC=${CC:-clang}; CXX=${CXX:-clang++}; AR=${AR:-ar}; RANLIB=${RANLIB:-ranlib}
    [ $TARGET = mac-arm64 ] && MAC_ARCH=arm64 || MAC_ARCH=x86_64
    export MACOSX_DEPLOYMENT_TARGET=11.0
    CMAKE_TARGET_ARGS=(-DCMAKE_OSX_ARCHITECTURES=$MAC_ARCH -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0)
    CC="$CC -arch $MAC_ARCH"; CXX="$CXX -arch $MAC_ARCH"
    ;;
  *) echo "unknown TARGET: $TARGET"; exit 1 ;;
esac
export CC CXX
# macOS: Homebrew installs GNU libtoolize as glibtoolize; autoreconf needs the GNU names.
if [ "$(uname -s)" = Darwin ] && command -v brew >/dev/null; then
  GNUBIN=$(brew --prefix libtool)/libexec/gnubin
  if [ -d "$GNUBIN" ]; then export PATH="$GNUBIN:$PATH"; fi
fi

[ -f "$SS/core/dive.cpp" ] || { echo "missing submodule: git submodule update --init third_party/subsurface && git -C third_party/subsurface submodule update --init libdivecomputer"; exit 1; }
