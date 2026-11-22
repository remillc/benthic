// @ts-check
// The Benthic+ account of this device, one answer for the whole app: signed in, and subscribed. Being a subscriber is a
// property of the account, not of where the logbook lives (a subscriber whose logbook is still on the device is one too).
// Pure so that node:test can check it; the reactive copy is lib/benthic-plus-state.svelte.js.

/** The remembered « subscribed » answer: the fallback when the server cannot be asked; `'0'` or `'1'`. */
export const BENTHIC_PLUS_SUBSCRIBED_KEY = 'od.odplusSubscribed';

/** @typedef {{ signedIn: boolean, email: string, subscribed: boolean }} BenthicPlusAccount */

/** @type {BenthicPlusAccount} */
export const SIGNED_OUT = { signedIn: false, email: '', subscribed: false };

/**
 * What the account is: the session of the device says whether anyone is signed in; the server says whether the account is
 * subscribed (`remote`, null when it could not be asked or did not say); else the remembered answer. A session is only ever
 * kept for a subscribed account (the sign-in sends the others to the offer), so without any answer it counts as subscribed.
 * @param {{ info: { signedIn?: boolean, email?: string }|null, cached: string|null, remote: boolean|null }} input
 * @returns {BenthicPlusAccount}
 */
export function resolveBenthicPlusAccount({ info, cached, remote }) {
  if (!info?.signedIn) return { ...SIGNED_OUT };
  const subscribed = remote !== null ? remote : cached !== '0';
  return { signedIn: true, email: String(info.email ?? ''), subscribed };
}

/** Whether the account is a subscriber: signed in with a subscribed Benthic+ account. @param {BenthicPlusAccount} account */
export function isSubscribed(account) {
  return account.signedIn && account.subscribed;
}
