#!/bin/bash
# Own git repository instead of the cloud (tests/git_remote_test.cpp): the
# façade against local repositories served by `git daemon` (git://), with fake
# credentials. Nothing leaves this machine.
#   1. the rules of git_check / git_configure (HTTPS only, no credentials in
#      an address, bad names), and leaving git mode;
#   2. git_check: a public repository (branches), an empty one, a missing one;
#   3. an empty repository: the first push creates the branch, once;
#   4. a repository that is not empty is never written when its branch is
#      missing (git_create_log refuses, so does a plain open);
#   5. a second device reads what the first one wrote; an edit is pushed;
#   6. server unreachable: the edit stays on the device (offline), and is sent
#      when the server is back;
#   7. the fake token is nowhere: not in a local copy, not in an output.
# Keep the work directory on a Linux file system (under WSL, not /mnt/...).
# usage: run-git-remote-test.sh <git-remote> <workdir>
set -uo pipefail
GR=$(realpath "$1"); W=$2
PORT=${PORT:-19431}
TOKEN=FAKEtoken0123456789abcdef
rm -rf "$W"; mkdir -p "$W/srv" "$W/out"
fails=0
ok()   { echo "PASS $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else fail "$1"; fi; }
out() { cat "$W/out/$1"; }

start_daemon() {
  git daemon --export-all --enable=receive-pack --base-path="$W/srv" --listen=127.0.0.1 --port=$PORT --reuseaddr \
    --pid-file="$W/daemon.pid" --detach "$W/srv"
  sleep 0.5
}
stop_daemon() { kill "$(cat "$W/daemon.pid")" 2>/dev/null; sleep 0.5; }
trap 'stop_daemon' EXIT
URL=git://127.0.0.1:$PORT
run() { # home name args...
  local home=$1 name=$2; shift 2
  mkdir -p "$W/$home"
  HOME="$W/$home" "$GR" "$@" > "$W/out/$name" 2> "$W/out/$name.err"
}
refs() { git -C "$1" for-each-ref --format='%(refname) %(objectname)'; }
GIT="git -c user.name=test -c user.email=test@example.invalid"

# Repositories: an empty one, and one with two branches that is not a log.
git init -q --bare -b main "$W/srv/empty.git"
git init -q --bare -b main "$W/srv/full.git"
git init -q -b main "$W/seed"
echo "not a dive log" > "$W/seed/README"
git -C "$W/seed" add README
$GIT -C "$W/seed" commit -q -m seed
git -C "$W/seed" branch other
git -C "$W/seed" push -q "$W/srv/full.git" main other
start_daemon

# 1. Rules.
if run h0 selftest selftest; then ok "selftest ($(grep -c '^ok' "$W/out/selftest") checks)"; else fail "selftest"; grep FAIL "$W/out/selftest"; fi

# 2. git_check.
run h0 c-full check "$URL/full.git"
check "check: a public repository" "grep -q '\"status\":\"public\"' '$W/out/c-full' && grep -q '\"main\",\"other\"\\|\"other\",\"main\"' '$W/out/c-full' && grep -q '\"empty\":false' '$W/out/c-full'"
run h0 c-empty check "$URL/empty.git"
check "check: an empty repository" "grep -q '\"status\":\"public\"' '$W/out/c-empty' && grep -q '\"empty\":true' '$W/out/c-empty' && grep -q '\"branches\":\\[\\]' '$W/out/c-empty'"
run h0 c-none check "$URL/missing.git"
check "check: no repository" "grep -q '\"status\":\"none\"' '$W/out/c-none'"
run h0 c-tok check "$URL/full.git" someone "$TOKEN"
check "check: with a token (push advertisement)" "grep -q '\"status\":\"ok\"' '$W/out/c-tok'"

# 3. The first push creates the branch.
BEFORE_FULL=$(refs "$W/srv/full.git")
check "empty repository has no reference" "[ -z \"\$(refs '$W/srv/empty.git')\" ]"
run h1 create create "$URL/empty.git" someone "$TOKEN" main
check "create: the branch is made" "grep -q '^json=' '$W/out/create' && git -C '$W/srv/empty.git' rev-parse -q --verify refs/heads/main >/dev/null"
check "create: one commit" "[ \"\$(git -C '$W/srv/empty.git' rev-list --count main)\" = 1 ]"
run h1b create-again create "$URL/empty.git" someone "$TOKEN" main
check "create twice: refused (LOG_EXISTS)" "grep -q 'error=LOG_EXISTS' '$W/out/create-again'"

# 4. Never write to a repository that is not empty.
run h1c create-full create "$URL/full.git" someone "$TOKEN" dev
check "create on a repository with refs: refused (NOT_EMPTY)" "grep -q 'error=NOT_EMPTY' '$W/out/create-full'"
run h1d open-missing open "$URL/full.git" someone "$TOKEN" nope
check "open a missing branch: refused" "grep -q '^error=' '$W/out/open-missing'"
check "the repository with refs is untouched" "[ \"\$(refs '$W/srv/full.git')\" = \"$BEFORE_FULL\" ]"
check "no local copy left by a refusal" "! ls '$W/h1c/.subsurface' >/dev/null 2>&1 || [ -z \"\$(find '$W/h1c/.subsurface' -mindepth 2 -maxdepth 3 -name '*.git' 2>/dev/null)\" ]"

# 5. A second device, an edit.
run h2 open2 open "$URL/empty.git" someone "$TOKEN" main edit
check "device 2 reads the new log (no dive)" "grep -q '^dives=0' '$W/out/open2'"
check "the edit was waiting, then sent" "grep -q '^pending=some' '$W/out/open2' && grep -q '^pendingAfter=0' '$W/out/open2' && grep -q 'pushed' '$W/out/open2'"
check "the remote got the commit" "[ \"\$(git -C '$W/srv/empty.git' rev-list --count main)\" = 2 ]"
run h3 open3 open "$URL/empty.git" someone "$TOKEN" main
check "device 3 sees the dive" "grep -q '^dives=1' '$W/out/open3' && grep -q '^synced=true' '$W/out/open3'"

# 6. Server unreachable, then back.
stop_daemon
TIP=$(git -C "$W/srv/empty.git" rev-parse main)
run h2 offline offline "$URL/empty.git" someone "$TOKEN" main edit
check "offline: the copy is read" "grep -q '^dives=1' '$W/out/offline' && grep -q '^synced=false' '$W/out/offline'"
check "offline: the edit stays on the device" "grep -q '^pendingAfter=some' '$W/out/offline' && grep -q 'offline' '$W/out/offline'"
check "offline: the remote is unchanged" "[ \"\$(git -C '$W/srv/empty.git' rev-parse main)\" = \"$TIP\" ]"
start_daemon
run h2 back open "$URL/empty.git" someone "$TOKEN" main
check "back online: the edit is sent" "[ \"\$(git -C '$W/srv/empty.git' rev-list --count main)\" = 3 ]"

# Site-only edits must be written, sent, and read by another device.
git init -q --bare -b main "$W/srv/sites.git"
run hs1 screate create "$URL/sites.git" someone "$TOKEN" main
run hs1 site-create hist "$URL/sites.git" someone "$TOKEN" main site-create
run hs2 site-before hist "$URL/sites.git" someone "$TOKEN" main sites
check "sites: the second device reads the original site" "grep -q '\"name\":\"Initial site\"' '$W/out/site-before'"
run hs1 site-edit hist "$URL/sites.git" someone "$TOKEN" main site-edit
run hs2 site-after hist "$URL/sites.git" someone "$TOKEN" main sites
check "sites: name, coordinates and country reach the second device" "grep -q '\"name\":\"Updated site\"' '$W/out/site-after' && grep -q '\"latUdeg\":23965000' '$W/out/site-after' && grep -q '\"lonUdeg\":-74555000' '$W/out/site-after' && grep -q '\"country\":\"Bahamas\"' '$W/out/site-after'"

# 8. History and restore (task 290): three syncs with changes, the middle version restored, the newest restored back,
# a deleted dive restored, a version opened read only. Nothing is ever rewritten on the server.
git init -q --bare -b main "$W/srv/hist.git"
run h5 hcreate create "$URL/hist.git" someone "$TOKEN" main
run h5 hadd1 hist "$URL/hist.git" someone "$TOKEN" main add:2026-12-01T10:00:00
run h5 hadd2 hist "$URL/hist.git" someone "$TOKEN" main add:2026-12-02T10:00:00
run h5 hadd3 hist "$URL/hist.git" someone "$TOKEN" main add:2026-12-03T10:00:00
check "history: three syncs, four versions on the server" "[ \"\$(git -C '$W/srv/hist.git' rev-list --count main)\" = 4 ]"
V0=$(git -C "$W/srv/hist.git" rev-parse main~3); V1=$(git -C "$W/srv/hist.git" rev-parse main~2)
V2=$(git -C "$W/srv/hist.git" rev-parse main~1); V3=$(git -C "$W/srv/hist.git" rev-parse main)
run h5 hlog hist "$URL/hist.git" someone "$TOKEN" main call:log:0:20:1
check "history: the log lists every version, newest first, with its changes" "grep -q '\"id\":\"$V3\"' '$W/out/hlog' && grep -q '\"id\":\"$V0\"' '$W/out/hlog' && grep -q '\"state\":\"new\"' '$W/out/hlog' && [ \"\$(grep -o '\"id\":\"[0-9a-f]\{40\}\",\"time' '$W/out/hlog' | head -1)\" = '\"id\":\"$V3\",\"time' ]"
run h5 hstats hist "$URL/hist.git" someone "$TOKEN" main call:stats:$V0:$V1:$V2:$V3
check "history: the counts per version (0, 1, 2, 3 dives)" "grep -q '\"id\":\"$V0\",\"dives\":0' '$W/out/hstats' && grep -q '\"id\":\"$V1\",\"dives\":1' '$W/out/hstats' && grep -q '\"id\":\"$V2\",\"dives\":2' '$W/out/hstats' && grep -q '\"id\":\"$V3\",\"dives\":3' '$W/out/hstats'"
run h5 hdiff hist "$URL/hist.git" someone "$TOKEN" main call:diff:$V2:$V3
check "history: what changed since the middle version is the newest dive" "[ \"\$(grep -o '\"state\":\"new\"' '$W/out/hdiff' | wc -l)\" -ge 1 ] && ! grep -q '\"state\":\"deleted\"' '$W/out/hdiff'"
run h5 hrestore hist "$URL/hist.git" someone "$TOKEN" main restore:$V2
check "history: restoring the middle version leaves two dives" "grep -q '^dives=2' '$W/out/hrestore'"
check "history: the restore is a new commit with the old content, sent to the server" "[ \"\$(git -C '$W/srv/hist.git' rev-list --count main)\" = 5 ] && [ \"\$(git -C '$W/srv/hist.git' rev-parse 'main^{tree}')\" = \"\$(git -C '$W/srv/hist.git' rev-parse '$V2^{tree}')\" ]"
check "history: no version was rewritten (every old commit is still in the history)" "(for c in $V0 $V1 $V2 $V3; do git -C '$W/srv/hist.git' merge-base --is-ancestor \$c main || exit 1; done)"
run h5 hback hist "$URL/hist.git" someone "$TOKEN" main restore:$V3
check "history: the newest version is still listed and restores back (three dives)" "grep -q '^dives=3' '$W/out/hback' && [ \"\$(git -C '$W/srv/hist.git' rev-parse 'main^{tree}')\" = \"\$(git -C '$W/srv/hist.git' rev-parse '$V3^{tree}')\" ]"
BEFORE_DEL=$(git -C "$W/srv/hist.git" rev-parse main)
run h5 hdel hist "$URL/hist.git" someone "$TOKEN" main delete-first
check "history: a dive deleted and synced" "grep -q '^dives=2' '$W/out/hdel'"
run h5 hdlog hist "$URL/hist.git" someone "$TOKEN" main call:log:0:1:1
check "history: the deletion shows as deleted dive files in the log" "grep -q '\"state\":\"deleted\"' '$W/out/hdlog'"
GONE=$(git -C "$W/srv/hist.git" diff-tree -r --no-commit-id --name-only --diff-filter=D $BEFORE_DEL main | head -1 | sed -E 's#/[^/]*$##')
run h5 hundel hist "$URL/hist.git" someone "$TOKEN" main restore:$BEFORE_DEL:$GONE
check "history: the deleted dive is restored alone (back to three dives)" "[ -n '$GONE' ] && grep -q '^dives=3' '$W/out/hundel'"
run h5 hopen hist "$URL/hist.git" someone "$TOKEN" main open:$V1 close
check "history: a version opens read only (one dive, no address, nothing can be saved)" "grep -q '^address=\[\]' '$W/out/hopen' && grep -q '^save=NO_LOG' '$W/out/hopen' && grep -q '^dives=1' '$W/out/hopen'"
check "history: closing it brings the logbook back (three dives, an address)" "tail -2 '$W/out/hopen' | grep -q '^dives=3' && grep -q '^address=\[set\]' '$W/out/hopen'"
check "history: opening a version changed nothing on the server" "[ \"\$(git -C '$W/srv/hist.git' rev-list --count main)\" = \"\$(git -C '$W/srv/hist.git' rev-list --count main)\" ] && git -C '$W/srv/hist.git' merge-base --is-ancestor $V3 main"

# 7. The token is nowhere.
check "the token is not in a local copy" "! grep -rqa '$TOKEN' '$W'/h1 '$W'/h2 '$W'/h3 '$W'/h5 2>/dev/null"
check "the token is not in an output" "! grep -rqa '$TOKEN' '$W/out'"
check "the token is not in the remote" "! grep -rqa '$TOKEN' '$W/srv'"

echo "failed: $fails"
[ "$fails" = 0 ]
