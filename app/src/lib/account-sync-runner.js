// @ts-check
// When the account data sync runs (docs/account-sync.md, « When it runs »), without Svelte and without the core: a state
// object the screens read, the triggers (about 3 s after a change, right after the dives sync, at start, on resume, when
// the network allows sync again, and « Synchroniser maintenant »), the gating, and what follows a run. The engine
// (lib/account-sync.js) is a parameter, so that node:test drives the runner with a fake and fake timers.

/** Wait after a change before sending, as the dives' `persistChanges`. */
export const EDIT_DELAY_MS = 3000;
/** Wait before trying again after a run that left something for the next one. */
export const RETRY_DELAY_MS = 5000;
/** Retries in a row. */
const MAX_RETRIES = 3;
/**
 * Offline with changes waiting (26 November 2026): the next tries, then every 5 min. The device's network may never drop
 * while the server is out of reach (a server down, a Wi-Fi without the Internet, adb reverse off), so no « online »
 * event would come.
 */
export const OFFLINE_RETRY_MS = [15000, 30000, 60000, 120000, 300000];

/**
 * What the screens read.
 * @typedef {Object} AccountSyncState
 * @property {'idle'|'syncing'|'synced'|'offline'|'error'} status
 * @property {string} lastSyncedAt ISO time of the last run that finished
 * @property {boolean} pullOnly the subscription ended: this device only receives
 * @property {{ path: string, keys: string[] }[]} conflicts files two devices changed in the same field, until `dismissConflicts`
 * @property {string[]} locked sealed files whose data key is missing here (« Verrouillé : jumelez cet appareil »)
 * @property {string[]} unsealed files withheld until their sensitive data is sealed
 * @property {boolean} joinNeeded this device has data and the account has data: the join step must run before anything is sent
 * @property {boolean} differentAccount this device last synced with another account: nothing is sent
 * @property {boolean} keyMissing the account has a data key that this device does not hold (the unlock dialog, the locked look)
 * @property {string[]} orphaned sealed items under a key nobody holds any more, on a device that holds the account key (the dialog that offers to erase them)
 * @property {boolean} hasRecovery the account has a recovery key (`keys/recovery.json`)
 * @property {string} error the code of the last failure, '' when none
 */

/** @returns {AccountSyncState} */
export const initialState = () => ({
  status: 'idle',
  lastSyncedAt: '',
  pullOnly: false,
  conflicts: [],
  locked: [],
  unsealed: [],
  joinNeeded: false,
  differentAccount: false,
  keyMissing: false,
  orphaned: [],
  hasRecovery: false,
  error: '',
});

/**
 * @typedef {Object} RunnerDeps
 * @property {{ run: () => Promise<import('./account-sync.js').SyncResult> }} engine
 * @property {AccountSyncState} state mutated in place (a Svelte `$state` object in the app)
 * @property {(options: { manual: boolean }) => boolean} allowed whether a sync may start: signed in, logbook open, not browsing a version; for an automatic one, also `autoSyncing()`
 * @property {(result: import('./account-sync.js').SyncResult) => Promise<void>|void} [afterRun] reads the data again after a run that changed it
 * @property {() => Promise<boolean>|boolean} [hasPending] whether changes of this device wait to be sent (the offline retries run only then)
 * @property {() => Date} [now]
 * @property {(fn: () => void, ms: number) => unknown} [setTimer]
 * @property {(handle: unknown) => void} [clearTimer]
 */

/** @param {RunnerDeps} deps */
export function createAccountSyncRunner({ engine, state, allowed, afterRun, hasPending = () => false, now = () => new Date(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(/** @type {any} */ (h)) }) {
  /** @type {unknown} */
  let timer = null;
  let running = false;
  let again = false;
  let retries = 0;
  let offlineTries = 0;

  /** @param {number} ms */
  function schedule(ms) {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void runNow(false);
    }, ms);
  }

  /** @param {boolean} manual @returns {Promise<import('./account-sync.js').SyncResult|null>} */
  async function runNow(manual) {
    if (!allowed({ manual })) return null;
    // Once the join or the account question is open, nothing runs by itself: the diver answers first.
    if (!manual && (state.joinNeeded || state.differentAccount)) return null;
    if (running) {
      again = true;
      return null;
    }
    running = true;
    state.status = 'syncing';
    /** @type {import('./account-sync.js').SyncResult} */
    let result;
    try {
      result = await engine.run();
    } catch (e) {
      console.error('Syncing the account data', e);
      result = { status: 'error', error: String(/** @type {any} */ (e)?.message ?? e) };
    }
    try {
      apply(result);
      if (result.status === 'synced' && (result.received || result.conflicts?.length)) await afterRun?.(result);
    } catch (e) {
      console.error('After the account data sync', e);
    } finally {
      running = false;
    }
    if (result.status === 'synced' && !result.retry) retries = 0;
    if (result.status !== 'offline') offlineTries = 0;
    if (result.retry && result.status !== 'offline' && !state.pullOnly && retries < MAX_RETRIES) {
      retries++;
      again = false;
      schedule(RETRY_DELAY_MS);
    } else if (again) {
      again = false;
      schedule(0);
    } else if (result.status === 'offline' && !state.pullOnly && (await pendingNow())) {
      schedule(OFFLINE_RETRY_MS[Math.min(offlineTries, OFFLINE_RETRY_MS.length - 1)]);
      offlineTries++;
    }
    return result;
  }

  async function pendingNow() {
    try {
      return !!(await hasPending());
    } catch {
      return false;
    }
  }

  /** @param {import('./account-sync.js').SyncResult} result */
  function apply(result) {
    state.error = '';
    switch (result.status) {
      case 'synced':
        state.status = 'synced';
        state.lastSyncedAt = now().toISOString();
        state.pullOnly = !!result.pullOnly;
        state.joinNeeded = false;
        state.differentAccount = false;
        state.locked = result.locked ?? [];
        state.unsealed = result.unsealed ?? [];
        state.keyMissing = !!result.keyMissing;
        state.orphaned = result.orphaned ?? [];
        state.hasRecovery = !!result.hasRecovery;
        if (result.conflicts?.length) state.conflicts = [...state.conflicts, ...result.conflicts.filter((c) => !state.conflicts.some((x) => x.path === c.path))];
        break;
      case 'offline':
        state.status = 'offline';
        break;
      case 'joinNeeded':
        state.status = 'idle';
        state.joinNeeded = true;
        state.keyMissing = !!result.keyMissing;
        state.hasRecovery = !!result.hasRecovery;
        break;
      case 'differentAccount':
        state.status = 'idle';
        state.differentAccount = true;
        break;
      case 'noSession':
        state.status = 'idle';
        break;
      default:
        state.status = 'error';
        state.error = result.error ?? result.status;
    }
  }

  return {
    state,
    /**
     * Something asked for a sync.
     * @param {'start'|'edit'|'dives'|'resume'|'network'|'push'} kind
     */
    trigger(kind) {
      if (!allowed({ manual: false })) return;
      if (state.joinNeeded || state.differentAccount) return;
      if (running) {
        again = true;
        return;
      }
      schedule(kind === 'edit' ? EDIT_DELAY_MS : 0);
    },
    /** The result of a run made outside the runner (a key file committed by the pairing): the screens read it as any other. @param {import('./account-sync.js').SyncResult} result */
    record(result) {
      apply(result);
    },
    /** « Synchroniser maintenant »: runs at once, whatever the network setting says. */
    async syncNow() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      retries = 0;
      return runNow(true);
    },
    /** The diver has read the « modifié sur deux appareils » notice. */
    dismissConflicts() {
      state.conflicts = [];
    },
    /** The join (or the account choice) is over: sync again. */
    resolved() {
      state.joinNeeded = false;
      state.differentAccount = false;
      schedule(0);
    },
    get running() {
      return running;
    },
  };
}
