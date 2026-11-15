#!/bin/bash
# Builds the core dependencies as static libraries for a desktop target:
# zlib, Mbed TLS, libgit2 (HTTPS through Mbed TLS, no SSH), libxml2, libxslt,
# sqlite3, libzip, libdivecomputer. Same options as native/build-deps.sh (Android).
# Output: build/desktop/<target>/deps/{include,lib}
# usage: [TARGET=linux-x64|win-x64|mac-arm64|mac-x64] native/desktop/build-deps.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"
SRC=$ROOT/build/desktop/src   # sources, shared by the targets
P=$DEPS
W=$OUT/work
mkdir -p "$SRC" "$P/lib" "$P/include" "$W"

clone() { # name url tag
  [ -d "$SRC/$1/.git" ] || git clone -q --depth 1 --branch "$3" "$2" "$SRC/$1"
}
clone zlib https://github.com/madler/zlib.git "$ZLIB_TAG"
[ -d "$SRC/mbedtls/.git" ] || git clone -q --depth 1 --recurse-submodules --shallow-submodules --branch "$MBEDTLS_TAG" https://github.com/Mbed-TLS/mbedtls.git "$SRC/mbedtls"
# The core and libgit2 reach the network from two threads; libgit2's client
# speaks up to TLS 1.2. In the source's configuration, so that the installed
# headers, read by libgit2 and the core, say the same as the library.
# Done once (the sources are shared by the targets, which may build in parallel).
MBEDTLS_CONFIG=$SRC/mbedtls/include/mbedtls/mbedtls_config.h
if grep -q '^//#define MBEDTLS_THREADING_PTHREAD' "$MBEDTLS_CONFIG"; then
  sed -i.bak -E 's|^//(#define MBEDTLS_THREADING_(C\|PTHREAD))|\1|; s|^(#define MBEDTLS_SSL_(PROTO_TLS1_3\|TLS1_3_[A-Z0-9_]+))|//\1|' "$MBEDTLS_CONFIG"
  rm -f "$MBEDTLS_CONFIG.bak"
fi
clone libgit2 https://github.com/libgit2/libgit2.git "$LIBGIT2_TAG"
clone libxml2 https://github.com/GNOME/libxml2.git "$LIBXML2_TAG"
clone libxslt https://github.com/GNOME/libxslt.git "$LIBXSLT_TAG"
clone libzip https://github.com/nih-at/libzip.git "$LIBZIP_TAG"
if [ ! -f "$SRC/sqlite/sqlite3.c" ]; then
  mkdir -p "$SRC/sqlite"
  curl -fL --retry 3 "https://sqlite.org/$SQLITE_YEAR/sqlite-autoconf-$SQLITE_VERSION.tar.gz" |
    tar xz --strip-components=1 -C "$SRC/sqlite"
fi

cm() { # name [cmake options...] — rebuilt if the options change
  local name=$1; shift
  [ -f "$W/$name.done" ] && [ "$(cat "$W/$name.done")" = "$*" ] && return 0
  rm -rf "$W/$name"
  echo "== $TARGET : $name"
  cmake -S "$SRC/$name" -B "$W/$name" -G Ninja -Wno-dev "${CMAKE_TARGET_ARGS[@]}" \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$P" -DCMAKE_INSTALL_LIBDIR=lib \
    -DCMAKE_FIND_ROOT_PATH="$P" -DCMAKE_PREFIX_PATH="$P" -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON "$@" >"$W/$name.log" 2>&1 || { tail -30 "$W/$name.log"; exit 1; }
  cmake --build "$W/$name" --target install -j"$JOBS" >>"$W/$name.log" 2>&1 || { tail -30 "$W/$name.log"; exit 1; }
  echo "$*" > "$W/$name.done"
}

# zlib: keep only the static library, named libz.a on every target.
cm zlib
rm -f "$P"/lib/libz.so* "$P"/lib/libz.dylib "$P"/lib/libzlib.dll.a "$P"/lib/libz.dll.a "$P"/bin/zlib1.dll "$P"/bin/libzlib.dll
[ -f "$P/lib/libz.a" ] || cp "$P/lib/libzlibstatic.a" "$P/lib/libz.a"

cm mbedtls -DENABLE_PROGRAMS=OFF -DENABLE_TESTING=OFF -DMBEDTLS_FATAL_WARNINGS=OFF -DGEN_FILES=OFF -DUSE_SHARED_MBEDTLS_LIBRARY=OFF

cm libgit2 -DUSE_HTTPS=mbedTLS -DUSE_SHA1=CollisionDetection -DUSE_SHA256=Builtin -DUSE_WINHTTP=OFF \
  -DUSE_SSH=OFF -DBUILD_TESTS=OFF -DBUILD_CLI=OFF -DBUILD_EXAMPLES=OFF \
  -DUSE_BUNDLED_ZLIB=OFF -DREGEX_BACKEND=builtin -DUSE_HTTP_PARSER=builtin -DUSE_NTLMCLIENT=OFF -DUSE_GSSAPI=OFF
cm libxml2 -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_ICU=OFF -DLIBXML2_WITH_LZMA=OFF \
  -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_DOCS=OFF
cm libxslt -DLIBXSLT_WITH_PYTHON=OFF -DLIBXSLT_WITH_CRYPTO=OFF -DLIBXSLT_WITH_MODULES=OFF \
  -DLIBXSLT_WITH_PROFILER=OFF -DLIBXSLT_WITH_PROGRAMS=OFF -DLIBXSLT_WITH_TESTS=OFF
cm libzip -DENABLE_BZIP2=OFF -DENABLE_LZMA=OFF -DENABLE_GNUTLS=OFF -DENABLE_MBEDTLS=OFF -DENABLE_OPENSSL=OFF \
  -DENABLE_COMMONCRYPTO=OFF -DENABLE_WINDOWS_CRYPTO=OFF -DBUILD_TOOLS=OFF -DBUILD_REGRESS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_DOC=OFF

if [ ! -f "$P/lib/libsqlite3.a" ]; then
  echo "== $TARGET : sqlite3"
  $CC -O2 -fPIC -DSQLITE_OMIT_LOAD_EXTENSION -c "$SRC/sqlite/sqlite3.c" -o "$W/sqlite3.o"
  $AR rcs "$P/lib/libsqlite3.a" "$W/sqlite3.o"
  cp "$SRC/sqlite/sqlite3.h" "$P/include/"
fi

if [ ! -f "$P/lib/libdivecomputer.a" ]; then
  echo "== $TARGET : libdivecomputer"
  rm -rf "$W/libdc"; cp -r "$SS/libdivecomputer" "$W/libdc"
  (cd "$W/libdc" && autoreconf --install --force >/dev/null 2>&1 &&
   ./configure "${CONFIGURE_HOST_ARGS[@]}" --prefix="$P" --disable-shared --enable-static --with-pic \
     --without-libusb --without-hidapi --without-bluez --disable-examples \
     CC="$CC" AR="$AR" RANLIB="$RANLIB" >"$W/libdc.log" 2>&1 &&
   make -j"$JOBS" >>"$W/libdc.log" 2>&1 && make install >>"$W/libdc.log" 2>&1) ||
    { tail -30 "$W/libdc.log"; exit 1; }
fi
echo "dependencies ready in $P"
