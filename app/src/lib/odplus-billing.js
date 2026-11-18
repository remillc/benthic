// @ts-check
// The three calls that need a provider the app has no dependency on yet (task 2026-11-17-265): the sign-in with
// Google, the sign-in with Apple and the subscription bought from the store (Google Play Billing, the App Store).
// Each is ONE function and answers `{ status: 'unavailable' }` until Christian approves the native parts; the screens
// call these and nothing else, so wiring them later changes this file only. Nothing here reads or stores a secret.

/**
 * @typedef {{ status: 'unavailable' }
 *   | { status: 'cancelled' }
 *   | { status: 'signedIn', idToken: string }} ProviderSignIn
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
 * « Continuer avec Apple ». To wire: Sign in with Apple, then the identity token to the server's sign-in call.
 * @returns {Promise<ProviderSignIn>}
 */
export async function signInWithApple() {
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
