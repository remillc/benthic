// @ts-check
// The tab of the desktop detail pane that was last chosen (task 2026-11-15-191): kept when another
// dive is selected and between sessions, in the settings of this computer (device-store.js,
// key `od.detailTab`).

export const TAB_KEY = 'od.detailTab';
export const DETAIL_TABS = /** @type {const} */ (['info', 'equipment', 'gas', 'notes', 'map']);
/** @typedef {typeof DETAIL_TABS[number]} DetailTab */

/** @param {{ getItem: (key: string) => string|null }} store @returns {DetailTab} */
export function readTab(store) {
  const raw = store.getItem(TAB_KEY);
  return /** @type {readonly string[]} */ (DETAIL_TABS).includes(/** @type {string} */ (raw)) ? /** @type {DetailTab} */ (raw) : 'info';
}

/** @param {{ setItem: (key: string, value: string) => void }} store @param {DetailTab} tab */
export function saveTab(store, tab) {
  store.setItem(TAB_KEY, tab);
}

/**
 * The tab an arrow key leads to (← →, wrapping round).
 * @param {DetailTab} tab @param {'ArrowLeft'|'ArrowRight'} key
 * @returns {DetailTab}
 */
export function stepTab(tab, key) {
  const at = DETAIL_TABS.indexOf(tab);
  return DETAIL_TABS[(at + (key === 'ArrowRight' ? 1 : DETAIL_TABS.length - 1)) % DETAIL_TABS.length];
}
