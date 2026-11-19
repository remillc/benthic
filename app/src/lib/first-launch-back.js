// @ts-check
// The system Back while the first launch is open: the steps component registers its handler (it owns the
// « Retour » logic), lib/back-button.js and the iOS edge swipe call it.

/** @type {(() => boolean)|null} */
let handler = null;

/** @param {(() => boolean)|null} fn returns true when it handled the Back (false: the app goes to the background) */
export function setWelcomeBack(fn) {
  handler = fn;
}

/** @returns {boolean} whether a step handled the Back (including « do nothing ») */
export function welcomeBack() {
  return handler ? handler() : false;
}
