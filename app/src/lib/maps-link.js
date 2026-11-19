// @ts-check
// The link that opens a position in the device's maps app (« Ouvrir dans Cartes », task 2026-11-19-289). Pure, so that
// node:test can check it. Android: the system's geo: link. iPhone: Apple Maps through the maps: scheme
// (`maps://?ll=lat,lon&q=name`, which the system opens in Plans or the map app the person chose by default), with the
// web address of Apple Maps as the fallback when the scheme cannot be opened.

/**
 * @param {number} latUdeg latitude, in millionths of a degree
 * @param {number} lonUdeg longitude, in millionths of a degree
 * @param {string} name the site's name (may be empty)
 * @param {boolean} [ios]
 * @returns {{ primary: string, fallback: string }}
 */
export function mapsLinks(latUdeg, lonUdeg, name, ios = false) {
  const lat = latUdeg / 1e6;
  const lon = lonUdeg / 1e6;
  const q = encodeURIComponent(name || `${lat},${lon}`);
  if (ios) {
    const query = `ll=${lat},${lon}&q=${q}`;
    return { primary: `maps://?${query}`, fallback: `https://maps.apple.com/?${query}` };
  }
  const geo = `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(name)})`;
  return { primary: geo, fallback: geo };
}
