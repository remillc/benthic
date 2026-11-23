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
| Dive photos and videos | on the device | unchanged (AGENTS.md: photos stay on the device; 11.6 opt-in later) |
| Diver settings (phase 2): units, cylinder library, planner defaults, dive computer list | `deviceStore` | `settings/units.json`, `settings/planner.json`, `settings/computers.json`, newest file wins |
| Device settings: language, theme, date/time format, notifications, Bluetooth, paper/slate, autoSync, network, maps, snoozes | `deviceStore` | stay on the device |
| `meta/*` (pending, state, sync head, consent) | IndexedDB | never synced |
| Data key | secure storage | never in clear; only wrapped: `keys/recovery.json`, `keys/pairing/<id>.json`, plus `keys/account.json` `{kid}` |

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
Decided: **QR pairing** carried by the `benthic` branch, plus an optional **recovery key**; platform keychain sync later.

- Pairing, new device with a camera: the old device shows a QR with a one-time 256-bit key K and a pairing id, and commits
  `keys/pairing/<id>.json` = account key wrapped with K (AES-GCM, expires after 10 minutes). The new device scans, pulls,
  unwraps, deletes the file. New device without a camera (desktop): it shows a QR with an ephemeral ECDH P-256 public key;
  the phone scans, wraps the account key to it (ECDH, HKDF, AES-GCM, WebCrypto) and commits. The old device confirms.
- Recovery key: 128 random bits shown as about 26 base32 characters; `keys/recovery.json` wraps the account key
  (HKDF from WebCrypto). Offered strongly at the first sync, not forced.
- `secret-box.js` gets a keyring: `open` picks the key by `block.kid`, `seal` always uses the account key, and no key is
  ever created when `keys/account.json` exists and the key is missing (`MISSING_DATA_KEY`). A joining device that has its
  own key keeps it in the keyring, opens its items and re-seals them with the account key before upload. Until the key
  arrives, sensitive items are neither uploaded nor overwritten and show as locked (« Verrouillé : jumelez cet appareil »);
  the rest syncs. A destructive « Repartir sans les données chiffrées » for the case where every device and the recovery key
  are lost.
- Bug fixed on the way: Android must never replace an unreadable data key silently (exclude `data-key.bin` from backups
  or treat an unreadable key as missing).

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
5. Keyring, pairing and recovery key (`account-keys.js`, `secret-box.js`).
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
| `AccountUnlockDialog` | 1 | `camera` (false on a computer: the row reads « Afficher un code à lire avec votre téléphone ») | `onpair`, `onrecoverykey`, `onlater` (also Back and the scrim), `onlost` (opens `StartOverDialog`) |
| `PairShowCode` | 2, 7 | `variant` (`'old'`: paired device, QR with K; `'new'`: computer without a camera, QR with its ECDH key), `payload` (the QR text), `expiresAt` (ms since 1970), `now` (clock, tests) | `oncancel`, `onscan` (phone and tablet, old variant: the « Lire le code d’un ordinateur » button on the left), `onrenew` (« Nouveau code » once expired) |
| `PairConfirmDialog` | 8 | `deviceName`, `busy` | `onconfirm` (« Jumeler »: only now is anything committed), `onrefuse` (« Refuser », Back, scrim) |
| `PairedDialog` | 4 | none | `onclose` |
| `RecoveryKeyOffer` | 9 | `busy` | `oncreate`, `onlater` |
| `RecoveryKeyShow` | 10 | `recoveryKey` (the 26 characters, any grouping) | `oncopy(text)` (the key in groups of four), `ondone`; Back and the scrim do nothing: the key is never shown again |
| `RecoveryKeyEnter` | 3 | `error` (`''` or `'wrong'`, after a refusal), `busy` | `onrecoverykey(key)` (26 upper-case characters, separators removed), `oncancel` |
| `JoinSummaryDialog` | 11 | `recognised`, `added`, `matches` (`[{ id, thisDevice, account }]`), `defaultChoice` (`'same'`), `busy` | `onjoin([{ id, same }])`, `oncancel` |
| `LockedDataCard` | 5 | none | `onpair`, `onrecoverykey` (default: the actions in `locked-data.svelte.js`) |
| `StartOverDialog` | 6 | `busy` | `onstartover`, `oncancel` |

Not components:

- `lib/pair-scan.js`: the two camera screens (« Jumeler cet appareil », « Lire le code d’un ordinateur ») are the native scanner.
  `scanPairingCode('new-device' | 'computer')` gives it its texts and resolves to the code's text, or `null` when closed.
- `lib/two-device-notice.js`: `showTwoDeviceNotice(name)` (item 12), the app's snackbar with « OK ». It uses two new options of
  `showSnackbar`: `placement: 'center'` (560 dp, centred at the bottom on a tablet and the desktop) and `long` (three lines).
  Above the FAB on the phone as for every snackbar.
- `lib/locked-data.svelte.js`: `accountLock` `{ locked, canPair, onpair, onpairnew, onrecoverykey }`, all off by default.
  `locked` turns on the item 5 look: the subtitles of « Fiche d’urgence », « Brevets et documents » and « Informations »
  read « Verrouillé : jumelez cet appareil » (phone page and the wide left pane), `LockedDataCard` appears under the phone
  list and replaces the Informations pane and the Brevets pane on a wide screen, and the Brevets « + » and the Informations
  pencil are hidden. `canPair` shows the account sheet's « Jumeler un nouvel appareil » row (Android, iPhone and desktop
  sheets), which calls `onpairnew` (show the code, `PairShowCode variant="old"`).

### What the wiring step must do

1. Set `accountLock.locked` from `MISSING_DATA_KEY`, `accountLock.canPair` when the device holds the key, and the three actions.
2. Open `AccountUnlockDialog` when the key is missing and `keys/account.json` exists. `onpair`: on a phone or tablet, the
   scanner (`scanPairingCode('new-device')`) then `PairedDialog`; on a computer, `PairShowCode variant="new"`, then `PairedDialog`
   once the phone has answered. `onrecoverykey`: `RecoveryKeyEnter`, then `PairedDialog` (pass `error="wrong"` on a refusal).
   `onlost`: `StartOverDialog`.
3. On the paired device: the account sheet row opens `PairShowCode variant="old"` (give `onscan` on a phone or tablet, which
   calls `scanPairingCode('computer')`), then `PairConfirmDialog` when the request arrives.
4. Open `RecoveryKeyOffer` at the first sync, `RecoveryKeyShow` right after « Créer la clé », `JoinSummaryDialog` from
   `account-join.js`, and call `showTwoDeviceNotice` from the merge.
5. The pairing code's text is the key module's: nothing here parses it.
6. Native: the scanner accepts only dive and plan transfer codes (`OD1~d|p~…`, Kotlin `QrScanActivity.parseHeader` and its Swift
   twin) and answers « Code inconnu » to anything else. Add a `mode: 'text'` that returns the first code as it is (what
   `pair-scan.js` already sends), or wrap the pairing payload in the transfer header with a third kind. The desktop shows
   codes only, so it needs no scanner.
7. Add the release-notes line (`about.releaseNotes`) when the screens become reachable, and update `tests/app/account-sync-screens.test.mjs`
   (its last test checks that the screens are not imported yet).

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
- Not in the plan: what the paired device does with a pairing request it did not start, an expired request, or two requests.
- Not in the plan: the recovery key's visibility to screen capture (Android `FLAG_SECURE`) while `RecoveryKeyShow` is open.
