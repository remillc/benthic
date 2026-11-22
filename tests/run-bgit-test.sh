#!/bin/bash
# The git calls of the facade (core/libbenthic/bgit.h) against a local git http server (tests/bgit_server.py):
# clone of an empty repository, commit, push, a second device, fast-forward, a clean merge, a conflict and its
# resolution, a wrong token, an http address refused. usage: tests/run-bgit-test.sh [build/poc/bgit-test]
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN=${1:-$ROOT/build/poc/bgit-test}
W=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf "$W"' EXIT
mkdir -p "$W/srv/owner"; git init -q --bare -b main "$W/srv/owner/repo.git"
python3 "$ROOT/tests/bgit_server.py" "$W/srv" tok > "$W/port" & SRV=$!
for _ in $(seq 50); do grep -q PORT "$W/port" && break; sleep 0.1; done
URL=http://127.0.0.1:$(awk '{print $2}' "$W/port")/owner/repo.git
T() { "$BIN" --http "$@" 2>/dev/null; }
pass=0; fail=0
ok() { if [ "$1" = 0 ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2"; fi; }
has() { case "$1" in *"$2"*) return 0;; esac; return 1; }
srv() { git -C "$W/srv/owner/repo.git" show "main:$1" 2>/dev/null; }

has "$("$BIN" clone "$URL" "$W/x" main u tok 2>/dev/null)" "BAD_ADDRESS"; ok $? "http refused without the switch"
has "$(T clone "$URL" "$W/x" main u wrong)" "ERROR REFUSED"; ok $? "wrong token refused"
[ ! -e "$W/x" ]; ok $? "failed clone leaves no folder"
has "$(T clone "$URL" "$W/a" main u tok)" '"result":"empty"'; ok $? "empty repository gives an empty working copy"
has "$(T clone "$URL" "$W/a" main u tok)" "ERROR EXISTS"; ok $? "clone onto a working copy refused"
mkdir -p "$W/a/dives"; echo '{"a":1}' > "$W/a/dives/one.json"; echo '{"b":1}' > "$W/a/other.json"
has "$(T status "$W/a")" '"state":"new"'; ok $? "status lists new files"
r=$(T commit "$W/a" "First" - dives/one.json other.json); has "$r" '"commit":"'; ok $? "commit"
has "$(T commit "$W/a" "Again" - dives/one.json)" '"commit":null'; ok $? "nothing to commit gives null"
has "$(T commit "$W/a" "x" - ../evil)" "BAD_PATH"; ok $? "path outside refused"
has "$(T unpushed "$W/a" main)" '"ahead":1'; ok $? "one commit not pushed"
has "$(T push "$W/a" main u tok)" '"result":"pushed"'; ok $? "push"
[ "$(srv dives/one.json)" = '{"a":1}' ]; ok $? "the server has the file"
has "$(T unpushed "$W/a" main)" '"ahead":0'; ok $? "nothing left to push"
has "$(T list "$W/a" dives/)" 'dives/one.json'; ok $? "list files"

has "$(T clone "$URL" "$W/b" main u tok)" '"result":"cloned"'; ok $? "clone"
[ "$(cat "$W/b/dives/one.json")" = '{"a":1}' ]; ok $? "cloned content"
has "$(T pull "$W/b" main u tok)" '"result":"upToDate"'; ok $? "pull up to date"
[ -z "$(T status "$W/b" | grep -o '"path"')" ]; ok $? "status clean after clone"

# a: edits other.json; b: edits dives/one.json -> clean merge
echo '{"b":2}' > "$W/a/other.json"; T commit "$W/a" "A edit" - other.json >/dev/null; T push "$W/a" main u tok >/dev/null
has "$(T pull "$W/b" main u tok)" '"result":"fastForward"'; ok $? "pull fast-forward"
[ "$(cat "$W/b/other.json")" = '{"b":2}' ]; ok $? "fast-forward updated the file"
echo '{"a":2}' > "$W/b/dives/one.json"; T commit "$W/b" "B edit" - dives/one.json >/dev/null
echo '{"b":3}' > "$W/a/other.json"; T commit "$W/a" "A edit 2" - other.json >/dev/null; T push "$W/a" main u tok >/dev/null
has "$(T push "$W/b" main u tok)" "ERROR REJECTED"; ok $? "push behind is rejected"
has "$(T pull "$W/b" main u tok)" '"result":"merged"'; ok $? "pull merges"
[ "$(cat "$W/b/other.json")" = '{"b":3}' ] && [ "$(cat "$W/b/dives/one.json")" = '{"a":2}' ]; ok $? "merge keeps both sides"
has "$(T push "$W/b" main u tok)" '"result":"pushed"'; ok $? "push the merge"
[ "$(git -C "$W/srv/owner/repo.git" rev-list --parents -n1 main | wc -w)" = 3 ]; ok $? "merge commit has two parents"

# conflict on the same line
T pull "$W/a" main u tok >/dev/null
echo '{"a":"fromA"}' > "$W/a/dives/one.json"; T commit "$W/a" "A conflict" - dives/one.json >/dev/null; T push "$W/a" main u tok >/dev/null
echo '{"a":"fromB"}' > "$W/b/dives/one.json"; T commit "$W/b" "B conflict" - dives/one.json >/dev/null
r=$(T pull "$W/b" main u tok)
has "$r" '"result":"conflict"' && has "$r" '"path":"dives/one.json"' && has "$r" 'fromA' && has "$r" 'fromB'; ok $? "conflict lists the file with the sides"
[ "$(cat "$W/b/dives/one.json")" = '{"a":"fromB"}' ]; ok $? "conflict leaves the working copy alone"
theirs=$(echo "$r" | sed -E 's/.*"theirs":"([0-9a-f]{40})","files".*/\1/')
echo '{"a":"resolved"}' > "$W/b/dives/one.json"
has "$(T commit "$W/b" "Resolve" "$theirs" dives/one.json)" '"commit":"'; ok $? "commit of the resolution"
has "$(T push "$W/b" main u tok)" '"result":"pushed"'; ok $? "push the resolution"
[ "$(srv dives/one.json)" = '{"a":"resolved"}' ]; ok $? "the server has the resolution"
has "$(T pull "$W/a" main u tok)" '"result":"fastForward"'; ok $? "the other device fast-forwards to it"

# a deleted file
rm "$W/a/other.json"; has "$(T status "$W/a")" '"state":"deleted"'; ok $? "status lists deleted files"
T commit "$W/a" "Delete" - other.json >/dev/null; T push "$W/a" main u tok >/dev/null
[ -z "$(srv other.json)" ]; ok $? "deletion reaches the server"

# many files
mkdir -p "$W/a/many"; for i in $(seq 300); do echo "{\"n\":$i}" > "$W/a/many/$i.json"; done
T commit "$W/a" "Many" - $(cd "$W/a" && ls many/*.json) >/dev/null; has "$(T push "$W/a" main u tok)" '"result":"pushed"'; ok $? "push 300 files"
has "$(T clone "$URL" "$W/c" main u tok)" '"result":"cloned"'; [ "$(ls "$W/c/many" | wc -l)" = 300 ]; ok $? "clone 300 files"

# history (task 290): a repository in Subsurface's git format with three versions
H=$W/hist; git init -q -b main "$H"; git -C "$H" config user.email t@t; git -C "$H" config user.name T
mk() { mkdir -p "$H/$(dirname "$1")"; printf '%s
' "$2" > "$H/$1"; }
mk 00-Subsurface "version 3"; mk 01-Divesites/Site-0000aaaa "name Alpha"; mk 01-Divesites/Site-0000bbbb "name Beta"
mk 2022/04/24-Sun-10=30=00/Dive-1 "duration 50:00 min"; mk 2022/04/24-Sun-10=30=00/Divecomputer "model A"
mk 2022/05/01-Sun-09=00=00/Dive-2 "duration 40:00 min"
git -C "$H" add -A; git -C "$H" commit -q -m "v1" --date="2026-11-01T10:00:00"; V1=$(git -C "$H" rev-parse HEAD)
mk 2022/05/08-Sun-09=00=00/Dive-3 "duration 41:00 min"; mk 2022/04/24-Sun-10=30=00/Dive-1 "duration 51:00 min buddy Michael"
git -C "$H" add -A; git -C "$H" commit -q -m "v2" --date="2026-11-02T10:00:00"; V2=$(git -C "$H" rev-parse HEAD)
git -C "$H" rm -q -r 2022/05/01-Sun-09=00=00; mk 2022/05/15-Sun-09=00=00/Dive-4 "duration 42:00 min"
git -C "$H" add -A; git -C "$H" commit -q -m "v3" --date="2026-11-03T10:00:00"; V3=$(git -C "$H" rev-parse HEAD)
r=$(T hlog "$H" main 0 10 0); has "$r" "\"summary\":\"v3\"" && has "$r" "\"summary\":\"v1\"" && has "$r" '"more":false'; ok $? "history: the commits, newest first"
[ "$(T hlog "$H" main 0 2 0 | grep -o '"more":true')" = '"more":true' ]; ok $? "history: more commits than the page"
has "$(T hlog "$H" main 2 5 0)" "\"summary\":\"v1\""; ok $? "history: skip"
r=$(T hlog "$H" main 0 1 1); has "$r" '"state":"deleted"' && has "$r" '"state":"new"'; ok $? "history: changes of a commit"
has "$(T hlog "$H" main 2 1 1)" '"state":"new","path"' || has "$(T hlog "$H" main 2 1 1)" '"state":"new"'; ok $? "history: the first commit adds everything"
r=$(T hstats "$H" $V1 $V2 $V3); has "$r" "\"id\":\"$V1\",\"dives\":2,\"sites\":2,\"pieces\":null" && has "$r" "\"id\":\"$V2\",\"dives\":3" && has "$r" "\"id\":\"$V3\",\"dives\":3"; ok $? "history: counts of dives and sites per version"
r=$(T hdiff "$H" $V1 $V3); has "$r" '2022/05/01-Sun-09=00=00/Dive-2","state":"deleted"' && has "$r" '"state":"modified"'; ok $? "history: difference between two versions"
has "$(T hread "$H" $V1 2022/04/24-Sun-10=30=00/Dive-1)" '"text":"duration 50:00 min\n"'; ok $? "history: a file as of a commit"
has "$(T hread "$H" $V1 2022/05/08-Sun-09=00=00/Dive-3)" '"text":null'; ok $? "history: absent file reads null"
has "$(T hfiles "$H" $V3 2022/05/)" '2022/05/15-Sun-09=00=00/Dive-4'; ok $? "history: files of a commit under a prefix"
# restore one dive that was deleted (path), as a new commit; nothing else moves
r=$(T hrestore "$H" main $V1 "Restore dive" 2022/05/01-Sun-09=00=00); has "$r" '"commit":"'; ok $? "history: restore a deleted dive"
[ -f "$H/2022/05/01-Sun-09=00=00/Dive-2" ] && [ -f "$H/2022/05/15-Sun-09=00=00/Dive-4" ]; ok $? "history: the restored dive is back, the others stay"
[ "$(git -C "$H" rev-list --count main)" = 4 ] && [ "$(git -C "$H" log -1 --format=%s)" = "Restore dive" ]; ok $? "history: a restore adds a commit"
git -C "$H" cat-file -e $V3 2>/dev/null; ok $? "history: the version it started from is still there"
# restore the whole first version, then the newest again
V4=$(git -C "$H" rev-parse HEAD)
has "$(T hrestore "$H" main $V1 "Restore all")" '"commit":"'; ok $? "history: restore a whole version"
[ ! -e "$H/2022/05/15-Sun-09=00=00" ] && [ ! -e "$H/2022/05/08-Sun-09=00=00" ] && [ "$(cat "$H/2022/04/24-Sun-10=30=00/Dive-1")" = "duration 50:00 min" ]; ok $? "history: the working copy follows the restore"
[ -z "$(git -C "$H" status --porcelain)" ]; ok $? "history: the working copy is clean after a restore"
has "$(T hrestore "$H" main $V4 "Back to the newest")" '"commit":"'; ok $? "history: the newest version restores back"
[ -f "$H/2022/05/15-Sun-09=00=00/Dive-4" ] && [ "$(git -C "$H" rev-list --count main)" = 6 ]; ok $? "history: the newest is back and nothing was rewritten"
has "$(T hrestore "$H" main $V4 "Same")" '"commit":null'; ok $? "history: restoring what is current adds nothing"
has "$(T hrestore "$H" main 0000000000000000000000000000000000000000 "x")" "UNKNOWN_COMMIT"; ok $? "history: unknown commit refused"
has "$(T hrestore "$H" main $V1 "x" ../evil)" "BAD_PATH"; ok $? "history: path outside refused"
# read-only borrow: a reader opens the version with nothing copied
has "$(T hborrow "$H" $V2 "$W/borrow")" '"branch":"v"'; ok $? "history: borrow a version"
[ "$(git -C "$W/borrow" rev-parse v)" = "$V2" ] && [ "$(git -C "$W/borrow" show v:2022/05/08-Sun-09=00=00/Dive-3)" = "duration 41:00 min" ]; ok $? "history: the borrowed branch reads the old objects"
# a bare cache, as the core keeps its own
git clone -q --bare "$H" "$W/bare.git"
has "$(T hrestore "$W/bare.git" main $V1 "Restore in a bare cache")" '"commit":"'; ok $? "history: restore in a bare repository"

# the device's own logbook from before the account: its history joins the account's, nothing is sent anywhere
A=$W/account; git init -q -b main "$A"; git -C "$A" config user.email t@t; git -C "$A" config user.name T
mkdir -p "$A/2022/05/15-Sun-09=00=00"; echo "duration 42:00 min" > "$A/2022/05/15-Sun-09=00=00/Dive-4"
git -C "$A" add -A; git -C "$A" commit -q -m "account v1" --date="2026-11-10T10:00:00"
D=$W/device; git init -q -b main "$D"; git -C "$D" config user.email t@t; git -C "$D" config user.name T
mkdir -p "$D/2022/05/01-Sun-09=00=00" "$D/2022/05/15-Sun-09=00=00"
echo "duration 40:00 min" > "$D/2022/05/01-Sun-09=00=00/Dive-2"; echo "duration 42:00 min" > "$D/2022/05/15-Sun-09=00=00/Dive-4"
git -C "$D" add -A; git -C "$D" commit -q -m "device v1" --date="2026-11-04T10:00:00"; DV1=$(git -C "$D" rev-parse HEAD)
git -C "$D" rm -q -r 2022/05/01-Sun-09=00=00; git -C "$D" commit -q -m "device delete" --date="2026-11-05T10:00:00"
DV2=$(git -C "$D" rev-parse HEAD)
r=$(T hadopt "$A" "$D" main); has "$r" '"result":"adopted"' && has "$r" "\"head\":\"$DV2\""; ok $? "adopt: the device history comes in"
[ "$(git -C "$A" rev-parse main)" != "$DV2" ] && [ "$(git -C "$A" symbolic-ref --short HEAD)" = main ]; ok $? "adopt: the account's branch is left alone"
r=$(T hlog "$A" main 0 10 0); has "$r" '"summary":"account v1"' && has "$r" '"summary":"device delete"' && has "$r" '"summary":"device v1"'; ok $? "adopt: the log lists both histories"
[ "$(T hlog "$A" main 0 10 0 | grep -o '"id":"[0-9a-f]*"' | head -1)" = "\"id\":\"$(git -C "$A" rev-parse main)\"" ]; ok $? "adopt: the account's own commit is the newest"
has "$(T hadopt "$A" "$D" main)" '"result":"unchanged"'; ok $? "adopt: the same head twice does nothing"
echo "duration 43:00 min" > "$D/2022/05/15-Sun-09=00=00/Dive-4"; git -C "$D" commit -q -a -m "device later" --date="2026-11-06T10:00:00"
has "$(T hadopt "$A" "$D" main)" '"result":"adopted"'; ok $? "adopt: a later head is brought in too"
git -C "$A" cat-file -e $DV2 2>/dev/null && [ "$(git -C "$A" for-each-ref refs/benthic/device | wc -l)" = 2 ]; ok $? "adopt: each head keeps its own reference"
r=$(T hrestore "$A" main $DV1 "Restore a device dive" 2022/05/01-Sun-09=00=00); has "$r" '"commit":"'; ok $? "adopt: a dive deleted before the account is restored from it"
[ "$(git -C "$A" show main:2022/05/01-Sun-09=00=00/Dive-2)" = "duration 40:00 min" ]; ok $? "adopt: the restored dive has its content"
has "$(T hadopt "$A" "$W/nothing-here" main)" '"result":"none"'; ok $? "adopt: no device logbook is not an error"
has "$(T hadopt "$A" "$D" nobranch)" '"result":"none"'; ok $? "adopt: a branch the device logbook does not have is not an error"
git clone -q --bare "$A" "$W/account-bare.git"
has "$(T hadopt "$W/account-bare.git" "$D" main)" '"result":"adopted"'; ok $? "adopt: into a bare cache"

# a working copy made before the rename to Benthic keeps the device history under refs/opendives/device/: opening it
# renames the references, once, and the history is still listed
for ref in $(git -C "$A" for-each-ref --format='%(refname)' refs/benthic/device); do
  git -C "$A" update-ref "refs/opendives/device/${ref##*/}" "$ref"; git -C "$A" update-ref -d "$ref"
done
[ "$(git -C "$A" for-each-ref refs/opendives/device | wc -l)" = 2 ] && [ "$(git -C "$A" for-each-ref refs/benthic/device | wc -l)" = 0 ]; ok $? "legacy refs: the old names are in place"
r=$(T hlog "$A" main 0 10 0); has "$r" '"summary":"device v1"'; ok $? "legacy refs: the log still lists the device history"
[ "$(git -C "$A" for-each-ref refs/benthic/device | wc -l)" = 2 ] && [ "$(git -C "$A" for-each-ref refs/opendives/device | wc -l)" = 0 ]; ok $? "legacy refs: opening renamed them to refs/benthic/device/"
git -C "$A" cat-file -e $DV2 2>/dev/null; ok $? "legacy refs: the commits are still there"

echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
