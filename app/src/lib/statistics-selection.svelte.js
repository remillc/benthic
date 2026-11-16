// @ts-check
// The statistic chosen in the Statistiques section, one for both layouts of the adaptive page
// (docs/system-design.md, section 7): the desktop layout's list and the narrow layout's saved
// statistics read and write it, so a choice survives a change of window width. The key is a
// desktop statistic (`byYear`, `maxDepth`, ...) or `saved:<id>` for one the diver created.
import { deviceStore } from './device-store.js';

export const SELECTED_KEY = 'od.desktopStatistic';

/** @returns {string} */
function read() {
  try {
    return deviceStore.getItem(SELECTED_KEY) ?? 'byYear';
  } catch {
    return 'byYear';
  }
}

export const statSelection = $state({ key: read() });

/** @param {string} key */
export function chooseStatistic(key) {
  statSelection.key = key;
  try {
    deviceStore.setItem(SELECTED_KEY, key);
  } catch {
    // Not fatal: the choice lasts until the app closes.
  }
}
