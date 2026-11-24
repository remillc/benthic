// @ts-check
// The calls that need a provider (task 2026-11-17-265): the sign-in with Google, the sign-in with Apple and the
// subscription bought from the store (Google Play Billing, the App Store). Each is ONE function; Google and the store
// answer `{ status: 'unavailable' }` until their native parts exist. The screens call these and nothing else. Nothing
// here reads or stores a secret.

/**
 * @typedef {{ status: 'unavailable' }
 *   | { status: 'cancelled' }
 *   | { status: 'failed' }
 *   | { status: 'signedIn', idToken: string, nonce?: string, authorizationCode?: string, name?: string }} ProviderSignIn
 * @typedef {{ status: 'unavailable' } | { status: 'cancelled' } | { status: 'purchased' }} Purchase
 */

/**
 * « Continuer avec Google ». To wire: Google's official sign-in (Credential Manager on Android), then the ID token to
 * the server's sign-in call.
 * @returns {Promise<ProviderSignIn>}
 */
export async function signInWithGoogle() {
  return { status: 'unavailable' };
}

/**
 * « Continuer avec Apple »: Apple's sheet (the plugin's `appleSignIn`, iPhone and iPad), with the SHA-256 of a fresh nonce
 * in the request. The identity token, the raw nonce and the code then go to the server's sign-in call
 * (`server-api.js`, signInApple), which checks them. Without the plugin method (another platform) nothing is asked.
 * @param {((options: {nonceHash: string}) => Promise<import('benthic-core').AppleSignInResult>)} [appleSignIn]
 * @returns {Promise<ProviderSignIn>}
 */
export async function signInWithApple(appleSignIn) {
  if (!appleSignIn) return { status: 'unavailable' };
  const nonce = randomNonce();
  let answer;
  try {
    answer = await appleSignIn({ nonceHash: await sha256Hex(nonce) });
  } catch {
    return { status: 'failed' };
  }
  if (answer.action === 'cancelled' || answer.action === 'unavailable') return { status: answer.action };
  if (answer.action !== 'done' || !answer.identityToken) return { status: 'failed' };
  const name = [answer.givenName, answer.familyName].filter(Boolean).join(' ').trim();
  return { status: 'signedIn', idToken: answer.identityToken, nonce, authorizationCode: answer.authorizationCode || '', ...(name ? { name } : {}) };
}

/** 32 random bytes as hexadecimal: the nonce of one Apple request. */
function randomNonce() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @param {string} text */
async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * « Restaurer les achats » (the App Store requires it on the offer). To wire: StoreKit's restore of the person's
 * purchases, then the server confirms the subscription. Until then nothing is restored.
 * @returns {Promise<Purchase>}
 */
export async function restorePurchases() {
  return { status: 'unavailable' };
}

/**
 * « S’abonner ». To wire: Google Play Billing or the App Store's purchase of the yearly subscription, then the
 * server confirms it from the store's receipt. Until then nothing is bought and nothing is created.
 * @returns {Promise<Purchase>}
 */
export async function purchaseSubscription() {
  return { status: 'unavailable' };
}
