// @ts-check
// Dialog buttons that do not fit side by side are stacked, one per line, aligned to the end, the
// main action on top (task 2026-11-14-143, Material 3). Decided by measuring the open dialog, not
// by counting its buttons: the same dialog may fit in English and not in French, or not with a
// large font. A label is then allowed to wrap: never cut, never over another button. Applies to
// Framework7's dialogs (f7.dialog) through enableDialogFit(), and to <Md3Dialog> through fitButtons().

/** The class that stacks the buttons (theme.css for Framework7's dialogs, Md3Dialog.svelte for ours). */
export const STACKED = 'od-dialog-stacked';

/**
 * Whether a row of buttons does not fit its width: the row overflows, or a label is cut.
 * @param {HTMLElement} row
 */
export function overflows(row) {
  if (row.scrollWidth > row.clientWidth + 1) return true;
  for (const b of /** @type {HTMLElement[]} */ ([...row.children])) if (b.scrollWidth > b.clientWidth + 1) return true;
  return false;
}

/**
 * Stacks the buttons of `surface` when they do not fit on one line. Measured with the buttons on
 * one line first, so that a dialog shown again in a wider window goes back to one line.
 * @param {HTMLElement} surface the element that receives the class
 * @param {HTMLElement|null} row the row of buttons
 */
export function fitButtons(surface, row) {
  if (!row || row.children.length < 2) return;
  surface.classList.remove(STACKED);
  if (overflows(row)) surface.classList.add(STACKED);
}

/**
 * Every Framework7 dialog of the app: measured as it opens, and again when the window changes size
 * (rotation, font size). Dialogs built with verticalButtons are left as they are.
 * @param {any} f7 the Framework7 app
 */
export function enableDialogFit(f7) {
  /** @param {any} dialog */
  const fit = (dialog) => {
    const el = /** @type {HTMLElement|undefined} */ (dialog?.el);
    if (!el || el.classList.contains('dialog-buttons-vertical')) return;
    fitButtons(el, el.querySelector('.dialog-buttons'));
  };
  f7.on('dialogOpen', fit);
  if (typeof window !== 'undefined')
    window.addEventListener('resize', () => document.querySelectorAll('.dialog.modal-in').forEach((el) => fit({ el })));
}
