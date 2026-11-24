// @ts-check
// The position of a site set from « Sites sans coordonnées » (task 2026-11-24-395): « Utiliser cette position »
// and the « Placer <site> » screen both end here, so country and region are found the same way as in the editor.

import { geocodeSite, siteChange } from './sites.svelte.js';

/**
 * Saves a position on a site (one undoable step), then fills country and region from it
 * (a value the diver corrected is kept by the core).
 * @param {number} uuid @param {{ latUdeg: number, lonUdeg: number }} position
 * @param {(uuid: number) => Promise<boolean>} [fill] finds country and region (the desktop's keeps the sites that wait for the network)
 * @returns {Promise<number>} the undoable steps it made (the move, then the country and region found)
 */
export async function setSitePosition(uuid, position, fill = geocodeSite) {
  await siteChange({ action: 'edit', uuid, field: 'location', lat: position.latUdeg, lon: position.lonUdeg });
  return (await fill(uuid)) ? 2 : 1;
}
