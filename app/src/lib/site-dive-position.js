// @ts-check
// The GPS position of a site's dives, for « Utiliser cette position » on « Sites sans coordonnées »
// (task 2026-11-24-395). For a site without coordinates, the site detail (siteQuery 'site') gives each dive's own
// recorded position (recordedLatUdeg / recordedLonUdeg: GPS1/GPS2 of a dive computer); the latest dive that has one
// wins.

import { BenthicCore } from 'benthic-core';

/**
 * @param {{ diveList?: { date: string, recordedLatUdeg?: number, recordedLonUdeg?: number }[] }} detail
 * @returns {{ latUdeg: number, lonUdeg: number }|null}
 */
export function recordedPosition(detail) {
  let best = null;
  for (const d of detail?.diveList ?? []) {
    if (!Number.isFinite(d.recordedLatUdeg) || !Number.isFinite(d.recordedLonUdeg)) continue;
    if (d.recordedLatUdeg === 0 && d.recordedLonUdeg === 0) continue;
    if (!best || d.date > best.date) best = d;
  }
  return best ? { latUdeg: /** @type {number} */ (best.recordedLatUdeg), lonUdeg: /** @type {number} */ (best.recordedLonUdeg) } : null;
}

/**
 * @param {{ uuid: number }} site
 * @param {(options: { kind: 'site', uuid: number }) => Promise<any>} [query]
 * @returns {Promise<{ latUdeg: number, lonUdeg: number }|null>}
 */
export async function positionOfSiteDives(site, query = (o) => BenthicCore.siteQuery(o)) {
  try {
    return recordedPosition(await query({ kind: 'site', uuid: site.uuid }));
  } catch {
    return null;
  }
}
