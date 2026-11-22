#!/bin/bash
# Runs the import formats test (tests/import_formats_test.cpp, built by tests/android/build.sh) on the
# emulator: Subsurface's sample files, read by the core as the NDK compiles it, with sqlite, libzip
# and the XSLT stylesheets of the app's own build. Only ever the emulator: every adb command carries
# -s emulator-5554. Nothing is installed; the files go to /data/local/tmp and are removed at the end.
# usage: tests/android/run-import-formats.sh [x86_64]     (the emulator's ABI)
# Exit status: 0 when the test passes on the device. The output goes to
# build/android/tests/<abi>/import_formats_test.log.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ABI=${1:-x86_64}
SERIAL=emulator-5554
DIR=/data/local/tmp/benthic-import-tests

find_adb() {
  if [ -n "${ADB:-}" ]; then echo "$ADB"; return; fi
  if command -v adb >/dev/null 2>&1; then echo adb; return; fi
  for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" /mnt/c/Users/*/AppData/Local/Android/Sdk; do
    for n in adb adb.exe; do [ -n "$d" ] && [ -x "$d/platform-tools/$n" ] && { echo "$d/platform-tools/$n"; return; }; done
  done
  return 1
}
ADB=$(find_adb) || { echo "adb not found: set ADB"; exit 2; }
adb() { "$ADB" -s "$SERIAL" "$@"; }

state=$("$ADB" devices | tr -d '\r' | awk -v s="$SERIAL" '$1 == s { print $2 }')
[ "$state" = device ] || { echo "the emulator $SERIAL is not running"; exit 2; }
device_abi=$(adb shell getprop ro.product.cpu.abi | tr -d '\r')
[ "$device_abi" = "$ABI" ] || { echo "the emulator runs $device_abi, not $ABI"; exit 2; }
echo "device: $(adb shell getprop ro.product.model | tr -d '\r'), $device_abi, Android $(adb shell getprop ro.build.version.release | tr -d '\r')"

B=$ROOT/build/android/tests/$ABI
[ -f "$B/import_formats_test" ] || { echo "missing $B/import_formats_test: run tests/android/build.sh $ABI"; exit 2; }
winpath() { case "$ADB" in *.exe) wslpath -w "$1" ;; *) echo "$1" ;; esac; }
adb shell "rm -rf $DIR && mkdir -p $DIR/work" >/dev/null
adb push "$(winpath "$B/import_formats_test")" "$DIR/import_formats_test" >/dev/null 2>&1
adb push "$(winpath "$ROOT/third_party/subsurface/dives")" "$DIR/dives" >/dev/null 2>&1
adb push "$(winpath "$ROOT/third_party/subsurface/xslt")" "$DIR/xslt" >/dev/null 2>&1
adb shell "chmod 755 $DIR/import_formats_test"

adb shell "cd $DIR && ./import_formats_test $DIR/dives $DIR/work $DIR/xslt 2>/dev/null; echo EXIT=\$?" | tr -d '\r' > "$B/import_formats_test.log"
code=$(sed -n 's/^EXIT=//p' "$B/import_formats_test.log" | tail -1)
echo "import_formats_test on the emulator ($ABI): exit ${code:-?}, $(grep -c '^ok' "$B/import_formats_test.log") ok, $(grep -c '^FAIL' "$B/import_formats_test.log") failed"
[ "${code:-1}" = 0 ] || grep -E '^FAIL' "$B/import_formats_test.log" | head -20
adb shell "rm -rf $DIR" >/dev/null
[ "${code:-1}" = 0 ]
