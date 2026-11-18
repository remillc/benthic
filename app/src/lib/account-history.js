// @ts-check
// The account sheet in the browser history (Android only, this sheet only; task 2026-11-18-281). Opening the sheet adds
// « #compte » to the address with a new history entry, so that the system's Back closes the sheet instead of leaving
// the page. Closing the sheet another way (scrim, swipe down, ✕, a row that opens a page) goes back one entry, so no
// orphan « #compte » stays. Other sheets and dialogs are decided case by case later: nothing here is general.

/** The fragment of the account sheet. */
export const ACCOUNT_HASH = '#compte';

/**
 * @typedef {{ location: { hash: string }, history: { pushState: (state: any, title: string, url?: string) => void, back: () => void }, addEventListener: (type: string, fn: () => void) => void, removeEventListener: (type: string, fn: () => void) => void }} HistoryWindow
 */

/**
 * @param {HistoryWindow} win
 * @param {{ close: () => void }} sheet closes the sheet (the state of the screen); called when Back pops the entry
 * @returns {{ sync: (open: boolean) => void, destroy: () => void }}
 */
export function createAccountHistory(win, sheet) {
  /** True while the entry this module added is in the history. */
  let pushed = false;

  const popped = () => {
    // Back removed the fragment: the entry is gone, the sheet closes without going back again.
    if (pushed && win.location.hash !== ACCOUNT_HASH) {
      pushed = false;
      sheet.close();
    }
  };
  win.addEventListener('popstate', popped);

  return {
    /** Called when the sheet's state changes. @param {boolean} open */
    sync(open) {
      if (open && !pushed && win.location.hash !== ACCOUNT_HASH) {
        win.history.pushState({ odAccount: true }, '', ACCOUNT_HASH);
        pushed = true;
      } else if (!open && pushed) {
        pushed = false;
        // The entry is ours and on top: go back one entry (the popstate that follows finds nothing to do).
        if (win.location.hash === ACCOUNT_HASH) win.history.back();
      }
    },
    destroy() {
      win.removeEventListener('popstate', popped);
    },
  };
}
