// @ts-check
// The accessible name of a map of sites (task 2026-11-14-147): each site in view
// with where it is on the map and its number of dives, « Northern Arch au nord,
// 1 plongée. Lake Coleridge au sud, 1 plongée ». The place is read from the
// visible map: its middle third is « au centre », else one of eight directions.

/** @typedef {'centre'|'north'|'northEast'|'east'|'southEast'|'south'|'southWest'|'west'|'northWest'} MapPlace */

const AROUND = /** @type {MapPlace[]} */ (['east', 'northEast', 'north', 'northWest', 'west', 'southWest', 'south', 'southEast']);

/**
 * Where a point is on the visible map.
 * @param {number} lon
 * @param {number} lat
 * @param {[number, number, number, number]} bounds west, south, east, north (degrees)
 * @returns {MapPlace|null} null when the point is not in view
 */
export function placeOnMap(lon, lat, [west, south, east, north]) {
  // A view across the antimeridian has east < west.
  const width = east >= west ? east - west : east + 360 - west;
  let dx = lon - west;
  if (dx < 0) dx += 360;
  if (dx > width || lat < south || lat > north || width <= 0 || north <= south) return null;
  // -1 to 1 across the map, y up.
  const x = (dx / width) * 2 - 1;
  const y = ((lat - south) / (north - south)) * 2 - 1;
  if (Math.abs(x) <= 1 / 3 && Math.abs(y) <= 1 / 3) return 'centre';
  const angle = Math.atan2(y, x);
  return AROUND[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

/**
 * The map's accessible name.
 * @param {{ name: string, lonDeg: number, latDeg: number, dives: number }[]} sites
 * @param {[number, number, number, number]|null} bounds the visible map, or null before it is shown
 * @param {{ map: string, withSites: (list: string) => string, item: (name: string, place: MapPlace, dives: number) => string, join: string }} words
 *   map: the name alone (no site in view); withSites: the name followed by the list
 */
export function mapLabel(sites, bounds, words) {
  if (!bounds) return words.map;
  const items = [];
  for (const s of sites) {
    const place = placeOnMap(s.lonDeg, s.latDeg, bounds);
    if (place) items.push(words.item(s.name, place, s.dives));
  }
  return items.length ? words.withSites(items.join(words.join)) : words.map;
}
