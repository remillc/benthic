// @ts-check
// Geography helpers shared by the maps and the sites: boxes, longitudes and
// distances. Pure logic: no network, no DOM.

/** @param {number} lng @param {number} lat @param {number[]} bbox [w, s, e, n] */
export function inBbox(lng, lat, bbox) {
  const [w, s, e, n] = bbox;
  if (lat < s || lat > n) return false;
  return w <= e ? lng >= w && lng <= e : lng >= w || lng <= e; // crosses the antimeridian
}

/** Distance between two points, km. @param {number} lng1 @param {number} lat1 @param {number} lng2 @param {number} lat2 */
export function distanceKm(lng1, lat1, lng2, lat2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** @param {number} lng */
export const normalizeLongitude = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

/**
 * Longitudes brought into [-180, 180] (a map dragged past the antimeridian
 * gives 190). A box whose west is then east of its east crosses the antimeridian.
 * @param {number[]} bbox [west, south, east, north]
 * @returns {[number, number, number, number]}
 */
export function normalizeBbox([w, s, e, n]) {
  if (e - w >= 360) return [-180, s, 180, n];
  const east = e === 180 ? 180 : normalizeLongitude(e);
  return [normalizeLongitude(w), s, east, n];
}
