// @ts-check
// The GPS position of a site's dives, for « Utiliser cette position » on « Sites sans coordonnées »
// (task 2026-11-24-395).
//
// The façade gives the dive computer's own position (GPS1/GPS2) only for dives without a site
// (siteQuery 'without': latUdeg, lonUdeg). For a dive that has a site, the dive JSON carries the site's
// coordinates (siteCoordinates), which are missing here by definition, and no position of its own. So no
// position can be found for a site without coordinates until the façade exposes it. Until then this returns
// null and the card offers « Placer sur la carte » only (the mock-up's second case).

/**
 * @param {{ uuid: number }} site
 * @returns {Promise<{ latUdeg: number, lonUdeg: number }|null>}
 */
export async function positionOfSiteDives(site) {
  void site;
  return null;
}
