#!/usr/bin/env bash
# Runs every Node measurement, one size after the other (needs the dev stack, proxy.mjs 3100 0 and proxy.mjs 3180 80).
# usage: . build/spike-git/env.sh (credentials) ; tools/spike-git/run-all.sh
cd "$(dirname "$0")"
node build-web.mjs > /dev/null
export CONTENTS_RUNS=3 CONTENTS_RUNS_LAT=1
for n in 300 1000 3000; do
  node driver.mjs $n 3 2>&1 | tail -40
done
