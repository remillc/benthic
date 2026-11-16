# OpenDives — Proposed architecture

2026-11-05 · Christian Rémillard

English copy of the French original kept on claude.ai ([online](https://claude.ai/artifact/Q3xMEsTfLkAqTnwT4m33Z9)).

## 1. Summary

OpenDives is built in **three layers**. At the top, a JavaScript web interface in Capacitor, designed for phone and tablet. In the middle, a thin native bridge in Swift (iOS) and Kotlin (Android). At the bottom, a **shared C++ core** that reuses Subsurface's business code, freed from Qt, with libdivecomputer and libgit2. All calculations, the Git format and downloading from dive computers live in the core. The interface only displays and sends commands.

**Decisions made (5 November 2026)**

| Topic | Decision |
| --- | --- |
| Data | Connection to the existing Subsurface cloud, which remains the only data source; local mode without an account also supported |
| Technology | Capacitor: web interface in JavaScript documented with JSDoc (not TypeScript) inside a native iOS and Android app |
| Scope of the first version | All "essential" and "adapted" features, all new mobile features, and the tablet version |
| Photos | Stay on the device; only the reference is synchronised |
| Services | GeoNames (places), divelogs.de (import and upload, no synchronisation), OpenStreetMap (maps, offline too) |
| Coexistence with Subsurface-mobile | Handled explicitly (format fidelity, conflicts, version, Bluetooth, duplicates, signed commits) |
| Relationship with the Subsurface project | No approach for now; to revisit before publication |

Interface: Svelte 5 + Framework7 v9 (decided). The code coming from Subsurface stays up to date with Subsurface (decided). Maps: OpenStreetMap packages hosted by OpenDives (decided). All architecture decisions are made.

## 2. Overview

> *Diagram: OpenDives architecture · 4 layers, 4 external services — visible in [the online document](https://claude.ai/artifact/Q3xMEsTfLkAqTnwT4m33Z9).*

The interface only talks to the OpenDivesCore plugin. The plugin translates each call for the C++ core and handles what depends on the system: Bluetooth, USB, keychain, widget. Only the core talks to the Subsurface cloud and web services. Only map tiles are loaded directly by the interface. This split guarantees that a dive gives the same figures as in Subsurface, since the same code does the calculation.

## 3. The shared C++ core

Subsurface's core is already largely written in standard C++. It can therefore be extracted from Qt without a rewrite: a few utility functions and system accesses just need replacing. Measured in `core/` (commit `258beb4`), 89 files out of 200 use Qt. The essential files depend on it little or not at all.

| Part of the core | Qt dependency | Handling |
| --- | --- | --- |
| Git reading, model, dive, dive computer, trips, sites, deco, planner, cylinder pressures, statistics, units | None | Reused as is |
| Git writing, XML (reading and writing), profile, list and log, gas, planner notes | A utility header (`qthelper.h`) or a lock (`QMutex`) | Small replacement module in standard C++ (translation, dates, notifications) |
| Remote Git access | Qt regular expressions and proxy | `std::regex`; proxy provided by the platform |
| Filters and full-text search | `QString` used throughout | Minimal `QString` provided by `compat/`, without touching Subsurface's code (the largest part of `compat/`) |
| Download (`libdivecomputer.cpp`) | Device names as `QString` | Light adaptation |
| Bluetooth, serial, network, cloud account, settings, Android | Qt Bluetooth, Qt Network, QSettings, Qt JNI | **Not reused**: replaced by adapters provided by the native bridge |
| Undo and redo (`commands/`) | `QUndoCommand` | Command logic reused, stack rewritten in standard C++ |

**Proposed organisation.** Subsurface's code is included as is as a Git submodule, pinned to a precise commit. Replacements live in an OpenDives `compat/` folder that provides the same functions as `qthelper.h`. Changes to Subsurface's code are thus kept to a minimum. Following its evolution, including the Git format, then means updating the submodule and rerunning the tests.

**Following Subsurface (decision of 5 November 2026).** Subsurface's code is never modified in OpenDives. Everything that differs goes through `compat/` or the facade. If a Subsurface file absolutely must be touched, the change is kept as a **separate patch** (`patches/` folder), reapplied automatically at each update. These patches are written so they can later be offered to Subsurface. Every week, continuous integration builds OpenDives with the latest Subsurface and runs the tests (Git round trip and calculations). This shows immediately whether a Subsurface improvement can be taken in, and what it breaks. The update itself stays a deliberate act: advance the submodule, review format changes, release.

**The facade.** Above Subsurface's code, a small layer (`libopendives`) exposes a stable and simple API to the native bridge. It converts data to JSON, keeps the state of the open log, runs commands with undo/redo and reports progress. The rest of OpenDives never sees Subsurface's internal structures.

## 4. The native bridge: the API between the interface and the core

The interface calls a single plugin, **OpenDivesCore**, with asynchronous commands (JavaScript promises) and receives **events** for long operations. The shapes of the exchanged data are described in JSDoc (`@typedef`) in a single file, `core-api.js`, which serves as the contract between the web and native sides.

| Group | Main commands | Notes |
| --- | --- | --- |
| Log | `openLog`, `closeLog`, `getLogInfo` | Opens the local repository (cloud or local only) |
| Account and sync | `signIn`, `createAccount`, `verifyPin`, `resetPassword`, `deleteAccount`, `sync`, `attachCloud` | Credentials kept by the bridge in the keychain, never passed to the interface |
| Reading | `listDives(page, filter, sort)`, `getDive(id)`, `getProfile(id, dc)`, `listTrips`, `listSites`, `searchSites(near)`, `getStats(query)` | Pagination for large logbooks; the profile arrives computed (curves, ceiling, ppO2, events), ready to draw |
| Writing | `applyEdit(type, target, values)`, `undo`, `redo`, `canUndo` | Every change goes through an undoable command, taken from `commands/` |
| Operations | `mergeDives`, `splitDive`, `shiftTime`, `renumber`, `mergeSites`, `groupTrip`… | Also undoable |
| Dive computers | `scanDevices`, `listKnownDevices`, `downloadDives(device, options)`, `cancelDownload` | Progress and received dives sent as events |
| Planning and gas | `planDive(parameters)`, `gasMod`, `bestMix` | Calculated in the core, structured result and plan text |
| Files | `importFile(path, format)`, `exportDives(selection, format)` | XML, UDDF, FIT, CSV…; sharing through the system share sheet |
| Services | `reverseGeocode(gps)`, `divelogsUpload`, `divelogsImport` | GeoNames and divelogs.de called on the native side |
| Events | `downloadProgress`, `syncProgress`, `logChanged`, `conflictResolved`, `error` | `logChanged` says what changed so that only what is needed is refreshed |

**Bridge rules.**

- Values stay in whole SI units, as in the core (mm, mbar, mK, s). Conversion to m/ft, bar/psi, °C/°F happens in the interface, at display time.
- The core runs on a dedicated thread; no call blocks the interface.
- Large data (profile, list) is sent as compact arrays rather than objects, to limit JSON size.
- An error carries a stable code (`AUTH_FAILED`, `FORMAT_NEWER`, `DEVICE_BUSY`…) that the interface translates.

## 5. Dive computers

libdivecomputer knows each dive computer's protocol, but not the transport. It delegates reading and writing bytes to functions it is given (`dc_custom_open`), and Subsurface already uses this for BLE and Android USB. OpenDives does the same: the **transport is written natively** in the bridge, and the **protocol stays in the core**. Bytes never go through the web interface.

| Transport | iOS | Android | Implementation |
| --- | --- | --- | --- |
| Bluetooth LE | Yes | Yes | Core Bluetooth (Swift), BluetoothGatt (Kotlin); choice of service and characteristics taken from `qt-ble.cpp` (Telit, u-blox, known serial services) |
| Classic Bluetooth | No (iOS limit) | Yes | RFCOMM socket (Kotlin) |
| USB serial | No | Yes | usb-serial-for-android library (FTDI, CP210x, CDC…), already used by Subsurface |
| Files (FIT, logs) | Yes | Yes | File import, no transport |

**How a download runs**

1. The bridge looks for nearby devices. The core recognises the manufacturer and model from the Bluetooth name (tables from `btdiscovery.cpp`).
2. The user confirms once; the device is remembered with its nickname.
3. The core starts libdivecomputer on a dedicated thread. Reads are blocking, with a timeout: the bridge serves them from a byte queue fed by Bluetooth.
4. The **fingerprint** of the last downloaded dive (saved in the Git repository) stops the download at dives already known, even if they were downloaded by Subsurface on another device.
5. Received dives are merged with Subsurface's import rules (duplicates, trips), then saved in a single undoable commit.
6. The bridge **releases the connection** at the end or on error, so Subsurface-mobile or another app can connect (coexistence decision).

**Platform constraints.** The screen stays on during the download: iOS and Android cut Bluetooth for background apps. Bluetooth permissions are requested on first use, not at launch. The iOS simulator has no Bluetooth: tests run on a real device, or with a simulated transport that replays byte captures.

## 6. Storage, synchronisation, local mode and coexistence

The whole logbook lives in **a local Git repository**, in the app's private storage, in Subsurface's exact format. The cloud is just one more remote. Local mode and cloud mode therefore share the same code: the only difference is the presence of a remote.

| Situation | Behaviour |
| --- | --- |
| Local mode (no account) | Git repository without a remote; manual import and export possible |
| Moving to the cloud | If the account is empty: the local repository is sent as is. If it already holds dives: the local dives are **imported** into it with the duplicate rules, never overwritten (`classify_git_save`) |
| Saving | Each validated command produces a local commit, signed "OpenDives", with the text of the action as the message |
| Synchronisation | On opening, when returning to the foreground, a few seconds after a change, and on demand. Offline, commits wait for the network |
| Conflict | libgit2 merge as in Subsurface; if one side won, the user is told and the dive is flagged |
| Newer format | If the format version in `00-Subsurface` is newer than the one OpenDives knows, the logbook opens **read only**, with a message asking to update the app |
| Credentials | Cloud password in the iOS keychain or the Android Keystore, read only by the bridge |

**Format fidelity.** Since Git reading and writing are Subsurface's own code, everything Subsurface writes is read back and rewritten identically. This holds for the Subsurface version included in OpenDives; the version guard covers newer formats. An automatic test checks it: loading then saving real repositories, without any difference.

**Photos and videos.** The repository only keeps the reference of each media item (file name and offset within the dive), like Subsurface. OpenDives also keeps, locally and outside the repository, a table linking each reference to the photo in the device gallery. On another device, the dive shows that a media item exists without being able to display it.

**Settings.** Settings that change calculations (GF, max ppO2, default SAC) and units follow Subsurface: saved in the repository when Subsurface does so, otherwise on the device. OpenDives' display settings stay on the device.

## 7. The interface

The interface is a single-page web app in **modern JavaScript (ES modules) documented with JSDoc**, bundled by Vite and embedded by Capacitor. It contains no business rule: it displays what the core returns and sends it commands. Its visual design is set out in the [System design](system-design.md), the [UI foundations](ui-foundations.md) and the [UI specification](ui-specification.md).

| Need | Proposal | Why |
| --- | --- | --- |
| Mobile components | Framework7 v9 (decided) | Native iOS 26 and Material You (MD3) rendering, stack navigation with swipe back, list + detail for tablets; official Svelte 5 support |
| App framework | Svelte 5 (decided) | Concise, compiled, light code that writes well in JavaScript with JSDoc. Preferred to Vue 3 + Ionic, which offers no MD3 or iOS 26 rendering without third-party themes |
| Type checking | JSDoc + `// @ts-check`, checked in the editor and in continuous integration | Plain JavaScript is kept, with type errors caught before running |
| Dive profile | 2D `canvas` drawing, written for OpenDives | Thousands of points, several curves, pinch zoom: a generic chart is not enough |
| Statistics | Chart.js (MIT licence) | Ready-made bars and scatter plots; licence compatible with GPLv2 (see section 8) |
| Maps | MapLibre GL JS with OpenStreetMap vector tiles | Fast, offline possible, no Google account |
| Languages | JSON translation files (French and English to start) | Simple format for translators |
| Units | A single conversion module, from the core's SI values | Same rounding rules everywhere |

**Offline maps: a constraint to know.** The [OpenStreetMap Foundation tile usage policy](https://operations.osmfoundation.org/policies/tiles/) forbids offline use on its servers, including "download a city for later" features. It recommends self-hosted tiles or a provider that explicitly allows offline use. Decision C: OpenDives hosts its own vector tile packages per region (PMTiles format), built from OpenStreetMap data. The app uses them online and downloads them for offline use, without ever calling the OpenStreetMap Foundation's servers.

**Tablet.** The same screens adapt to the width: list and detail side by side on tablets, one after the other on phones. Features marked "more complete version" on tablets (statistics, planner, bulk editing) gain extra panels, not different screens.

**New mobile features**

| Feature | Implementation |
| --- | --- |
| GPS position of the site | Capacitor geolocation plugin, then GeoNames for country and region |
| Gallery photos | Media picker plugin; the capture time places the photo on the profile |
| Sharing as an image | The profile is rendered to PNG by the interface, then the system share sheet takes over |
| Home-screen widget | Separate native code (WidgetKit on iOS, Glance on Android), fed by a small summary written by the core |
| Offline map | PMTiles packages per region hosted by OpenDives, downloaded on demand (for example a trip's region) |
| Reminders | Local notifications computed by the core (end of desaturation, no-fly time), without a server |

## 8. Repository, build, tests and licence

**Organisation of the `remillc/opendives` repository**

| Folder | Content |
| --- | --- |
| `app/` | Web interface: JavaScript sources, translations, Vite configuration |
| `plugins/opendives-core/` | Capacitor plugin: `ios/` (Swift), `android/` (Kotlin), `core-api.js` (JSDoc contract) |
| `core/` | C++ facade `libopendives`, `compat/` module that replaces Qt, core tests |
| `third_party/` | Pinned submodules: Subsurface, libdivecomputer (Subsurface branch), libgit2, libxml2, libxslt, SQLite, libzip |
| `ios/`, `android/` | Native projects generated by Capacitor, with the widgets (WidgetKit, Glance) |
| `docs/` | Analysis, reverse engineering, architecture, decisions |

**Build.** The core builds with CMake: as `.so` libraries per architecture for Android (NDK, arm64 and x86_64), as an XCFramework for iOS (device and simulator). **Warning: building for iOS requires a Mac.** From a Windows machine, Android builds locally, and iOS goes through a Mac or continuous integration (GitHub Actions, macOS runners). Continuous integration builds the core and runs its tests on Linux, builds both apps and checks the JavaScript (lint and `@ts-check`).

**Tests, in order of importance**

1. **Git round trip:** load then rewrite real Subsurface repositories, and check there is **no difference**. This is the guarantee of compatibility with the cloud.
2. **Calculations:** compare SAC, deco, CNS and plans with Subsurface's results on the sample files in its repository (159 files in `dives/`), reusing its tests (`tests/`, 17,600 lines).
3. **Coexistence:** automated scenarios with desktop Subsurface on a test account (changes on both sides, conflicts, newer format).
4. **Download:** simulated transport replaying Bluetooth captures, then trials on real dive computers.
5. **Interface:** unit tests (Vitest) and end-to-end flows on emulators.

**Licence.** By reusing Subsurface's code, published under **GPLv2 only** ("GPL-2.0", without "or later"), OpenDives must itself be published under GPLv2. The other components are compatible: libdivecomputer (LGPL-2.1 or later), libgit2 (GPLv2 with a linking exception), Capacitor, Framework7 and Svelte (MIT), MapLibre (BSD), Chart.js (MIT). Libraries under Apache-2.0, often considered incompatible with GPLv2 only, must be avoided. Two delicate points need checking by a lawyer before publication: distribution on the App Store (Subsurface-mobile is published there, though) and static linking of libdivecomputer on iOS. This is not legal advice.

## 9. Decisions and risks

**Decisions before coding**

- [x] **A. Interface app framework:** decided on 5 November 2026: Svelte 5 + Framework7 v9. Accepted risk: Framework7 relies mostly on one maintainer; the interface stays thin so it can be replaced. To validate with a one-day trial on a real Android phone and an iPhone.
- [x] **B. Reusing Subsurface's code:** decided on 5 November 2026: the code coming from Subsurface must be updatable when Subsurface improves. Hence a pinned submodule + `compat/` module, with no modified copy of the code.
- [x] **C. Tiles for the offline map:** decided on 5 November 2026: PMTiles packages per region, built from OpenStreetMap data and hosted by OpenDives, used online and offline. To plan: static file hosting, periodic regeneration of the packages and the "© OpenStreetMap contributors" credit.

**Risks**

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Data loss during a Git write | Corrupted logbooks for Subsurface users | Subsurface's Git code reused as is, round-trip test mandatory before each release, format version guard |
| Format changes by Subsurface | OpenDives stuck in read-only mode | Follow Subsurface releases, update the submodule, automatic tests |
| Subsurface servers | The project could restrict an unknown client; no approach is planned for now | Clearly identified client (User-Agent, signed commits), sparing synchronisation; decision to revisit before publication |
| Bluetooth quirks of each manufacturer | Downloads failing on some models | Reuse Subsurface's BLE settings, simulated transport, betas with divers using varied models |
| GPLv2 licence and App Store | iOS publication challenged | Legal advice before publication; Subsurface-mobile serves as a precedent |
| Data volume across the bridge | Slowness on large logbooks | Pagination, compact arrays, profiles computed in the core |
| iOS build | Impossible from Windows | Spare Mac or macOS continuous integration |

**Proposed next step.** With A, B and C settled, interface design could start in parallel with a first **technical proof of concept**: build the core without Qt for Android, open a real cloud logbook, show it in a list, and achieve the Git round trip without differences. Both have since been done (see [the proof of concept](../poc/README.md)).

## 11. OpenDives server (release edition)

Decided on 16 November 2026. **Release edition only**: not in `main`'s beta, and the app keeps working without any server (Subsurface cloud, own git repository, local mode). The server code, the development stack and the hosting plan live in a **private repository** (`opendives-server`); this section only fixes what the app and the server agree on.

### 11.1 Components and what lives where

```
                      app (phone, tablet, desktop)
            ┌──────────────┬──────────────────┬─────────────────┐
            │ HTTPS JSON   │ git over HTTPS   │ HTTPS (signed   │
            │ /v1/...      │ (scoped token)   │ object URLs)    │
            ▼              ▼                  ▼                 │
     ┌─────────────┐  ┌───────────┐    ┌────────────────┐      │
     │ OpenDives   │  │ Git       │    │ Object storage │      │
     │ API         │─▶│ hosting   │    │ (S3-compatible)│◀─────┘
     │ (sign-in,   │  │ 1 repo /  │    │ photos, videos,│
     │  sharing)   │  │ user      │    │ encrypted docs │
     └──────┬──────┘  └───────────┘    └────────────────┘
            │ SQL
            ▼
     ┌─────────────┐
     │ PostgreSQL  │  accounts, sessions, opt-in shared data
     │ + PostGIS   │  (friends, public site base)
     └─────────────┘
```

| What | Where | Notes |
| --- | --- | --- |
| Logbook (dives, sites, gear, settings) | Git repository, branch `main` | **Subsurface's format, unchanged.** Desktop Subsurface can read and write it. |
| Data OpenDives adds (inventory, maintenance, certifications, gas analyses, diver profile, site water type) | Same repository, **second branch `opendives`** | Section 11.3. Subsurface never touches that branch. |
| Accounts, sessions, friends, public site base | PostgreSQL + PostGIS | Sharing is **opt-in** (section 11.6). |
| Photos, videos, encrypted documents | S3-compatible object storage | Referenced by content hash (section 11.5). |
| Sign-in | OpenDives API | E-mail code, no password (section 11.2). |

The API never holds the logbook itself: the app talks to the git hosting directly with a scoped token that the API hands out at sign-in.

### 11.2 Sign-in contract (API v1)

All bodies are JSON (`Content-Type: application/json`), UTF-8. Addresses are lower-cased by the server. The account is created at the first successful verification: the app has no separate "create account" call.

**`POST /v1/auth/code`** sends a 6-digit code to the address.

Request: `{ "email": "diver@example.org" }`

Response `200`: `{ "ok": true, "expiresInSeconds": 600, "resendAfterSeconds": 30 }`. The response is the same whether the account exists or not.

**`POST /v1/auth/verify`** checks the code and signs in (and creates the account if it is new).

Request: `{ "email": "diver@example.org", "code": "123456" }`

Response `200`:

```json
{
  "sessionToken": "opaque, 64 hex characters",
  "sessionExpiresInSeconds": 7776000,
  "user": { "id": "17", "email": "diver@example.org", "isNew": true },
  "repository": {
    "url": "https://git.example.org/<user>/logbook.git",
    "branch": "main",
    "dataBranch": "opendives"
  },
  "git": {
    "username": "<user>",
    "token": "scoped git token",
    "scopes": ["read:repository", "write:repository"]
  }
}
```

The git token only reaches the repositories of that user. The app keeps `sessionToken` and `git.token` in the platform's secure storage (Keychain, Keystore), never in the device store or in logs. Each successful verification issues a new git token.

**`GET /v1/health`** returns `{ "status": "ok" | "degraded", "db": true, "forgejo": true }`, without authentication. The app can use it for the "server unreachable" state.

**Errors.** Every error is `{ "error": { "code": "...", "message": "...", "retryAfterSeconds": 600 } }` (`retryAfterSeconds` only when relevant; also sent as the `Retry-After` header). The `message` is for logs only: the app shows its own translated text for each `code`.

| HTTP | `code` | When | App behaviour |
| --- | --- | --- | --- |
| 400 | `INVALID_ADDRESS` | The address is not a valid e-mail address | Error under the address field |
| 400 / 401 | `WRONG_CODE` | The code is malformed (400) or does not match (401) | Error under the code field; the person can retry |
| 410 | `CODE_EXPIRED` | The code is older than 10 minutes, or already used | "Get a new code" |
| 429 | `TOO_MANY_ATTEMPTS` | 5 wrong codes, or 5 codes requested in 10 minutes: the address is locked for 10 minutes | Message with the wait (`retryAfterSeconds`); both buttons disabled until then |
| 429 | `RESEND_TOO_SOON` | A second code was asked within 30 seconds | Countdown on "Send the code again" (`retryAfterSeconds`) |
| 502 | `UNREACHABLE` | The server could not send the e-mail or finish provisioning | Same screen as a network failure |
| 404 / 500 | `NOT_FOUND`, `SERVER_ERROR` | Unknown route, unexpected error | Same screen as a network failure |
| (no response) | `UNREACHABLE` | Client side: no network, timeout, TLS failure, a 5xx without a JSON body | "Server unreachable": **Try again** and **Choose another place** |

The 6-digit code, the 10-minute expiry, the 5-attempt limit and the 10-minute wait are the values of the design tasks 259 and 260. They are server constants: the app reads the actual delays from `expiresInSeconds`, `resendAfterSeconds` and `retryAfterSeconds`, never from its own copy.

### 11.3 The second branch: `opendives`

The branch `opendives` of the user's repository is an **orphan branch** (no common history with `main`). It holds the data OpenDives adds to a Subsurface logbook, so that the logbook itself stays exactly what Subsurface writes.

```
opendives branch
├── manifest.json              { "format": 1, "kind": "opendives-data" }
├── keys/wrapped.json          the data key, wrapped (section 11.4)
├── equipment/<id>.json        inventory item (#42)
├── maintenance/<id>.json      reminder or service record (#47)
├── certifications/<id>.json   certification or document (#48), sensitive
├── gas-analyses/<id>.json     analysis of a cylinder's gas (#49)
├── profile/diver.json         diver profile (#63), sensitive fields
├── site-info/<site-uuid>.json extra data about a site, e.g. water type (#64)
└── media/<dive-key-hash>.json photos and videos of a dive (section 11.5)
```

Rules:

- **One JSON file per item.** `<id>` is a UUID version 7, created on the device, never reused. Deleting an item deletes its file (git keeps the history). Two devices editing two items never conflict.
- Every file carries `"format": <integer>`. A file with a newer `format` than the app knows is kept as is and shown read only; unknown fields are preserved on rewrite.
- Common fields: `format`, `id`, `createdAt`, `updatedAt` (UTC, ISO 8601). Merge: if both sides changed the same file, the one with the later `updatedAt` wins for the whole file; the other stays in the commit history.
- JSON is written with sorted keys, two-space indent and a final newline, so that equal data gives equal files and diffs stay readable.
- Commits are made by the app, signed "OpenDives", one per validated action, like the logbook commits.
- Pressures and temperatures are stored in bar and degrees Celsius whatever the display units.

**Stable keys** link an item to the logbook without touching it.

| Key | Form | Notes |
| --- | --- | --- |
| Dive key | `{ "deviceId": "<hex>", "diveId": "<hex>" }` for a dive from a dive computer (the `deviceid` and `diveid` Subsurface stores for the dive computer), else `{ "start": "2026-11-01T09:30:00Z" }` (start time of the dive, UTC, when the link is created) | The key is **stored in the item and never recomputed**. If Subsurface later changes the start time of a manual dive, the app looks the dive up again and rewrites the link. Open question: dives with several dive computers. |
| Site key | `{ "siteUuid": "<hex>" }`, Subsurface's dive site `uuid` | Stable across Subsurface edits. |
| Equipment key | `"equipmentId": "<uuid>"` | Used by maintenance items and gas analyses (the cylinder). |

Shapes by kind (fields not listed are preserved if present):

```json
// equipment/<id>.json
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "type": "regulator", "name": "...", "brand": "...", "model": "...", "serial": "...",
  "purchasedOn": "2024-05-01", "tags": ["travel"], "retired": false }

// maintenance/<id>.json
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "equipmentId": "<uuid>", "task": "service", "intervalMonths": 12,
  "intervalDives": 100, "lastDoneOn": "2026-03-10", "lastDoneDive": { "start": "..." },
  "notes": "" }

// certifications/<id>.json   (sensitive: the whole payload is encrypted)
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "enc": { "v": 1, "alg": "A256GCM", "kid": "...", "nonce": "<base64>", "ct": "<base64>" } }
// plaintext after decryption: agency, level, number, issuedOn, expiresOn,
// and "documents": [ { "hash": "<sha256>", "mime": "application/pdf", "size": 123456 } ]

// gas-analyses/<id>.json
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "dive": { "deviceId": "...", "diveId": "..." }, "equipmentId": "<cylinder uuid>",
  "o2Percent": 32.0, "hePercent": 0.0, "pressureBar": 200, "analysedAt": "..." }

// profile/diver.json   (plain fields + one encrypted block for the sensitive ones)
{ "format": 1, "updatedAt": "...",
  "displayName": "...", "homeAirport": "...",
  "enc": { "v": 1, "alg": "A256GCM", "kid": "...", "nonce": "...", "ct": "..." } }
// plaintext of enc: bloodGroup, allergies, medicalNotes, emergencyContact { name, phone }

// site-info/<site-uuid>.json
{ "format": 1, "siteUuid": "...", "updatedAt": "...", "waterType": "salt" }
```

### 11.4 Sensitive data: encrypted on the device

The server and its operator must not be able to read the **sensitive items**: documents and certifications (#48), blood group, allergies, medical notes and emergency contact (#63). The rest of the `opendives` branch and the logbook are readable by the server: the logbook has to stay readable by Subsurface, so it cannot be encrypted. The app and the privacy policy say this plainly.

High-level design:

1. **Data key.** At first use, the device creates a random 256-bit key. It lives in the platform's secure storage (Keychain, Keystore; the system credential store on desktop) and never leaves the device in clear.
2. **Encryption.** Sensitive payloads are encrypted on the device with AES-256-GCM (a fresh random nonce each time, the item id and `format` as authenticated data) before the commit or the upload. The file keeps `enc: { v, alg, kid, nonce, ct }`; `kid` names the key so that it can be rotated.
3. **Documents** (scans, PDFs) are encrypted the same way and stored in object storage under the hash of the **ciphertext**; the certification item holds the hash list.
4. **More than one device.** The data key is also stored **wrapped** in `keys/wrapped.json`: encrypted with a key derived (Argon2id, parameters stored in the file) from a recovery secret chosen by the person. A new device asks for the recovery secret, unwraps the data key and keeps it in its own secure storage. A device-to-device route by QR code can be added later.
5. **Loss.** If every device is lost **and** the recovery secret is forgotten, the sensitive items cannot be read again, by anyone. The app tells the person so when the secret is created.

**To decide (flagged for Christian):** what the recovery secret is. A generated recovery phrase is strong but must be written down; a recovery question is easier but weaker, because guessable answers cut the effective strength of the wrapped key. Until this is decided, the wrapped key and the multi-device flow are not built; the single-device case works without it.

### 11.5 Photos and videos: by hash

- Photos stay on the device by default (unchanged). Uploading the photos or videos of a dive is **opt-in**, per dive or album.
- An uploaded file is stored once, under the **SHA-256 of its content** (`media/<hash>`), so the same photo uploaded twice, or from two devices, is one object.
- The reference lives in the `opendives` branch, in `media/<dive-key-hash>.json`: `{ "format": 1, "dive": <dive key>, "items": [ { "hash": "...", "mime": "image/jpeg", "size": 0, "takenAt": "...", "caption": "" } ] }`. Subsurface's own picture entries in the logbook are left as they are.
- The app holds no storage credentials: it asks the API for short-lived signed URLs to upload or download an object. The API only signs for objects the person owns or that were shared with them (section 11.6).
- Originals are never altered or recompressed on upload.

### 11.6 Shared data: opt-in

Everything social lives in PostgreSQL + PostGIS, never in the logbook.

- **Off by default.** The account works fully with nothing shared. Each kind of sharing is a separate switch, each with a sentence that says exactly what leaves the device: for example "Follow friends" (name and the dives a friend chooses to show) and "Contribute my sites to the public site base" (site name, position, water type; no dive, no date, no name).
- Sharing a site to the public base copies only the listed fields; the person's own logbook entry is not modified. Withdrawing deletes the copy.
- A follow needs the other person's acceptance.
- Nothing from the sensitive items (section 11.4) is ever shared.

### 11.7 Where the rest lives

The server code, the local development stack (containers, seed data, smoke test) and the hosting plan (hosting, backups, restore, monitoring, privacy-law notes, go-live checklist) are in the **private repository `opendives-server`**. They are deliberately not described here: this repository only holds what the app depends on.
