// @ts-check
// The one snackbar of the app (docs/ui-foundations.md, section 8). It is
// Framework7's toast, styled by `.toast.bc-snackbar` in theme.css: every
// message of the app goes through `showSnackbar`, nothing else calls
// `f7.toast`. Framework7 already closes the open toast when another opens, so
// there is one snackbar at a time; the closing callback of the old one runs then.
import { f7 } from 'framework7-svelte';
import { snackbarClasses, snackbarTimeout } from './snackbar-logic.js';
import { horizontalSwipe, settle } from './swipe.js';

/**
 * A swipe to the right sends the snackbar away (Christian's request of 14 November 2026): it
 * follows the finger; past a quarter of its width, or with a quick flick, it leaves to the right
 * and closes (its onClosed runs, its action does not); otherwise it goes back. The `translate`
 * property is used, so that Framework7's own `transform` (its opening and closing) is untouched.
 * @param {any} toast
 */
function swipeToDismiss(toast) {
  const el = /** @type {HTMLElement} */ (toast.el);
  let width = 0;
  horizontalSwipe(el, {
    // Not from the action button: a tap there stays a tap.
    accept: (e) => !(/** @type {HTMLElement} */ (e.target).closest('.toast-button')),
    move(dx) {
      width = el.offsetWidth || 1;
      const x = Math.max(0, dx);
      el.style.transition = 'none';
      el.style.translate = `${x}px 0`;
      el.style.opacity = String(1 - Math.min(1, x / width) * 0.6);
    },
    end(dx, velocity) {
      const x = Math.max(0, dx);
      const away = x > width / 4 || (velocity > 0.25 && x > 16);
      const target = away ? width + 32 : 0;
      const { easing, ms } = settle(x, target, x > 0 ? velocity : 0);
      el.style.transition = `translate ${ms}ms ${easing}, opacity ${ms}ms ease-out`;
      el.style.translate = `${target}px 0`;
      el.style.opacity = away ? '0' : '';
      setTimeout(() => {
        if (away) toast.close();
        else el.style.transition = '';
      }, ms);
    },
  });
}

/**
 * @typedef {object} SnackbarOptions
 * @property {string} [action] the label of the one action ("Annuler")
 * @property {() => void} [onAction] the action was pressed (the snackbar then closes)
 * @property {() => void} [onClosed] the snackbar is gone, whatever the cause
 * @property {number} [timeout] ms; raised to the floor (4 s, 6 s with an action)
 * @property {boolean} [undoable] closed at once when the undo history is cleared
 * @property {'start'|'center'} [placement] on a tablet, at the bottom left (the first launch), or centred, 560 dp wide
 * @property {boolean} [long] up to three lines instead of two
 * @property {boolean} [hasFab] force whether the snackbar floats above a FAB (default: the page has one);
 *   false when the page moves its FAB up itself while the snackbar shows
 */

/**
 * @param {string} text
 * @param {SnackbarOptions} [options]
 */
export function showSnackbar(text, { action, onAction, onClosed, timeout, undoable, placement, long, hasFab: forcedFab } = {}) {
  const hasFab = forcedFab ?? (typeof document !== 'undefined' && !!document.querySelector('.view.tab-active .page-current .fab'));
  /** @type {Record<string, () => void>} */
  const on = {};
  if (action && onAction) on.closeButtonClick = onAction;
  if (onClosed) on.closed = onClosed;
  const toast = f7.toast.create({
    text,
    cssClass: snackbarClasses({ hasFab, undoable, placement, long }),
    closeButton: !!action,
    closeButtonText: action,
    closeTimeout: snackbarTimeout(timeout, !!action),
    position: 'bottom',
    on,
  });
  // Announced by screen readers without taking the focus.
  toast.el.setAttribute('role', 'status');
  swipeToDismiss(toast);
  toast.open();
  return toast;
}
