#!/bin/bash
# The git calls of the facade (core/libopendives/odgit.h) against a local git http server (tests/odgit_server.py):
# clone of an empty repository, commit, push, a second device, fast-forward, a clean merge, a conflict and its
# resolution, a wrong token, an http address refused. usage: tests/run-odgit-test.sh [build/poc/odgit-test]
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN=${1:-$ROOT/build/poc/odgit-test}
W=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf "$W"' EXIT
mkdir -p "$W/srv/owner"; git init -q --bare -b main "$W/srv/owner/repo.git"
python3 "$ROOT/tests/odgit_server.py" "$W/srv" tok > "$W/port" & SRV=$!
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

echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
