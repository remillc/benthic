// @ts-check
// The one place where the app keeps what belongs to this device: its settings and
// its small remembered choices (sort orders, the export format, the gas blender's
// mode, automatic sync, the clean-up marks, the user's statistics…). Stored with
// @capacitor/preferences, the place each system provides for an app's settings:
// SharedPreferences on Android, UserDefaults on iOS. Unlike the WebView's
// localStorage, they are written at once, survive an update, and are never
// purged by the system to make room.
//
// The rules, so that every setting is stored the same way:
//  - one module: nothing else in the app reads or writes these values;
//  - keys "bc.<name>", values as text (JSON for objects and lists);
//  - read synchronously from memory, loaded once before the app starts
//    (main.js); each change is kept in memory and sent to the system at once.
// Not here: the logbook snapshot (lib/snapshot.js) and the detail snapshot (lib/detail-snapshot.js),
// caches of what is shown at start, too large for preferences and rebuilt from the logbook when missing.

/** Keys that are not settings: they stay in the WebView's storage. */
export const NOT_SETTINGS = new Set(['bc.logbookSnapshot', 'bc.logbookSnapshotBeta', 'bc.detailSnapshot', 'bc.detailSnapshotBeta']);
/** Set once the values kept in localStorage before 15 November 2026 have been copied. */
const MOVED_KEY = 'bc.storeVersion';

// Until the rename to Benthic (22 November 2026) every key started with "od." and one was named after the old
// paid offer. The old keys are copied to the new names once, then deleted (idempotent: nothing is left to rename).
const OLD_PREFIX = 'od.';
const RENAMED = new Map([['od.odplusSubscribed', 'bc.benthicPlusSubscribed']]);

/**
 * The new name of a key stored under the old naming, or null for a key that is not an old one.
 * @param {string} key
 * @returns {string|null}
 */
export function renamedKey(key) {
  if (RENAMED.has(key)) return /** @type {string} */ (RENAMED.get(key));
  return key.startsWith(OLD_PREFIX) ? `bc.${key.slice(OLD_PREFIX.length)}` : null;
}

/** @type {Map<string, string>} */
const memory = new Map();
/** @type {typeof import('@capacitor/preferences').Preferences|null} */
let system = null;

/**
 * Loads every kept value into memory, before the app starts. The first time,
 * the values the app kept in the WebView's localStorage are copied over (and
 * left there, unread).
 */
export async function loadDeviceStore() {
  try {
    system = (await import('@capacitor/preferences')).Preferences;
    const { keys } = await system.keys();
    const values = await Promise.all(keys.map((key) => /** @type {NonNullable<typeof system>} */ (system).get({ key })));
    keys.forEach((key, i) => {
      const value = values[i].value;
      if (value != null) memory.set(key, value);
    });
    await migrateOldKeys();
    migrateOldLocalStorageCaches();
    if (!memory.has(MOVED_KEY)) await moveFromLocalStorage();
  } catch (e) {
    // Without the plugin (a test, a broken install): memory only, from localStorage.
    console.error('Settings storage', e);
    system = null;
    if (!memory.size) copyLocalStorage();
    migrateOldLocalStorageCaches();
  }
}

/**
 * Copies every "od." key of the system's preferences to its "bc." name, then deletes the old one. A value already
 * kept under the new name wins (the old one is then just deleted).
 */
async function migrateOldKeys() {
  const s = system;
  for (const [key, value] of [...memory]) {
    const name = renamedKey(key);
    if (!name) continue;
    if (!memory.has(name)) {
      memory.set(name, value);
      if (s) await s.set({ key: name, value });
    }
    memory.delete(key);
    if (s) await s.remove({ key });
  }
}

/**
 * The caches that stay in the WebView's localStorage (the logbook snapshot and the detail snapshot, with the suffix
 * of the logbook they belong to) keep their content under the new names.
 */
function migrateOldLocalStorageCaches() {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(OLD_PREFIX)) old.push(key);
    }
    for (const key of old) {
      const name = renamedKey(key);
      const value = localStorage.getItem(key);
      if (name && value != null && localStorage.getItem(name) == null) localStorage.setItem(name, value);
      localStorage.removeItem(key);
    }
  } catch {
    // No localStorage, or full: the caches are rebuilt from the logbook.
  }
}

/** The values kept before, in the WebView's localStorage. */
function copyLocalStorage() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const name = key ? (renamedKey(key) ?? key) : '';
      if (!name.startsWith('bc.') || NOT_SETTINGS.has(name)) continue;
      const value = localStorage.getItem(key);
      if (value != null && !memory.has(name)) memory.set(name, value);
    }
  } catch {
    // No localStorage: nothing to copy.
  }
}

async function moveFromLocalStorage() {
  copyLocalStorage();
  memory.set(MOVED_KEY, '1');
  const s = system;
  if (s) await Promise.all([...memory].map(([key, value]) => s.set({ key, value })));
}

/** @param {string} key */
function check(key) {
  if (!key.startsWith('bc.') || NOT_SETTINGS.has(key)) throw new Error(`Not a setting of this device: ${key}`);
}

/**
 * DEVELOPMENT ONLY (lib/dev-reset.js): forgets every setting, in memory and in the system's preferences.
 * @returns {Promise<void>}
 */
export async function clearDeviceStore() {
  memory.clear();
  await system?.clear();
}

/** The settings of this device, read and written as with localStorage. */
export const deviceStore = {
  /** @param {string} key @returns {string|null} */
  getItem(key) {
    check(key);
    return memory.get(key) ?? null;
  },
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    check(key);
    const text = String(value);
    memory.set(key, text);
    system?.set({ key, value: text }).catch((/** @type {unknown} */ e) => console.error('Keeping a setting', key, e));
  },
  /** @param {string} key @param {string} value */
  async setItemConfirmed(key, value) {
    check(key);
    if (!system) throw new Error('Settings storage is unavailable');
    const text = String(value);
    await system.set({ key, value: text });
    memory.set(key, text);
  },
  /** @param {string} key */
  removeItem(key) {
    check(key);
    memory.delete(key);
    system?.remove({ key }).catch((/** @type {unknown} */ e) => console.error('Removing a setting', key, e));
  },
};

/**
 * Every setting kept on this device, for the full export: key to text, without the store's own bookkeeping key and
 * without any key that names a secret (the account's credentials live in the secure storage, never here).
 * @returns {Record<string, string>}
 */
export function deviceSettingsSnapshot() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of [...memory].sort(([a], [b]) => a.localeCompare(b))) {
    if (key === MOVED_KEY || NOT_SETTINGS.has(key) || /token|password|secret|session|credential/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}
