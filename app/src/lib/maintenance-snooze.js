// @ts-check
// « Me le rappeler dans 1 semaine » (task 2026-11-19-308): the day a late maintenance may remind again, per reminder,
// kept on this device (device-store.js, key bc.maintenanceSnooze, JSON { itemId: 'YYYY-MM-DD' }).
import { deviceStore } from './device-store.js';
import { addDays, todayIso } from './maintenance.js';

const KEY = 'bc.maintenanceSnooze';

/** @returns {Record<string, string>} */
export function readSnoozed() {
  try {
    const value = JSON.parse(deviceStore.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** Snoozes a reminder for a week, from `today`. @param {string} itemId @param {string} [today] */
export function snoozeOneWeek(itemId, today = todayIso()) {
  const next = { ...readSnoozed(), [itemId]: addDays(today, 7) };
  // Past snoozes are of no use: they are dropped as the new one is written.
  for (const [id, day] of Object.entries(next)) if (day <= today) delete next[id];
  deviceStore.setItem(KEY, JSON.stringify(next));
}

/** The maintenance is recorded: the snooze goes. @param {string} itemId */
export function clearSnooze(itemId) {
  const all = readSnoozed();
  if (!(itemId in all)) return;
  delete all[itemId];
  deviceStore.setItem(KEY, JSON.stringify(all));
}
