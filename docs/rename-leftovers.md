# Rename to Benthic: what keeps the old name

Task 2026-11-19-316. The app is Benthic everywhere the diver reads (texts, names under the icon, links, e-mails, desktop window and menus, privacy policy, site). The names below still say OpenDives, because renaming them would break an installed app, a sign-in, stored data or a signed identity. Each line says what renaming would involve.

## Identity and signing (cannot change after release without a new app)

| Name | Where | Renaming means | Risk |
|---|---|---|---|
| `org.opendives.app` (appId, bundle ID, Android `namespace` and `applicationId`, iCloud container `iCloud.org.opendives.app`, background task `org.opendives.app.maps-download`) | `app/capacitor.config.json`, `app/android/app/build.gradle`, `app/ios/**`, `desktop/package.json`, `site/build.mjs` (assetlinks, AASA), tests/e2e | A new app in both stores: installed apps are not updated, data and subscriptions do not follow, deep-link verification files change | Very high; decide before the first store release |
| Windows Store `identityName: "OpenDives"` | `desktop/package.json` | Reserved in Partner Center under that name | High once reserved |
| Desktop package name `opendives-desktop` (decides Electron's `userData` folder) and the origin `app://opendives/` | `desktop/package.json`, `desktop/main.cjs` | The data folder and the web storage of installed desktops move: logbooks seem lost | High for installed desktops |
| Electron/Android/iOS logbook folder `OpenDives` on Google Drive, WebDAV and the iCloud container name | `desktop/cloud.cjs` (`DEFAULT_FOLDER`), `app/ios/App/App/Info.plist` | Existing cloud logbooks would no longer be found | High |

## Stored data and sign-in

| Name | Renaming means | Risk |
|---|---|---|
| Device-store keys `od.*`, secure-storage keys, account and session files, `<userData>/odgit`, `cloud-dev.env` | A migration that copies every key and file | High (sign-out, lost settings) |
| `opendives/` folder and `manifest.app: "OpenDives"` inside the full-data export archive | Importers must read both | Medium |
| Second git branch `opendives` of a Benthic+ logbook, Forgejo repository description "OpenDives logbook", git author `OpenDives` in logbook commits | Server and core must accept both; existing logbooks keep the old branch | High (breaks the logbook format shared with Subsurface) |
| URL scheme `opendives://` (still accepted; `benthic://` not added) | Add a second scheme in the manifest, Info.plist and `parseLink` | Low; can be added any time |
| `app://opendives/` origin, `odtiles://` scheme | See above | High |

## Code names (no user-visible effect)

| Name | Renaming means | Risk |
|---|---|---|
| GitHub repositories `remillc/opendives` and `opendives-server`, Cloudflare Pages project `opendives` | Rename on GitHub (redirects stay) and update `SOURCE` in `site/build.mjs` and the remotes | Low | **Done 19 November 2026:** repositories renamed `remillc/benthic` and `remillc/benthic-server` (GitHub redirects the old addresses); links in the code updated.
| `docs/mockups` and `docs/mockups-release` file names (`*odplus*`), one design file that points to `docs/brand/opendives-*` | Design files, referenced by name in the inbox | Low |
| History: `CHANGELOG.md`, closed tasks of `docs/agent-inbox.md`, `docs/TODOS.md`, `docs/IDEAS.md` | Left as written | None |

## Files and folders renamed in this task

Code names (task 2026-11-22, step 1; no user-visible or stored-data effect):

- Capacitor plugin: package `opendives-core` became `benthic-core`, folder `plugins/opendives-core` became `plugins/benthic-core`, `OpenDivesCore` became `BenthicCore` (JS export, Capacitor registration name on Android, iOS and the web), `OpendivesCore.podspec` became `BenthicCore.podspec`, `OpenDivesCorePlugin` became `BenthicCorePlugin`, Kotlin package `org.opendives.core` became `app.benthicdivelog.core` (and the JNI symbols `Java_org_opendives_core_*`), `opendives_jni.cpp` became `benthic_jni.cpp`, `libopendives.so` became `libbenthic.so`, Swift/ObjC `OpenDivesNative*` became `BenthicNative*`.
- Façade: `core/libopendives` became `core/libbenthic`, `opendives.h/.cpp` became `benthic.h/.cpp`, namespace and symbols `opendives::`, `opendives_*` became `benthic::`, `benthic_*`, CMake target `opendives_core` became `benthic_core`. The `odgit.*` files and `odgit_*` functions keep their name (they are tied to the `<userData>/odgit` folder of step 2).
- `tests/app/opendives-core-stub.mjs` became `benthic-core-stub.mjs`; the environment variables `OPENDIVES_*` became `BENTHIC_*` (`OPENDIVES_HOST`, `OPENDIVES_STAGE`, `OPENDIVES_DEV_CA`, the cloud test variables and so on).
- Logcat tag and the map downloads' User-Agent `OpenDives` became `Benthic`; the `OpenDivesInsets` JavaScript bridge became `BenthicInsets`; `odplus` identifiers and translation keys became `benthicPlus` (the device-store key `od.odplusSubscribed` is stored data and keeps its name); `odDesktop` became `benthicDesktop`; the router fields `odLocks`, `odRaw` and so on became `bcLocks`, `bcRaw`; the Vite plugins `od-…` became `bc-…`.
- Still on the old names, for a later step: the `OD_*` development variables (`OD_HOST`, `OD_STAGE`, `OD_E2E_PORT`, ...), the `od-*` CSS classes, element ids, custom events and keyframes, the `od_*` temporary-folder prefixes, the QR payload key `odValidation` (a wire format), the `org.opendives.maps*` queue labels, the Android server User-Agent `OpenDives` of `desktop/bridge.cjs` and the web view's `appendUserAgent`, the npm names `opendives-app` and `opendives-dc-images`, and the word « OpenDives » in code comments.

- `docs/brand/opendives-*` and `docs/brand/previous/opendives-*` became `benthic-*`.
- The desktop helper `opendives-host(.exe)` became `benthic-host(.exe)` (CMake target, `native/desktop/build.sh` output, `desktop/main.cjs`, `desktop/scripts/prepare.cjs`, tests, tools).
- `app/src/components/OdPlus*.svelte` and `FirstLaunchOdPlus.svelte` became `BenthicPlus*.svelte` and `FirstLaunchBenthicPlus.svelte`; `app/src/lib/odplus*.js` became `benthic-plus*.js`.

## Hosts

Links on `opendives.app` still open the app: both hosts are in the Android intent filters and in `App.entitlements`; `parseLink` accepts both; the app shares `benthicdivelog.app` links. `opendives.app` itself must redirect (Cloudflare) and keep serving `/.well-known/assetlinks.json` and the Apple association file for as long as old links are in circulation.
