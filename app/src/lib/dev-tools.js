// @ts-check
// DEVELOPMENT ONLY. The actions of the « Outils de développement » menu: switch between a free account and a paying
// (Benthic+) one while trying the app. Loaded only through `import()` behind `devAccounts` (lib/dev-switch.js), so a
// build without VITE_DEV_ACCOUNTS=1 does not contain it. The dev routes refuse any server that is not local (dev-accounts.js).
// Every dependency is given, so that node:test runs the actions with a fake transport and no device.
import { createDevApi, randomTempEmail, isTempEmail } from './dev-accounts.js';
import { ALPHA_IMPORT_KEY } from './alpha-logbook.js';
import { BENTHIC_PLUS_SUBSCRIBED_KEY } from './benthic-plus-state.js';

/** The remembered « subscribed » answer of the app (lib/benthic-plus-state.js): the fallback when the server cannot be asked (GET /v1/account). */
export const SUBSCRIBED_KEY = BENTHIC_PLUS_SUBSCRIBED_KEY;
/** The beta's first-launch key (logbook.svelte.js): « show » replays it; the logbooks are not touched. */
export const WELCOME_KEY = 'bc.welcomeBeta';

/**
 * @typedef {Object} DevToolsDeps
 * @property {ReturnType<typeof createDevApi>} api
 * @property {{ info: () => Promise<{ signedIn: boolean, email: string }>, access: () => Promise<{ sessionToken: string }>, save: (session: any) => Promise<void>, clear?: () => Promise<void> }} session
 * @property {{ signOut: (options?: { deleteCopy?: boolean }) => Promise<void>, startWithoutAccount: () => Promise<any> }} app
 * @property {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }} store
 * @property {(account: { signedIn: boolean, email: string, subscribed: boolean }) => void} [account] sets the app's Benthic+ account at once (lib/benthic-plus-state.svelte.js): the whole app follows, with no restart
 * @property {() => void} reload the app starts again so that every screen reads the new state
 * @property {() => string} server the server's address
 * @property {() => string} [email] a fresh temporary address
 * @property {() => Promise<number>} [alphaFolders] how many logbooks of the previous version the device keeps
 */

/**
 * @typedef {{ kind: 'free'|'subscribed', signedIn: boolean, subscribed: boolean, email: string, server: string, temporary: boolean, fromServer: boolean, alphaFolders: number|null }} DevState
 */

/** @param {DevToolsDeps} deps */
export function createDevTools(deps) {
  const { api, session, app, store, reload, server } = deps;
  const fresh = deps.email ?? randomTempEmail;
  const setAccount = deps.account ?? (() => {});

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
    // The server is the truth when a session exists; the remembered flag only stands in when it cannot be asked.
    let subscribed = info.signedIn && store.getItem(SUBSCRIBED_KEY) !== '0';
    let fromServer = false;
    if (info.signedIn) {
      try {
        subscribed = (await api.account(await token())).subscribed;
        fromServer = true;
      } catch {
        // Offline or refused: the remembered flag.
      }
    }
    let alphaFolders = null;
    try {
      const n = deps.alphaFolders ? await deps.alphaFolders() : null;
      alphaFolders = Number.isInteger(n) ? n : null;
    } catch {
      // Not listable here (desktop, browser): unknown, the action stays enabled.
    }
    return { alphaFolders, fromServer, kind: subscribed ? 'subscribed' : 'free', signedIn: info.signedIn, subscribed, email: info.signedIn ? info.email : '', server: server(), temporary: info.signedIn && isTempEmail(info.email) };
  }

  return {
    state,

    /**
     * « Passer en compte gratuit ». `signOut` (default): the session of Benthic+ is forgotten, the logbook of the device
     * stays and the app opens it. `unsubscribe`: the session stays and the server marks the account not subscribed.
     * @param {'signOut'|'unsubscribe'} [how]
     */
    async toFree(how = 'signOut') {
      const s = await state();
      if (how === 'unsubscribe') {
        if (s.signedIn) {
          // Idempotent on the server: an account that is not subscribed stays so.
          await api.unsubscribe(await token());
          setAccount({ signedIn: true, email: s.email, subscribed: false });
        } else {
          // No session: a temporary account is signed in (as « Abonné » does) and left not subscribed.
          const created = await api.signIn(fresh(), 'Plongeur d’essai');
          if (created.user?.subscribed === true) await api.unsubscribe(created.sessionToken);
          await session.save(created);
          setAccount({ signedIn: true, email: created.user?.email ?? '', subscribed: false });
        }
        store.setItem(SUBSCRIBED_KEY, '0');
        // No restart: the account sheet and every Benthic+ feature follow the account state.
        return;
      } else {
        if (s.signedIn) await app.signOut({ deleteCopy: false });
        // The session is forgotten even when the logbook was never connected through it (app.signOut only clears it then).
        if (s.signedIn) await session.clear?.();
        store.removeItem(SUBSCRIBED_KEY);
        setAccount({ signedIn: false, email: '', subscribed: false });
        await app.startWithoutAccount();
      }
      reload();
    },

    /** « Passer en compte abonné »: a temporary account when there is no session, then the simulated purchase. */
    async toSubscribed() {
      const s = await state();
      let email = s.email;
      if (s.signedIn) {
        await api.subscribe(await token());
      } else {
        const created = await api.signIn(fresh(), 'Plongeur d’essai');
        await api.subscribe(created.sessionToken);
        await session.save(created);
        email = created.user?.email ?? '';
      }
      store.setItem(SUBSCRIBED_KEY, '1');
      // No restart: the account state changes the whole app at once.
      setAccount({ signedIn: true, email, subscribed: true });
    },

    /** « Nouveau compte d'essai »: a fresh temporary account that is not subscribed; the previous session is left. */
    async newAccount() {
      const s = await state();
      const created = await api.signIn(fresh(), 'Plongeur d’essai');
      if (s.signedIn) {
        await app.signOut({ deleteCopy: false });
        await session.clear?.();
      }
      await session.save(created);
      store.setItem(SUBSCRIBED_KEY, created.user?.subscribed === true ? '1' : '0');
      setAccount({ signedIn: true, email: created.user?.email ?? '', subscribed: created.user?.subscribed === true });
      reload();
    },

    /** « Supprimer ce compte d'essai »: only a temporary account (the server checks it too). */
    async deleteAccount() {
      const s = await state();
      if (!s.signedIn) throw new Error('NO_SESSION');
      if (!s.temporary) throw new Error('NOT_TEMPORARY');
      await api.reset(await token());
      await app.signOut({ deleteCopy: true });
      await session.clear?.();
      store.removeItem(SUBSCRIBED_KEY);
      setAccount({ signedIn: false, email: '', subscribed: false });
      reload();
    },

    /** « Rejouer le premier lancement »: only the beta's first-launch key; the logbooks and the session stay. */
    replayFirstLaunch() {
      store.setItem(WELCOME_KEY, 'show');
      reload();
    },

    /**
     * « Importer le carnet de la version précédente »: the one-off import is offered again (its « done » mark is cleared)
     * and the first launch replays; « Importer un carnet » then lists the alpha's local copies, if the device has some.
     */
    async importAlphaLogbook() {
      const s = await state();
      if (s.alphaFolders === 0) throw new Error('NO_ALPHA');
      store.removeItem(ALPHA_IMPORT_KEY);
      store.setItem(WELCOME_KEY, 'show');
      reload();
    },
  };
}

/**
 * The three segments of the account selector. The current one (the account's true state) is on and disabled; the others
 * are enabled, except while an action runs or before the tools are loaded.
 * @param {DevState|null} state
 * @param {{ busy?: string, ready?: boolean }} [options]
 * @returns {{ id: 'out'|'keep'|'sub', index: number, on: boolean, disabled: boolean }[]}
 */
export function accountSegments(state, { busy = '', ready = true } = {}) {
  const level = !state ? -1 : state.kind === 'subscribed' ? 2 : state.signedIn ? 1 : 0;
  return /** @type {const} */ (['out', 'keep', 'sub']).map((id, index) => ({ id, index, on: level === index, disabled: !ready || !!busy || level === index }));
}

/** What a segment does. @param {ReturnType<typeof createDevTools>} tools @param {'out'|'keep'|'sub'} id */
export function runSegment(tools, id) {
  if (id === 'out') return tools.toFree('signOut');
  if (id === 'keep') return tools.toFree('unsubscribe');
  return tools.toSubscribed();
}

/** The real dependencies, read when the menu opens (dynamic imports: the app's modules are not loaded by the tests). */
export async function realDevTools() {
  const [{ BenthicCore }, { deviceStore }, logbookModule, accounts, { serverUrl }, { setBenthicPlusAccount }] = await Promise.all([
    import('benthic-core'),
    import('./device-store.js'),
    import('./logbook.svelte.js'),
    import('./dev-accounts.js'),
    import('./server-url.js'),
    import('./benthic-plus-state.svelte.js'),
  ]);
  return createDevTools({
    api: accounts.createDevApi(),
    session: { info: () => BenthicCore.serverSessionInfo(), access: () => BenthicCore.serverSessionAccess(), save: accounts.saveSession, clear: () => BenthicCore.serverSessionClear() },
    app: { signOut: logbookModule.signOut, startWithoutAccount: logbookModule.startWithoutAccount },
    store: deviceStore,
    account: setBenthicPlusAccount,
    // A moment later, so that the « done » message is seen before the app starts again.
    reload: () => void setTimeout(() => window.location.reload(), 900),
    server: serverUrl,
    alphaFolders: async () => (await BenthicCore.alphaCacheList()).length,
  });
}
