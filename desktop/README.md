# Benthic desktop

The desktop app is Electron (Windows, macOS, Linux). The Svelte app is the same as on phones; the
core (Subsurface's C++ code through the facade) runs in a helper process.

## Bridge

```
renderer (app/)                      main process                        helper process
core-api.js                          desktop/bridge.cjs                  desktop/host/host.cpp
  -> plugins/benthic-core/           ipc 'od:*' handlers   <-- stdio -->  benthic-host
     desktop.js  -> window.benthicDesktop   + HostProcess (restarts it)          (the facade)
                    (desktop/preload.cjs)
```

- **`plugins/benthic-core/desktop.js`** is the desktop twin of `BenthicCorePlugin.kt`: the same
  methods, option names, resolved shapes and rejection codes. `core-api.js` registers it as the
  plugin's `web` implementation; without `window.benthicDesktop` (a plain browser) its methods reject with
  `UNAVAILABLE`.
- **`desktop/preload.cjs`** exposes `window.benthicDesktop`; **`desktop/bridge.cjs`** (`setupBridge`) answers
  it. The full list of the preload API, the checks on paths and the ipc channels is at the top of
  `bridge.cjs`.
- **`desktop/host/host.cpp`** is the desktop twin of `benthic_jni.cpp`: one handler per `NativeCore`
  function, the same names, arguments, results and errors.

Wiring in `desktop/main.cjs`:

```js
const { setupBridge } = require('./bridge.cjs');
setupBridge({ ipcMain, app, safeStorage, hostPath, resourcesDir });
// webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true }
```

The Logbook menu can rename the current logbook's display name. It is kept in `logbooks.json` by
logbook ID, independently of the recent list; the logbook file, account and core process are unchanged.

`resourcesDir` holds `xslt/` (Subsurface's stylesheets, as `native/build-android.sh` copies them to the
Android assets) and `SampleDivesV2.ssrf`. By default: `<process.resourcesPath>/resources` when
packaged, else `desktop/resources`.

### Host protocol

One JSON object per line over stdio, UTF-8, nothing else on stdout (logs go to stderr).
The bridge omits only the core's missing CCR diluent-cylinder diagnostic from the desktop stderr
log. Other diagnostics and the core's return values are unchanged.

```
-> {"id":7,"method":"editDive","args":{"id":12,"changes":"{...}"}}
<- {"id":7,"result":<value>}        a string stays a string, even when it holds JSON
<- {"id":7,"error":"message"}       where the JNI function would throw
<- {"event":"syncProgress","data":{"message":"..."}}
```

`args` is a flat object (strings, integers, booleans, arrays of strings or integers; `null` reads as
absent). A function that returns nothing gives `"result":null`. Requests run in order on one core
thread; `cloudProbe` and `gitCheck` run on a second thread (they run beside a load), and
`downloadCancel`, `setCaFile`, `setXsltDir`, `dcFromBluetoothName`, `dcBluetoothModels` and `ping` run at
once. When stdin closes, the requests already received finish and the process exits.

The bridge calls `init`, `setCaFile` (a PEM file written from Node's root certificates) and
`setXsltDir` before any other call, and again after a restart of the host; the renderer cannot call
them. After a restart the plugin emits `coreRestarted`: what was loaded in the core is gone.

Left out of the host: `downloadDives` (Bluetooth will come from the web layer, Web Bluetooth).

### Tests

```sh
poc/build.sh                                   # Linux or WSL: the core objects
desktop/host/build-linux-test.sh               # build/desktop/benthic-host
BENTHIC_HOST=build/desktop/benthic-host node --test tests/desktop/host.test.mjs
node --test tests/desktop/bridge.test.mjs      # the bridge, with a fake host: no native build needed
node --import ./tests/app/register.mjs --test tests/app/desktop-plugin.test.mjs
```

### Personal clouds

`cloud.cjs` signs in to Google Drive, OneDrive and Dropbox (OAuth 2 with PKCE, system browser, loopback redirect) and syncs a cloud logbook's .ssrf file; `bridge.cjs` runs the sync around the working copy (see docs/architecture.md, section 10). The client ids are read from `desktop/oauth-clients.local.json` (git-ignored, never logged):

```json
{ "google": { "clientId": "...", "clientSecret": "..." }, "microsoft": { "clientId": "..." }, "dropbox": { "appKey": "..." } }
```

A service missing from the file shows "Pas encore disponible" and cannot be chosen. Tests: `node --test tests/desktop/cloud.test.mjs` (a fake OAuth server and fake providers; no real account), `tests/desktop/startup.test.mjs` (« Ouvrir au démarrage »).

### Hover audit

`node desktop/scripts/hover-audit.mjs <DevTools port>` checks the current page of a running desktop app: every visible element that shows the hand pointer must change its look under `:hover` (docs/system-design.md, section 8, « Pointer »). It forces `:hover` through the DevTools protocol and compares the computed styles of the element, its descendants and their pseudo-elements; the elements with no change are listed (exit code 1). Open the screen or the state to check first, then run it; `--verbose` also lists the elements that pass.

`node desktop/scripts/overflow-audit.mjs <DevTools port> [--size 768x560] [--reload] [--pre "<js>"] [--shot file.png] [--json]` checks the current page of a running desktop app against the fluid layout rule (docs/system-design.md, section 7, « Fluid desktop layout »): horizontal overflow of the document and of any element (a scrollbar, or content cut off at the right or the bottom), page-level vertical overflow, an element that sticks out of its box or the window, visible scrollbars, and panes that scroll although they are not marked as lists (`data-od-scroll`). `--size` emulates a window of that size for the audit (the smallest the app allows is 768x560; the desktop layout starts at 1200 wide); `--reload` loads the page again at that size first (what a diver who opens the app at that size sees); `--pre` runs a script in the page (a click that opens the screen or the dialog) before the audit; with a popup, a sheet or a dialog open, only that layer is looked at (`--root` names another). It also reports anything fixed to the window (the rail and its account button) that is cut off at the bottom. Exit code 1 when a problem is found; port 9333 is refused. Run it on your own Electron (own `OD_USER_DATA`, own port), never on the developer's window.
