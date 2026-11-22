// @ts-check
// The reactive Benthic+ account (lib/benthic-plus-state.js): loaded at start from the session of the device and the device
// store, refreshed from the server when it answers, set by the sign-in, purchase and sign-out flows and by the development
// tools. The account sheet, the avatar and every Benthic+ feature read it, never where the logbook lives.
import { BenthicCore } from 'benthic-core';
import { deviceStore } from './device-store.js';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { BENTHIC_PLUS_SUBSCRIBED_KEY, SIGNED_OUT, isSubscribed, resolveBenthicPlusAccount } from './benthic-plus-state.js';

export const benthicPlusAccount = $state({ ...SIGNED_OUT });

/** Whether this device holds a subscribed Benthic+ account. */
export const benthicPlusSubscriber = () => isSubscribed(benthicPlusAccount);

/**
 * Sets the account at once (no restart): a purchase, a sign-in, a sign-out, a development choice.
 * @param {Partial<import('./benthic-plus-state.js').BenthicPlusAccount>} next
 */
export function setBenthicPlusAccount(next) {
  Object.assign(benthicPlusAccount, next);
  if (!benthicPlusAccount.signedIn) Object.assign(benthicPlusAccount, SIGNED_OUT);
  if (typeof next.subscribed === 'boolean' || next.signedIn === false) deviceStore.setItem(BENTHIC_PLUS_SUBSCRIBED_KEY, benthicPlusSubscriber() ? '1' : '0');
}

/** Reads the session and the remembered answer, then asks the server (when it answers) and keeps its answer. */
export async function loadBenthicPlusAccount() {
  /** @type {any} */
  let info = null;
  try {
    info = await BenthicCore.serverSessionInfo();
  } catch {
    // No session plugin here (a browser): signed out.
  }
  const cached = deviceStore.getItem(BENTHIC_PLUS_SUBSCRIBED_KEY);
  Object.assign(benthicPlusAccount, resolveBenthicPlusAccount({ info, cached, remote: null }));
  if (!info?.signedIn) return;
  try {
    const token = (await BenthicCore.serverSessionAccess()).sessionToken;
    const overview = await createServerApi({ baseUrl: serverUrl(), transport: serverTransport }).accountOverview(token);
    const remote = overview.subscription?.subscribed ?? null;
    const email = overview.email?.trim() || info.email;
    Object.assign(benthicPlusAccount, resolveBenthicPlusAccount({ info: { ...info, email }, cached, remote }));
    if (remote !== null) {
      deviceStore.setItem(BENTHIC_PLUS_SUBSCRIBED_KEY, remote ? '1' : '0');
    }
  } catch {
    // Offline or refused: the remembered answer stands.
  }
}

// Development builds only: lets a headless check put the device in any Benthic+ state.
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__benthicPlusAccount = setBenthicPlusAccount;
