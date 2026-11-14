// @ts-check
// « Où je plonge le plus » (task 2026-11-14-152): the dives of the Statistics filter
// counted per site and the area that holds most of them; the heat itself is a density
// (lib/heat-density.js, task 2026-11-14-154).
import { distanceKm } from './maps-logic.js';

/** Sites within this distance of the busiest place make up the area shown. */
export const AREA_KM = 150;

/**
 * The dives counted per site, for the sites with coordinates. The dive list names
 * its site only: a name shared by several sites goes to the one of them with
 * coordinates and the most dives.
 * @param {{ site: string }[]} dives
 * @param {{ name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number, dives: number }[]} sites
 * @returns {{ name: string, lon: number, lat: number, count: number }[]} the busiest first
 */
export function siteHeat(dives, sites) {
  /** @type {Map<string, { name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number, dives: number }>} */
  const byName = new Map();
  for (const s of sites) {
    if (!s.hasLocation || !s.name) continue;
    const kept = byName.get(s.name);
    if (!kept || s.dives > kept.dives) byName.set(s.name, s);
  }
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const d of dives) if (d.site && byName.has(d.site)) counts.set(d.site, (counts.get(d.site) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => {
      const s = /** @type {NonNullable<ReturnType<typeof byName.get>>} */ (byName.get(name));
      return { name, lon: s.lonUdeg / 1e6, lat: s.latUdeg / 1e6, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The area that holds most of the dives: around the place with the most dives
 * within AREA_KM, the sites within that distance of it. Not the whole world when
 * one trip went far away.
 * @param {{ lon: number, lat: number, count: number }[]} spots
 * @param {number} [areaKm]
 * @returns {{ lon: number, lat: number, count: number }[]} the spots of that area
 */
export function busiestArea(spots, areaKm = AREA_KM) {
  let best = -1;
  /** @type {typeof spots} */
  let area = [];
  for (const centre of spots) {
    const near = spots.filter((s) => distanceKm(centre.lon, centre.lat, s.lon, s.lat) <= areaKm);
    const total = near.reduce((n, s) => n + s.count, 0);
    if (total > best) {
      best = total;
      area = near;
    }
  }
  return area;
}
