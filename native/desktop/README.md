# Desktop build of the core

Builds Subsurface's core (unmodified) + `core/compat` + the façade `core/libopendives` as a
static library `opendives_core`, with the test programs `roundtrip` and `facade` (and
`opendives-host` when `desktop/host/` exists). Mbed TLS is the TLS library on every target.

Targets: `linux-x64`, `win-x64` (cross-compiled from Linux or WSL with llvm-mingw, UCRT,
C++ runtime linked statically), `mac-arm64` and `mac-x64` (native clang on macOS).

## Build

Needs: cmake, ninja, autoconf, automake, libtool, pkg-config, curl, git, a C/C++ compiler.

```sh
git submodule update --init third_party/subsurface
git -C third_party/subsurface submodule update --init libdivecomputer
TARGET=win-x64 native/desktop/install-llvm-mingw.sh   # once, win-x64 only: installs under ~
native/desktop/build.sh linux-x64                      # or win-x64, mac-arm64, mac-x64
```

Output goes to `build/desktop/<target>/`: `deps/` (static dependencies), `lib/libopendives_core.a`,
`bin/` (programs; `.exe` on Windows). `native/desktop/build-deps.sh` alone builds the dependencies.
Dependency sources are cached in `build/desktop/src/`. `SS=<path>` overrides the Subsurface checkout.

## Proof

```sh
tests/run-roundtrip.sh build/desktop/linux-x64/bin/roundtrip build/rt \
  third_party/subsurface/dives/*.xml third_party/subsurface/dives/*.ssrf
```

Expected: `passed: 98  failed: 0`. On Windows the same script runs the `.exe` through WSL interop.

## Notes

- Windows uses Subsurface's `core/windows.cpp` instead of `core/unix.cpp` (chosen in CMake).
- `core/compat/https_mbedtls.cpp` has a Winsock branch. Mbed TLS has no system certificate
  store: the application passes a PEM file with `opendives_https_set_ca_file()` on every target.
- CI: `.github/workflows/desktop.yml`, manual only.
