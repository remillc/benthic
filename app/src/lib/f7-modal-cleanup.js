// @ts-check
// Framework7 sheets and popups with a swipe gesture register `touchmove` and `touchend` listeners on the app, and
// remove them on `sheetDestroy` / `popupDestroy`. Destroying a modal only emits `<type>BeforeDestroy`, so the
// listeners stay, with the whole closure (the sheet's element and its contents) behind them: every layout swap
// that remounted a sheet kept one more copy. The app hands the matching event over just before the modal goes.

/**
 * `modalBeforeDestroy` handler (app parameter `on`).
 * @param {any} modal a Framework7 Modal instance
 */
export function releaseModalListeners(modal) {
  const type = String(modal?.type ?? '');
  if (type === 'sheet' || type === 'popup') modal.emit(`local::${type}Destroy`, modal);
}
