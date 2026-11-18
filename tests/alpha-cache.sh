#!/bin/bash
# The previous version's cloud cache (alpha_cache_list / alpha_cache_open), without any personal data: a fixture
# cache is built from a Subsurface sample with the core's roundtrip tool, under a fake
# $HOME/.subsurface/cloudstorage/<hash>, with the account's e-mail as the branch (the alpha's cloud layout).
# Checks detection, the branch read from the repository, the dive count, the read-only open (the cache is
# byte-identical before and after), that the opened log has no address (it cannot be saved over the cache) and
# that a folder name cannot leave the cache.
#
# usage: alpha-cache.sh <build/poc dir> <workdir> [sample]
B=$1; W=$2; S=${3:-third_party/subsurface/dives/SampleDivesV2.ssrf}
pass=0; fail=0
ok() { pass=$((pass+1)); echo "PASS $1"; }
ko() { fail=$((fail+1)); echo "FAIL $1"; }
sum() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1); }

rm -rf "$W"; mkdir -p "$W/home/.subsurface/cloudstorage" "$W/ref"
export HOME="$W/home"
BRANCH='diver@example.org'
CACHE="$HOME/.subsurface/cloudstorage"
git init -q -b "$BRANCH" "$CACHE/6f1c2e9a"
"$B/roundtrip" "$S" "$CACHE/6f1c2e9a[$BRANCH]" 2>/dev/null || { echo "FAIL fixture"; exit 1; }
git init -q -b main "$W/ref/r"
EXPECT=$("$B/facade" import "$S" "$W/ref/r[main]" 2>/dev/null | tail -1)
[ "$EXPECT" -gt 0 ] && ok "fixture has $EXPECT dives" || ko "fixture has no dive"

# A second cache folder (another account), a stray file and an unrelated folder.
git init -q -b other@example.org "$CACHE/aa00bb11"
"$B/roundtrip" "$S" "$CACHE/aa00bb11[other@example.org]" 2>/dev/null
mkdir "$CACHE/notarepo"; echo x > "$CACHE/file.txt"

BEFORE=$(sum "$CACHE")
LIST=$("$B/facade" alpha-list)
echo "$LIST" | grep -q '"id":"6f1c2e9a","branch":"diver@example.org"' && ok "folder and branch read from the repository" || ko "folder or branch: $LIST"
echo "$LIST" | grep -q '"id":"aa00bb11","branch":"other@example.org"' && ok "second folder listed" || ko "second folder: $LIST"
echo "$LIST" | grep -q 'notarepo' && ko "a folder without a repository is listed" || ok "folder without a repository left out"
[ "$(echo "$LIST" | grep -o '"dives":[0-9]*' | head -1)" = "\"dives\":$EXPECT" ] && ok "dive count in the list" || ko "dive count: $LIST"
echo "$LIST" | grep -Eq '"bytes":[1-9][0-9]*,"modified":[1-9][0-9]*' && ok "size and date" || ko "size or date: $LIST"

OUT=$("$B/facade" alpha-open 6f1c2e9a 2>/dev/null)
[ "$OUT" = "dives=$EXPECT address=[]" ] && ok "open: $OUT" || ko "open: $OUT"
"$B/facade" alpha-open '../6f1c2e9a' >/dev/null 2>&1 && ko "a path is accepted as a folder name" || ok "a path is refused"
"$B/facade" alpha-open 'notarepo' >/dev/null 2>&1 && ko "a folder without a repository opens" || ok "a folder without a repository is refused"
"$B/facade" alpha-open 'nothere' >/dev/null 2>&1 && ko "a missing folder opens" || ok "a missing folder is refused"
[ "$(sum "$CACHE")" = "$BEFORE" ] && ok "the cache is byte-identical after listing and opening" || ko "the cache changed"

rm -rf "$HOME/.subsurface"
[ "$("$B/facade" alpha-list)" = "[]" ] && ok "no cache: empty list" || ko "no cache"
echo "passed: $pass  failed: $fail"
[ $fail = 0 ]
