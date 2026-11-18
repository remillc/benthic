// @ts-check
// DEVELOPMENT ONLY. The actions of the « Outils de développement » menu: switch between a free account and a paying
// (OpenDives+) one while trying the app. Loaded only through `import()` behind `devAccounts` (lib/dev-switch.js), so a
// build without VITE_DEV_ACCOUNTS=1 does not contain it. The dev routes refuse any server that is not local (dev-accounts.js).
// Every dependency is given, so that node:test runs the actions with a fake transport and no device.
import { createDevApi, randomTempEmail, isTempEmail } from './dev-accounts.js';

/** The remembered answer of the last dev action: the server has no « am I subscribed » route yet. */
export const SUBSCRIBED_KEY = 'od.devSubscribed';
/** The beta's first-launch key (logbook.svelte.js): « show » replays it; the logbooks are not touched. */
export const WELCOME_KEY = 'od.welcomeBeta';

/**
 * @typedef {Object} DevToolsDeps
 * @property {ReturnType<typeof createDevApi>} api
 * @property {{ info: () => Promise<{ signedIn: boolean, email: string }>, access: () => Promise<{ sessionToken: string }>, save: (session: any) => Promise<void> }} session
 * @property {{ signOut: (options?: { deleteCopy?: boolean }) => Promise<void>, startWithoutAccount: () => Promise<any> }} app
 * @property {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }} store
 * @property {() => void} reload the app starts again so that every screen reads the new state
 * @property {() => string} server the server's address
 * @property {() => string} [email] a fresh temporary address
 */

/**
 * @typedef {{ kind: 'free'|'subscribed', signedIn: boolean, subscribed: boolean, email: string, server: string, temporary: boolean }} DevState
 */

/** @param {DevToolsDeps} deps */
export function createDevTools(deps) {
  const { api, session, app, store, reload, server } = deps;
  const fresh = deps.email ?? randomTempEmail;

  /** The token of the session on this device. */
  async function token() {
    return (await session.access()).sessionToken;
  }

  /** @returns {Promise<DevState>} */
  async function state() {
    let info = { signedIn: false, email: '' };
    try {
      info = await session.info();
    } catch {
      // No session.
    }
    const subscribed = info.signedIn && store.getItem(SUBSCRIBED_KEY) !== '0';
    return { kind: subscribed ? 'subscribed' : 'free', signedIn: info.signedIn, subscribed, email: info.signedIn ? info.email : '', server: server(), temporary: info.signedIn && isTempEmail(info.email) };
  }

  return {
    state,

    /**
     * « Passer en compte gratuit ». `signOut` (default): the session of OpenDives+ is forgotten, the logbook of the device
     * stays and the app opens it. `unsubscribe`: the session stays and the server marks the account not subscribed.
     * @param {'signOut'|'unsubscribe'} [how]
     */
    async toFree(how = 'signOut') {
      const s = await state();
      if (how === 'unsubscribe') {
        if (!s.signedIn) throw new Error('NO_SESSION');
        await api.unsubscribe(await token());
        store.setItem(SUBSCRIBED_KEY, '0');
      } else {
        if (s.signedIn) await app.signOut({ deleteCopy: false });
        store.removeItem(SUBSCRIBED_KEY);
        await app.startWithoutAccount();
      }
      reload();
    },

    /** « Passer en compte abonné »: a temporary account when there is no session, then the simulated purchase. */
    async toSubscribed() {
      const s = await state();
      if (s.signedIn) {
        await api.subscribe(await token());
      } else {
        const created = await api.signIn(fresh(), 'Plongeur d’essai');
        await api.subscribe(created.sessionToken);
        await session.save(created);
      }
      store.setItem(SUBSCRIBED_KEY, '1');
      reload();
    },

    /** « Nouveau compte d'essai »: a fresh temporary account that is not subscribed; the previous session is left. */
    async newAccount() {
      const s = await state();
      const created = await api.signIn(fresh(), 'Plongeur d’essai');
      if (s.signedIn) await app.signOut({ deleteCopy: false });
      await session.save(created);
      store.setItem(SUBSCRIBED_KEY, created.user?.subscribed === true ? '1' : '0');
      reload();
    },

    /** « Supprimer ce compte d'essai »: only a temporary account (the server checks it too). */
    async deleteAccount() {
      const s = await state();
      if (!s.signedIn) throw new Error('NO_SESSION');
      if (!s.temporary) throw new Error('NOT_TEMPORARY');
      await api.reset(await token());
      await app.signOut({ deleteCopy: true });
      store.removeItem(SUBSCRIBED_KEY);
      reload();
    },

    /** « Rejouer le premier lancement »: only the beta's first-launch key; the logbooks and the session stay. */
    replayFirstLaunch() {
      store.setItem(WELCOME_KEY, 'show');
      reload();
    },
  };
}

/** The real dependencies, read when the menu opens (dynamic imports: the app's modules are not loaded by the tests). */
export async function realDevTools() {
  const [{ OpenDivesCore }, { deviceStore }, logbookModule, accounts, { serverUrl }] = await Promise.all([
    import('opendives-core'),
    import('./device-store.js'),
    import('./logbook.svelte.js'),
    import('./dev-accounts.js'),
    import('./server-url.js'),
  ]);
  return createDevTools({
    api: accounts.createDevApi(),
    session: { info: () => OpenDivesCore.serverSessionInfo(), access: () => OpenDivesCore.serverSessionAccess(), save: accounts.saveSession },
    app: { signOut: logbookModule.signOut, startWithoutAccount: logbookModule.startWithoutAccount },
    store: deviceStore,
    reload: () => window.location.reload(),
    server: serverUrl,
  });
}
