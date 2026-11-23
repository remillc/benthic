// @ts-check
// Sites by distance from the phone (task 2026-11-14-151): the order of « Choisir un
// site » and of the quick entry's sites, and the distance as it is written there:
// feet then miles in imperial (« 394 pi », « 1,1 mi », « 61 mi »), metres then
// kilometres in metric. Without a position, the most recently dived site first.
import { distanceKm } from './geo.js';

/** Under this, a distance is in feet (imperial) or metres (metric). */
const FEET_LIMIT = 1000;
const METRES_LIMIT = 1000;

/**
 * A distance as a number and a unit: whole feet or metres when short, then miles or
 * kilometres, with one decimal under 10.
 * @param {number} metres
 * @param {'m'|'ft'} unit the depth unit of the settings
 * @returns {{ value: number, decimals: 0|1, unit: 'm'|'km'|'ft'|'mi' }}
 */
export function distanceParts(metres, unit) {
  if (unit === 'ft') {
    const feet = metres / 0.3048;
    if (feet < FEET_LIMIT) return { value: Math.round(feet), decimals: 0, unit: 'ft' };
    const miles = metres / 1609.344;
    return miles < 10 ? { value: Math.round(miles * 10) / 10, decimals: 1, unit: 'mi' } : { value: Math.round(miles), decimals: 0, unit: 'mi' };
  }
  if (metres < METRES_LIMIT) return { value: Math.round(metres), decimals: 0, unit: 'm' };
  const km = metres / 1000;
  return km < 10 ? { value: Math.round(km * 10) / 10, decimals: 1, unit: 'km' } : { value: Math.round(km), decimals: 0, unit: 'km' };
}

/**
 * How far a site is, metres; null without coordinates.
 * @param {{ latUdeg: number, lonUdeg: number }} from
 * @param {{ hasLocation?: boolean, latUdeg: number, lonUdeg: number }} site
 */
export function metresTo(from, site) {
  if (site.hasLocation === false) return null;
  return distanceKm(from.lonUdeg / 1e6, from.latUdeg / 1e6, site.lonUdeg / 1e6, site.latUdeg / 1e6) * 1000;
}

/**
 * The sites in the order of the site choice: nearest first when the position is
 * known (sites without coordinates last, most recent first), else the most recently
 * dived first (sites never dived last, by name).
 * @template {{ name: string, hasLocation?: boolean, latUdeg: number, lonUdeg: number, lastDate?: string }} S
 * @param {S[]} sites
 * @param {{ latUdeg: number, lonUdeg: number }|null} position
 * @returns {{ site: S, metres: number|null }[]}
 */
export function sitesInChoiceOrder(sites, position) {
  const byRecent = (/** @type {S} */ a, /** @type {S} */ b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name);
  const rows = sites.map((site) => ({ site, metres: position ? metresTo(position, site) : null }));
  return rows.sort((a, b) => {
    if (a.metres !== null && b.metres !== null) return a.metres - b.metres;
    if (a.metres !== null) return -1;
    if (b.metres !== null) return 1;
    return byRecent(a.site, b.site);
  });
}
