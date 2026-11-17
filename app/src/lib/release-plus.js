// @ts-check
// The two entries of the first step that lead to the OpenDives+ screens of task 2026-11-17-265 (« Se connecter »: the
// sign-in flow; « Découvrir OpenDives+ »: the offer). Those screens are built on feature/release-server-screens.
// Until they are connected here, each entry only says that the screen is coming: a clearly named placeholder, so that
// the merge replaces these two functions (or the calls in components/FirstLaunchSteps.svelte) and nothing else.

/**
 * PLACEHOLDER for task 265: « Se connecter » (the connection screen: Google, Apple, e-mail).
 * @param {(text: string) => void} show the snackbar
 * @param {(key: string) => string} t
 */
export function openSignIn(show, t) {
  show(t('welcomeSteps.plusSoon'));
}

/**
 * PLACEHOLDER for task 265: « Découvrir OpenDives+ » (the offer screen).
 * @param {(text: string) => void} show the snackbar
 * @param {(key: string) => string} t
 */
export function openOffer(show, t) {
  show(t('welcomeSteps.plusSoon'));
}
