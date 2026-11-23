// @ts-check
// The site suggested for a dive without a site by its position (task 2026-11-14-148):
// the nearest site with coordinates, when it is within SITE_SUGGESTION_LIMIT_M of
// the position recorded with the dive. Farther away, no suggestion: « Nouveau site »
// creates one there. The limit is a constant, listed in docs/advanced-settings.md.
import { distanceKm } from './geo.js';

/** Farther than this, a site is not suggested (500 m, 1 640 ft). */
export const SITE_SUGGESTION_LIMIT_M = 500;

/**
 * The nearest site to a position, and how far it is.
 * @template {{ hasLocation?: boolean, latUdeg: number, lonUdeg: number }} S
 * @param {{ latUdeg: number, lonUdeg: number }} position
 * @param {S[]} sites
 * @returns {{ site: S, distanceM: number }|null} null when no site has coordinates
 */
export function nearestSite(position, sites) {
  /** @type {{ site: S, distanceM: number }|null} */
  let best = null;
  for (const site of sites) {
    if (site.hasLocation === false || (!site.latUdeg && !site.lonUdeg)) continue;
    const distanceM = distanceKm(position.lonUdeg / 1e6, position.latUdeg / 1e6, site.lonUdeg / 1e6, site.latUdeg / 1e6) * 1000;
    if (!best || distanceM < best.distanceM) best = { site, distanceM };
  }
  return best;
}

/**
 * The suggestion for a dive: the nearest site within the limit, or null.
 * @template {{ hasLocation?: boolean, latUdeg: number, lonUdeg: number }} S
 * @param {{ latUdeg: number, lonUdeg: number }} position
 * @param {S[]} sites
 * @param {number} [limitM]
 */
export function suggestByDistance(position, sites, limitM = SITE_SUGGESTION_LIMIT_M) {
  const near = nearestSite(position, sites);
  return near && near.distanceM <= limitM ? near : null;
}

/**
 * A distance in whole metres or feet, as the depth unit says (« 210 m », « 689 pi »).
 * @param {number} metres
 * @param {'m'|'ft'} unit
 * @returns {number}
 */
export function distanceInDepthUnit(metres, unit) {
  return Math.round(unit === 'ft' ? metres / 0.3048 : metres);
}
