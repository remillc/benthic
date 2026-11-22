# Rename to Benthic: what was renamed, what keeps the old name

Task 2026-11-19-316 renamed what the diver reads (texts, names under the icon, links, e-mails, desktop window and menus, privacy policy, site). Step 1 (22 November 2026) renamed the code names. **Step 2 (22 November 2026, decided by Christian: change everything before the first store release)** renamed the app identity, the stored data names, the git branch of the server logbooks and the leftovers of step 1. This file is the inventory of what is left.

## What still says OpenDives, and why

| Name | Where | Why it stays |
|---|---|---|
| `opendives.app` (the old domain) | Android intent filters, `App.entitlements`, `parseLink` (`OLD_LINK_HOST`), `SUPPORT_EMAIL` and similar texts | The domain, not a name to clean. It must redirect (Cloudflare) and keep serving `/.well-known/assetlinks.json` and the Apple association file for as long as old links are in circulation. |
| Folder `OpenDives` on Google Drive and WebDAV, and in the iCloud container (`desktop/cloud.cjs` `DEFAULT_FOLDER`, `BenthicCorePlugin.swift`) | alpha edition only (the beta never offers a personal cloud) | A folder in the diver's own storage: renaming it would hide the logbooks already there. Not in the step 2 brief. |
| `~/.opendives/cloud-dev.env` | `poc/README.md`, `app/README.md` | A development file in the developer's home folder, not shipped. |
| Filter rule types `od_country`, `od_region`, `od_trip` | `app/src/lib/filter.svelte.js`, `core/libbenthic/filter.cpp`, `benthic.h` | Names of rules saved inside filter presets of the logbook: renaming them would orphan saved presets. Not in the step 2 brief. |
| Cloudflare Pages project `opendives`, `remillc/opendives-test` (a fake test address) | `site/README.md`, `tests/` | The project is renamed in the Cloudflare dashboard, not in the code; the address is a fixture. |
| Forgejo user names `od<hash>` of the server's accounts, dev stack names (`opendives-dev` Compose project, `POSTGRES_*`, bucket `opendives-media`, `od-admin`) | benthic-server | Stored identifiers of existing accounts and volumes of the development stack. |
| The old names inside the migrations: `od.` device-store keys, `odplusSubscribed`, `opendives-files`, `opendives-*` Keystore aliases, `odgit`, `refs/opendives/device/`, `OpenDives plan`, `OpenDives title`, the branch `opendives`, `app://opendives/`, `opendives-desktop` | `device-store.js`, `file-store.js`, `SealedFile.kt`, `bgit.cpp`, `internal.h`, `desktop/legacy-migration.cjs`, benthic-server migration script | They are what the migrations read. |
| Mock-up file names (`*odplus*`, `docs/mockups*`), `CHANGELOG.md`, closed inbox tasks, `docs/TODOS.md`, `docs/IDEAS.md`, `docs/agent-inbox.md` | docs | History, left as written. |

## Done in step 2 (22 November 2026)

**App identity.** `org.opendives.app` became `app.benthicdivelog`: Capacitor `appId`, Android `namespace` and `applicationId` (the Java package and folder of `MainActivity` and `SafeAreaInsets` moved to `app/benthicdivelog`), iOS bundle identifier, iCloud container `iCloud.app.benthicdivelog`, background task `app.benthicdivelog.maps-download`, queue labels `app.benthicdivelog.maps*`, file-type identifiers `app.benthicdivelog.ssrf`, `.divefile` and `.benthic`, `desktop/package.json` `appId`, `site/build.mjs` (assetlinks `package_name`, Apple app-site-association), tests and e2e scripts. Windows Store `identityName` became `Benthic`: **the name has to be reserved in Partner Center**. The app is a new app in the stores; the old `org.opendives.app` is a different app, whose data does not move.

**Desktop.** Package name `opendives-desktop` became `benthic-desktop` (it decides Electron's `userData` folder), the origin `app://opendives/` became `app://benthic/`, `odtiles://` became `bctiles://`. The migration is `desktop/legacy-migration.cjs` (see the section below).

**URL scheme** `opendives://` became `benthic://` (Android manifest, Info.plist, `deep-link.js`, `open-link.js`, `FLIGHT_LINK`, tests). Test addresses `@opendives.test` became `@benthic.test`.

**Stored names.** Device-store keys `od.*` became `bc.*` (`od.odplusSubscribed` became `bc.benthicPlusSubscribed`); IndexedDB `opendives-files` became `benthic-files`; Android Keystore aliases `opendives-data-key`, `-cloud-account`, `-git-remote`, `-server-session` became `benthic-*`; `<userData>/odgit` (and `<files>/odgit`, `<Documents>/odgit`) became `bgit`, and the code with it (`core/libbenthic/odgit.*` became `bgit.*`, `odgit_*` became `bgit_*`, the plugin methods `odgit*` became `bgit*` on JS, Kotlin, Swift and the desktop host; `tests/odgit_*` and `tests/run-odgit-test.sh` became `bgit`). The iOS Keychain service was already `app.benthicdivelog.core`, with account names that did not carry the old name. Export archive: folder `opendives/` became `benthic/`, `opendives.json` became `benthic.json`, `manifest.app` is `"Benthic"`; the temporary names `opendives-qr.ssrf`, `/tmp/opendives`, `/data/local/tmp/opendives-*`.

**Logbook data.** Git author `OpenDives` became `Benthic` (new commits only). The device's own history kept in the account's clone moved from `refs/opendives/device/` to `refs/benthic/device/` (renamed when a working copy is opened). The planned dives' extra data `OpenDives plan` and `OpenDives title` (in the diver's logbook, shared with Subsurface) are read under both names and written as `Benthic plan` and `Benthic title`; a dive that is saved loses its old keys.

**Git branch.** The second branch `opendives` became `benthic`, with no compatibility in the app or the core (`opendives.json` became `benthic.json`, kind `benthic-data`). The server side is `scripts/migrate-branch-opendives-to-benthic.mjs` in benthic-server (docs/server-migration.md there).

**Leftovers of step 1.** The `OD_*` development variables became `BC_*`; the `od-*` CSS classes, element ids, custom events (`od-cancel`), keyframes, `data-od-*` attributes, cascade layers (`od.tokens`, `od.base`, `od.components`) and the `__od*` window hooks became `bc-*` and `bc.*`; the IPC channels `od:*` became `bc:*`; the QR payload key `odValidation` became `bcValidation`; the Android string `od_maps_channel` became `bc_maps_channel`; User-Agents `OpenDives` became `Benthic` (`desktop/bridge.cjs`, `appendUserAgent`, and `Benthic/0.3.0` in `core/compat/qthelper_compat.cpp`); the npm names `opendives-app` and `opendives-dc-images` became `benthic-app` and `benthic-dc-images`; the iOS workflow artifact `OpenDives-simulator` became `Benthic-simulator`; the word « OpenDives » in code comments became « Benthic ».

## The one-time migrations

Every migration copies old to new, then deletes the old, and is idempotent (a second start finds nothing to move). None of them overwrites a value that already exists under the new name.

| What | Where it runs | When | Tested by |
|---|---|---|---|
| Device-store keys `od.*` to `bc.*`, the two localStorage caches (snapshots) | `device-store.js` `loadDeviceStore` | at each start, before the app reads a setting | `tests/app/device-store-migration.test.mjs` |
| IndexedDB `opendives-files` to `benthic-files` | `file-store.js` `migrateLegacyFilesDatabase`, at the first opening | once | `tests/app/file-store-migration.test.mjs` |
| Desktop data folder `opendives-desktop` to `benthic-desktop` (logbooks, `carnet`, `logbooks.json`, credential `*.bin`, window state, Chromium profile) | `desktop/legacy-migration.cjs` `migrateUserDataFolder`, in `main.cjs` before anything opens the folder | when the new folder is missing or empty and the old one exists; a rename, else a copy that leaves the old folder in place | `tests/desktop/legacy-migration.test.mjs`, and a real run of Electron on a copy of a real folder (22 November 2026) |
| Desktop web storage (localStorage, IndexedDB) of the origin `app://opendives` to `app://benthic` | `legacy-migration.cjs` `handOverLegacyOrigin`: two hidden windows, the old origin read, the new one written (absent keys only), the old one emptied; marker `legacy-origin.json` | at the first start with the new name; three tries at most | the same |
| `<userData>/odgit` to `bgit` (desktop), `<files>/odgit` (Android), `<Documents>/odgit` (iOS, not built) | `migrateGitFolder`, `BenthicCorePlugin.kt`, `BenthicCorePlugin.swift` | first use | the desktop part, in the same test |
| Android Keystore aliases `opendives-*` to `benthic-*` | `SealedFile.kt`, on the first read | once per secret | not tested (needs a device that holds the old key; the old app id is another app anyway) |
| `refs/opendives/device/*` to `refs/benthic/device/*` | `bgit.cpp` `open_repo` | each time a working copy is opened (nothing left after the first) | `tests/run-bgit-test.sh` (the « legacy refs » checks) |
| Extra data `OpenDives plan`, `OpenDives title` | `core/libbenthic` `rewrite_legacy_extra_data`, called before each save; `plan_extra_value` reads both | each save | `tests/edit_roundtrip.cpp` (`plans` mode: old keys read, a save rewrites them) |
| Branch `opendives` to `benthic` on the server | benthic-server `scripts/migrate-branch-opendives-to-benthic.mjs` | run by hand, dry run first | `scripts/migrate-branch-test.mjs`, and the local development stack |
