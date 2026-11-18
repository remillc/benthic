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

## 10. The desktop app (decided on 15 November 2026)

OpenDives also runs on **Windows, macOS and Linux**, as an **Electron** app (task 2026-11-15-170). The interface is the same web layer as on the phones and tablets; only the shell and the way to reach the core change.

| Piece | Where | Role |
| --- | --- | --- |
| Electron's main process | `desktop/main.cjs`, `menu.cjs`, `window-state.cjs` | The window (size and place remembered), the interface served from `app://opendives/` (from `app/dist`, or the Vite server in development), the macOS menu bar (none on Windows and Linux) |
| The bridge | `desktop/bridge.cjs`, `desktop/preload.cjs` | Starts the core's helper, passes the calls of the interface to it, keeps the account credentials (Electron `safeStorage`), and gives the interface a few checked file operations. The interface sees `window.odDesktop` only (contract at the top of `bridge.cjs`) |
| The core's helper | `desktop/host/host.cpp` → `opendives-host` | Subsurface's core, `core/compat` and the façade, compiled natively for the system (`native/desktop/`), in a **separate process** that speaks JSON lines on its standard input and output: one handler per function of the Android bridge (`opendives_jni.cpp`), with the same names and results |
| The plugin | `plugins/opendives-core/desktop.js` | The desktop implementation of `OpenDivesCore`, method by method as `OpenDivesCorePlugin.kt`, built on `window.odDesktop`; `core-api.js` registers it as the plugin's web implementation, so the app's code does not know it runs on a computer |

**Why a helper process and not a Node module.** A Node module must be built with the compiler Electron was built with (Visual Studio on Windows) against each Electron version. A separate program builds with any compiler (gcc on Linux, clang on macOS, llvm-mingw from Linux for Windows), does not change when Electron does, and a crash of the core does not take the window down: the bridge starts it again. The core works on one logbook at a time from one thread, so one long-lived process fits; its replies are already JSON.

**Build.** `native/desktop/build.sh <target>` builds the core's dependencies and `opendives-host` in `build/desktop/<target>/` (`linux-x64`, `win-x64`, `mac-arm64`, `mac-x64`); `npm run dist` in `desktop/` gathers the interface (built without the development switches), the helper, Subsurface's XSLT stylesheets and the sample logbook (`desktop/scripts/prepare.cjs`), then electron-builder makes the packages: NSIS and APPX (Microsoft Store) on Windows, DMG and MAS (Mac App Store) on macOS, AppImage and Flatpak on Linux. The `desktop` GitHub workflow builds the three systems; it is started by hand.

**What the desktop does not have yet.** Offline maps, the gauge camera, QR codes, Apple Health and the Bluetooth download (planned through Chromium's Web Bluetooth, in JavaScript) answer as on a device without them (`desktop.js` lists each one).

**Metered connection (task 2026-11-15-202).** « Seulement sur Wi-Fi ou câble » stops the automatic sync (edits sent after a change, the retry, the exchange at start, the catch-up when the network returns) on a metered or tethered link; « Synchroniser maintenant » always works. Chromium has no such signal on desktop, so the main process asks the system (`desktop/network.cjs`, `window.odDesktop.network`): Windows, WinRT `GetConnectionCost()` through PowerShell (Fixed or Variable, or a mobile broadband profile, is metered; a phone's Wi-Fi hotspot is marked so by Windows); Linux, NetworkManager `nmcli ... GENERAL.METERED` (yes or yes (guessed)); macOS, the default route's hardware port (iPhone USB, cellular modem), the iPhone hotspot's gateway 172.20.10.1 or DHCP option ANDROID_METERED (written from the system's documented output, not run on a Mac). When nothing can tell (no `nmcli`, a failed command, a timeout, an unsupported system) the answer is `unknown` and the sync is allowed. The answer is cached, asked again when the network interfaces change (a 15 s in-process check, only while a window watches) or after 5 minutes, and the commands are asynchronous with an 8 s timeout, so the interface never waits on them except the start-up exchange, which waits at most 2.5 s when the switch is on. `OD_NETWORK_COST=metered|unmetered|unknown` forces the answer for checks.

**Several logbooks (task 2026-11-15-173).** One window per logbook, one core helper per window, because the core holds one logbook at a time. `desktop/windows.cjs` opens, reuses (a logbook already open comes to the front) and closes the windows and answers the interface's `od:logbooks` messages (new, open, recent, close, save a copy); `desktop/logbooks.cjs` holds the descriptors and the recent list (`<userData>/logbooks.json`). `bridge.cjs` keeps a context per window (its `webContents` id): its descriptor, its helper, its git token. The preload gives the interface `window.odDesktop.logbook` (`{id, kind, name, location}`; `null` on the start screen), and every ipc call is routed to the helper of its sender; without a sender (tests) the default context, the logbook of this computer, answers, so the single-window case works as before. Three kinds of logbook:
- `main`: `<userData>/carnet`, local or the Subsurface cloud account, exactly as before (id `main`);
- `file`: a `.ssrf` file. The core works on a git copy in `<userData>/logbooks/<id>/repo`; at the start of the helper the copy is made again from the file when the file is not the one the app last wrote (a hash in `meta.json`), and after every `saveLocal` or `sync` the bridge writes the copy back to the file (`exportDives`, format `ssrf`, every dive, then an atomic replace). No new core function. Limit: the file is written by Subsurface's "export selected dives" (settings, unused sites and empty trips are not kept); a core function that saves the loaded logbook to a plain file would remove it;
- `git`: a repository the diver owns; the token is stored per logbook (`git-remote-<id>.bin`, Electron `safeStorage`), the logbook is read and written through the existing git code. The new-logbook dialog checks and prepares the repository with a short-lived helper of its own.
`cloud`: a `.ssrf` file in a personal cloud (Google Drive, OneDrive, Dropbox), reached through the service's API (`desktop/cloud.cjs`, see below). Closing a logbook stops its helper and reloads the window on the start screen.

**Cloud logbooks (task 2026-11-15-173).** Sign-in is OAuth 2 for installed apps with PKCE: the system browser opens the provider's page (`shell.openExternal`), the main process listens on a loopback address (`http://127.0.0.1:<free port>` for Google and Microsoft, the fixed `http://127.0.0.1:53682/` for Dropbox), checks `state`, exchanges the code with the PKCE verifier, reads the account name. The access scope of each service is one constant (`ACCESS` in `cloud.cjs`: Google `drive.file`; Microsoft Graph `Files.ReadWrite.AppFolder` with the app-folder root; Dropbox an app-folder app. Decided on 15 November 2026: the app folder stays, no full access). Client ids come from `desktop/oauth-clients.local.json` (git-ignored); a service without one is "not available" and its row is disabled. Refresh tokens are encrypted with `safeStorage` in `<userData>/cloud-<service>.bin`; the interface only receives `{ provider, available, connected, account }`, and the bridge refuses these files and the keys file in every path argument. A cloud logbook is the file logbook machinery on a working copy (`<userData>/logbooks/<id>/logbook.ssrf`, written back with Subsurface's Save As as for any file logbook) plus the remote file. `meta.json` keeps the revision last seen (Drive `headRevisionId`, Graph `cTag`, Dropbox `rev`) and `pending` (a local change not sent). Every write-back is followed by an upload (refused if the remote revision moved: Dropbox `update` mode, a check before sending elsewhere). On open, on window focus (at most every 30 s) and every 5 minutes the remote revision is read: unchanged, nothing; changed and nothing pending, the file is downloaded and the window reloads; changed and pending, a dialog offers "La copie de cet ordinateur" or "La copie de {service}" with both dates, or "Décider plus tard" (nothing is overwritten before a choice; it is not asked again until the logbook is reopened). Offline, the working copy is the logbook and the change waits (`pending`). Limits: one account per service; Dropbox uploads up to 150 MB; the sync state is emitted as the `cloudSync` core event but no screen shows it yet. The new-logbook dialog never asks for a folder: the file goes into an `OpenDives` folder (`DEFAULT_FOLDER` in `cloud.cjs`: Google Drive and WebDAV an `OpenDives` folder at the root; OneDrive and Dropbox the app-folder root). « Changer de compte » signs in again with `prompt=select_account consent` (Google), `prompt=select_account` (Microsoft) or `force_reauthentication=true` (Dropbox); the stored tokens are replaced only once the new sign-in succeeded (a failure leaves the earlier account). **WebDAV ou Nextcloud (task 2026-11-15-208)** has no browser sign-in: the page sends the server address, user name and password once, on « Créer le carnet »; the main process (`cloud.cjs`, Node `fetch`) checks the connection with `PROPFIND` Depth 0, keeps `{ baseUrl, username, password }` encrypted with `safeStorage` in `<userData>/cloud-webdav.bin` (never sent back to the page, never logged; the status only says `alice@host`), creates the `OpenDives` collection with `MKCOL` (405 means it exists), and `PUT`s the .ssrf. The address is https, or http for `localhost`, `127.0.0.1` and `::1` only; no scheme means https. A bare server address is tried first as a Nextcloud, `https://host/remote.php/dav/files/<user>/`, then as it stands (any other WebDAV server); an address that already contains `/remote.php/dav/` or `/remote.php/webdav` is used as pasted. The revision is the `getetag` of a `PROPFIND` (quotes and `W/` ignored); a save is a `PUT` with `If-Match` on it, and 412 is a remote file changed elsewhere (the same version choice as the other services). The credentials are kept for the creation and put back (or removed) if it fails. Errors carry codes the page puts under the field concerned: `BAD_ADDRESS`, `INSECURE_ADDRESS` and `NETWORK` under « Adresse du serveur », `BAD_CREDENTIALS` (401) under « Mot de passe », the others at the bottom. Limit: one WebDAV account at a time, shared by every WebDAV logbook.

**Start-up.** « Ouvrir au démarrage » (Réglages > Carnet) is kept in `<userData>/logbooks.json` with the logbooks open at the last quit: `last` (default) reopens them, each in its window; `ask` opens the start screen.

**Interface.** From 1200 dp wide the desktop app shows the logbook as a table beside the detail (`pages/DesktopLogbook.svelte`, `lib/desktop-table.js`); below, the tablet layout. `lib/layout.svelte.js` tells the desktop app (`desktopApp`, `desktopMac`) and its width (`layout.desktop`). See docs/system-design.md, section 7, and docs/ui-specification.md, « Desktop logbook ».

## 11. OpenDives server (release edition)

Decided on 16 November 2026. **Release edition** (the default build, in `main` since 18 November 2026; `VITE_EDITION=alpha` builds the alpha behaviour): the app keeps working without any server (local mode; the Subsurface cloud and the own git repository are the alpha's: the beta never offers to open a logbook in a cloud drive or a personal git repository, decided on 18 November 2026, and the git code stays for the OpenDives server). The Subsurface cloud mode of section 6 is unchanged: there the log stays in Subsurface's format and desktop Subsurface reads and writes it (see AGENTS.md, "Coexistence"). This section is only the OpenDives-server edition. The server code, the development stack and the hosting plan live in a **private repository** (`opendives-server`); this section only fixes what the app and the server agree on. The logbook format (11.3) was decided finally on 18 November 2026: the dives stay in Subsurface's git format, and this decision replaces the earlier ones of this section.

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
| The dives (with sites, trips, cylinders) | Git repository, branch `main`, **Subsurface's git format**, read and written by the core | One engine for the alpha and OD+ (section 11.3). |
| Everything OpenDives-only (inventory, kits, maintenance, gas analyses, certifications, diver profile, settings) | Same repository, branch `opendives`, JSON files | Never read or written by Subsurface's code (section 11.3). |
| Accounts, sessions, friends, public site base | PostgreSQL + PostGIS | Sharing is **opt-in** (section 11.7). |
| Photos, videos, encrypted documents | S3-compatible object storage | Referenced by content hash (section 11.6). |
| Sign-in | OpenDives API | E-mail code, no password (section 11.2). |

The API never holds the logbook itself: the app talks to the git hosting directly with a scoped token that the API hands out at sign-in. Git gives what the logbook needs: history, offline work on the device and a merge when two devices changed the same logbook.

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
    "branch": "main"
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
| 429 | `RESEND_TOO_SOON` | A second code was asked within 30 seconds | None: a guard only. "Send the code again" stays disabled during the countdown (from `resendAfterSeconds`), so the app never calls early and shows no separate message |
| 502 | `UNREACHABLE` | The server could not send the e-mail or finish provisioning | Same screen as a network failure |
| 404 / 500 | `NOT_FOUND`, `SERVER_ERROR` | Unknown route, unexpected error | Same screen as a network failure |
| (no response) | `UNREACHABLE` | Client side: no network, timeout, TLS failure, a 5xx without a JSON body | "Server unreachable": **Try again** and **Choose another place** |

The 6-digit code, the 10-minute expiry, the 5-attempt limit and the 10-minute wait are the values of the design tasks 259 and 260. They are server constants: the app reads the actual delays from `expiresInSeconds`, `resendAfterSeconds` and `retryAfterSeconds`, never from its own copy.

**In the app (tasks 2026-11-16-259 and 260).** The server's address is the build's `VITE_SERVER_URL`; while developing (`vite`) it defaults to `http://10.0.2.2:8080` on Android and `http://127.0.0.1:8080` elsewhere, and a built app without the variable has no address and shows « Le serveur ne répond pas » (`lib/server-url.js`). Only https, or http to the development server of this machine, is accepted; the Android debug build alone allows clear text to those two addresses (`app/android/app/src/debug`). The calls go through the native HTTP client on a phone and the main process on the desktop (the API sends no CORS headers). The session (session token and git token) is kept by the plugin (`serverSessionSave`, Keystore, Keychain, `safeStorage`), never in the device store. The download (`lib/server-logbook.js`) lists the branch through the git host's HTTP interface and fetches the small JSON files; loading them into the core is the open point below and is not built, so the screen says the logbook cannot be opened yet.

**Creating a logbook and OpenDives+ (tasks 2026-11-17-265 and 266).** The verify answer carries `user.subscribed` (boolean); an account that is not subscribed goes to the offer and nothing of it is kept on the device. The app writes a new logbook itself, with the session's git token, through the git host's HTTP interface (`POST .../contents`, several files per commit): sites and trips with the first dive that needs them, the dives in small commits (5 dives each), and `opendives.json` last, so that a logbook with a marker is a complete one. Which dives are on the server is read from the branch's tree; the device keeps only the ids it gave and the name (`od.serverUpload`, no token), so an interrupted upload resumes with the same files and is offered again at the next start. An empty repository answers the tree request with 400 « sha not found » on Forgejo; the app reads that as empty. The dives come from the core as JSON (`getDive`) and are mapped in JavaScript (`lib/server-logbook-format.js`); the samples written are the core's plot samples. Not built yet: loading a logbook of the server into the core (the open point below), syncing later edits, Google and Apple sign-in and the store purchase (`lib/odplus-billing.js`, one inert function each).

### 11.3 The logbook on the server (decided on 18 November 2026)

This replaces the earlier proposal of an OpenDives-own JSON format for dives. **The dives stay in Subsurface's git format.**

- **One repository per diver** on the server's git host. The server is one more git host: the app syncs an OD+ logbook with the core's existing git code (libgit2), exactly as it already syncs a Subsurface logbook with the diver's own git repository ("Use my own git repository").
- **One engine: Subsurface's core**, for the alpha and for OD+. Filters, statistics, planner, calculations, edits and undo are never rewritten: every screen works on an OD+ logbook as it does today. Dives, sites, trips, cylinders, dive numbers and profiles are Subsurface's own data, read and written by the core.
- **Two branches in the same repository:**

| Branch | Content | Read and written by |
| --- | --- | --- |
| `main` | The dives, in Subsurface's git format | The core (Subsurface's code), as today |
| `opendives` | OpenDives-only data, as JSON files (below) | The app, through generic git calls of the façade; Subsurface's code never reads or writes it |

- Subsurface desktop could open the `main` branch of an OD+ repository, but the supported way to use the dives in Subsurface remains the export (section 11.4). **The `opendives` branch must never be pushed to a Subsurface cloud repository** (alpha): on the Subsurface cloud nothing changes (AGENTS.md, "Coexistence").

#### What goes in the dive's extra data

Subsurface keeps the extra data (key-value pairs) of a dive when it loads and saves the git format (the `keyvalue` handling of `load-git.cpp` and `save-git.cpp`); unknown entries survive a round trip. OpenDives stores there:

- the dive's **stable identifier**: a random UUID version 4, created once on the device that creates the dive, never recomputed, never reused (the Subsurface dive number can change; this id cannot);
- the **links to equipment**: the ids of the inventory items used (`gear/<id>`), of the kit used (`kits/<id>`), and the free description of a piece used that is not in the inventory.

Key-value is judged sufficient for OD+. The entries use the `OpenDives ` prefix (the same mechanism as `OpenDives title` for saved plans). Files on the `opendives` branch refer to a dive by this id (`"diveId"`).

**Equipment already in the logbook (decided on 18 November 2026).** Subsurface gives equipment no identity of its own, except dive computers. Dive computers are matched by what Subsurface already records (model, device id, serial number): no key is written. The suit, cylinders and weights are text in each dive; when a logbook enters OD+, the app lists their distinct values with their dive counts and the diver turns them into inventory pieces (merging variants, skipping rented items). The result is a **mapping rule** on the `opendives` branch (`gear-mapping.json`: text value → piece id): past dives are linked through it and are **not rewritten**. The extra data of a dive is written only when the dive is saved in OpenDives (its id, the pieces used, pieces not in the inventory, the kit), and it always wins over the mapping rule; it also settles ambiguous cases such as two pieces with the same description.

#### The `opendives` branch

```
opendives.json                     { "format": 1, "kind": "opendives-data", "minReader": 1, "createdAt": "..." }
gear/<id>.json                     inventory item: cylinder, regulator, suit, ... (#42)
kits/<id>.json                     kit: a name and the `gearId`s of its pieces (#42, added on 17 November 2026)
maintenance/<id>.json              reminder or service record (#47)
gas-analyses/<id>.json             analysis of a cylinder's gas (#49)
certifications/<id>.json           certification or document (#48), sensitive: encrypted
profile/diver.json                 diver profile (#63): plain fields + one encrypted block
settings/units.json                the units, each measure separately
settings/planner.json              planner defaults
settings/computers.json            dive computers list (nicknames, serials)
keys/wrapped.json                  data key wrapped for the optional recovery phrase (section 11.5)
media/<dive id>.json               photos and videos of a dive, by hash (section 11.6)
```

- **`<id>` is a random UUID (version 4), created once on the device that creates the item, never recomputed, never reused.** It is a field of the file (`"id"`) and the file name.
- A maintenance item holds the `gearId` of its item; a link to a dive is `"diveId": "<dive id from the extra data>"`.
- JSON is written with sorted keys, two-space indent and a final newline, so that equal data gives equal files and text diffs stay readable.
- Commits on this branch are made by the app, signed "OpenDives", one per validated action.

```json
// gear/<id>.json
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "type": "regulator", "name": "...", "brand": "...", "model": "...", "serial": "...",
  "purchasedOn": "2024-05-01", "tags": ["travel"], "retired": false }

// maintenance/<id>.json
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "gearId": "<uuid>", "task": "service", "intervalMonths": 24, "intervalDives": 100,
  "startOn": "2026-11-18", "lastDoneOn": "2026-03-10", "notifyDays": 30, "warnInDive": true,
  "history": [ { "id": "...", "kind": "service", "doneOn": "2026-03-10", "doneBy": "...", "cost": 185, "notes": "", "invoicePhotoId": "..." } ] }
// task: service | inspection | hydrostatic | battery | seals | travelCheck | custom (+ "label").
// Either interval may be null (not both for an active reminder). Dives counted: those where the piece is in the
// dive's equipment, after lastDoneOn (from startOn before a first service). The first criterion reached wins.

// gas-analyses/<id>.json
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "diveId": "<uuid>", "gearId": "<cylinder uuid>",
  "o2Percent": 32.0, "hePercent": 0.0, "pressureBar": 200, "analysedAt": "..." }

// certifications/<id>.json   (sensitive: the whole payload is encrypted, section 11.5)
{ "format": 1, "id": "...", "createdAt": "...", "updatedAt": "...",
  "enc": { "v": 1, "alg": "A256GCM", "kid": "...", "nonce": "<base64>", "ct": "<base64>" } }
// plaintext: agency, level, number, issuedOn, expiresOn,
// "documents": [ { "hash": "<sha256>", "mime": "application/pdf", "size": 123456 } ]

// profile/diver.json   (plain fields + one encrypted block)
{ "format": 1, "updatedAt": "...", "displayName": "...", "homeAirport": "...",
  "enc": { "v": 1, "alg": "A256GCM", "kid": "...", "nonce": "...", "ct": "..." } }
// plaintext of enc: bloodGroup, allergies, medicalNotes, emergencyContact { name, phone }
```

#### Kits and what a dive used (added on 17 November 2026, task 267)

```json
// kits/<id>.json
{ "format": 1, "id": "<uuid>", "createdAt": "...", "updatedAt": "...", "name": "Cold water", "gearIds": ["<uuid>", "<uuid>"] }
```

- `gear/<id>.json` also takes the optional fields `note` (the line under the name), `computerModel` and `computerSerial` (tie a dive computer to the dives it recorded), `firmware` and `firmwareReadAt` (read at a download, never typed). A dive computer enters the inventory at its first download.
- What a dive used goes in `dive.json`: `"gear": { "suitGearId", "undersuitGearId", "gearIds": [...], "adhoc": [ { "id", "name" } ], "kitId" }`. `adhoc` pieces (borrowed, rented) live only there and never enter the inventory. Weights stay in `weights`, outside the inventory.
- **Interim on the device, until the logbook is read in this format:** the on-device logbook is still the Subsurface core's, whose numeric ids are valid for one load, so the same content is kept in `dive-equipment/<uuid>.json` with `"diveKey": { "start": "<local start time to the second>" }`. The start time is the key (Subsurface itself merges two dives that start together); editing it re-keys the file. When the dive has its own UUID, the file's content moves into its `dive.json` and the file goes away. The working copy is held in a file store with this layout (`app/src/lib/file-store.js`, IndexedDB until a file plugin is chosen), and `meta/state.json` and `meta/pending.json` (files changed here and not sent) stay on the device.
- After an OpenDives+ subscription ends the inventory is read only for 30 days (the app writes nothing to it), then lost unless the diver subscribes again or exports it.

#### Versions and unknown fields

- Every file carries `"format": <integer>`; `opendives.json` carries `minReader`, the lowest app format that may write the branch.
- An app that finds `minReader` above its own format leaves the branch **read only** and says why; it never rewrites anything.
- A file with a `format` newer than the app knows, on a branch the app may write, is kept byte for byte and shown read only for that item.
- **Unknown fields are preserved.** The app reads a file as a JSON object, changes only the keys it owns and writes the object back; it never rebuilds a file from its own model.
- Adding an optional field is not a format change; changing the meaning of a field or removing one is, and raises `format`.

#### Merge and conflicts

- **`main`** (the dives): merged by the core's git code, as for any Subsurface logbook; the existing conflict handling applies.
- **`opendives`**: granularity is **the file** first, then **the field**. The device does the merge, never the server: the server only accepts fast-forward pushes. A device whose push is refused fetches, merges, then pushes again; offline work is a list of local commits that go through the same path when the network is back.
  1. Two devices that changed **different files** never conflict (git merges them).
  2. Two devices that changed **the same file**: the app does a three-way merge of the JSON objects (base = common ancestor, ours, theirs), key by key, instead of git's text merge. A key changed on one side only takes that change. Arrays (`tags`, `documents`, ...) are one value: changed on one side only, taken; changed on both, a conflict on that key. A key changed on both sides to the same value is not a conflict.
  3. A conflict on a key goes to the choice screen already built for the cloud conflicts (the "sync conflict" state, version choice). Until the person chooses, the later `updatedAt` is kept in the working copy and the other version stays in the history, so nothing is lost and a silent sync never blocks.
  4. Deleting an item deletes its file (git keeps the history). Deleted on one side and changed on the other: the change wins and the file stays; the person can delete it again.
  5. Two devices that **create** items never collide: the ids are random UUIDs, so the paths differ.
  6. For an encrypted file the app decrypts base, ours and theirs, merges the plaintext objects, and encrypts the result with a fresh nonce.

The merge of these JSON files is JavaScript in `app/src/lib`, tested in `tests/app`; it only needs the files, which the façade's git calls hand over.

#### Git on the device (decided on 18 November 2026)

The app keeps a real git working copy of the repository on the device, in the app's data directory, and talks to the server with git over HTTPS. **Git is libgit2, already linked in the core.** The core's own git code syncs the dives (`main`). For the `opendives` branch, the façade exposes a few generic libgit2 calls: clone, fetch and merge, commit of a list of files, push, status. This is a deliberate exception to "JavaScript first": git is not a Subsurface function, and isomorphic-git in JavaScript was rejected as too slow on a simulated mid-range phone (1,000 dives: 13 to 24 s to clone, 5 to 13 s per edit round trip; `docs/spike-git-on-device.md` on branch `spike/git-on-device`). A first push that is too big may be split into several pushes. The git host's web API is not used for the logbook.

### 11.4 Export to Subsurface and full export

An OD+ logbook already holds Subsurface data, so **the export to Subsurface is direct**: the core writes the dives it holds in Subsurface's format (XML or git), and the extra data (the `OpenDives ` entries) stays in them, so that re-importing the export into OpenDives maps to the same dives. Nothing is converted and nothing is dropped from the dives. Import from Subsurface (XML, `.ssrf` or a Subsurface git logbook) is the core's import as today; a dive already in the logbook is skipped when one of its computers has the same `deviceId` and `diveId`, or, for a manual dive, the same start and duration.

Using the dives in Subsurface desktop is supported **through this export**. Opening the `main` branch of the repository directly is technically possible but not the supported way. Data that Subsurface has no place for (inventory, kits, maintenance, certifications, gas analyses, diver profile) lives on the `opendives` branch and is not in the Subsurface export.

**Full export (decided on 17 November 2026):** a separate « export all my data » action, asked for by the diver (for example from the account), writes everything: the dives, the files of the `opendives` branch, the media files, and the decrypted sensitive items after the device unlocks them. It is the diver's copy of their data, distinct from the Subsurface export; its exact packaging is decided when its screen is designed.

### 11.5 Sensitive data: encrypted on the device

The server and its operator must not be able to read the **sensitive items**: documents and certifications (#48), blood group, allergies, medical notes and emergency contact (#63). The rest of the logbook is readable by the server; the app and the privacy policy say this plainly. Because the sensitive items are encrypted on the device, the physical location of the object storage does not matter for them: they are unreadable wherever they are stored.

1. **Data key.** At first use, the device creates a random 256-bit key. It lives in the platform's secure storage and never reaches the server in clear.
2. **Encryption.** Sensitive payloads are encrypted on the device with AES-256-GCM (a fresh random nonce each time, the item id and `format` as authenticated data) before the commit or the upload. The file keeps `enc: { v, alg, kid, nonce, ct }`; `kid` names the key so that it can be rotated.
3. **Documents** (scans, PDFs) are encrypted the same way and stored in object storage under the hash of the **ciphertext**; the certification item holds the hash list.
4. **Getting the key on a new device**, in this order:
   - **Platform keychain.** iOS: the key is a synchronisable Keychain item (iCloud Keychain), so a new iPhone or iPad of the same Apple account receives it. Android: Google Block Store, with the system backup as a second route, restores it on a new Android device of the same Google account.
   - **Device-to-device QR transfer.** On a device that has the key, "Add a device" shows QR codes; the new device scans them and keeps the key in its own secure storage. The transfer is local (camera and screen), with the animated-code mechanism the app already has for dives and plans (`qr-send.js`, `qr-receive.svelte.js`); nothing passes through the server. The codes appear only after the person confirms on the old device.
   - **Recovery phrase (optional).** The person can ask for a generated phrase; the data key is then also stored **wrapped** in `keys/wrapped.json` (encrypted with a key derived by Argon2id from the phrase, parameters stored in the file). Off by default.
5. **Limits, said plainly in the app:**
   - The keychains do not cross platforms: there is **no transfer from an iPhone to an Android phone (or the reverse) through the keychain**. Changing platform needs the QR transfer or the recovery phrase.
   - **Desktop** (Windows, macOS, Linux) has no synchronised keychain: it relies on the QR transfer from a phone, or on the recovery phrase if the person made one.
   - The keychain routes depend on the platform account (Apple, Google) and on iCloud Keychain, or the Android backup, being turned on.
   - If every device and every platform backup is lost **and** there is no recovery phrase, the sensitive items cannot be read again, by anyone. The app says so, once, when the key is created.

Until the key routes are built, the single-device case works with the device's own secure storage alone.

### 11.6 Photos and videos: by hash

- Photos stay on the device by default (unchanged). Uploading the photos or videos of a dive is **opt-in**, per dive or album.
- An uploaded file is stored once, under the **SHA-256 of its content** (`media/<hash>`), so the same photo uploaded twice, or from two devices, is one object.
- The reference lives in `media/<dive id>.json` on the `opendives` branch: `{ "format": 1, "diveId": "<dive id>", "items": [ { "hash": "...", "mime": "image/jpeg", "size": 0, "takenAt": "...", "caption": "" } ] }`. Merge: `items` are merged by `hash` (union); the caption is a field of the item.
- The app holds no storage credentials: it asks the API for short-lived signed URLs to upload or download an object. The API only signs for objects the person owns or that were shared with them (section 11.7).
- Originals are never altered or recompressed on upload.

### 11.7 Shared data: opt-in

Everything social lives in PostgreSQL + PostGIS, never in the logbook.

- **Off by default.** The account works fully with nothing shared. Each kind of sharing is a separate switch, each with a sentence that says exactly what leaves the device: for example "Follow friends" (name and the dives a friend chooses to show) and "Contribute my sites to the public site base" (site name, position, water type; no dive, no date, no name).
- Sharing a site to the public base copies only the listed fields; the person's own logbook entry is not modified. Withdrawing deletes the copy.
- A follow needs the other person's acceptance.
- Nothing from the sensitive items (section 11.5) is ever shared.

### 11.8 Where the rest lives

The server code, the local development stack (containers, seed data, smoke test) and the hosting plan (hosting, backups, restore, monitoring, privacy-law notes, go-live checklist) are in the **private repository `opendives-server`**. They are deliberately not described here: this repository only holds what the app depends on.
