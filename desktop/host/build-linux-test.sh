#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Builds opendives-host on Linux / WSL for tests, from the core objects that
# poc/build.sh leaves in build/poc/obj (system libraries, as the POC build).
# The desktop packages are built elsewhere (native/desktop/CMakeLists.txt).
#
# usage: desktop/host/build-linux-test.sh [output]     (default: build/desktop/opendives-host)
# env:   OPENDIVES_POC_BUILD  the poc/build.sh build directory (default: build/poc; run
#                             poc/build.sh first, or point at another checkout's)
#        OPENDIVES_SUBSURFACE the Subsurface tree (default: third_party/subsurface)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
B=${OPENDIVES_POC_BUILD:-$ROOT/build/poc}
SS=${OPENDIVES_SUBSURFACE:-$ROOT/third_party/subsurface}
OUT=${1:-$ROOT/build/desktop/opendives-host}
COMPAT=$ROOT/core/compat

[ -f "$B/libdc/lib/libdivecomputer.a" ] && [ -f "$B/obj/opendives.o" ] || {
	echo "missing the core objects in $B: run poc/build.sh, or set OPENDIVES_POC_BUILD"
	exit 1
}

# The same flags as poc/build.sh.
FLAGS="-std=c++20 -O1 -w
 -iquote $COMPAT/shadow -I$COMPAT/qtshim -I$COMPAT/gen -I$B/gen
 -I$ROOT -I$SS -I$SS/libdivecomputer/include -I$B/libdc/include
 -include $B/gen/build-defs.h -DBT_SUPPORT -DBLE_SUPPORT
 $(pkg-config --cflags libgit2 libxml-2.0 libxslt libzip sqlite3)"

mkdir -p "$(dirname "$OUT")"
OBJ=$(dirname "$OUT")/host.o
g++ $FLAGS -Wall -Wextra -c "$ROOT/desktop/host/host.cpp" -o "$OBJ"

# The same objects as poc/build.sh links, without the test programs.
OBJS=$(ls "$B"/obj/*.o | grep -Ev '/(roundtrip|facade|cloud|edit_roundtrip|cloud_write|tools_test|plan_test|plan_oracle|account_test|git_remote_test|stats_test|download_test|cylinder_reorder_test|fit_import_test|multi_dive_test|import_formats_test|import_csv_test|save_logbook_test|odgit_test|opendives|edit|tools|settings|plan|filter|account|stats|download|odgit)[.]o$')
FACADE="$B/obj/opendives.o $B/obj/edit.o $B/obj/tools.o $B/obj/settings.o $B/obj/plan.o $B/obj/filter.o $B/obj/account.o $B/obj/stats.o $B/obj/download.o $B/obj/odgit.o"
LIBS="$B/libdc/lib/libdivecomputer.a $(pkg-config --libs libgit2 libxml-2.0 libxslt libzip sqlite3) -lssl -lcrypto -lz -lm -lpthread"
g++ $OBJS $FACADE "$OBJ" -o "$OUT" $LIBS
echo "built $OUT"
