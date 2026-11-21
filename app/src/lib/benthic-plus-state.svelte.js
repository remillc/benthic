// @ts-check
// The reactive OpenDives+ account (lib/benthic-plus-state.js): loaded at start from the session of the device and the device
// store, refreshed from the server when it answers, set by the sign-in, purchase and sign-out flows and by the development
// tools. The account sheet, the avatar and every OpenDives+ feature read it, never where the logbook lives.
import { OpenDivesCore } from 'opendives-core';
import { deviceStore } from './device-store.js';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { ODPLUS_SUBSCRIBED_KEY, SIGNED_OUT, isSubscribed, resolveOdplusAccount } from './benthic-plus-state.js';

export const odplusAccount = $state({ ...SIGNED_OUT });

/** Whether this device holds a subscribed OpenDives+ account. */
export const odplusSubscriber = () => isSubscribed(odplusAccount);

/**
 * Sets the account at once (no restart): a purchase, a sign-in, a sign-out, a development choice.
 * @param {Partial<import('./benthic-plus-state.js').OdplusAccount>} next
 */
export function setOdplusAccount(next) {
  Object.assign(odplusAccount, next);
  if (!odplusAccount.signedIn) Object.assign(odplusAccount, SIGNED_OUT);
  if (typeof next.subscribed === 'boolean' || next.signedIn === false) deviceStore.setItem(ODPLUS_SUBSCRIBED_KEY, odplusSubscriber() ? '1' : '0');
}

/** Reads the session and the remembered answer, then asks the server (when it answers) and keeps its answer. */
export async function loadOdplusAccount() {
  /** @type {any} */
  let info = null;
  try {
    info = await OpenDivesCore.serverSessionInfo();
  } catch {
    // No session plugin here (a browser): signed out.
  }
  const cached = deviceStore.getItem(ODPLUS_SUBSCRIBED_KEY);
  Object.assign(odplusAccount, resolveOdplusAccount({ info, cached, remote: null }));
  if (!info?.signedIn) return;
  try {
    const token = (await OpenDivesCore.serverSessionAccess()).sessionToken;
    const overview = await createServerApi({ baseUrl: serverUrl(), transport: serverTransport }).accountOverview(token);
    const remote = overview.subscription?.subscribed ?? null;
    const email = overview.email?.trim() || info.email;
    Object.assign(odplusAccount, resolveOdplusAccount({ info: { ...info, email }, cached, remote }));
    if (remote !== null) {
      deviceStore.setItem(ODPLUS_SUBSCRIBED_KEY, remote ? '1' : '0');
    }
  } catch {
    // Offline or refused: the remembered answer stands.
  }
}

// Development builds only: lets a headless check put the device in any OpenDives+ state.
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__odplusAccount = setOdplusAccount;
