// @ts-check
// The shared map's groups, made on the device with Supercluster: the app holds the whole map (GET /v1/sites/base/all) and
// asks for the groups of the view at each whole zoom level, so a group follows the zoom while it happens, instead of
// waiting for the map to stop and the server to answer.
import Supercluster from 'supercluster';

/** Dots closer than this on screen merge into a group, px (512-px tiles, as MapLibre draws them). */
export const CLUSTER_RADIUS_PX = 56;
/** From this zoom on every site is drawn alone (the server's rule before: zoom 13). */
export const LAST_GROUPED_ZOOM = 12;
/** The view is widened by this share on each side, so the dots just outside are there when the map pans. */
const MARGIN = 0.25;

/** A longitude brought back between -180 and 180 (MapLibre's world copies go beyond); ±180 itself is kept. @param {number} x */
const wrap = (x) => (x >= -180 && x <= 180 ? x : ((((x + 180) % 360) + 360) % 360) - 180);

/**
 * @template {{ id: string, lat: number, lon: number }} S
 * @typedef {{ index: Supercluster<{ site: S }, any>, sites: S[] }} SiteIndex
 */

/**
 * @template {{ id: string, lat: number, lon: number }} S
 * @param {S[]} sites
 * @returns {SiteIndex<S>}
 */
export function indexSites(sites) {
  const index = new Supercluster({ radius: CLUSTER_RADIUS_PX, extent: 512, maxZoom: LAST_GROUPED_ZOOM, minPoints: 2 });
  index.load(sites.map((site) => ({ type: 'Feature', properties: { site }, geometry: { type: 'Point', coordinates: [site.lon, site.lat] } })));
  return { index, sites };
}

/**
 * The view widened by MARGIN, as Supercluster wants it ([west, south, east, north], west > east across the antimeridian).
 * @param {[number, number, number, number]} bounds MapLibre's, longitudes possibly beyond ±180
 * @returns {[number, number, number, number]}
 */
export function widenedBox(bounds) {
  const [w, s, e, n] = bounds;
  const dx = (e - w) * MARGIN;
  const dy = (n - s) * MARGIN;
  if (e - w + 2 * dx >= 360) return [-180, Math.max(-90, s - dy), 180, Math.min(90, n + dy)];
  return [wrap(w - dx), Math.max(-90, s - dy), wrap(e + dx), Math.min(90, n + dy)];
}

/**
 * The groups and lone sites of a view.
 * @template {{ id: string, lat: number, lon: number }} S
 * @param {SiteIndex<S>} sitesIndex
 * @param {[number, number, number, number]} bounds
 * @param {number} zoom MapLibre's, with its fraction
 * @returns {{ sites: S[], clusters: { id: number, lat: number, lon: number, count: number }[] }}
 */
export function groupsIn(sitesIndex, bounds, zoom) {
  const level = Math.max(0, Math.floor(zoom));
  /** @type {S[]} */
  const sites = [];
  /** @type {{ id: number, lat: number, lon: number, count: number }[]} */
  const clusters = [];
  for (const f of sitesIndex.index.getClusters(widenedBox(bounds), level)) {
    const [lon, lat] = f.geometry.coordinates;
    const p = /** @type {any} */ (f.properties);
    if (p.cluster) clusters.push({ id: p.cluster_id, lat, lon, count: p.point_count });
    else sites.push(p.site);
  }
  return { sites, clusters };
}

/**
 * The zoom at which a group opens into smaller groups or its sites.
 * @param {SiteIndex<any>} sitesIndex @param {number} clusterId
 */
export const openingZoom = (sitesIndex, clusterId) => Math.min(sitesIndex.index.getClusterExpansionZoom(clusterId), LAST_GROUPED_ZOOM + 1);

/**
 * The sites in a view, for the list and the map's accessible name.
 * @template {{ lat: number, lon: number }} S
 * @param {S[]} sites @param {[number, number, number, number]} bounds
 */
export function sitesInView(sites, bounds) {
  const [w, s, e, n] = bounds;
  if (e - w >= 360) return sites.filter((x) => x.lat >= s && x.lat <= n);
  const west = wrap(w);
  const east = wrap(e);
  const inLon = west <= east ? (/** @type {number} */ x) => x >= west && x <= east : (/** @type {number} */ x) => x >= west || x <= east;
  return sites.filter((x) => x.lat >= s && x.lat <= n && inLon(x.lon));
}
