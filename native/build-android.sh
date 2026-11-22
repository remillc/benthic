#!/bin/bash
# Builds libbenthic.so for Android and prepares what Gradle bundles:
#   build/android/jniLibs/<abi>/libbenthic.so
#   build/android/assets/SampleDivesV2.ssrf
#   build/android/assets/xslt/ (Subsurface's stylesheets)
# usage: native/build-android.sh [abi...]     (default: arm64-v8a x86_64)
set -euo pipefail
source "$(dirname "$0")/env.sh"
ABIS=${*:-$ALL_ABIS}
[ -f "$TOOLCHAIN_FILE" ] || { echo "NDK not found: run native/install-ndk.sh"; exit 1; }
"$ROOT/native/build-deps.sh" $ABIS

for ABI in $ABIS; do
  echo "== $ABI : libbenthic"
  B=$OUT/core/$ABI
  cmake -S "$ROOT/native" -B "$B" -G Ninja -Wno-dev \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN_FILE" -DANDROID_ABI="$ABI" -DANDROID_PLATFORM="android-$ANDROID_API" \
    -DANDROID_STL=c++_static -DCMAKE_BUILD_TYPE=Release -DDEPS="$OUT/deps/$ABI" >/dev/null
  cmake --build "$B" -j"$JOBS"
  mkdir -p "$OUT/jniLibs/$ABI"
  "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip" --strip-unneeded \
    -o "$OUT/jniLibs/$ABI/libbenthic.so" "$B/libbenthic.so"
done

mkdir -p "$OUT/assets"
cp "$(dirname "$0")/../core/sample/SampleLogbook.ssrf" "$OUT/assets/SampleDivesV2.ssrf"
# Subsurface's XSLT stylesheets (exports, CSV imports), copied to the app's
# files at start (set_xslt_dir).
rm -rf "$OUT/assets/xslt"
mkdir -p "$OUT/assets/xslt"
cp "$SS"/xslt/*.xsl* "$OUT/assets/xslt/"
ls -l "$OUT"/jniLibs/*/libbenthic.so
