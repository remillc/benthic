// @ts-check
// DEVELOPMENT ONLY. « Rejouer le premier lancement »: the app goes back to the state of a first install. Loaded only through
// `import()` behind `devAccounts` (lib/dev-switch.js), so a build without VITE_DEV_ACCOUNTS=1 does not contain it. The native
// side (`devResetApp`) refuses anything but a debug build. Every dependency is given, so node:test runs it with fakes.

/**
 * What the reset erases, in this order (ids are the keys of the texts in the menu and of the tests). The last two are
 * the web layer's own state; they go last so that nothing written meanwhile survives.
 */
export const RESET_STEPS = /** @type {const} */ ([
  'notifications', // pending local notifications
  'native', // the core's open log, the device logbook, working copies, session and git tokens, data key, staged files
  'indexedDb', // equipment, profile, certifications, maintenance stores
  'deviceStore', // every bc.* setting (device-store.js), the first-launch state and the dev flags with them
  'localStorage', // the logbook snapshot and anything the web view kept
]);

/** What is never touched, listed so that the confirmation can say it. */
export const RESET_KEPT = /** @type {const} */ (['devAuthority', 'offlineMaps', 'serverAccount']);

/**
 * @typedef {Object} DevResetDeps
 * @property {() => boolean} allowed whether this is a development build (the switch of lib/dev-switch.js)
 * @property {() => Promise<void>} cancelNotifications
 * @property {(options: { keepAlpha: boolean }) => Promise<void>} native `devResetApp` of the plugin
 * @property {() => Promise<void>} clearIndexedDb
 * @property {() => Promise<void>|void} clearDeviceStore
 * @property {() => void} clearLocalStorage
 * @property {() => void} reload
 */

/**
 * What the confirmation lists, from the numbers of this device.
 * @param {{ dives: number, loggedIn: boolean, keepAlpha: boolean }} o
 * @returns {string[]} ids of the lines to show
 */
export function resetLines({ dives, loggedIn, keepAlpha }) {
  return [...(dives > 0 ? ['logbook'] : []), 'settings', ...(loggedIn ? ['session'] : []), 'equipment', 'files', 'notifications', ...(keepAlpha ? [] : ['alpha'])];
}

/** @param {DevResetDeps} deps */
export function createDevReset(deps) {
  return {
    /**
     * Erases everything, then starts the app again. Nothing is called on the server.
     * @param {{ keepAlpha?: boolean }} [options] the alpha's cache stays unless this is false
     * @returns {Promise<string[]>} the steps done, in order
     */
    async run({ keepAlpha = true } = {}) {
      if (!deps.allowed()) throw new Error('NOT_DEV');
      /** @type {string[]} */
      const done = [];
      await deps.cancelNotifications().catch(() => {}); // desktop and the browser have none
      done.push('notifications');
      await deps.native({ keepAlpha });
      done.push('native');
      await deps.clearIndexedDb();
      done.push('indexedDb');
      await deps.clearDeviceStore();
      done.push('deviceStore');
      deps.clearLocalStorage();
      done.push('localStorage');
      deps.reload();
      return done;
    },
  };
}

/** Deletes every IndexedDB database of the app. @param {IDBFactory} [factory] */
export async function deleteAllDatabases(factory = globalThis.indexedDB) {
  if (!factory) return;
  const names = typeof factory.databases === 'function' ? (await factory.databases()).map((d) => d.name ?? '') : ['benthic-files'];
  await Promise.all(
    names.filter(Boolean).map(
      (name) =>
        new Promise((resolve) => {
          const request = factory.deleteDatabase(name);
          request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
        }),
    ),
  );
}

/** The real dependencies (dynamic imports: the app's modules are not loaded by the tests). */
export async function realDevReset() {
  const [{ BenthicCore }, store, { devAccounts }] = await Promise.all([import('benthic-core'), import('./device-store.js'), import('./dev-switch.js')]);
  return createDevReset({
    allowed: () => devAccounts,
    cancelNotifications: async () => {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const pending = (await LocalNotifications.getPending()).notifications;
      if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    },
    native: (options) => BenthicCore.devResetApp(options),
    clearIndexedDb: () => deleteAllDatabases(),
    clearDeviceStore: () => store.clearDeviceStore(),
    clearLocalStorage: () => globalThis.localStorage?.clear(),
    reload: () => window.location.replace('/'),
  });
}
