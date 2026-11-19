// @ts-check
// Logbook, phone layout: the name a screen reader gives a dive row as one item (task 2026-11-18-278):
// "Plongée 9, 7 février 2026, 9 h 09, site à préciser, 91 pieds, 55 minutes".
import { depthValue, formatDate, formatTimeOfDay } from './format.js';
import { t } from './i18n.js';

/**
 * Spoken depth: "91 pieds", "27,5 mètres"; empty for a depth the core does not know (zero).
 * @param {number} mm
 * @param {import('opendives-core').Prefs} prefs
 */
export function spokenDepth(mm, prefs) {
  if (!mm) return '';
  const feet = prefs.length === 'ft';
  const value = feet ? Math.round(mm / 304.8) : Math.round(mm / 100) / 10;
  return t(feet ? 'units.feetSpoken' : 'units.metersSpoken', { n: value, v: depthValue(mm, prefs) });
}

/** @param {number} seconds */
export function spokenDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  return t('units.minutesSpoken', { n: minutes, v: String(minutes) });
}

/**
 * @param {{ number: number, date: string, site: string, maxDepthMm: number, durationSeconds: number }} dive
 * @param {import('opendives-core').Prefs} prefs
 */
export function diveRowLabel(dive, prefs) {
  const notSet = t('dive.siteNotSet');
  return [
    dive.number ? t('dive.spokenNumber', { number: String(dive.number) }) : t('dive.spokenDive'),
    formatDate(dive.date),
    formatTimeOfDay(dive.date),
    dive.site || notSet.charAt(0).toLocaleLowerCase() + notSet.slice(1),
    spokenDepth(dive.maxDepthMm, prefs),
    spokenDuration(dive.durationSeconds),
  ]
    .filter(Boolean)
    .join(', ');
}
