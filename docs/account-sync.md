# Account data sync (to-do #164)

Decided on 23 November 2026 (Christian accepted every recommendation below). The diver's own data — profile, equipment,
kits, maintenance, certifications, documents, dive validations, what each dive used — is saved on the Benthic+ server
and synchronized between devices. Until now it lived only on the device (IndexedDB through `app/src/lib/file-store.js`),
so a new device or a reinstall lost it. This document is the reference for the implementation; `docs/architecture.md`
section 11 (11.3 the `benthic` branch and its merge rules, 11.5 encryption) stays the reference for the format.

## What syncs, and where

| Kind | Local today | On the server |
|---|---|---|
| Diver profile (name, date of birth, emergency contact, blood group…) | `profile/diver.json` | `benthic` branch, same path; every sensitive field in the sealed `enc` block (#136) |
| Equipment pieces | `gear/<id>.json` | branch, same path |
| Kits | `kits/<id>.json` | branch |
| Maintenance (reminders and history) | `maintenance/<id>.json` | branch; `history` entries are combined by `id` |
| What a dive used | `dive-equipment/<uuid>.json` (keyed by `diveKey.start`) | branch, plus a clean-up pass: at most one file per `diveKey` |
| Dive validations | `dive-validations/<id>.json` | branch |
| Certifications and documents (data) | `certifications/<id>.json` (sealed) | branch |
| Card photos, scans, PDFs | `documents/<hash>.json` (sealed base64) | branch (v1), encrypted; photos re-encoded at 1024 px, PDFs capped at about 10 MB; object storage with signed URLs later |
| Gear and invoice photos | `media/<id>.json` | renamed **`gear-photos/<id>.json`** before anything reaches the server (`media/` is reserved for dive media, 11.6) |
| Dive photos and videos | on the device (`<media folder>/<sha-256>`) | synced for Benthic+ (decided on 23 November 2026): objects by hash in object storage, references in `media/<dive id>.json` on the branch (architecture 11.6), merged as a union by hash (`lib/dive-media.js`). Until the logbook has a stable dive id, `<dive id>` is the dive’s start time, made safe for a file name (`2026-05-01T10-30-00`), so the same dive on two devices is one file. The transfers are `lib/media-sync.js`, not the git sync. |
| Diver settings (phase 2): units, cylinder library, planner defaults, dive computer list | `deviceStore` | `settings/units.json`, `settings/planner.json`, `settings/computers.json`, newest file wins |
| Device settings: language, theme, date/time format, notifications, Bluetooth, paper/slate, autoSync, network, maps, snoozes | `deviceStore` | stay on the device |
| `meta/*` (pending, state, sync head, consent) | IndexedDB | never synced |
| Data key | secure storage | never in clear; only wrapped: `keys/recovery.json`, `keys/pairing/<id>.json` (the answer to `keys/requests/<id>.json`), plus `keys/account.json` `{kid}` |

## Store model

IndexedDB stays the app's store (the screens do not change; edits stay one transaction). A git working copy
`bgit/benthic-<hash of the repository key>` holds the synced copy; the sync engine copies changes between the two.

## The sync engine (`app/src/lib/account-sync.js`, wrapped by `account-sync.svelte.js`)

No screen code; receives `core`, `store` and `box` (tested with fakes, as `server-logbook.js`). One run:

1. Clone the `benthic` branch if needed (`bgitClone`, `"empty"` when the branch does not exist yet).
2. `snapshotPending()`: paths and texts not sent yet.
3. Write them into the working copy (`bgitWrite`), `bgitCommit(paths, "Benthic: <n> changes")`.
4. `bgitPull`. On a conflict, merge each file with `mergeAccountFile` (or `mergeEncryptedAccountFile` for `profile/`,
   `certifications/`, `documents/`), write, `bgitCommit({ mergeParent: theirs })`; then the clean-up pass (may add a commit).
5. `bgitPush`; on `REJECTED` back to 4 (at most 3 times).
6. `bgitDiff(lastAppliedHead, head)` + `bgitRead` give the files that changed.
7. `applySyncedIfUnchanged(expected = snapshot, writes, removes, acknowledged = snapshot)`: an edit made during the sync is
   never overwritten; it goes at the next run.
8. Write `meta/sync.json` `{ accountKey, head }`, then reload inventory and profile and reschedule notifications.

**Clean-up pass** after a merge: drop kit `gearIds` and `dive-equipment` links to missing pieces; merge `dive-equipment`
files that share a `diveKey` (newest `updatedAt` wins, `gearIds` combined); remove maintenance whose piece is gone.

**When it runs:** at start once the logbook is open; about 3 s after a change (`inventory.svelte.js` `change()`,
`profile.svelte.js` `changeProfile()`, same debounce as `persistChanges`); right after each dives sync (`syncEdits`);
on resume; when the network allows sync again (`onSyncAllowedAgain`); always on « Synchroniser maintenant ». Same gating
as the dives (`autoSyncing()`); pull only when the subscription ended (`meta/state.json readOnlyFrom`); never while a
version is browsed. Instant push between devices is #173, separate.

**Merge rules (decided):** different files merge through git; the same file gets a three-way merge per key; arrays are one
value, except `maintenance.history`, combined by entry `id`; a modified file beats a deleted one; a real conflict keeps
the later `updatedAt` silently, the other value stays in the git history (and, for sealed files, in the sealed conflict
record), and a small notice « modifié sur deux appareils » tells the diver; the full choice screen of 11.3 comes later.
A piece deleted on one device while its maintenance changed on another: the orphan reminder is removed.

**Deletions** are file deletions in one commit (a deleted piece takes its kit links, dive links, maintenance and photos).

**Offline:** edits wait in `meta/pending.json`, local commits wait in the working copy (`bgitUnpushed`).

**Platforms:** the same JavaScript everywhere; only `bgit*` is native (JNI, Swift, the desktop host's git lane). On the
desktop only the `main` logbook window syncs account data.

## First sync of a device that already has data (join step, `account-join.js`)

- Remote branch empty: push everything; this device's key becomes the account key (`keys/account.json {kid}`).
- Remote has data: match by natural key, keep the server's id and remap local references (`kits.gearIds`,
  `dive-equipment.*GearId`, `maintenance.gearId`, `photoId`); empty server fields are filled from local, differing values
  follow the newer `updatedAt`. Natural keys: gear `type` + normalised `brand/model/serial` (serial alone when present;
  computers through `dc-model.js` `sameComputer`); kits: normalised name; maintenance: matched piece + `task`;
  certifications: `kind` + `agency/level/number` (or `title`/`insurer`); `dive-equipment`: `diveKey`; profile: one file,
  merged by field. Exact matches merge automatically; ambiguous ones are listed on a summary screen
  (« 12 pièces reconnues, 3 nouvelles, 2 à confirmer »). One commit, « Joindre cet appareil ».
- Before the first push: `media/` → `gear-photos/`; clear `dateOfBirth`/`fullName` move into `enc` (#136); every existing
  file is added to `meta/pending.json`.
- Signing in to a different account on a device that synced (`meta/sync.json accountKey` differs): ask; never upload silently.

## The data key on a second device

There is no account password (sign-in by e-mail code), and a key held by the server would break end-to-end encryption.
Decided (23 November 2026, to-do #183): **pairing by approval** carried by the `benthic` branch, plus an optional **recovery
key**; platform keychain sync later. The first version of this section paired by QR code (a one-time key in a QR read by the
camera, or an ECDH public key in a QR shown by a computer); it was replaced because it needed a camera, differed between
phone and desktop, and put a long-lived secret on a screen. Nothing in the code reads a QR any more.

### Pairing by approval

No camera, the same on a phone, a tablet and a computer. The server relays two small files and never sees the account key in
clear.

1. **New device** (no key): makes an ephemeral ECDH P-256 key pair (the private key stays in memory), commits the request
   `keys/requests/<id>.json` and shows « En attente d’autorisation » with a 6-digit **verification code**. Only key files are
   committed (`commitKeyFiles` with `keysOnly`): no sync, hence no join of data, runs before the key is held.
2. **Paired device** (holds the account key): finds the request (see below) and asks « Donner accès à « <name> » ? » with the
   same 6 digits and the buttons « Refuser » / « Autoriser ». Nothing is written before the diver taps.
   - « Autoriser »: makes its own ephemeral ECDH pair, derives the shared secret with the request's public key, wraps the
     account key (HKDF-SHA-256, then AES-256-GCM) and commits `keys/pairing/<id>.json`; the request is deleted in the same commit.
   - « Refuser » and « Les codes sont différents »: delete the request and leave `keys/pairing/<id>.json` = `{ format: 1, mode:
     'declined', id, by, expiresAt }` (`by`: this device's name, no secret), so that the new device can say who refused; the new
     device deletes it. The second also opens « Demande refusée » (the codes did not match, nothing was shared, check who can
     read the e-mail). Back and the scrim leave the request for later (not asked again by itself in this run of the app).
   - Only one paired device needs to answer: the request disappears from the others' next look, and a dialog about it closes.
3. **New device** looks at the server every 3 s: when `keys/pairing/<id>.json` exists, it unwraps with its private key, adopts the
   key, seals its local items with it (`adoptAndReseal`), deletes the answer and shows « Appareil jumelé »; the join summary
   follows when due. If its request disappears without an answer it was declined; after 10 minutes it expired. Both give a clear
   message and « Demander de nouveau ».

**How the paired device finds requests.** Without any push channel (instant push between devices is #173), it polls: every 15 s
while the app runs (`REQUEST_POLL_MS` in `account-sync-flows.svelte.js`; the poll is a pull of the branch with `fetchKeys`,
nothing of the data), at once when the app comes back to the front, and after each sync run (reads the working copy, no
network). It polls only when it can approve: signed in, key held, not pull-only. A request opens the approval dialog by itself
when no other screen is open (the same « one screen at a time » rule as the other questions). When the app is not in front
(the web layer still runs in the background of a phone or a tablet, or in a minimised desktop window) a system notification
« Donner accès à « <name> » ? / Code de vérification 482 913. Touchez pour répondre. » is shown, only if the notification
permission is already granted (`lib/access-request-notify.js`). **A closed app is not woken**: that needs a push through the
server (not built; Forgejo has no such hook for it). The request then waits (10 minutes) for the next start of the app or its
next poll. The account sheet has no row for requests any more (task 349); while the data is locked it has « Jumeler cet
appareil » (`accountLock.locked`), which starts the request.

**Files** (`app/src/lib/account-keys.js`, `account-pairing.js`)

- `keys/requests/<id>.json`: `{ format: 1, id, pub, deviceName, platform, createdAt, expiresAt }`. `id`: 16 random bytes in
  base64url (22 characters); `pub`: the new device's ECDH public key, 65 raw bytes in base64url; `expiresAt - createdAt` is
  10 minutes, and a paired device ignores a request whose span is longer.
- `keys/pairing/<id>.json`: `{ format: 1, mode: 'e', id, kid, expiresAt, epk, nonce, ct }`; `epk` is the paired device's
  ephemeral public key. HKDF-SHA-256 (salt = the id, info `benthic-pair-ecdh-v1`), then AES-256-GCM; the authenticated data is
  `pair|e|<id>|<kid>|<expiresAt>`, so the expiry cannot be extended.
- `keys/devices/<id>.json`: `{ format: 1, id, name, platform, lastSeenAt }`, written by a paired device after a sync run, at most
  every 6 hours (`touchDeviceRecord`; its id is kept in `meta/device.json`, never synced). It is what the new device lists as « Vos
  appareils jumelés » (name and last seen, devices unseen for 180 days left out) and names in « À approuver sur … ». No secret.
- The clean-up pass of every run deletes the requests and the answers past their time.

**The verification code.** (Task 349 words it as « derived from the hash of both public keys ». That cannot work as written: the
new device must show the code before the paired device has made its key. The code below binds everything the new device
sent, which is what a swapped request changes; the paired device's own key is bound by the ECDH itself, since only the key in
the request can open the answer.) Six decimal digits: the first 4 bytes of SHA-256 over
`benthic-pair-sas-v1|<id>|<deviceName>|<pub bytes>`, read as an unsigned number, modulo 1 000 000, zero padded. The new device
shows it before the paired device has any key, so it can depend only on what both sides read from the request. Both sides
compute it themselves from the request file's content; it is never sent.

*Why it matters.* The server relays the request. A malicious or compromised server could replace `pub` with its own key,
let the paired device wrap the account key to that key, and read it. The paired device's code is computed from the `pub` it
received, the new device's from the `pub` it made: a swapped key (or name, or id) shows two different codes, and the diver,
who compares them before « Autoriser », refuses. Nothing else authenticates the new device: the server can never get the
key without the diver approving a code that matches.

*What it does not do (decided limit, to be reviewed).* Six digits are 20 bits. A server that replaced `pub` could try about a
million key pairs until the code of its key equals the real one (seconds to minutes on a computer) and the comparison would
then pass: the comparison protects against a passive or opportunistic server and against a mistaken approval, not against a
server that is actively grinding. Two cheap ways to close it if wanted: a longer code (8 digits is 27 bits, 10 digits 33 bits)
or a commit step (the new device first publishes only a hash of its key and reveals the key after the paired device shows its
own random value, as in ZRTP's short authentication string; one more round trip). Not done in this first version, to keep the
flow to one approval. The approval dialog also says to approve only if the diver just asked for it, and an answer expires after
10 minutes.

**At sign-in** (tasks 348 and 350). Right after the logbook download, `probeSignInKeys` reads the account's keys (it clones the
working copy of the `benthic` branch; nothing of the data is received or joined). When `keys/account.json` exists and this device
does not hold the key: a **phone** goes to the step `benthicPlusPair` (« Jumeler cet appareil », the reason, « Vos appareils
jumelés » with names and last seen, « Demander l’accès », « Saisir la clé de secours », « Plus tard », the note, and « Plus d’appareil
ni de clé ? » centred) before « Votre carnet est prêt »; a **tablet or a computer** goes to « Votre carnet est prêt » and
« Déverrouiller vos données chiffrées » opens over it by itself. The step ends when the key arrives (`accountFlow.unlocked`),
or with « Plus tard ». « Demande expirée » carries « Plus d’appareil ni de clé ? » too (phone: its own line above the other
buttons; tablet and desktop: left of the row). The line « La demande s’affiche sur ces appareils, même si Benthic y est fermé »
of the mock-up reads « … dès que Benthic y est ouvert » here, because a closed app is not woken.

**Device name.** `lib/device-name.js` names a device without a native call: « Téléphone Android » or « Tablette Android »
(screen's short side of 600 px and more), « iPhone », « iPad », « Ordinateur Windows », « Ordinateur Mac », « Ordinateur Linux »
(`window.benthicDesktop.platform`), « Autre appareil »; the keys are `accountSync.device.*`. The Android model is not used:
Chrome's reduced user agent gives « K ». A native model name would need a plugin call and is left out.

### Recovery key

128 random bits shown as about 26 base32 characters; `keys/recovery.json` wraps the account key (HKDF from WebCrypto). Offered
strongly at the first sync, not forced.

- Crockford's base32 (`0-9 A-Z` without I, L, O, U) in groups of four joined by dashes; on input, spaces, dashes and case are
  ignored, O reads as 0, I and L as 1. HKDF-SHA-256 (salt `benthic-recovery-v1`, info `account key wrap`), then AES-256-GCM.
- `keys/recovery.json`: `{ format: 1, kid, nonce, ct }`. `keys/account.json`: `{ format: 1, kid }`, the id of the account key
  (first 8 bytes of its SHA-256, in hex).
- `secret-box.js` gets a keyring: `open` picks the key by `block.kid`, `seal` always uses the account key, and no key is
  ever created when `keys/account.json` exists and the key is missing (`MISSING_DATA_KEY`). A joining device that has its
  own key keeps it in the keyring, opens its items and re-seals them with the account key before upload. Until the key
  arrives, sensitive items are neither uploaded nor overwritten and show as locked (« Verrouillé : jumelez cet appareil »);
  the rest syncs. A destructive « Repartir sans les données chiffrées » for the case where every device and the recovery key
  are lost.
- Bug fixed on the way: Android must never replace an unreadable data key silently (exclude `data-key.bin` from backups
  or treat an unreadable key as missing).

### Items nobody can open any more (« orphaned »)

Found on 23 November 2026 on a tablet that held the account key: its certifications and the profile's `enc` block were sealed
with the key of an older app install (`org.opendives.app`) that is lost for good (Android Keystore). Pairing cannot help: the
device already holds the account key, and no other device or recovery key has the old one.

- **Detection** (`findOrphans` in the engine, reported as `orphaned` by every `synced` run): a sealed item of `profile/diver.json`
  or `certifications/*` whose `enc.kid` is neither the account's nor any key this device holds, on a device that holds the
  account key. A device that does not hold the account key reports none (pairing can still open them).
- **Dialog** (`OrphanedDataDialog`, once per run of the app, after the join and before the recovery key offer, not when
  pull-only): « Données chiffrées illisibles » — « Des données chiffrées avec une ancienne clé ne peuvent plus être ouvertes. … »
  with « Plus tard » / « Effacer ».
- **« Effacer »** (`eraseOrphans`): the orphaned certifications are removed; the profile loses its unreadable `enc` block and keeps
  every clear field (a clear `dateOfBirth` is then sealed with the account key by `sealClear` before the next send); both go up
  as ordinary pending edits.
- **Documents.** Each run's clean-up removes `documents/*` that no certification references, on the device and, by the next send,
  on the server. It does nothing unless the device holds the account key and every certification opens (an unreadable card could
  reference any document), and it never removes a document still waiting to be sent. It is what deletes the card photos of the
  erased certifications.

## Server and native changes

- Server: nothing required for v1 (pushing a `benthic` branch already works; Forgejo refuses non-fast-forward pushes).
  Recommended: a smoke-test check of that refusal; repository and push size limits that fit encrypted photos and PDFs;
  later signed upload/download URLs for object storage.
- Core/plugin (libgit2, allowed by AGENTS.md): `bgitWrite(dir, files[{path, text|null}])`; `bgitRead`, `bgitDiff`,
  `bgitFiles` exposing `bgit_history_read/diff/files` for a bgit folder; wired in JNI + Kotlin, Swift, `host.cpp` +
  `bridge.cjs` allow-list, `desktop.js`, `core-api.js`. Everything else is JavaScript.

## Implementation order

1. Bring in the #136 code left unmerged on the Copilot branch `account-data-sync` (commit `aa49d062`; written before the
   rename: `odgit`, `opendives.json`, `odDesktop`, `od:fs` must become `bgit`, `benthic.json`, `benthicDesktop`, `bc:`):
   `account-data-merge.js`, tracked file-store (`applyTracked`, `snapshotPending`, `acknowledgePending`,
   `applySyncedIfUnchanged`…), `MISSING_DATA_KEY`, `dateOfBirth`/`fullName` sealed; drop its desktop `fs.accountGit*`
   IPC. Fix the Android data-key backup. Rename `media/` → `gear-photos/`.
2. The four native bgit calls, on every platform, with `tests/run-bgit-test.sh` cases on the `benthic` branch.
3. The engine and the clean-up pass (`account-sync.js`), tested with two fake devices over real git.
4. The join step and matching (`account-join.js`).
5. Keyring, pairing by approval and recovery key (`account-keys.js`, `account-pairing.js`, `secret-box.js`).
6. Triggers, status and screens (pairing, recovery key, join summary, locked items, the conflict notice) — the screens
   from Claude Conception's mock-ups (to-do in `docs/TODOS.md`).
7. Two-device integration test against the dev server; then a check on the real tablet and phone.
8. Phase 2: diver settings; later object storage for documents.

## Screens (step 6, inbox task 2026-11-23-338)

Built on 23 November 2026 as components driven only by props and callbacks. They import neither the engine nor the key
modules, and nothing in the app reaches them yet: the wiring step opens them. Every screen is Benthic+ only. All are basic
dialogs (`Md3Dialog.svelte`: Material 3 on Android, the system's corners on iOS) with no ✕, except the two camera screens.
Texts are under `accountSync.*` in `fr.json` and `en.json`. The pure rules (recovery key groups, countdown, join answers)
are in `app/src/lib/account-sync-screens.js`, tested by `tests/app/account-sync-screens.test.mjs`.

| Component (`app/src/components/`) | Item | Props | Callbacks |
|---|---|---|---|
| `AccountUnlockDialog` | 1 | `names` (the paired devices, for « À approuver sur … ») | `onpair`, `onrecoverykey`, `onlater` (also Back and the scrim), `onlost` (opens `StartOverDialog`) |
| `PairRequestDialog` | 2, 7 (#183) | `kind` (`'waiting'`: « Demande d’accès envoyée », the names, « En attente d’une réponse… » with the wavy line, « Code de vérification » and the 6 digits large and monospace, the countdown; `'declined'` (`by`), `'expired'`, `'failed'`: what happened), `code`, `names`, `by`, `expiresAt` (ms since 1970), `now` (clock, tests) | `oncancel` (« Annuler » / « Fermer », Back, scrim), `onagain` (« Nouvelle demande », the ended kinds), `onlost` (« Plus d’appareil ni de clé ? », the expired kind) |
| `PairConfirmDialog` | 8 (#183) | `deviceName`, `code`, `busy` | `onconfirm` (« Autoriser »: only now is anything committed), `onrefuse` (« Refuser »), `onmismatch` (« Les codes sont différents », a text button on its own line), `onlater` (Back, scrim) |
| `PairMismatchDialog` | 349.8 | `deviceName` | `onclose` (« OK ») |
| `OrphanedDataDialog` | — | `busy` | `onerase` (« Effacer »), `onlater` (« Plus tard », Back, scrim) |
| `PairedDialog` | 4 | none | `onclose` |
| `RecoveryKeyOffer` | 9 | `busy` | `oncreate`, `onlater` |
| `RecoveryKeyShow` | 10 | `recoveryKey` (the 26 characters, any grouping) | `oncopy(text)` (the key in groups of four), `ondone`; Back and the scrim do nothing: the key is never shown again |
| `RecoveryKeyEnter` | 3 | `error` (`''` or `'wrong'`, after a refusal), `busy` | `onrecoverykey(key)` (26 upper-case characters, separators removed), `oncancel` |
| `JoinSummaryDialog` | 11 | `recognised`, `added`, `matches` (`[{ id, thisDevice, account }]`), `defaultChoice` (`'same'`), `busy` | `onjoin([{ id, same }])`, `oncancel` |
| `LockedDataCard` | 5 | none | `onpair`, `onrecoverykey` (default: the actions in `locked-data.svelte.js`) |
| `StartOverDialog` | 6 | `busy` | `onstartover`, `oncancel` |

Not components:

- The two camera screens of the QR pairing (`lib/pair-scan.js`) are gone. The native scanner keeps its `mode: 'text'` (Kotlin `QrScanActivity`, Swift `QrScanController`), unused and harmless.
- `lib/two-device-notice.js`: `showTwoDeviceNotice(name)` (item 12), the app's snackbar with « OK ». It uses two new options of
  `showSnackbar`: `placement: 'center'` (560 dp, centred at the bottom on a tablet and the desktop) and `long` (three lines).
  Above the FAB on the phone as for every snackbar.
- `lib/locked-data.svelte.js`: `accountLock` `{ locked, onpair, onrecoverykey }`, all off by default.
  `locked` turns on the item 5 look: the subtitles of « Fiche d’urgence », « Brevets et documents » and « Informations »
  read « Verrouillé : jumelez cet appareil » (phone page and the wide left pane), `LockedDataCard` appears under the phone
  list and replaces the Informations pane and the Brevets pane on a wide screen, and the Brevets « + » and the Informations
  pencil are hidden. `locked` also shows the account sheet's row « Jumeler cet appareil » (lock icon, « Données chiffrées verrouillées sur cet appareil » in the pending colour; Android, iPhone and desktop sheets), which calls `onpair`.

### Wiring (done on 23 November 2026)

`components/AccountSyncHost.svelte`, mounted once in `App.svelte` (`isRelease` only), picks the screen due from the sync state, one at a
time and in this order: another account (`AccountDifferentDialog`, new, « Garder séparé » / « Utiliser ce compte » = `forgetLastAccount`),
the missing key (`AccountUnlockDialog`, once per run of the app), the join (`JoinSummaryDialog`, only when the key is held: a device that
must be paired first is paired first), the recovery key offer (`RecoveryKeyOffer`, at the first successful sync, asked again after a week
when postponed). It also sets the flags of `locked-data.svelte.js` (`locked` from `accountSync.keyMissing`), looks for access requests (`watchRequests`, only when the device holds the key, is
signed in and is not pull-only) and writes the device's record (`touchDevice`) and shows the « modifié sur deux appareils » notice from `accountSync.conflicts`.
`lib/account-sync-flows.svelte.js` is what each button does: the pairing codes and files, adopting the key (`adoptAccountKey`, then
`resealFiles` into the store as pending writes, then `persistAccountKey`, in that order, so that nothing is lost if the app stops between),
the recovery key, the start-over, the join. Dialogs own no route: nothing here touches the router.

The engine (`lib/account-sync.js`) handles the keys of the working copy: at the first push to a branch without `keys/account.json` it writes
the kid of the device's own key (a new key only when the device never had one; a key the device had and lost is never replaced); on each
run and each pull it reads `keys/account.json` into the box (`setAccountKid`) and reports `keyMissing`; a sealed file under another key than
the account's is withheld (`locked`); the pairing files past their time are deleted by the clean-up. `keys/` is not in `SYNCED_PREFIXES`:
those files never enter the local store, and the engine's `readKeys`, `commitKeyFiles` and `paths` are the only doors to them.
On a conflict, a key file takes the server's side (two devices that both made a first key: the first push wins, the other device is
then missing the key and pairs).

The scanner has a text mode (`mode: 'text'`, Kotlin `QrScanActivity`, Swift `QrScanController`): the first code ends the scan, whatever it holds.

### Not covered by the mock-ups (the task asks to list it)

The mock-ups of the block « Synchronisation du compte (Benthic+) » are not in `docs/mockups/` of the repository, so the screens
were built from the task's text and the app's existing dialogs, and have not been compared with the drawings. To check
against them: the texts the task does not give (the help lines under the QR codes, the dialog bodies, the field's hints and
errors, the scanner hints, the account sheet row's second line), the buttons of the pairing dialogs, and the segmented
button's default. Questions the mock-ups do not answer:

- Join summary: should « Même pièce » or « Deux pièces » be preselected for an ambiguous match? Built with « Même pièce » (the
  matcher's best guess; `defaultChoice` changes it). A wrong merge loses a distinction, a wrong split only duplicates.
- A pairing code that expired: built as « Le code a expiré » with « Nouveau code »; the key rotation (new K, new file) is the engine's.
- Wrong recovery key, and a code the new device cannot read or that expired: built as a line under the field for the key;
  for pairing, no screen yet (a snackbar would do).
- The « Fiche d’urgence » page itself (`/profile/emergency`) when locked: only its entry row is changed; the page should
  not open, or should show `LockedDataCard`.
- Device name on `PairConfirmDialog`: where it comes from (the new device announces it in the request) is not specified.
- Item 12: several items changed by one sync show one notice at a time (the snackbar replaces the previous one).
- The iPhone and iPad portrait boards are not drawn: the same dialogs are used (checked on the iPhone look).
- Not in the plan: what the paired device does with a pairing request it did not start, an expired request, or two requests (built: a request is
  only read from a scan; an expired file is deleted by the next sync).
- Not in the plan: the recovery key's visibility to screen capture (Android `FLAG_SECURE`) while `RecoveryKeyShow` is open.
