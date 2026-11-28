// @ts-check
// The right to the desktop app, reactive (task 2026-11-27-414; the rules are in lib/desktop-access.js). Loaded at start; the
// right is checked with the server at start, when the network returns, when the diver signs in and on « Réessayer », and the
// state is worked out again every ten minutes (the grace period runs while the app stays open). Nothing here applies outside
// the release edition's desktop window: phones, tablets, the alpha and the Mac's side windows are never read only.
import { BenthicCore, setCoreReadOnly } from 'benthic-core';
import { deviceStore } from './device-store.js';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { isRelease } from './edition.js';
import { desktopApp, sideWindow } from './layout.svelte.js';
import { connection } from './online.svelte.js';
import { KEYS, accessState, checkResult, purchaseUrl, remembered, rightFromOverview, trustedNow } from './desktop-access.js';

/**
 * Whether this window applies the right. `VITE_DESKTOP_ACCESS=off` builds a desktop app without it (development and the
 * tests that do not concern it).
 */
// @ts-ignore import.meta.env is added by Vite; absent under node:test.
const switchedOff = !!import.meta.env && import.meta.env.VITE_DESKTOP_ACCESS === 'off';
export const accessEnforced = desktopApp && isRelease && !sideWindow && !switchedOff;

/** Where « Acheter la version Desktop » and « Renouveler » go (configuration: the payment provider is not chosen yet). */
// @ts-ignore import.meta.env is added by Vite; absent under node:test.
export const desktopPurchaseUrl = purchaseUrl(import.meta.env ? import.meta.env.VITE_DESKTOP_PURCHASE_URL : '');

export const access = $state({
  /** The session of the device is read: until then nothing is read only (no flash of the sign-in screen). */
  ready: false,
  /** An account is signed in on this device. */
  signedIn: false,
  /** @type {import('./desktop-access.js').AccessStatus} */
  status: 'ok',
  /** @type {import('./desktop-access.js').ReadOnlyReason|null} */
  reason: null,
  daysLeft: 0,
  endedOn: '',
  /** « Réessayer » is running. */
  checking: false,
  /** The diver chose « Ouvrir un carnet en lecture seule » on the sign-in screen of a window with no logbook. */
  browsing: false,
  /** The diver pressed « Se connecter » on the banner of an open read-only logbook: the sign-in screen is over it. */
  signInRequested: false,
  /** Counts the presses of « Exporter le carnet » of the read-only banner: the logbook page opens its export dialog on each. */
  exportRequests: 0,
});

/** Whether the logbook is read only now (always false where the right is not applied). */
export const desktopReadOnly = () => accessEnforced && access.ready && access.status === 'readOnly';

/**
 * The sign-in screen (« Benthic sur ordinateur demande un compte Benthic+ »): in a window with no logbook while there is no valid
 * right and the diver has not asked to look; over an open read-only logbook when the diver asked to sign in.
 * @param {boolean} noLogbook the window has no logbook open
 */
export const accessScreenShown = (noLogbook) =>
  accessEnforced && access.ready && access.status === 'readOnly' && (noLogbook ? !access.browsing : access.signInRequested);

/** « Ouvrir un carnet en lecture seule ». */
export function browseReadOnly() {
  access.browsing = true;
  access.signInRequested = false;
}

/** « Se connecter » of the banner, and of the start screen of a read-only window. */
export function showSignIn() {
  access.browsing = false;
  access.signInRequested = true;
}

/** Works the state out again from what the device remembers, and locks or unlocks the core's writes. */
export function refreshAccessState() {
  if (!accessEnforced) return;
  const mem = remembered(deviceStore);
  const now = trustedNow(Date.now(), mem.seenAt);
  // The clock only moves forward for the grace period: the latest time seen is kept.
  if (mem.seenAt === null || now > mem.seenAt) deviceStore.setItem(KEYS.seenAt, String(now));
  const state = accessState({ signedIn: access.signedIn, granted: mem.granted, endedOn: mem.endedOn, checkedAt: mem.checkedAt, now });
  access.status = state.status;
  access.reason = state.reason;
  access.daysLeft = Math.max(1, state.daysLeft ?? 0);
  access.endedOn = state.endedOn;
  setCoreReadOnly(state.status === 'readOnly');
  // The screens that are not given the state read it from the page (a few CSS rules in DesktopAccessBanner.svelte).
  document.documentElement.classList.toggle('bc-access-read-only', state.status === 'readOnly');
}

/** « Exporter le carnet » of the read-only banner. */
export function requestExport() {
  access.exportRequests += 1;
}

/** Reads the session of the device (whether anyone is signed in). */
async function readSession() {
  try {
    access.signedIn = !!(await BenthicCore.serverSessionInfo())?.signedIn;
  } catch {
    access.signedIn = false;
  }
}

/**
 * Asks the server whether the account holds the right, and keeps the answer and the time. Does nothing offline, signed out,
 * or where the right is not applied. A refusal or a network error keeps what was remembered: the grace period runs on.
 * @returns {Promise<'ok'|'offline'|'failed'|'signedOut'>}
 */
export async function checkDesktopAccess() {
  if (!accessEnforced) return 'ok';
  if (!access.signedIn) return 'signedOut';
  if (!connection.online) return 'offline';
  access.checking = true;
  try {
    const token = (await BenthicCore.serverSessionAccess()).sessionToken;
    const overview = await createServerApi({ baseUrl: serverUrl(), transport: serverTransport }).accountOverview(token);
    // The desktop access is Benthic+ or Benthic Desktop; the banner of a read-only logbook names the subscription that ended.
    const right = rightFromOverview(overview);
    if (!right) return 'failed';
    const now = trustedNow(Date.now(), remembered(deviceStore).seenAt);
    for (const [key, value] of Object.entries(checkResult(right, now))) deviceStore.setItem(key, value);
    return 'ok';
  } catch {
    return 'failed';
  } finally {
    access.checking = false;
    refreshAccessState();
  }
}

/** Reads the session again (after a sign-in or a sign-out), then checks. */
export async function accountChanged() {
  if (!accessEnforced) return;
  await readSession();
  refreshAccessState();
  await checkDesktopAccess();
}

let started = false;

/** Starts the right: once, from App.svelte. */
export async function startDesktopAccess() {
  if (!accessEnforced || started) return;
  started = true;
  await readSession();
  access.ready = true;
  refreshAccessState();
  void checkDesktopAccess();
  // The grace period runs while the app stays open.
  setInterval(refreshAccessState, 10 * 60 * 1000);
}

// Development builds only: lets a headless check put the device in any state of the right.
// @ts-ignore import.meta.env is added by Vite; absent under node:test.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  /** @type {any} */ (window).__desktopAccess = {
    access,
    /** @param {{ signedIn?: boolean, granted?: boolean|null, daysAgo?: number, endedOn?: string }} s */
    set(s) {
      if (s.signedIn !== undefined) access.signedIn = s.signedIn;
      if (s.granted !== undefined) deviceStore.setItem(KEYS.granted, s.granted === null ? '' : s.granted ? '1' : '0');
      if (s.daysAgo !== undefined) {
        deviceStore.setItem(KEYS.checkedAt, String(Date.now() - s.daysAgo * 24 * 3600 * 1000));
        deviceStore.setItem(KEYS.seenAt, String(Date.now()));
      }
      if (s.endedOn !== undefined) deviceStore.setItem(KEYS.endedOn, s.endedOn);
      access.ready = true;
      access.browsing = false;
      access.signInRequested = false;
      refreshAccessState();
    },
  };
}
