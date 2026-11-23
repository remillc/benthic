// @ts-check
// The push notification of an access request (inbox task 2026-11-23-356, parts 3 and 4): the logic, without Capacitor, so that
// node:test can drive it. lib/push-notifications.svelte.js gives it the plugins.
//
// Only one thing wakes a closed app: a new device asking a paired device for the data key (the server sends nothing else). The
// token of this device is sent to the server once the device holds the account key and the system allows notifications; it is
// refreshed when it changes (and once a week), and removed at sign-out and when the device is unpaired.
//
// Nothing here ever blocks or breaks the app: every call is fire-and-forget, a failure is a quiet log line and a retry at the
// next start, never a message to the diver.

/** Set once the explanation was shown: « Plus tard » and a refusal never ask again on their own. */
export const ASKED_KEY = 'bc.pushAsked';
/** What was last sent to the server: `{ token, deviceId, at }`. */
export const TOKEN_KEY = 'bc.pushToken';
/** The token the system gave, kept until the device id is known. */
export const NATIVE_TOKEN_KEY = 'bc.pushNativeToken';
/** A token that did not change is sent again after this long (the server keeps one row per device and account). */
export const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** The iPhone notification category of an access request (the server's `category`) and its one action. */
export const ACCESS_REQUEST_CATEGORY = 'ACCESS_REQUEST';
export const ACCESS_REQUEST_ANSWER = 'answer';

/** @typedef {'granted'|'prompt'|'denied'|'unsupported'} Permission */
/** @typedef {'granted'|'refused'|'undecided'|'unsupported'} PermissionView */

/**
 * @typedef {Object} PushDeps
 * @property {'android'|'ios'|''} platform '' where there is no push (desktop, browser)
 * @property {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }} store
 * @property {{ registerPushToken: (session: string, f: { deviceId: string, platform: 'android'|'ios', token: string }) => Promise<void>, removePushToken: (session: string, deviceId: string) => Promise<void>, signOut: (session: string) => Promise<void> }} api
 * @property {() => Promise<string>} sessionToken '' when there is no session
 * @property {() => Promise<string>} permission the system's state: 'granted', 'prompt' or 'denied'
 * @property {() => Promise<string>} requestPermission the system's request, answered with the new state
 * @property {() => Promise<void>} register asks the system for this device's token (it arrives through `onToken`)
 * @property {() => Promise<void>} [unregister] forgets the token on the system side
 * @property {() => number} [now]
 * @property {(message: string, e?: unknown) => void} [warn]
 */

/** @param {unknown} s @returns {Permission} */
function permissionOf(s) {
  return s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';
}

/**
 * What a data message (Android) or a notification's data (iOS) says; null for anything else.
 * @param {any} data every value is a string
 * @returns {{ type: 'access-request', requestId: string, deviceName: string, code: string, expiresAt: number }|{ type: 'access-request-done', requestId: string }|null}
 */
export function parsePush(data) {
  if (!data || typeof data !== 'object') return null;
  const requestId = typeof data.requestId === 'string' ? data.requestId : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId)) return null;
  if (data.type === 'access-request-done') return { type: 'access-request-done', requestId };
  if (data.type !== 'access-request') return null;
  const expiresAt = Number(data.expiresAt);
  return {
    type: 'access-request',
    requestId,
    deviceName: String(data.deviceName ?? ''),
    code: String(data.code ?? ''),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
  };
}

/** @param {PushDeps} deps */
export function createPush(deps) {
  const now = deps.now ?? Date.now;
  const warn = deps.warn ?? ((message, e) => console.warn(message, e));
  const native = deps.platform === 'android' || deps.platform === 'ios';
  /** @type {Promise<boolean>|null} */
  let sending = null;

  /** @returns {{ token: string, deviceId: string, at: number }|null} */
  function sent() {
    try {
      const r = JSON.parse(deps.store.getItem(TOKEN_KEY) ?? 'null');
      return r && typeof r.token === 'string' && typeof r.deviceId === 'string' ? { token: r.token, deviceId: r.deviceId, at: Number(r.at) || 0 } : null;
    } catch {
      return null;
    }
  }

  const api = {
    /** Whether this device can receive pushes at all (a phone or a tablet). */
    supported: () => native,

    /** The system's state, never throwing. @returns {Promise<Permission>} */
    async permission() {
      if (!native) return 'unsupported';
      try {
        return permissionOf(await deps.permission());
      } catch (e) {
        warn('Reading the notification permission', e);
        return 'prompt';
      }
    },

    /**
     * What the screens show: refused when the system says so, or when the explanation was answered and the system still does not
     * allow (Android reports « prompt » after one refusal).
     * @param {Permission} state @returns {PermissionView}
     */
    view(state) {
      if (!native || state === 'unsupported') return 'unsupported';
      if (state === 'granted') return 'granted';
      return state === 'denied' || deps.store.getItem(ASKED_KEY) === '1' ? 'refused' : 'undecided';
    },

    /** The explanation is due: never answered on this device, and the system has not decided. @returns {Promise<boolean>} */
    async explanationDue() {
      if (!native || deps.store.getItem(ASKED_KEY) === '1') return false;
      return (await api.permission()) === 'prompt';
    },

    /** The explanation is on screen: whatever the diver answers, it is not asked again by itself. */
    markAsked() {
      deps.store.setItem(ASKED_KEY, '1');
    },

    /**
     * « Continuer »: the system's own request.
     * @returns {Promise<Permission>}
     */
    async askSystem() {
      if (!native) return 'unsupported';
      try {
        return permissionOf(await deps.requestPermission());
      } catch (e) {
        warn('Asking the notification permission', e);
        return 'prompt';
      }
    },

    /**
     * The system gave (or renewed) this device's token. Kept, then sent when the device id and the session are known.
     * @param {string} token @param {string} [deviceId]
     * @returns {Promise<boolean>} true when the server has it
     */
    async onToken(token, deviceId = '') {
      if (!native || !token) return false;
      deps.store.setItem(NATIVE_TOKEN_KEY, token);
      return api.send(deviceId);
    },

    /**
     * Sends the token the system gave to the server, when it is new for this device or older than a week. Never throws.
     * @param {string} deviceId the id of this device's `keys/devices/<id>.json` record
     * @returns {Promise<boolean>} true when the server has the current token
     */
    send(deviceId) {
      if (sending) return sending;
      const run = (async () => {
        try {
          const token = deps.store.getItem(NATIVE_TOKEN_KEY) ?? '';
          if (!native || !token || !deviceId) return false;
          const last = sent();
          if (last && last.token === token && last.deviceId === deviceId && now() - last.at < REFRESH_MS) return true;
          const session = await deps.sessionToken();
          if (!session) return false;
          await deps.api.registerPushToken(session, { deviceId, platform: /** @type {'android'|'ios'} */ (deps.platform), token });
          deps.store.setItem(TOKEN_KEY, JSON.stringify({ token, deviceId, at: now() }));
          return true;
        } catch (e) {
          warn('Registering the push token', e);
          return false;
        }
      })();
      sending = run;
      void run.then(() => {
        if (sending === run) sending = null;
      });
      return run;
    },

    /**
     * This device holds the key and the system allows notifications: asks the system for the token, and sends the one it has.
     * Does nothing when the permission is not granted. Never throws.
     * @param {string} deviceId
     * @returns {Promise<boolean>} true when the server has this device's token
     */
    async ensure(deviceId) {
      if (!native || !deviceId) return false;
      try {
        if ((await api.permission()) !== 'granted') return false;
        const sentOk = await api.send(deviceId);
        // The system's `register` answers through `onToken`, which sends again only what changed.
        await deps.register();
        return sentOk;
      } catch (e) {
        warn('Registering for push notifications', e);
        return false;
      }
    },

    /** Whether the server holds a token of this device (what the last send said). */
    registered: () => sent() !== null,

    /**
     * Removes this device's token from the server (the device is unpaired) and forgets it here. Never throws.
     * @returns {Promise<boolean>} true when a token was removed
     */
    async remove() {
      const last = sent();
      if (!native || !last) return false;
      try {
        const session = await deps.sessionToken();
        if (session) await deps.api.removePushToken(session, last.deviceId);
      } catch (e) {
        warn('Removing the push token', e);
      }
      api.forget();
      return true;
    },

    /**
     * Sign-out: the server ends the session and drops the tokens registered with it. The token is forgotten here either way.
     * Waits at most `limitMs`, so that a server that does not answer never holds the sign-out. Never throws.
     * @param {number} [limitMs]
     */
    async signOut(limitMs = 4000) {
      if (!native) return;
      try {
        const session = await deps.sessionToken();
        if (session && (sent() || deps.store.getItem(NATIVE_TOKEN_KEY))) {
          await Promise.race([deps.api.signOut(session), new Promise((resolve) => setTimeout(resolve, limitMs))]);
        }
      } catch (e) {
        warn('Ending the server session', e);
      }
      api.forget();
    },

    /** Forgets the token on this device, and on the system side (best effort). */
    forget() {
      deps.store.removeItem(TOKEN_KEY);
      deps.store.removeItem(NATIVE_TOKEN_KEY);
      Promise.resolve()
        .then(() => deps.unregister?.())
        .catch((e) => warn('Forgetting the push token', e));
    },
  };
  return api;
}
