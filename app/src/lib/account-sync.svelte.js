// @ts-check
// The account data sync on screen (docs/account-sync.md): the status the screens read, and the triggers. The engine is
// lib/account-sync.js, the join step lib/account-join.js, the timing and gating lib/account-sync-runner.js (tested
// there); this file only ties them to the app: the Benthic+ session, the logbook's own sync gating (`autoSyncing`, the
// same as the dives'), the resume and network events, and the inventory and profile that are read again after a run.
//
// Only a Benthic+ account with a server session syncs, never while an earlier version of the logbook is browsed, and on
// the desktop only the window that holds the logbook. A subscription that ended leaves the device pulling only (the
// engine reads `meta/state.json` `readOnlyFrom`).
import { BenthicCore } from 'benthic-core';
import { App as CapacitorApp } from '@capacitor/app';
import { createAccountSync } from './account-sync.js';
import { createAccountJoin } from './account-join.js';
import { createAccountSyncRunner, initialState } from './account-sync-runner.js';
import { onAccountData } from './account-sync-signal.js';
import { isRelease } from './edition.js';
import { benthicPlusAccount } from './benthic-plus-state.svelte.js';
import { autoSyncing, logbook } from './logbook.svelte.js';
import { onSyncAllowedAgain } from './sync-network.svelte.js';
import { onPushLive } from './push-state.js';
import { accountDataDeps, loadProfile } from './profile.svelte.js';
import { loadInventory } from './inventory.svelte.js';
import { startToIdMap } from './dive-id-migration.js';
import { sideWindow } from './layout.svelte.js';
import { refreshMedia } from './dive-media.svelte.js';

/**
 * What the screens read: `status` (idle, syncing, synced, offline, error), `locked` (sealed items waiting for the data
 * key), `conflicts` (« modifié sur deux appareils »), `joinNeeded`, `differentAccount`, `error`, `pullOnly`,
 * `lastSyncedAt` (lib/account-sync-runner.js, AccountSyncState).
 */
export const accountSync = $state(initialState());

/** @type {ReturnType<typeof createAccountSyncRunner>|null} */
let runner = null;
/** @type {ReturnType<typeof createAccountJoin>|null} */
let joiner = null;
/** @type {ReturnType<typeof createAccountSync>|null} */
let syncEngine = null;
let started = false;

/** Whether this device may sync its account data at all now. @param {{ manual: boolean }} options */
function allowed({ manual }) {
  if (!isRelease || sideWindow) return false;
  if (!benthicPlusAccount.signedIn) return false;
  if (logbook.loading || logbook.welcome || logbook.error || logbook.browsing) return false;
  return manual || autoSyncing();
}

/** The engine, the join and the runner over the profile's store and box, made once. */
function build() {
  if (runner && joiner && syncEngine) return { runner, joiner, engine: syncEngine };
  const { store, box, profile } = accountDataDeps();
  const core = /** @type {any} */ (BenthicCore);
  // A date of birth still in clear is sealed before anything leaves the device (the engine calls this before each pass).
  const engine = createAccountSync({ core, store, box, sealClear: () => profile.migrateBirthDate(), diveIds: () => startToIdMap(logbook.dives) });
  syncEngine = engine;
  const base = createAccountSyncRunner({
    engine,
    state: accountSync,
    allowed,
    hasPending: async () => ((await store.read('meta/pending.json'))?.paths?.length ?? 0) > 0,
    afterRun: async () => {
      await Promise.all([loadInventory(), loadProfile()]);
      // Dive photos and videos: new references from another device, uploads waiting (quiet, never blocks).
      refreshMedia();
    },
  });
  runner = base;
  joiner = createAccountJoin({ core, store, box });
  return { runner: base, joiner, engine };
}

/**
 * Starts the triggers, once, when the logbook is open (App.svelte): a first sync now, then at each change of the diver's
 * data (about 3 s later), after each dives sync, on resume and when the network allows sync again.
 */
export function startAccountSync() {
  if (started || !isRelease) return;
  started = true;
  const { runner: r } = build();
  onAccountData((kind) => r.trigger(kind === 'dives' ? 'dives' : 'edit'));
  onSyncAllowedAgain(() => {
    r.trigger('network');
    refreshMedia();
  });
  if (typeof window !== 'undefined') window.addEventListener('online', () => r.trigger('network'));
  // The server's push channel is live again after the sync found it out of reach: send what waits (26 November 2026).
  onPushLive((live) => {
    if (live && accountSync.status === 'offline') r.trigger('network');
  });
  CapacitorApp.addListener('resume', () => r.trigger('resume')).catch((/** @type {unknown} */ e) => console.error('App resume', e));
  r.trigger('start');
}

/**
 * The account branch's head this device has applied (`meta/sync.json`), '' when none: the push channel compares the server's
 * head with it (lib/push-sync.svelte.js).
 */
export async function accountLocalHead() {
  const { store } = accountDataDeps();
  return (await store.read('meta/sync.json'))?.head ?? '';
}

/** The server says the account branch moved (push channel): the same run as any automatic one, gated the same way. */
export function triggerAccountSyncFromPush() {
  build().runner.trigger('push');
}

/** « Synchroniser maintenant »: at once, whatever the connection setting says. */
export function syncAccountNow() {
  return build().runner.syncNow();
}

/** The diver has read the notice « modifié sur deux appareils ». */
export function dismissAccountConflicts() {
  runner?.dismissConflicts();
}

/**
 * The account's keys as the working copy holds them (no network): the account key's id, `keys/recovery.json`, the pairing
 * files. The key flows (lib/account-sync-flows.svelte.js) read them after a sync.
 */
export function readAccountKeys() {
  return build().engine.readKeys();
}

/**
 * The account's keys as the server holds them now, cloning the working copy first when this device has none (no data is
 * received or joined). The pairing and the recovery key read the keys this way.
 */
export function fetchAccountKeys() {
  return build().engine.fetchKeys();
}

/** « Effacer » (items nobody can open any more): removes them here; the run that follows sends it. */
export async function eraseAccountOrphans() {
  const { engine, runner: r } = build();
  const n = await engine.eraseOrphans();
  accountSync.orphaned = [];
  void r.syncNow();
  return n;
}

/**
 * Commits pairing files (requests and answers) and pushes them: nothing of the diver's data is read, sent, received or
 * joined, so a device that does not hold the key yet never joins before it. The working copy must exist (`fetchAccountKeys`
 * clones it).
 * @param {{ writes?: { path: string, json: any }[], deletes?: string[], message?: string }} changes
 */
export function commitPairingFiles(changes) {
  return build().engine.commitKeyFiles({ ...changes, keysOnly: true });
}

/** Every path of the account's working copy (the start-over lists what to drop). */
export function listAccountPaths() {
  return build().engine.paths();
}

/**
 * Commits key files (`keys/…`) and syncs: a pairing file, the recovery key, the start-over's new account key. The screens
 * read the result as any other run.
 * @param {{ writes?: { path: string, json: any }[], deletes?: string[], message?: string }} changes
 * @returns {Promise<import('./account-sync.js').SyncResult>}
 */
export async function commitAccountKeyFiles(changes) {
  const { engine, runner: r } = build();
  const result = await engine.commitKeyFiles(changes);
  r.record(result);
  if (result.status === 'synced' && (result.received || result.conflicts?.length)) await Promise.all([loadInventory(), loadProfile()]);
  return result;
}

/** The join summary: what recognising this device's data would do (nothing is changed). */
export function analyseJoin() {
  return build().joiner.analyse();
}

/**
 * Joins this device to the account (one commit, « Joindre cet appareil »); then the screens read again and the sync goes on.
 * @param {import('./account-join.js').JoinResolution[]} [resolutions]
 */
export async function applyJoin(resolutions = []) {
  const { runner: r, joiner: j } = build();
  const result = await j.apply(resolutions);
  if (result.state === 'joined') {
    await Promise.all([loadInventory(), loadProfile()]);
    r.resolved();
  }
  return result;
}

/**
 * The diver answered « use this account » or « keep the other » after `differentAccount`: forget the device's last sync so the
 * join step decides what happens to the data (the screen of task 338 asks first).
 */
export async function forgetLastAccount() {
  const { store } = accountDataDeps();
  await store.remove('meta/sync.json');
  accountSync.differentAccount = false;
  accountSync.joinNeeded = false;
  runner?.resolved();
}
