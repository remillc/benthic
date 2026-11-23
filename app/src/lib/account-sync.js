// @ts-check
// The account data sync engine (docs/account-sync.md, « The sync engine »): the diver's profile, equipment, kits,
// maintenance, certifications and what each dive used are kept in the local store (lib/file-store.js, IndexedDB) and
// copied to the `benthic` branch of the diver's repository on the Benthic server through the core's git calls
// (`bgit*`, plugins/benthic-core/core-api.js). One run is the plan's eight steps; the merge of two devices that changed
// the same file is lib/account-data-merge.js.
//
// No screen code and no platform code: `core`, `store` and `box` are parameters, so that node:test drives the engine with
// a fake core over real git (tests/app/account-sync.test.mjs). The Svelte side (triggers, status) is
// lib/account-sync.svelte.js; the first sync of a device that already has data is lib/account-join.js.

import { sortedJson } from './file-store.js';
import { mergeAccountFile, mergeEncryptedAccountFile } from './account-data-merge.js';
import { repositoryKey } from './server-logbook.js';
import { ACCOUNT_KEY_PATH, PAIRING_DIR, RECOVERY_PATH, accountKeyFile, isPairingExpired, newAccountKey, parseAccountKeyFile } from './account-keys.js';

/** The branch of the account data. */
export const BRANCH = 'benthic';

/**
 * The folders of the working copy this engine moves between the device's store and the server. `meta/` never syncs,
 * `media/` is reserved for the dives' media (docs/architecture.md, 11.6). `keys/` (the account key's id, the recovery
 * key's file, the pairing files) is not in this list on purpose: those files never enter the local store; the engine
 * reads and writes them in the working copy only (`KEYS_PREFIX`, `readKeys`, `commitKeyFiles`).
 */
export const SYNCED_PREFIXES = ['profile/', 'certifications/', 'documents/', 'gear/', 'gear-photos/', 'kits/', 'maintenance/', 'dive-equipment/', 'dive-validations/'];

/** The folder of the key files in the working copy (docs/account-sync.md, « QR payloads and key files »). */
export const KEYS_PREFIX = 'keys/';

/** @param {unknown} path */
export const isKeyPath = (path) => typeof path === 'string' && path.startsWith(KEYS_PREFIX) && path.endsWith('.json') && !path.includes('..');

/** Folders whose files carry a sealed `enc` block (docs/architecture.md, 11.5). */
const SEALED = ['profile/', 'certifications/'];

/** Runs of the pull, merge and push loop before giving up (the plan: at most 3 retries on a rejected push). */
const MAX_PUSH_RETRIES = 3;
/** Passes over one run when an edit made during the sync had to be merged in. */
const MAX_PASSES = 3;

/** @param {unknown} path */
export const isSyncedPath = (path) =>
  typeof path === 'string' && path.endsWith('.json') && !path.includes('..') && SYNCED_PREFIXES.some((prefix) => path.startsWith(prefix));

/** @param {string} path */
const isSealedPath = (path) => SEALED.some((prefix) => path.startsWith(prefix));

/** The name of the working copy of a repository: `benthic-<hash of the repository key>`. @param {string} repositoryUrl */
export function workingCopyName(repositoryUrl) {
  const text = repositoryKey(repositoryUrl);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return `benthic-${hex(h2)}${hex(h1)}`;
}

/** @param {unknown} e @returns {string} */
export const codeOf = (e) => String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');

/**
 * What a run reports.
 * @typedef {Object} SyncResult
 * @property {'synced'|'offline'|'refused'|'error'|'noSession'|'joinNeeded'|'differentAccount'} status
 * @property {boolean} [pullOnly] the subscription ended: nothing was sent
 * @property {number} [sent] files sent
 * @property {number} [received] files changed here by the server's state
 * @property {string|null} [head]
 * @property {{ path: string, keys: string[] }[]} [conflicts] files two devices changed in the same field: the later `updatedAt` was kept
 * @property {string[]} [locked] sealed files whose data key is missing here: neither sent nor overwritten
 * @property {string[]} [unsealed] files withheld because they still hold clear sensitive data
 * @property {boolean} [keyMissing] the account has a data key (`keys/account.json`) that this device does not hold: sealed items stay locked
 * @property {boolean} [hasRecovery] `keys/recovery.json` exists on the server
 * @property {boolean} [retry] an edit made during the run, or a rejected push, is left for the next run
 * @property {string} [error] the core's error code
 */

/**
 * @typedef {Object} AccountSyncDeps
 * @property {Pick<import('benthic-core').BenthicCorePlugin, 'bgitClone'|'bgitPull'|'bgitCommit'|'bgitPush'|'bgitHead'|'bgitWrite'|'bgitRead'|'bgitDiff'|'bgitFiles'|'bgitRemove'|'bgitUnpushed'> & { serverSessionAccess: () => Promise<{repositoryUrl: string, username: string, token: string}> }} core
 * @property {import('./file-store.js').FileStore} store
 * @property {import('./secret-box.js').SecretBox} box
 * @property {() => Date} [now]
 * @property {string} [authorName]
 * @property {string} [authorEmail]
 */

/** The text of a local file without parsing it. @param {import('./file-store.js').FileStore} store @param {string} path @returns {Promise<string|null>} */
async function localText(store, path) {
  try {
    return (await store.readSnapshot(path)).text;
  } catch {
    // Unparseable: the raw text is not reachable through the store; the file is left alone.
    return null;
  }
}

/** @param {string|null} text @returns {Record<string, any>|null} */
const parse = (text) => (text == null ? null : JSON.parse(text));

/** @param {Record<string, any>|null} a @param {Record<string, any>|null} b */
const sameFile = (a, b) => (a === null || b === null ? a === b : sortedJson(a) === sortedJson(b));

/** The ids of a sealed file's item: the profile is `profile`, a certification its own id. @param {string} path @param {Record<string, any>|null} file */
function sealedItem(path, file) {
  if (path.startsWith('profile/')) return { id: 'profile', format: Number(file?.format ?? 1) };
  const id = file?.id ?? path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
  return { id: String(id), format: Number(file?.format ?? 1) };
}

/** A profile file that still holds its date of birth in clear: it is sealed on the device before it may leave (docs/architecture.md, 11.5). @param {string} path @param {Record<string, any>|null} file */
const holdsClearSecrets = (path, file) => path === 'profile/diver.json' && !!file && Object.hasOwn(file, 'dateOfBirth');

/**
 * `maintenance.history` entries are combined by `id`: an entry on both sides is kept (the side that changed it from the
 * base), one on a single side is added, one deleted on a single side goes unless the other side changed it.
 * @param {any[]|undefined} base @param {any[]|undefined} ours @param {any[]|undefined} theirs @param {boolean} preferOurs
 */
function mergeHistory(base, ours, theirs, preferOurs) {
  const index = (/** @type {any[]|undefined} */ list) => new Map((list ?? []).filter((e) => e && typeof e.id === 'string').map((e) => [e.id, e]));
  const b = index(base);
  const o = index(ours);
  const t = index(theirs);
  const same = (/** @type {any} */ x, /** @type {any} */ y) => !!x && !!y && sortedJson(x) === sortedJson(y);
  const out = [];
  for (const id of new Set([...o.keys(), ...t.keys()])) {
    const be = b.get(id);
    const oe = o.get(id);
    const te = t.get(id);
    if (oe && te) out.push(same(oe, te) ? oe : same(be, oe) ? te : same(be, te) ? oe : preferOurs ? oe : te);
    else if (oe) {
      if (!(be && same(be, oe))) out.push(oe); // deleted on the other side only when this side did not change it
    } else if (te && !(be && same(be, te))) out.push(te);
  }
  return out.sort((x, y) => (x.doneOn < y.doneOn ? 1 : x.doneOn > y.doneOn ? -1 : x.id < y.id ? -1 : 1));
}

/**
 * The plain three-way merge; two timestamps that cannot be compared still give one answer, the same on both devices.
 * @param {Record<string, any>|null} base @param {Record<string, any>|null} ours @param {Record<string, any>|null} theirs
 * @returns {{ value: Record<string, any>|null, conflicts: { key: string }[] }}
 */
function mergeGeneric(base, ours, theirs) {
  try {
    return /** @type {any} */ (mergeAccountFile(base, ours, theirs));
  } catch (e) {
    if (codeOf(e) !== 'ACCOUNT_DATA_CONFLICT_TIME') throw e;
    const pick = sortedJson(ours) >= sortedJson(theirs) ? ours : theirs;
    return { value: pick, conflicts: [{ key: '*' }] };
  }
}

/** @param {Record<string, any>|null} file */
const withoutHistory = (file) => {
  if (!file) return file;
  const { history, ...rest } = file;
  return rest;
};

/**
 * A maintenance file: the fields merge key by key, the history by entry id, the last service follows the history.
 * @param {Record<string, any>|null} base @param {Record<string, any>|null} ours @param {Record<string, any>|null} theirs
 */
function mergeMaintenance(base, ours, theirs) {
  if (ours === null || theirs === null || sameFile(ours, theirs)) return mergeGeneric(base, ours, theirs);
  const merged = mergeGeneric(withoutHistory(base), withoutHistory(ours), withoutHistory(theirs));
  const value = /** @type {Record<string, any>} */ (merged.value);
  const preferOurs = String(ours.updatedAt ?? '') >= String(theirs.updatedAt ?? '');
  const history = mergeHistory(base?.history, ours.history, theirs.history, preferOurs);
  const hasHistory = history.length || Array.isArray(ours.history) || Array.isArray(theirs.history);
  return {
    value: { ...value, ...(hasHistory ? { history } : {}), ...(history.length ? { lastDoneOn: history[0].doneOn } : {}) },
    conflicts: merged.conflicts,
  };
}

/**
 * What the working copy holds of the keys.
 * @typedef {Object} KeyState
 * @property {string|null} kid the account key's id (`keys/account.json`), null when the account has none yet
 * @property {boolean} keyMissing the account has a key this device does not hold
 * @property {any|null} recovery the content of `keys/recovery.json`
 * @property {{ path: string, json: any }[]} pairing the pairing files on the branch
 */

/**
 * Creates the engine.
 * @param {AccountSyncDeps} deps
 */
export function createAccountSync({ core, store, box, now = () => new Date(), authorName, authorEmail }) {
  const stamp = () => now().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const author = { ...(authorName ? { authorName } : {}), ...(authorEmail ? { authorEmail } : {}) };

  /**
   * Resolves one file both sides changed. A sealed file whose key is missing here cannot be merged: the server's version
   * goes in the working copy (nothing of ours is sent) and the file is reported as locked.
   * @param {string} path @param {string|null} baseText @param {string|null} oursText @param {string|null} theirsText
   * @returns {Promise<{ text: string|null, keys: string[], locked: boolean }>}
   */
  async function resolveFile(path, baseText, oursText, theirsText) {
    // Key files: the server's side wins (the first device to write `keys/account.json` stays the account's key; a pairing
    // file deleted on one side is gone).
    if (isKeyPath(path)) return { text: theirsText, keys: [], locked: false };
    /** @type {Record<string, any>|null} */ let base;
    /** @type {Record<string, any>|null} */ let ours;
    /** @type {Record<string, any>|null} */ let theirs;
    try {
      [base, ours, theirs] = [parse(baseText), parse(oursText), parse(theirsText)];
    } catch {
      return { text: oursText, keys: ['*'], locked: false };
    }
    // The cases that need no merge, and no key: the file's text is kept as the side that wins wrote it.
    const clean = (/** @type {Record<string, any>|null} */ file) => !holdsClearSecrets(path, file);
    /** @type {string|null|undefined} */
    let quick;
    if (sameFile(ours, theirs)) quick = oursText;
    else if (sameFile(base, ours)) quick = theirsText;
    else if (sameFile(base, theirs)) quick = oursText;
    else if (ours === null) quick = theirsText;
    else if (theirs === null) quick = oursText;
    else if (path.startsWith('documents/')) quick = oursText; // named by the hash of its content: both sides hold the same bytes
    if (quick !== undefined && clean(parse(quick))) return { text: quick, keys: [], locked: false };

    /** @type {{ value: Record<string, any>|null, conflicts: { key: string }[] }} */
    let result;
    if (isSealedPath(path)) {
      const item = sealedItem(path, ours ?? theirs ?? base);
      try {
        const sealed = await mergeEncryptedAccountFile(base, ours, theirs, box, item);
        result = { value: sealed.value, conflicts: sealed.conflicts };
      } catch (e) {
        if (codeOf(e) === 'MISSING_DATA_KEY') return { text: theirsText, keys: [], locked: true };
        throw e;
      }
    } else if (path.startsWith('maintenance/')) result = mergeMaintenance(base, ours, theirs);
    else result = mergeGeneric(base, ours, theirs);
    return { text: result.value === null ? null : sortedJson(result.value), keys: result.conflicts.map((c) => c.key), locked: false };
  }

  /**
   * The clean-up pass after a merge (docs/account-sync.md): links to pieces that are gone, `dive-equipment` files that
   * share a dive, reminders of a missing piece. Written into the working copy and committed.
   * @param {{ dir: string }} copy
   * @returns {Promise<number>} the files changed
   */
  async function cleanUp({ dir }) {
    const { files } = await core.bgitFiles({ dir });
    const wanted = files.filter((p) => ['gear/', 'kits/', 'maintenance/', 'dive-equipment/'].some((prefix) => p.startsWith(prefix)) && p.endsWith('.json'));
    const { texts } = await core.bgitRead({ dir, paths: wanted });
    /** @type {Map<string, Record<string, any>>} */
    const byPath = new Map();
    wanted.forEach((path, i) => {
      try {
        const value = parse(texts[i]);
        if (value) byPath.set(path, value);
      } catch {
        // An unreadable file is left as it is.
      }
    });
    const gearIds = new Set([...byPath.keys()].filter((p) => p.startsWith('gear/')).map((p) => String(byPath.get(p)?.id ?? p.slice(5, -5))));
    const kitIds = new Set([...byPath.keys()].filter((p) => p.startsWith('kits/')).map((p) => String(byPath.get(p)?.id ?? p.slice(5, -5))));
    /** @type {Map<string, Record<string, any>|null>} */
    const changes = new Map();
    const touched = (/** @type {Record<string, any>} */ file) => ({ ...file, updatedAt: stamp() });

    for (const [path, kit] of byPath) {
      if (!path.startsWith('kits/') || !Array.isArray(kit.gearIds)) continue;
      const kept = kit.gearIds.filter((/** @type {string} */ id) => gearIds.has(id));
      if (kept.length !== kit.gearIds.length) changes.set(path, touched({ ...kit, gearIds: kept }));
    }
    for (const [path, item] of byPath) {
      if (path.startsWith('maintenance/') && item.gearId && !gearIds.has(item.gearId)) changes.set(path, null);
    }
    // At most one dive-equipment file per dive: the newest wins, the pieces of the others are added to it.
    /** @type {Map<string, string[]>} */
    const byDive = new Map();
    for (const [path, rec] of byPath) {
      const start = rec.diveKey?.start;
      if (path.startsWith('dive-equipment/') && typeof start === 'string') byDive.set(start, [...(byDive.get(start) ?? []), path]);
    }
    for (const paths of byDive.values()) {
      if (paths.length < 2) continue;
      const ranked = paths.slice().sort((a, b) => {
        const x = String(byPath.get(a)?.updatedAt ?? '');
        const y = String(byPath.get(b)?.updatedAt ?? '');
        return x === y ? (a < b ? 1 : -1) : x < y ? 1 : -1;
      });
      const winner = /** @type {Record<string, any>} */ ({ ...byPath.get(ranked[0]) });
      const union = new Set(Array.isArray(winner.gearIds) ? winner.gearIds : []);
      for (const other of ranked.slice(1)) {
        for (const id of byPath.get(other)?.gearIds ?? []) union.add(id);
        changes.set(other, null);
      }
      winner.gearIds = [...union];
      byPath.set(ranked[0], winner);
      changes.set(ranked[0], touched(winner));
    }
    // Links to pieces and kits that are gone.
    for (const [path, rec] of byPath) {
      if (!path.startsWith('dive-equipment/') || changes.get(path) === null) continue;
      const current = changes.get(path) ?? rec;
      /** @type {Record<string, any>} */
      const next = { ...current };
      if (Array.isArray(next.gearIds)) next.gearIds = next.gearIds.filter((/** @type {string} */ id) => gearIds.has(id));
      for (const key of ['suitGearId', 'undersuitGearId']) if (next[key] && !gearIds.has(next[key])) next[key] = '';
      if (next.kitId && !kitIds.has(next.kitId)) next.kitId = '';
      if (sortedJson(next) !== sortedJson(current)) changes.set(path, changes.has(path) ? next : touched(next));
    }
    if (!changes.size) return 0;
    const writes = [...changes].map(([path, value]) => ({ path, text: value === null ? null : sortedJson(value) }));
    await core.bgitWrite({ dir, files: writes });
    await core.bgitCommit({ dir, paths: writes.map((w) => w.path), message: 'Benthic: clean-up', ...author });
    return writes.length;
  }

  /**
   * The paths in the sealed folders the data key cannot open here: they are neither sent nor overwritten.
   * @param {string} path @param {string|null} text
   */
  async function isLocked(path, text) {
    if (text === null || !isSealedPath(path)) return false;
    let file;
    try {
      file = parse(text);
    } catch {
      return false;
    }
    if (!file?.enc) return false;
    // An item sealed with another key than the account's cannot be read by the account's other devices: it waits (the
    // device's own items until the pairing re-seals them) rather than going up under a key nobody else holds.
    const accountKid = box.getAccountKid();
    if (accountKid && file.enc.kid && file.enc.kid !== accountKid) return true;
    try {
      await box.open(file.enc, sealedItem(path, file));
      return false;
    } catch (e) {
      return codeOf(e) === 'MISSING_DATA_KEY';
    }
  }

  /**
   * What the working copy holds of the keys (`keys/`), and the account key's id into the box. Nothing is made here.
   * @param {string} dir
   * @returns {Promise<KeyState>}
   */
  async function readKeyState(dir) {
    const { files } = await core.bgitFiles({ dir });
    const keyPaths = files.filter(isKeyPath);
    const { texts } = keyPaths.length ? await core.bgitRead({ dir, paths: keyPaths }) : { texts: [] };
    /** @type {Map<string, any>} */
    const byPath = new Map();
    keyPaths.forEach((path, i) => {
      try {
        if (texts[i] != null) byPath.set(path, JSON.parse(/** @type {string} */ (texts[i])));
      } catch {
        // An unreadable key file is left alone.
      }
    });
    /** @type {string|null} */
    let kid = null;
    try {
      if (byPath.has(ACCOUNT_KEY_PATH)) kid = parseAccountKeyFile(byPath.get(ACCOUNT_KEY_PATH));
    } catch {
      kid = null;
    }
    let keyMissing = false;
    if (kid) {
      box.setAccountKid(kid);
      keyMissing = !(await box.hasKey(kid));
    }
    return {
      kid,
      keyMissing,
      recovery: byPath.get(RECOVERY_PATH) ?? null,
      pairing: [...byPath].filter(([path]) => path.startsWith(PAIRING_DIR)).map(([path, json]) => ({ path, json })),
    };
  }

  /**
   * The first push of a device to a server that has no account key yet: this device's own key becomes the account key
   * (nothing is re-sealed), or a new one is made when the device has none. `keys/account.json` is committed, with the data.
   * A key the device made once and lost is never replaced silently.
   * @param {string} dir
   * @returns {Promise<string|null>} the account key's id, or null when none could be set
   */
  async function createAccountKey(dir) {
    let kid = await box.deviceKid();
    if (!kid) {
      if (await box.hadKey()) return null;
      const made = await newAccountKey();
      await box.adoptAccountKey(made.key);
      await box.persistAccountKey();
      kid = made.kid;
    }
    box.setAccountKid(kid);
    const file = accountKeyFile(kid);
    await core.bgitWrite({ dir, files: [{ path: file.path, text: sortedJson(file.json) }] });
    await core.bgitCommit({ dir, paths: [file.path], message: 'Benthic: account key', ...author });
    return kid;
  }

  /**
   * Deletes the pairing files past their time (a pairing is 10 minutes); one commit.
   * @param {string} dir
   * @returns {Promise<number>}
   */
  async function cleanPairing(dir) {
    const { files } = await core.bgitFiles({ dir });
    const paths = files.filter((p) => p.startsWith(PAIRING_DIR) && p.endsWith('.json'));
    if (!paths.length) return 0;
    const { texts } = await core.bgitRead({ dir, paths });
    const stale = paths.filter((_, i) => {
      try {
        return isPairingExpired(texts[i] == null ? null : JSON.parse(texts[i]), { now: () => now().getTime() });
      } catch {
        return true;
      }
    });
    if (!stale.length) return 0;
    await core.bgitWrite({ dir, files: stale.map((path) => ({ path, text: null })) });
    await core.bgitCommit({ dir, paths: stale, message: 'Benthic: expired pairing', ...author });
    return stale.length;
  }

  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();

  /**
   * One run, after the one before it.
   * @returns {Promise<SyncResult>}
   */
  function run() {
    const next = queue.then(() => runOnce());
    queue = next.catch(() => {});
    return next;
  }

  /** @returns {Promise<SyncResult>} */
  async function runOnce() {
    /** @type {{ repositoryUrl: string, username: string, token: string }} */
    let access;
    try {
      access = await core.serverSessionAccess();
    } catch {
      return { status: 'noSession' };
    }
    if (!access?.repositoryUrl || !access.token) return { status: 'noSession' };
    const accountKey = repositoryKey(access.repositoryUrl);
    const dir = workingCopyName(access.repositoryUrl);
    const gitAccess = { dir, username: access.username, token: access.token, branch: BRANCH };

    const syncState = await store.read('meta/sync.json');
    if (syncState?.accountKey && syncState.accountKey !== accountKey) return { status: 'differentAccount' };
    const pullOnly = !!(await store.read('meta/state.json'))?.readOnlyFrom;

    /** @type {Set<string>} */ const lockedPaths = new Set();
    /** @type {Set<string>} */ const unsealedPaths = new Set();
    /** @type {Map<string, string[]>} */ const conflictKeys = new Map();
    let sent = 0;
    let received = 0;
    let retry = false;

    try {
      // 1. The working copy. A first sync starts from a fresh one: nothing of an earlier, unfinished first run is kept.
      let present = true;
      try {
        await core.bgitHead({ dir, branch: BRANCH });
      } catch (e) {
        if (codeOf(e) !== 'NO_WORKING_COPY') throw e;
        present = false;
      }
      if (present && !syncState) {
        await core.bgitRemove({ dir });
        present = false;
      }
      if (!present) await core.bgitClone({ ...gitAccess, url: access.repositoryUrl });

      let keys = await readKeyState(dir);
      if (!syncState) {
        const remote = (await core.bgitFiles({ dir })).files.filter(isSyncedPath);
        const local = await localSyncedPaths();
        if (local.length && remote.length) return { status: 'joinNeeded', keyMissing: keys.keyMissing, hasRecovery: !!keys.recovery };
        if (local.length && !pullOnly) await markAllPending(local);
      }
      // The account has no key yet: this device's key becomes the account's, with its first push.
      if (!keys.kid && !pullOnly && (await createAccountKey(dir))) keys = await readKeyState(dir);

      /** @type {Map<string, string|null>} the text each path had when it was sent, to merge an edit made meanwhile */
      let hints = new Map();
      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        // 2. What is not sent yet.
        const snapshot = pullOnly ? [] : await store.snapshotPending();
        /** @type {{ path: string, text: string|null }[]} */ const send = [];
        /** @type {[string, string|null][]} */ const acknowledged = [];
        for (const [path, text] of snapshot) {
          if (!isSyncedPath(path)) {
            acknowledged.push([path, text]);
            continue;
          }
          if (await isLocked(path, text)) {
            lockedPaths.add(path);
            continue;
          }
          let file = null;
          try {
            file = parse(text);
          } catch {
            // Unreadable here: sent as it is.
          }
          if (holdsClearSecrets(path, file)) {
            unsealedPaths.add(path);
            continue;
          }
          send.push({ path, text });
          acknowledged.push([path, text]);
        }

        // 3. Into the working copy, one commit. A path edited during an earlier pass joins what the server has.
        if (send.length) {
          const heads = hints.size ? (await core.bgitRead({ dir, paths: send.map((s) => s.path) })).texts : [];
          for (const [i, item] of send.entries()) {
            if (!hints.has(item.path)) continue;
            const current = heads[i] ?? null;
            const base = hints.get(item.path) ?? null;
            if (current === item.text || current === base) continue;
            const merged = await resolveFile(item.path, base, item.text, current);
            if (merged.locked) lockedPaths.add(item.path);
            else if (merged.keys.length) conflictKeys.set(item.path, merged.keys);
            item.text = merged.text;
          }
          await core.bgitWrite({ dir, files: send.map((s) => ({ path: s.path, text: s.text })) });
          const committed = await core.bgitCommit({ dir, paths: send.map((s) => s.path), message: `Benthic: ${send.length} changes`, ...author });
          if (committed.commit) sent += send.length;
        }

        // 4 and 5. Pull and merge; push; back to 4 when the server moved meanwhile.
        let pushed = false;
        for (let attempt = 0; attempt <= MAX_PUSH_RETRIES && !pushed; attempt++) {
          const pull = await core.bgitPull({ ...gitAccess, ...author });
          if (pull.result === 'conflict') {
            const writes = [];
            for (const file of pull.files) {
              const resolved = await resolveFile(file.path, file.base, file.ours, file.theirs);
              if (resolved.locked) lockedPaths.add(file.path);
              else if (resolved.keys.length) conflictKeys.set(file.path, resolved.keys);
              writes.push({ path: file.path, text: resolved.text });
            }
            await core.bgitWrite({ dir, files: writes });
            await core.bgitCommit({ dir, paths: writes.map((w) => w.path), message: 'Benthic: merge', mergeParent: pull.theirs, ...author });
          }
          if (pull.result !== 'upToDate' && pull.result !== 'empty') {
            await cleanUp({ dir });
            keys = await readKeyState(dir);
          }
          if (!pullOnly) await cleanPairing(dir);
          if (pullOnly) break;
          try {
            await core.bgitPush(gitAccess);
            pushed = true;
          } catch (e) {
            if (codeOf(e) !== 'REJECTED') throw e;
            if (attempt === MAX_PUSH_RETRIES) {
              retry = true;
              return { status: 'error', error: 'REJECTED', retry, sent, conflicts: conflictList(conflictKeys), locked: [...lockedPaths] };
            }
          }
        }

        // 6 and 7. The files the server's state changed, applied unless an edit made meanwhile is in the way.
        const { head } = await core.bgitHead({ dir, branch: BRANCH });
        const applied = await applyServerState({ dir, head, syncState: syncState ?? (await store.read('meta/sync.json')), snapshot, acknowledged, lockedPaths, unsealedPaths });
        received += applied.received;
        if (!applied.deferred.length) {
          // 8. The head this device has applied.
          await store.write('meta/sync.json', { format: 1, accountKey, head: head ?? '', syncedAt: stamp() });
          return {
            status: 'synced',
            pullOnly,
            sent,
            received,
            head,
            conflicts: conflictList(conflictKeys),
            locked: [...lockedPaths],
            unsealed: [...unsealedPaths],
            keyMissing: keys.keyMissing,
            hasRecovery: !!keys.recovery,
            retry: false,
          };
        }
        hints = new Map(applied.deferred.map((path) => [path, new Map(snapshot).get(path) ?? null]));
        if (pullOnly) {
          retry = false;
          return { status: 'synced', pullOnly, sent, received, head, conflicts: conflictList(conflictKeys), locked: [...lockedPaths], unsealed: [...unsealedPaths], keyMissing: keys.keyMissing, hasRecovery: !!keys.recovery, retry: false };
        }
      }
      retry = true;
      return { status: 'synced', pullOnly, sent, received, conflicts: conflictList(conflictKeys), locked: [...lockedPaths], unsealed: [...unsealedPaths], keyMissing: keys.keyMissing, hasRecovery: !!keys.recovery, retry };
    } catch (e) {
      const code = codeOf(e);
      if (code === 'UNREACHABLE' || code === 'CANCELLED') return { status: 'offline', error: code, sent, retry: true };
      if (code === 'REFUSED' || code === 'BAD_CREDENTIALS') return { status: 'refused', error: code };
      return { status: 'error', error: code || 'GIT_ERROR', sent };
    }
  }

  /** @param {Map<string, string[]>} map */
  const conflictList = (map) => [...map].map(([path, keys]) => ({ path, keys }));

  /** The synced files of the local store. @returns {Promise<string[]>} */
  async function localSyncedPaths() {
    const out = [];
    for (const prefix of SYNCED_PREFIXES) out.push(...(await store.list(prefix)));
    return out.filter(isSyncedPath);
  }

  /** Every existing file joins `meta/pending.json` before the first push. @param {string[]} paths */
  async function markAllPending(paths) {
    /** @type {[string, unknown][]} */
    const writes = [];
    for (const path of paths) {
      const value = await store.read(path);
      if (value) writes.push([path, value]);
    }
    if (writes.length) await store.trackedBatch({ writes });
  }

  /**
   * The server's state into the local store (steps 6 and 7).
   * @param {{ dir: string, head: string|null, syncState: any, snapshot: [string, string|null][], acknowledged: [string, string|null][], lockedPaths: Set<string>, unsealedPaths: Set<string> }} input
   * @returns {Promise<{ received: number, deferred: string[] }>}
   */
  async function applyServerState({ dir, head, syncState, snapshot, acknowledged, lockedPaths, unsealedPaths }) {
    const lastHead = typeof syncState?.head === 'string' ? syncState.head : '';
    /** @type {{path: string, state: string}[]} */
    let changes = [];
    let everything = false;
    if (head && head !== lastHead) {
      try {
        changes = (await core.bgitDiff({ dir, fromCommit: lastHead, toCommit: head })).changes;
      } catch (e) {
        if (codeOf(e) !== 'UNKNOWN_COMMIT') throw e;
        changes = (await core.bgitDiff({ dir, fromCommit: '', toCommit: head })).changes;
        everything = true;
      }
    }
    // What the server changed, and what this device sent (a file it sent may have been merged or cleaned away since).
    const paths = new Set(changes.map((c) => c.path));
    for (const [path] of acknowledged) paths.add(path);
    const interesting = [...paths].filter((p) => isSyncedPath(p) && !lockedPaths.has(p) && !unsealedPaths.has(p));
    if (everything && head) {
      // The last head is unknown: whatever the server no longer has and this device has not changed goes.
      const there = new Set((await core.bgitFiles({ dir })).files);
      const pending = new Set((await store.snapshotPending()).map(([p]) => p));
      for (const path of await localSyncedPaths()) if (!there.has(path) && !pending.has(path) && !lockedPaths.has(path)) interesting.push(path);
    }
    const wanted = [...new Set(interesting)];
    const texts = wanted.length && head ? (await core.bgitRead({ dir, paths: wanted })).texts : [];

    /** @type {[string, string|null][]} */ const expected = [];
    /** @type {[string, unknown][]} */ const writes = [];
    /** @type {string[]} */ const removes = [];
    /** @type {string[]} */ const deferred = [];
    const sent = new Map(snapshot);
    const pendingNow = new Map(await store.snapshotPending());
    /** An edit made since the snapshot, or one this run did not send, is never overwritten. @param {string} path */
    const inTheWay = (path) => pendingNow.has(path) && (!sent.has(path) || sent.get(path) !== pendingNow.get(path));

    for (const [i, path] of wanted.entries()) {
      const text = head ? texts[i] : null;
      const local = await localText(store, path);
      let value;
      if (text != null) {
        try {
          value = JSON.parse(text);
        } catch {
          continue;
        }
        if (local !== null && local === sortedJson(value)) continue;
      } else if (local === null) continue;
      if (inTheWay(path)) {
        deferred.push(path);
        continue;
      }
      expected.push([path, local]);
      if (text != null) writes.push([path, value]);
      else removes.push(path);
    }
    // What was acknowledged and is not in `expected` still has to match: applySyncedIfUnchanged checks it.
    for (let tries = 0; tries < 3; tries++) {
      if (await store.applySyncedIfUnchanged(expected, { writes, removes }, acknowledged)) return { received: writes.length + removes.length, deferred };
      // An edit landed between the read and the write: read again.
      for (const entry of expected) entry[1] = await localText(store, entry[0]);
    }
    return { received: 0, deferred: [...deferred, ...expected.map(([p]) => p)] };
  }

  /** The working copy's folder and the git access of the signed-in account. */
  async function session() {
    const access = await core.serverSessionAccess();
    if (!access?.repositoryUrl || !access.token) throw new Error('NOT_SIGNED_IN');
    return { access, dir: workingCopyName(access.repositoryUrl) };
  }

  return {
    run,
    /**
     * The keys of the account as the working copy holds them as of the last run (no network): the account key's id, the
     * recovery key's file and the pairing files. Also tells the box which key the account uses.
     * @returns {Promise<KeyState>}
     */
    async readKeys() {
      const { dir } = await session();
      return readKeyState(dir);
    },
    /**
     * Commits key files into the working copy (written and deleted paths under `keys/`) and syncs, so that they reach the
     * server and the other devices: a pairing file, `keys/recovery.json`, the start-over's `keys/account.json`.
     * @param {{ writes?: { path: string, json: any }[], deletes?: string[], message?: string }} changes
     * @returns {Promise<SyncResult>}
     */
    commitKeyFiles({ writes = [], deletes = [], message = 'Benthic: keys' }) {
      const files = [...writes.map((w) => ({ path: w.path, text: /** @type {string|null} */ (sortedJson(w.json)) })), ...deletes.map((path) => ({ path, text: /** @type {string|null} */ (null) }))];
      if (!files.length || !files.every((f) => isKeyPath(f.path))) return Promise.reject(new Error('BAD_PATH'));
      const next = queue.then(async () => {
        const { dir } = await session();
        await core.bgitWrite({ dir, files });
        await core.bgitCommit({ dir, paths: files.map((f) => f.path), message, ...author });
        return runOnce();
      });
      queue = next.catch(() => {});
      return next;
    },
    /** The commits not sent yet (offline queue). @returns {Promise<number>} */
    async unsent() {
      const { dir } = await session();
      const { ahead } = await core.bgitUnpushed({ dir, branch: BRANCH });
      return ahead;
    },
  };
}
