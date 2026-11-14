// @ts-check
// The heat of « Où je plonge le plus »: the halos' scale with the zoom (task 155), the colour
// scale fixed per filter (tasks 155, 162), and one spot per site as the mock-up draws them.

/** Halos follow the screen, not the ground (task 2026-11-14-155): radius at low zoom, and at zoom 13 and closer. */
export const HALO_FAR_DP = 20;
export const HALO_NEAR_DP = 40;
const FAR_ZOOM = 5;
const NEAR_ZOOM = 13;

/**
 * The kernel radius in dp at a zoom: 20 dp up to zoom 5, 40 dp from zoom 13, in between
 * interpolated. Zooming in, nearby sites separate; zooming out, they merge.
 * @param {number} zoom
 */
export function haloRadius(zoom) {
  const f = Math.max(0, Math.min(1, (zoom - FAR_ZOOM) / (NEAR_ZOOM - FAR_ZOOM)));
  return HALO_FAR_DP + (HALO_NEAR_DP - HALO_FAR_DP) * f;
}


/**
 * The colour scale of a heat map (tasks 155 and 162): measured once, at the opening framing,
 * on the whole filter; unchanged while panning and zooming; measured again only after the
 * filter or the dives change (reset).
 */
export function createHeatScale() {
  let value = 0;
  return {
    /** The scale, measuring it from this view's densest value if not yet set. @param {number} densest */
    measure(densest) {
      if (!value) value = densest || 1;
      return value;
    },
    /** Another filter, or the dives changed: the next view measures again. */
    reset() {
      value = 0;
    },
  };
}

/** @param {string} hex #RRGGBB @returns {[number, number, number]} */
export function rgb(hex) {
  const n = parseInt(hex.trim().replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}


// --- The heat as the mock-up draws it (15 November 2026, after Christian compared the app
// with android-stats.dc.html at the same zoom; the mock-up's card uses his real sites, so its
// numbers can be read back): one radial spot per site, not a summed density; spots cover one
// another (the busiest painted last) rather than adding up. Three gradients, by the site's
// dives n against the busiest site's D: one dive blue; up to about 5 % of D a yellow centre;
// from there a red centre. The radius grows with √((n − 1)/(D − 1)): 8 px for one dive, 27.5 px
// for the busiest site at the card's zoom (Lock 21, 144 dives; Lock 23, 103 dives: 24.5 px).

/** A gradient stop of a spot: offset from the centre (0) to the edge (1), a colour variable, an opacity. */
/** @typedef {{ offset: number, colour: string, alpha: number }} SpotStop */

/** The three gradients of the mock-up (#od-heat-1, 2 and 3 in android-stats.dc.html). */
export const SPOT_GRADIENTS = /** @type {const} */ ({
  one: [
    { offset: 0, colour: '--od-heat-1', alpha: 0.8 },
    { offset: 0.5, colour: '--od-heat-spot-mid', alpha: 0.5 },
    { offset: 1, colour: '--od-heat-fade', alpha: 0 },
  ],
  few: [
    { offset: 0, colour: '--od-heat-4', alpha: 0.85 },
    { offset: 0.35, colour: '--od-heat-3', alpha: 0.75 },
    { offset: 0.7, colour: '--od-heat-spot-edge', alpha: 0.5 },
    { offset: 1, colour: '--od-heat-fade', alpha: 0 },
  ],
  many: [
    { offset: 0, colour: '--od-heat-6', alpha: 0.9 },
    { offset: 0.25, colour: '--od-heat-5', alpha: 0.85 },
    { offset: 0.5, colour: '--od-heat-4', alpha: 0.75 },
    { offset: 0.72, colour: '--od-heat-3', alpha: 0.55 },
    { offset: 0.88, colour: '--od-heat-spot-edge', alpha: 0.35 },
    { offset: 1, colour: '--od-heat-fade', alpha: 0 },
  ],
});
/** Every spot is drawn at this opacity over its own gradient, as the mock-up does. */
export const SPOT_OPACITY = 0.9;
/** From this share of the busiest site's dives, a red centre (8 of 144 in the mock-up). */
export const MANY_SHARE = 0.05;

/**
 * Which gradient a site takes.
 * @param {number} dives n @param {number} busiest D
 * @returns {'one'|'few'|'many'}
 */
export function spotKind(dives, busiest) {
  if (dives <= 1) return 'one';
  return dives >= MANY_SHARE * busiest ? 'many' : 'few';
}

/**
 * A spot's radius, CSS px: 8 + 19.5 × √((n − 1)/(D − 1)) at the card's zoom, scaled with the
 * zoom as the halos of task 155 (× 1 far away, × 2 from zoom 13).
 * @param {number} dives n @param {number} busiest D @param {number} zoom
 */
export function spotRadius(dives, busiest, zoom) {
  const share = busiest > 1 ? Math.max(0, dives - 1) / (busiest - 1) : 0;
  return (8 + 19.5 * Math.sqrt(share)) * (haloRadius(zoom) / HALO_FAR_DP);
}
