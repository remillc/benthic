# OpenDives performance audit

Branch `audit/performance`, 16 November 2026, from `feature/desktop-logbook` (plus `origin/main`).
Nothing in the app was changed: this document and the scripts in `tools/perf/` are the whole delivery.
Raw results (JSON) are in `tools/perf/results/`.

## 1. Summary

The app is fast up to a few hundred dives. The desktop logbook does not scale: it renders **every row**
(about 15 DOM nodes per dive, no virtualisation). With 3,000 dives the page has 47,000 elements, a click on
a row takes 2.4 to 4.7 s, going back to the logbook from another section takes 4.2 s, the start-up blocks
the main thread for 6.6 s, and the renderer holds 713 MB. The phone layout is already virtualised (F7 virtual
list) and stays at 7,000 elements, but its layout swap still produces long tasks (up to 8.3 s at 4x CPU on 3,000 dives).

Top findings, ranked (details in section 5):

1. Desktop logbook table is not virtualised: 44,442 elements for 3,000 dives; selection 2.4 s, search 3.6 s, section round trip 4.2 s.
2. Start-up on 3,000 dives: first rows at 4.3 s, 6.6 s of long tasks (1.5 s + 4 x 1.1 s); the 2.1 MB single JS chunk costs 160 + 410 ms before any data.
3. Per-selection chatter: one click on a dive triggers 18 core calls (4 x `getDive`, 4 x `siteQuery list`, 6 x `statsQuery`, ...) for data that does not depend on the dive.
4. The log list payload is large and reloaded often: `listDives` 313 KB (500 dives) to 1.88 MB (3,000), about 60 % of it thumbnails; `diveColumns` another 126 KB / ~750 KB; 22 call sites reload the whole list.
5. Adaptive layout swap keeps a second copy of the DOM (+29k nodes at 500 dives, +130k at 3,000) and leaks about 75 nodes and 3 listeners per narrow/wide cycle.
6. Dive profile draws every sample (no downsampling): a 3 h dive at 1 s is a 826 KB `getDive` answer and four 120 KB SVG path strings.
7. File logbooks are rewritten whole after every save (`mirrorToFile`); not measurable here (see limits), probably the worst edit-latency risk on big logs.
8. 1.05 MB of CSS, three languages bundled in the main chunk, all routes statically imported.

## 2. Method

Machine: Windows 11, the audit's own Vite dev server (port 5241) and own Electron 39 (CDP 9391) run from the
worktree `F:/projets/OD-perf`; the helper (`opendives-host.exe`) and Electron come read-only from the main
checkout's `build/desktop` and `desktop/node_modules`. Nothing touched the main working tree, the emulator, or any cloud.

- Data: synthetic logbooks (section 3), opened as a `.ssrf` file logbook, a fresh user-data folder per label.
- Dev vs production: interaction measures use the Vite dev server (unbundled, 986 modules); start-up and process
  memory use the **production build** (`vite build`, served by Electron from `app://`). Dev numbers are a little worse for script, the same for DOM/layout.
- CDP used: `Performance.getMetrics`, `Memory.getDOMCounters` (after two forced GCs), `HeapProfiler.collectGarbage`,
  `Profiler` (CPU sampling), `PerformanceObserver` long tasks (>50 ms), `Emulation.setDeviceMetricsOverride` (390x844, DPR 3, touch)
  and `setCPUThrottlingRate` (4x) for the phone layout.
- Bridge: `OpenDivesCoreDesktop.prototype.core` is wrapped in the renderer to log every call (method, result size, duration). Durations include
  main-thread waits in the renderer, so they overstate the core time when the page is busy.
- Timings of interactions are "sync" (the handler) and "total" (until two animation frames later), in ms.

Scripts (`tools/perf/`): `gen-logbook.mjs` (generator), `measure-desktop.mjs` (DOM, interactions, loops, reload),
`measure-phone.mjs`, `measure-bridge.mjs`, `measure-startup.mjs` (production), `measure-leak.mjs`, `measure-profile.mjs`,
`measure-processes.mjs`, `measure-idle.mjs`, `measure-micro.mjs`, `profile-click.mjs`, helpers `cdp.mjs`, `kill-mine.mjs`
(kills only the audit's Electron by its debug port), `start-electron.sh`.
Reproduce: `node tools/perf/gen-logbook.mjs 3000 build/perf/logbook-3000.ssrf`, `cd app && npx vite --port 5241`, then
`node tools/perf/measure-desktop.mjs build/perf/logbook-3000.ssrf s3000`.

## 3. Test logbooks

`tools/perf/gen-logbook.mjs <dives> <out.ssrf> [seed] [sample-step-s] [dive-minutes]`, seeded, no personal data.
300 sites with GPS, trips of 4 to 23 dives, 12 buddies, suits, tags, ratings, notes, 1 to 3 cylinders (air, nitrox, trimix),
profile every 10 s with depth, temperature and tank pressure.

| Label | Dives | Samples | File |
|---|---|---|---|
| s50 | 50 | 13,518 | 1.0 MB |
| s500 | 500 | 130,830 | 9.4 MB |
| s3000 | 3,000 | 790,206 | 56.9 MB |
| long | 6 | 64,800 | 4.6 MB (10,800 samples per dive, 1 s step, 180 min) |

Subsurface's sample dives were not run through the interaction scripts (they are only a few dozen dives, so they behave like s50).

## 4. Measurements (before any change)

### 4.1 Desktop (Electron, wide layout, dev server, no throttling)

| Measure | s50 | s500 | s3000 |
|---|---|---|---|
| Elements in the page, logbook shown | 3,400 | 10,342 | 47,348 |
| of which the logbook page | 799 | 7,473 | 44,442 |
| Elements per dive row | 15 | 15 | 15 |
| Other pages mounted (sites / tools / stats) | 1,660 / 218 / 121 | 1,659 / 468 / 122 | 1,667 / 468 / 127 |
| CDP "Nodes" (all, detached included) | 12.5k | 31.4k | 130k |
| JS heap after GC (MB) | 43 | 57 | 133 |
| Renderer working set, production (MB) | 254 | n/a | 713 |
| Click a row, total (ms) (sync) | 48 (9) | 158 (13) | 2,371 (54) |
| Click another row (ms) | 42 | 161 | 4,694 |
| Sort by a column, total (ms) (sync) | 33 (10) | 204 (35) | 1,680 (178) |
| Search, first keystroke total (ms) | 18 | 83 | 3,590 |
| Section round trip: to Sites / back to logbook (ms) | 129 / 57 | 140 / 334 | 271 / 4,196 |
| Long tasks during the interaction script (count, max ms) | 6, 221 | 37, 324 | 41, 4,176 |
| Warm reload to first row (ms) | 743 | 1,046 | 4,491 |
| Cold open of the `.ssrf` file (spawn to rows, ms) | 3,707 | 12,309 | 68,221 |

Cold open includes importing the XML file into the git copy, which only file logbooks do (cloud logbooks load an existing git repository), so it is not the cloud start-up.

### 4.2 Start-up, production build (Electron, spawn to first logbook row, 2 runs)

| | s50 | s500 | s3000 |
|---|---|---|---|
| First paint / first contentful paint (ms) | 150 / 440 | 130-160 / 400-440 | 150 / 400-425 |
| Spawn to first row (ms) | 1,300-1,450 | 1,510-1,530 | 4,310-4,320 |
| Total long-task time in the first 3 s after rows (ms) | 407-652 | 1,117-1,365 | 6,606-6,709 |
| Largest long tasks (ms) | 414, 252 | 438, 412 | 1,493-1,519, then 1,069-1,227 x 3 |
| DOM elements, JS heap (MB) | 3,221 / 37-43 | 10,163 / 44-57 | 47,153 / 134-136 |

Common to all sizes: 160 ms task at ~200 ms (parse/evaluate the 2.1 MB chunk) and 380-440 ms task at ~400-560 ms (boot: F7 init, Svelte mount of the whole App).

### 4.3 Bundle (production build, `vite build`)

| Asset | Size | gzip |
|---|---|---|
| `start-*.js` (App, all routes and pages, i18n fr + fr-CA + en, F7 lite, Svelte) | 2,109 KB | 590 KB |
| `logbook.svelte-*.js` (lib, shared state) | 474 KB | 152 KB |
| `maplibre-gl-*.js` (separate chunk, loaded on demand) | 1,028 KB | 273 KB |
| `world-land-*.js` (separate chunk) | 998 KB | 274 KB |
| `index-*.css` (F7 bundle CSS + MapLibre CSS + theme) | 610 KB | 91 KB |
| `start-*.css` (component CSS) | 441 KB | 63 KB |
| `regions-*.txt` (offline regions) | 1,079 KB | 470 KB |
| Source Sans 3 VF font | 170 KB | (woff2) |
| `fr.json` + `fr-CA.json` + `en.json` (source) | 232 + 8 + 208 KB | |

Loading order: `index.js` (3.7 KB) -> `loadDeviceStore()` -> dynamic `import('./start.js')` -> its two big chunks: a waterfall, not parallel.

### 4.4 Phone layout (Electron emulating 390x844 DPR 3 touch, CPU 4x)

| | s500 | s3000 |
|---|---|---|
| Elements, wide layout before | 10,342 | 47,346 |
| Elements, phone layout after the swap | 6,430 | 6,938 |
| Logbook page / sites page / statistics page (elements, all mounted) | 928 / 2,991 / 1,819 | 928 / 2,190 / 3,119 |
| Trip rows in the F7 virtual list / profile SVGs | 21 / 105 | 21 / 105 |
| Swap to the phone layout, ready (ms) | 665 | 11 (already in place) |
| Long tasks after the swap (max, count) | 592, 21 | 8,314, 21 |
| Scroll 10 screens (ms) | 198 | 1,022 |

The list itself is cheap; the long tasks come from the swap and from the hidden pages (statistics grows with the dives: 1,819 -> 3,119 elements, mounted but not shown).

### 4.5 Memory and leaks

| Test | Result |
|---|---|
| 10 loops of Sites, Statistics, Tools, Logbook plus a row click (s500) | JS heap 60.5 -> 62.3 MB, nodes 31.79k -> 31.80k, listeners 886 -> 884: stable |
| Same loop, s3000 | heap 132.4 -> 134.7 MB, nodes stable at 130.3k, listeners 867: stable |
| First narrow/wide cycle (700 px then 1500 px), s500, `Memory.getDOMCounters` | nodes 31,359 -> 60,223; documents 3 -> 9; elements unchanged (10,342) |
| Cycles 2, 4, 8 | nodes 60,382 / 60,682 / 61,284; listeners 416 -> 448 -> 463 -> 470: about +75 nodes and +3 listeners per cycle |
| 12 resizes, s3000 | nodes 130k -> 259k, listeners 867 -> 225 (kept after forced GC: detached DOM is retained) |
| Process memory, production, s3000 (2 windows: start screen + logbook) | renderer 713 + 236 MB, GPU 198, main 169, utility 105, helper 137 + 9, total about 1.58 GB (s50: about 1.0 GB) |

The first swap keeps the other layout's DOM alive; later swaps add little. A narrow/wide change is something a desktop user does often (snapping windows), so the +130k retained nodes at 3,000 dives matter.

### 4.6 Bridge (renderer to main to helper, JSON lines on stdio)

| Call | Payload | Time s500 | Time s3000 |
|---|---|---|---|
| `listDives` (start-up) / `listLoadedDives` (reload after changes) | 313 KB / 1,880 KB (625 B per dive) | 158 ms | 989 ms |
| `diveColumns` (after every change of `logbook.dives`) | 126 KB / ~750 KB | 5 ms | n/a |
| `siteQuery list` (300 sites) | 52 KB | 1-170 ms | |
| `getDive`, 10 min dive / 3 h dive at 1 s | 20 KB / 826 KB | 25-66 ms | 38 ms (10.8k samples) |
| `editDive` result | 17-21 KB | 2 ms | 2 ms |
| `saveLocal` (git commit) | 0 | 3 ms | 299 ms |
| One row click (s500): `getDive` x4, `siteQuery` x4, `statsQuery` x6, `plannerSetup` x2, `toolQuery` x2 | 18 calls, 183 KB | 478 ms (wait included) | 18 calls, 168 KB |

`refreshAfterChange` (sites, merge, delete...): `listLoadedDives` + `diveColumns` + `siteQuery` + `statsQuery` = 554 KB at 500 dives.

Note: the helper in the main checkout's `build/desktop` predates `saveLogbookFile`, so `saveLocal` of a file logbook failed in my edit tests after the commit (see limits).

### 4.7 Profile and idle

| Test | Result |
|---|---|
| 10,800-sample dive: SVG paths | 4 paths, 117-121 KB `d` strings each, 66 SVG nodes |
| Long tasks when opening it | 193, 109, 255, 93, 108, 72 ms |
| Hover on the profile (40 moves) | 0.5 ms handler, 16.3 ms/frame average, 24 ms max |
| Layer toggle (Gaz/Tissus...) | 32 ms |
| Idle main-thread, logbook window, 3,000 dives | 4.9 % busy, 3.1 % script, 0 layouts, 0 style recalcs in 5 s |
| Idle, first-launch window | 0 %, no running animation (the decorative profile is static) |
| Micro-benchmarks, 3,000 dives | sort by date proxied 2.6 ms vs raw 0.1 ms; `filter+map` 1.8 vs 0 ms; one class toggle on a row 0.2 ms; forced full layout 6.3 ms |

## 5. Findings, ranked

Effort: S under half a day, M one to three days, L more.

### F1. Desktop logbook table is not virtualised (impact: very high, effort: M-L)

- Evidence: 3,000 rows in the DOM = 44,442 elements (15 per row: `tr`, 5-6 `td`, pin `svg` + `path`, buddy chips). Row click 2.4 s / 4.7 s, first search key 3.6 s, back-to-logbook 4.2 s, 41 long tasks up to 4.2 s, renderer 713 MB. Scaling is worse than linear (selection 48 ms, 158 ms, 2,371 ms for 50, 500, 3,000).
- CPU profile of a click at 3,000 (`profile-click.mjs`): 4.7 s native "(program)" (style, layout, paint) and 1.6 s in the Svelte `bind_element_size` callback, which reads `clientWidth` in a `ResizeObserver` (forced synchronous layout of the whole table). The JS itself is small; the cost is the DOM size.
- `app/src/pages/DesktopLogbook.svelte:889` (`{#each rows as row ...}` over all rows), `:108-109` (`sorted`, `rows` derived over everything), `:99-107` (ResizeObserver measure), `app/src/components/DiveProfile.svelte:360` (`bind:clientWidth`, forced layout during the selection).
- Fix: window the rows (render about 40 visible rows plus spacer rows or `padding` blocks; fixed row height of 70 px makes it easy), keep trip rows in the same windowed list, keep keyboard selection by id not by DOM. Also keep the table mounted while another section shows (`display:none`) or, better, virtualise so remounting is cheap. Replace the `bind:clientWidth` in the profile by a ResizeObserver that stores `contentRect.width` (no forced layout).
- Quick partial win (S): unmount the table when the logbook is not the current page (already half done: 44k -> 11k when hidden) and collapse trips by default so only trip rows render until opened.

### F2. Start-up cost: one 2.1 MB chunk, then the full list rendered (impact: high, effort: M)

- Evidence: production, 50 dives: FCP 440 ms, two long tasks 160 ms (evaluate) and 414 ms (boot), rows at 1.3-1.4 s. 3,000 dives: rows at 4.3 s, 6.6 s total long-task time, 1.5 s then 1.1 s x 4 (the table render, the `listDives` parse of 1.88 MB, `diveColumns`, `sortDives` 165 ms sync, the derived summary).
- `app/src/App.svelte:119` and the lines around it: every route is a static import, so planner, tools, statistics, about, settings, editors, both layouts (wide and narrow) and the first-launch screens are in `start-*.js`. `app/src/lib/i18n.js:9-11` bundles `fr.json`, `fr-CA.json` and `en.json` (448 KB source). `app/src/main.js:10` loads the device store and only then imports `start.js` (a waterfall).
- Fix: (a) lazy routes (`component: () => import(...)`) for planner, tools, statistics, settings, about, editors, desktop dialogs; (b) load only the active language (fr-CA on demand, English fallback loaded when needed); (c) start `import('./start.js')` in parallel with `loadDeviceStore()`; (d) with F1, the table render disappears from the start-up path. Expected: main chunk under 1 MB, the 410 ms boot task halved.

### F3. Chatty detail pane and selection (impact: high, effort: S)

- Evidence: one click on a row = 18 core calls: `getDive` x4 (the dive plus the two neighbours that `preloadDives` fetches, which makes sense for the phone swipe but not for desktop), `siteQuery list` x4 (52 KB each), `statsQuery values` x6, `plannerSetup` x2, `toolQuery cylinders` x2. None of these depend on the selected dive except one `getDive`.
- `app/src/components/DesktopDiveFields.svelte:70-80` (`onMount`: `plannerSetup`, `statsQuery` for buddy/guide/tag, `siteQuery list`, `toolQuery`), `app/src/pages/DiveDetail.svelte:304` (preload of neighbours), `app/src/pages/DiveDetail.svelte:294`.
- Fix: cache these lists in a module (invalidate on `logbook.sitesVersion` and on edits), read them once when the logbook loads; skip neighbour preloading when `layout.desktop`. Removes about 15 of 18 calls and about 160 KB per click.

### F4. Large list payload, reloaded whole, deep proxy (impact: high at 3,000+, effort: M)

- Evidence: `listDives` 313 KB (500) and 1.88 MB (3,000) at 625 bytes per dive, of which the 40-point thumbnail profile is most; `diveColumns` 126 KB / ~750 KB re-fetched on every change of `logbook.dives` (`DesktopLogbook.svelte:115-119`); 22 `listLoadedDives()` calls in `app/src/lib/logbook.svelte.js` (e.g. `:116`, `:130`, `:178`, `refreshAfterChange` at `:175`); `JSON.parse` of the list 5 ms but the proxy: `logbook = $state({ dives: [] })` (`logbook.svelte.js:35`) makes the 3,000 objects deep reactive proxies; a `filter().map()` over the proxy takes 1.8 ms vs 0 raw, a sort 2.6 ms vs 0.1 (20x, small in absolute value, but it is paid in every derived: `listed`, `sorted`, `summary`, filters, statistics).
- Fix: `logbook.dives = $state.raw` semantic (assign a new array on change; `$state.raw` is used only 4 times in the app today); fetch thumbnails separately and lazily for visible rows (halves the list); merge `diveColumns` into the list answer or fetch it only when a column that needs it is shown; for a single-dive edit patch the one dive in place instead of reloading 3,000 (the edit result already returns the dive, 17-21 KB).

### F5. Adaptive swap retains a second DOM and leaks slowly (impact: medium-high, effort: M)

- Evidence: first narrow/wide cycle: CDP nodes 31k -> 60k at 500 dives, 130k -> 259k at 3,000 (documents 3 -> 9); about +75 nodes and +3 listeners per later cycle; elements count unchanged, so the retained nodes are detached. Phone layout keeps the hidden sites page at 2-3k and the statistics page at 1.8-3.1k elements mounted.
- `app/src/components/AdaptivePage.svelte` (the `adopt` hand-over, `before` / `known` references), F7 page stack keeps old pages.
- Fix: on swap, destroy the old layout's component and drop `before`/`known`; confirm with a heap snapshot which object holds the detached tree (F7 `f7Page` data of the adopted element is the first suspect). Statistics/sites pages could render lazily when first shown.

### F6. Profile draws every sample (impact: medium, effort: S-M)

- Evidence: `DiveProfile.svelte:142-148` builds `line` and `water` paths with one `L` per sample, `toFixed(1)` each; at 10,800 samples that is four 117-121 KB path strings (line, water, temperature, one more) and a 255 ms task when opening; `getDive` answers 826 KB (76 bytes per sample, tissues are 16 floats per sample). Hover stays cheap (16 ms/frame). `DiveProfile.svelte:61` spreads `Math.max(1, ...depths, ...)`: fine now, but throws a `RangeError` above about 120,000 samples (a 33 h dive at 1 s; unlikely, cheap to fix with a loop).
- Fix: downsample to at most 2 points per pixel of plot width (min/max per pixel bucket keeps peaks), keep full arrays for the hover lookup; request tissues only when the Tissus layer is on (core option) or decimate them in the façade. Effort S in JavaScript for the path; M for the payload.

### F7. File logbooks rewritten whole after every save (impact: potentially high, effort: M; not measured)

- Evidence (code reading): `desktop/bridge.cjs:663` awaits `mirrorToFile` after every `saveLocal` and `sync`, which runs Subsurface's Save As of the whole log (`saveLogbookFile`) to a temp file, copies it, renames it. At 3,000 dives the file is 57 MB of XML: each edit waits for it. The git commit alone (`saveLocal`) is 299 ms at 3,000 dives. The audit's helper binary lacks `saveLogbookFile`, so the full cost could not be measured.
- Fix: debounce and coalesce mirroring (write at most every few seconds and on window close), and do not hold the renderer's `saveLocal` promise on it; write in the helper rather than copying in the main process (`copyFileSync` of 57 MB blocks the Electron main process, which is also the IPC hub of every window).

### F8. CSS weight (impact: medium on first load, effort: M)

- Evidence: 610 KB + 441 KB of CSS (91 + 63 KB gzip) parsed before first paint; `app/src/theme.css:19` imports the whole `framework7/css/bundle` plus MapLibre's CSS in layers. Only 7 pages are mounted on desktop, the style recalc counts are not the bottleneck (recalcStyle 65 at idle), but the parse cost is in the 400 ms boot task.
- Fix: import only the F7 component CSS actually used (`framework7/css/bundle` -> per-component imports), and load MapLibre's CSS with the map chunk.

### F9. Other items (low to medium)

- Map markers (`app/src/components/DesktopSiteMap.svelte:55-102`, `:164`): one DOM `button` + two children per site, **all removed and recreated on every `moveend`**, with `stackPins` O(n x groups) and a `sites.find` per group (O(n^2)). Fine at 300 sites (about 900 nodes); at 2,000 sites this becomes a visible hitch on each pan. Use a GeoJSON source and a circle/symbol layer (clustering built in); keep DOM markers only for the selected one. Effort M.
- Sites page regions (`app/src/lib/desktop-sites.svelte.js:65-80`): `loadRegions` does one sequential `siteQuery` round trip per site (300 calls) whenever the user types in the search, or leaves the sites pane; add a core call returning all regions, or run once and cache. Effort S (JS) / M (façade).
- Search (`DesktopLogbook.svelte:71-93`): debounce 150 ms then a core round trip, then the whole table re-renders: with F1 the cost vanishes; without it the first key is 3.6 s at 3,000.
- `deviceStore.setItem` (`app/src/lib/device-store.js:84-90`) writes through to Preferences on every call, with no check that the value changed; writes happen on sort, columns and drag end only, so low frequency. `loadDeviceStore` issues one `get` per key (a bulk read would be one call). The logbook snapshot is small (16 entries, ~10 KB), no issue.
- `LinearWavyProgress.svelte:50-60` and `LoadingIndicator.svelte:35` run a `requestAnimationFrame` loop writing `$state` (phase) at 60 Hz, re-deriving the SVG path every frame while a progress bar is shown (sync, download, import). Prefer a CSS/SMIL animation of a pre-built path (compositor) or lower the rate; stop when the page is hidden. Not measured in a long sync.
- Idle: no continuous animation in the first-launch window, 0 % CPU; logbook window 4.9 % busy with 3,000 dives while idle (3.1 % script, no layout): something wakes the page regularly (30 s intervals in `SyncStatus`, `FlightBanner`, `RecentLogbooks`, `DesktopTools` are cheap; worth a look with a trace if battery matters on laptops).
- Windows: opening a file logbook on a fresh profile also opens the start window (236 MB renderer + a second helper of 9 MB); a normal session has one window per logbook, each with its own helper holding the whole log (137 MB at 3,000 dives). Two windows on the same big logbook doubles that.
- Backdrop filters (`NavigationBar`, `ProfileHero`, `theme.css`): 9 uses, phone only, not measured as a problem.

## 6. Quick wins vs larger work

Quick wins (each S, no design change):
1. F3: cache sites/values/planner/cylinders lists; no neighbour preload on desktop. About 15 fewer calls per click.
2. F6: downsample the profile path, loop instead of spread.
3. F4 first step: `$state.raw` for `logbook.dives`, patch one dive after `editDive`, stop re-fetching `diveColumns` on every change.
4. F2 partial: start `start.js` in parallel with the device store; load fr-CA on demand.
5. F1 partial: collapse trips by default on desktop; ResizeObserver with `contentRect` instead of `bind:clientWidth` in the profile.
6. F7 first step: debounce `mirrorToFile` and do not await it in `saveLocal`.
7. F9: sites regions in one call or cached.

Larger work:
1. F1: windowed desktop table (the one change that fixes selection, search, section switching, memory and start-up at once on big logs).
2. F5: find and fix the retained DOM after the layout swap (heap snapshot work).
3. F2: lazy routes and CSS trimming.
4. F4: thumbnails out of the list answer, tissues on demand (façade change, JavaScript first rule applies where possible).
5. Map markers as a GeoJSON layer.

## 7. Limits and not measured

- Android emulator and a real phone: not used (no `adb` on this machine's PATH; the emulator may belong to another agent). The phone figures are Chromium device emulation with 4x CPU throttle on the desktop's Electron, a rough proxy only. Kotlin's main-thread use was not measured (code reading: the plugin calls the core through `onCoreThread`).
- `saveLogbookFile` cost (F7) and the cloud/git sync cost were not measured: the helper binary available read-only lacks the former, and writing to any cloud account was forbidden.
- Interaction timings are from the dev server; production start-up is measured separately and is similar for DOM-bound work.
- Bridge durations include time the renderer's main thread was busy (a request sent during a long task waits); sizes are exact.
- The synthetic logbook has uniform profiles; real logs with long CCR dives (F6) and many photos or notes would shift sizes.
- Run-to-run noise: start-up runs agree within about 10 % (two runs each); interaction numbers are single runs.
