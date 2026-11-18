# Spike: git on the device (isomorphic-git) or the git host's web API

Status: **partial**. The spike was stopped on request before it finished. Numbers below are what was measured; what is missing is listed explicitly in "Not measured".

## Question

For logbooks stored on the OpenDives server (format of `docs/architecture.md`, section 11.3), should the app run git on the device (isomorphic-git, pure JavaScript), keep using the git host's web API (today: Forgejo contents API for writing, tree list + raw files for reading), or fall back to libgit2 (already linked in the core)?

## Method

- Scripts: `tools/spike-git/` (`gen.mjs` generator, `lib.mjs`, `proxy.mjs`, `node-op.mjs` one measured operation per process, `driver.mjs`, `tables.mjs`, `merge.mjs`, `history.mjs`, `browser-entry.js` + `browser-run.mjs` + `build-web.mjs`). Data and results are generated under `build/spike-git/` (git-ignored). Credentials come from the environment, never from the repository.
- Data: generated with the app's own writer (`server-logbook-format.js`, `diveFile`, `profileFile`, ...): profiles at 1 sample per 4 s, 45 to 70 min, depth + temperature + ceiling columns, indented JSON as the format requires. 300 sites, 50 trips, 40 gear, 3 kits. Sizes: 300 dives = 994 files / 14.9 MB; 1,000 = 2,394 files / 49.5 MB; 3,000 = 6,394 files / 148.5 MB (about 50 KB per dive, mostly `profile.json`).
- Server: Forgejo of the local dev stack (Docker Desktop, bind-mounted data on Windows), reached directly (RTT about 0) or through `proxy.mjs`, which delays each request and each response by 40 ms (80 ms RTT, no bandwidth limit, no TLS or TCP handshake modelled).
- Machine: Intel Core i9-13900K, Windows 11, Node 24.21, git 2.43 (CLI as proxy for libgit2 speed), isomorphic-git 1.44.17, Chrome 142 for the (unfinished) browser runs. `core.autocrlf=false` forced for the CLI.
- Each case: 3 runs, median. Exceptions are marked `(1)` in the tables (one run). Each operation runs in its own Node process, so the RSS is that operation's peak.
- Contents API upload: sending a whole logbook through it at full size would take hours on this stack, so the repository is first seeded with all but the first K dives (git push, not timed), then the API sends K dives (K = 50 for batches of 5, K = 100 for batches of 50) and the whole-upload time is **the median time of one commit on a repository of full size x number of commits**. It is an estimate, not a full run. Marker commit included.
- Contents API pull on a second copy: list the tree (paged), compare blob shas with the previous listing, fetch the changed files with the raw endpoint.

## Results

### Initial upload

| Method | 300 dives | 300, 80 ms RTT | 1,000 dives | 1,000, 80 ms |
|---|---|---|---|---|
| Contents API, 5 dives per commit (estimate) | 5.5 min | 5.5 min (1) | 19.4 min | 19.4 min (1) |
| Contents API, 50 dives per commit (estimate) | 3.3 min | 3.1 min (1) | 10.9 min | not measured |
| isomorphic-git (Node, fs): init, add, commit, push | 2.4 s | 2.7 s | 5.9 s | not measured |
| git CLI: init, add, commit, push | 3.3 s | 3.6 s | 6.1 s | not measured |

- The contents API cost is per file on the server: about 5.4 s per commit of 5 dives (10 files, 0.4 MB) and about 27 s per commit of 50 dives (100 files, 3.3 MB) on this stack. The "0.4 s per request" quoted for the current code holds for small payloads only; with real profiles it is roughly 10 to 15 times more per request. This is partly the dev stack (Docker bind mount, one process spawn per file on the server) and a production server may be faster, but the cost grows with the number of files in any case. 50 dives in one body (3.3 MB) was accepted: no body limit was hit at that size.
- Latency adds only calls x RTT to the contents API (about 0.5 s on 60 calls), negligible against its server time. For git it adds a few round trips (+0.2 to +0.3 s).
- git push sends one pack: 1.9 MB for 300 dives, 6.1 MB for 1,000 (JSON compresses about 8x). On LTE the transfer of 6 MB is the dominant cost for 1,000 dives; the contents API sends the same data as base64 JSON (3.3 MB of body per 100 files, 1.33x the raw size, uncompressed): a 1,000-dive upload through it is about 65 MB against 6 MB.
- isomorphic-git peaks at 364 MB RSS (300 dives) and 863 MB (1,000 dives) for the initial add/commit/push, because it builds the pack in memory. CLI: 72 MB. This is the main risk of the initial upload on a phone.

### Clone

| Method | 300 dives | 300, 80 ms | 1,000 dives |
|---|---|---|---|
| Tree list + raw files, 4 at a time (today) | 38 s | 1.0 min | 1.6 min |
| Archive zip + fflate unzip | 0.17 s (*) | 0.26 s (*) | 0.26 s (*) |
| isomorphic-git, depth 1 | 0.89 s | 1.05 s | 2.4 s |
| isomorphic-git, full | 0.88 s | 1.03 s | 2.3 s |
| git CLI, depth 1 | 0.67 s | 1.04 s | 1.0 s |
| git CLI, full | 0.64 s | 1.01 s | 1.0 s |

(*) The archive is cached by Forgejo after the first request; the first request of a commit took 3.1 s for 300 dives (archive built on demand). The medians show the cached value, so the zip is not as fast as it looks for a first download after each change. Download sizes: raw files 14.7 MB (300) / 49.3 MB (1,000); zip 2.1 / 6.4 MB. The zip gives files only (no history, nothing to fetch incrementally afterwards).
Depth 1 and full are identical here because these test repositories have a single commit; the effect of a long history (`history.mjs`) was **not measured**.
Peak RSS of isomorphic-git clone: 236 MB (300), 308 to 322 MB (1,000); CLI 72 MB.

### Small edit round trip (1 dive.json + 1 gear file, commit and push; then update a second copy)

| Method | 300 dives | 300, 80 ms | 1,000 dives |
|---|---|---|---|
| Contents API (2 sha reads, commit, tree list, fetch changed) | 3.8 s | 4.4 s | 4.3 s |
| isomorphic-git (Node) | 1.5 s | 2.1 s | 2.1 s |
| git CLI | 1.6 s | 2.3 s | 1.6 s |

Push / pull split: contents API 3.0 s / 0.8 s (300), 3.0 s / 1.1 s (1,000); isomorphic-git 1.2 s / 0.3 s (300), 1.7 s / 0.4 s (1,000); CLI 1.1 s / 0.55 s. The contents API pull grows with the number of tree pages (one page per 1,000 files); isomorphic-git's fetch only moves the new objects. Peak RSS of the isomorphic-git round trip: 125 MB (300), 178 MB (1,000).

### Local operations (isomorphic-git, Node, working copy created by isomorphic-git)

| | 300 dives | 1,000 dives |
|---|---|---|
| `statusMatrix` on the full tree, clean | 106 ms | 247 ms |
| `statusMatrix` after 1 edit | 72 ms | 192 ms |
| `statusMatrix` limited to one file | 14 ms | 24 ms |
| `log` of the last 20 commits | 4 ms | 6 ms |

Warning seen on the way: on a working copy created by the git CLI (different stat data in the index), the first `statusMatrix` took 6.5 s for 300 dives because every file was rehashed. A working copy that isomorphic-git creates itself does not have this cost, so the app must never share a working copy with another git implementation (for example libgit2 fallback on the same directory) without a rebuild of the index.

### Bundle size added to the app (esbuild, minified, `Buffer` polyfill included)

| | min | gzip |
|---|---|---|
| isomorphic-git + http/web | 268 KB | 82 KB |
| LightningFS | 54 KB | 17 KB |
| fflate | 33 KB | 11 KB |
| all three | 294 KB | 90 KB |

isomorphic-git needs a `Buffer` implementation in the browser (the `buffer` package is included in these numbers).

## Not measured (stopped on request)

- 3,000 dives, for every operation (the runs had just started).
- 1,000 dives at 80 ms RTT, except the contents API upload (1 run) and part of the round trip.
- **Chromium headless runs with LightningFS and 4x CPU throttling** (harness written and bundled: `browser-entry.js`, `browser-run.mjs`, never run). So there is no number yet for isomorphic-git on an IndexedDB filesystem or at phone CPU speed. This is the largest gap: the Node numbers are on a fast desktop CPU and a real filesystem.
- **Merge behaviour** (`merge.mjs`, never run): concurrent edits of two different dives, of the same dive, and what a conflict looks like. Not known from measurements. From the library's documentation, `git.merge` does a tree merge and a text three-way merge and reports conflicting paths; the architecture already plans a JSON merge by the app, for which the three versions can be read with `findMergeBase` and `readBlob`, but this was not verified here.
- Effect of a long history on clone and fetch (`history.mjs`, never run).
- Android emulator run (optional, skipped).
- Memory in the browser (JS heap).

## Risks

- **Transport.** isomorphic-git talks HTTP through `isomorphic-git/http/web` (fetch). Forgejo has no CORS, so a browser needs a proxy; in the Capacitor app the plugin's native HTTP would have to be wrapped as an isomorphic-git `http` object (a small adapter: `request({url, method, headers, body})` returning an async iterable of the body). Streaming of the pack through the native bridge is not tested. Not tried in this spike.
- **Filesystem.** On a phone the choices are LightningFS (IndexedDB, 54 KB, per-file overhead, not measured here) or a Capacitor Filesystem adapter written for the isomorphic-git `fs` interface (not existing, to be written and tested). 6,000 files for 3,000 dives is many small IndexedDB entries.
- **Memory.** The initial upload builds the pack in memory: 363 MB at 300 dives and 863 MB at 1,000 dives in Node. At 3,000 dives this would likely exceed what a phone web view allows. A clone, a push of a small commit and a pull stay at 125 to 320 MB in Node.
- **iOS.** WKWebView has tighter memory limits than Android, and IndexedDB data may be evicted by the system when the app is unused. Not tested (no Mac).
- **Server cost.** The contents API cost is server-side per file; git moves a pack and costs the server very little per push.
- **Working copy sharing** (see the status warning above).

## Recommendation (from what was measured)

1. **Do not use the contents API for the initial upload or for more than a few files.** Measured: 5 to 19 min for 300 to 1,000 dives at 5 dives per commit, about 11 min for 1,000 dives at 50 per commit, against 2 to 6 s with a pack push. At 3,000 dives it would be more than an hour. If the API stays for the first version, make it the path for small edits only.
2. **Git on the device is clearly faster than the web API for everything except the first load of a single file**, on this desktop-class setup: upload 100x to 150x, edit round trip 1.5 to 2.5x faster, and a clone in about 1 to 2.4 s for 1,000 dives against 1.6 min through raw files (a zip download is also fast, but only once the archive is cached).
3. **isomorphic-git or libgit2?** The numbers do not show isomorphic-git to be too slow in Node (about 1.0 to 2.4x the CLI, the CLI being a stand-in for libgit2), but its memory use on the initial upload (863 MB at 1,000 dives) and the untested phone environment (IndexedDB, throttled CPU, native HTTP adapter) are the open questions. Proposed thresholds before adopting it for the whole logbook:
   - Chromium at 4x throttling: clone of 1,000 dives under about 15 s, edit round trip under about 5 s, `statusMatrix` of one file under 100 ms, JS heap under about 300 MB for clone and small pushes.
   - Initial upload: do not push 1,000+ dives in one pack from the device through isomorphic-git; send it in several commits/pushes of about 100 to 200 dives (each pack small), or fall back to libgit2 (the core already links it, memory 72 MB for the CLI).
   - If the browser runs miss those thresholds, or the native HTTP adapter cannot stream, use **libgit2** in the native plugin (Kotlin/Swift) behind the same JSDoc contract, with the web API kept as a reading path for small logbooks.
4. Next steps to settle it: run `browser-run.mjs` (LightningFS, 4x CPU), `merge.mjs` and `history.mjs`, then 3,000 dives, and an Android emulator run with the plugin's native HTTP. This was not done.

## How to rerun

Start the dev stack, `proxy.mjs 3100 0` and `proxy.mjs 3180 80`, load the credentials into `OD_FORGEJO_USER` / `OD_FORGEJO_PASSWORD` in the environment, then `tools/spike-git/run-all.sh`, `node tools/spike-git/tables.mjs`, `node tools/spike-git/merge.mjs`, `node tools/spike-git/browser-run.mjs 1000`.

## Second round (18 November 2026): the app's real git layer at phone CPU speed

The harness `tools/spike-git/odgit-entry.js` + `build-odgit.mjs` + `odgit-run.mjs` runs the app's own git layer (`app/src/lib/odgit/`: `repo.js`, `fs-adapter.js`, `http-adapter.js`) in headless Chrome 142 with CPU throttling 4x, against the dev Forgejo through `proxy.mjs 3100 0` (no latency, CORS added). Two file backends under the same adapter:

- `lightning`: LightningFS (IndexedDB), the pure web-view case.
- `bridge`: every file operation leaves the page as an asynchronous call with base64 data and is done by Node's `fs` (puppeteer `exposeFunction`). It models the shape of `@capacitor/filesystem` (JSON bridge, base64), not its speed: the Node side is not throttled, the CDP binding is slower than Capacitor's bridge. Read it as a pessimistic bound for the bridge cost.

Same generated logbooks as before (300 dives = 994 files, 1,000 dives = 2,394 files). Round trip = edit one `dive.json` and one gear file, commit, push from copy A, then copy B pulls (fast-forward). One-file status = `statusMatrix` limited to the edited file. Runs are noisy on this machine (Docker running next to it): ranges are given when several runs differ.

| 4x CPU | Clone | Round trip (push + pull) | One-file status | Peak JS heap |
|---|---|---|---|---|
| 300 dives, LightningFS | 3.5 s | 2.8 to 5.2 s, median 3.3 s | 132 to 157 ms | 62 MB |
| 300 dives, bridge | 6.4 s | median 4.7 s | 260 to 274 ms | 160 MB |
| 1,000 dives, LightningFS | 13.1 to 13.5 s | 5.2 to 9.2 s, medians 5.5 to 7.6 s | 176 to 276 ms | 99 to 102 MB |
| 1,000 dives, bridge | 24.2 s | median 12.9 s | 321 ms | 179 MB |

Thresholds of the first report: clone of 1,000 dives under about 15 s, round trip under about 5 s, one-file status under 100 ms, JS heap under about 300 MB.

- **Memory holds** everywhere (at most 179 MB).
- **Clone of 1,000 dives holds with LightningFS (13 s) but not on a bridge-shaped backend (24 s).**
- **The round trip misses at 1,000 dives** (5.2 to 9.2 s on LightningFS) and sits at the limit at 300 dives. Split for 1,000 dives, LightningFS: writing the files 2 ms, `add` + `commit` 1.6 to 4.3 s, `push` 2.5 to 4.2 s, pull about 1 s. The cost is isomorphic-git's own CPU work (it rewrites the tree objects of the whole logbook at each commit and walks them again to choose the objects to push), not the file system. A persistent `cache` object passed to every call (the index parsed once) did not change it measurably.
- **The one-file status misses** at both sizes (132 to 321 ms): even limited to one file it reads and parses the whole index (994 or 2,394 entries) at each call. An app that knows what it wrote does not need it per edit; as a general check it is over the threshold.
- **Verdict: the thresholds do not hold for the 1,000-dive logbook at 4x throttling** (round trip, one-file status; the clone only on LightningFS). They hold for memory. The 4x factor on this i9-13900K is a modelled phone, not a measured one; the Android emulator run would give the real file-system and native-HTTP costs but cannot fix the CPU-bound part, so it was not run before this decision point.

### Merge behaviour (merge.mjs, Node, 300 dives, Forgejo)

Two copies, A pushes first, B (with a local commit) fetches then `git.merge({ abortOnConflict: true })`:

| Case | Result |
|---|---|
| Edits to two different dives | merges (a merge commit, 130 ms), both edits kept, push accepted |
| Same dive, different fields (`notes` and `rating`, not adjacent lines) | merges cleanly by the text three-way merge, both fields kept |
| Same dive, adjacent fields (`maxDepthMm`, `meanDepthMm` on neighbouring lines) | `MergeConflictError` although the fields differ: git merges lines, and neighbouring lines conflict |
| Same dive, same field | `MergeConflictError` naming the file (`bothModified`) |

On a conflict with `abortOnConflict: true` the working copy is left as it was (checked in `tests/app/odgit-repo.test.mjs`). With `abortOnConflict: false`, isomorphic-git writes `<<<<<<<`/`=======`/`>>>>>>>` markers into the JSON file and still throws. The three versions are readable in about 8 to 10 ms (`findMergeBase`, `readBlob` on the merge base, ours and theirs), which is what a field-level JSON merge by the app needs: it would turn the adjacent-field conflicts into clean merges. `merge.mjs` ran at 300 dives (the merge does not depend on the size).

### Not done in this round

- The Android emulator run with the real `@capacitor/filesystem` and native HTTP (stopped at the decision point above).
- 3,000 dives, long history (`history.mjs`), 80 ms RTT.
