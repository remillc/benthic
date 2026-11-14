// @ts-check
// The heat of « Où je plonge le plus » drawn as a density (task 2026-11-14-154): each
// site adds a smooth kernel weighted by its dive count, on a coarse grid of the visible
// map; each value is then mapped to the tertiary ramp, the densest point of the view
// reaching the darkest colour. Overlapping sites no longer stack into dark brown.

/**
 * The density on a grid of cells: each point adds weight × (1 − (d/r)²)³, a soft
 * kernel close to a Gaussian, within its radius.
 * @param {{ x: number, y: number, weight: number }[]} points positions in CSS px
 * @param {number} width @param {number} height CSS px of the view
 * @param {number} radius CSS px
 * @param {number} cell CSS px per grid cell
 * @returns {{ values: Float32Array, cols: number, rows: number, max: number }}
 */
export function densityGrid(points, width, height, radius, cell) {
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const values = new Float32Array(cols * rows);
  const r2 = radius * radius;
  for (const p of points) {
    if (p.x < -radius || p.y < -radius || p.x > width + radius || p.y > height + radius) continue;
    const c0 = Math.max(0, Math.floor((p.x - radius) / cell));
    const c1 = Math.min(cols - 1, Math.floor((p.x + radius) / cell));
    const r0 = Math.max(0, Math.floor((p.y - radius) / cell));
    const r1 = Math.min(rows - 1, Math.floor((p.y + radius) / cell));
    for (let row = r0; row <= r1; row++) {
      const dy = (row + 0.5) * cell - p.y;
      for (let col = c0; col <= c1; col++) {
        const dx = (col + 0.5) * cell - p.x;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const k = 1 - d2 / r2;
        // A soft kernel, near a Gaussian: the halo fades out smoothly to its edge.
        values[row * cols + col] += p.weight * k * k * k;
      }
    }
  }
  let max = 0;
  for (const v of values) if (v > max) max = v;
  return { values, cols, rows, max };
}

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
 * A density's place on the ramp (task 2026-11-14-162): t = √(d / D), clamped to 1, where D is
 * the scale (the densest value of the filter at the opening framing). The square root
 * spreads the values: a quarter of the top density sits halfway (yellow-green).
 * @param {number} value d
 * @param {number} reference D
 */
export function heatShare(value, reference) {
  return value > 0 && reference > 0 ? Math.min(1, Math.sqrt(value / reference)) : 0;
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

/** Where the colours sit on t (task 2026-11-14-162): the fade-in, then the six stops of task 161. */
export const FADE_AT = 0.05;
export const STOPS_AT = [0.12, 0.3, 0.48, 0.66, 0.83, 1];

/**
 * The colour at t on the ramp: transparent under 0.05; from 0.05 the fade colour (light blue,
 * alpha 0) into the first stop at 0.12, then the stops at STOPS_AT, interpolated. Alpha 0 at
 * 0.05, 0.6 at 0.30, 0.85 from 0.48 up: the low end stays see-through.
 * @param {number} t
 * @param {[number, number, number][]} stops the six colours, least to most
 * @param {[number, number, number]} [fade] the colour the low end fades in through
 * @returns {[number, number, number, number]} r, g, b, alpha 0–255
 */
export function rampColour(t, stops, fade = stops[0]) {
  const v = Math.max(0, Math.min(1, t));
  if (v < FADE_AT) return [0, 0, 0, 0];
  const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ f) => a.map((x, i) => Math.round(x + (b[i] - x) * f));
  const points = [FADE_AT, ...STOPS_AT];
  const colours = [fade, ...stops];
  let i = 0;
  while (i < points.length - 2 && v > points[i + 1]) i++;
  const f = Math.min(1, (v - points[i]) / (points[i + 1] - points[i]));
  const [r, g, b] = mix(colours[i], colours[i + 1], f);
  const alpha = v <= 0.3 ? (0.6 * (v - FADE_AT)) / (0.3 - FADE_AT) : v >= 0.48 ? 0.85 : 0.6 + (0.25 * (v - 0.3)) / (0.48 - 0.3);
  return [r, g, b, Math.round(255 * alpha)];
}
