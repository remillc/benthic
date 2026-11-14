// @ts-check
// The heat of « Où je plonge le plus » drawn as a density (task 2026-11-14-154): each
// site adds a smooth kernel weighted by its dive count, on a coarse grid of the visible
// map; each value is then mapped to the tertiary ramp, the densest point of the view
// reaching the darkest colour. Overlapping sites no longer stack into dark brown.

/**
 * The density on a grid of cells: each point adds weight × (1 − (d/r)²)², an
 * Epanechnikov-like kernel, within its radius.
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
        values[row * cols + col] += p.weight * k * k;
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

/** @param {string} hex #RRGGBB @returns {[number, number, number]} */
export function rgb(hex) {
  const n = parseInt(hex.trim().replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The colour of a share of the densest value (0 to 1) on the ramp (task 2026-11-14-161): the
 * fade colour (light blue) at the lowest density, then the stops from least to most, the last
 * one at 1; transparent under 2 %.
 * @param {number} t
 * @param {[number, number, number][]} stops least to most
 * @param {[number, number, number]} [fade] the colour the lowest density fades out through
 * @returns {[number, number, number, number]} r, g, b, alpha 0–255
 */
export function rampColour(t, stops, fade = stops[0]) {
  const v = Math.max(0, Math.min(1, t));
  if (v < 0.02) return [0, 0, 0, 0];
  const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ f) => a.map((x, i) => Math.round(x + (b[i] - x) * f));
  // The fade colour at 0, the first stop at FIRST, the others evenly up to the last at 1.
  const FIRST = 0.12;
  /** @type {number[]} */
  let rgbValue;
  if (v <= FIRST) rgbValue = mix(fade, stops[0], v / FIRST);
  else {
    const at = ((v - FIRST) / (1 - FIRST)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(at));
    rgbValue = mix(stops[i], stops[i + 1], at - i);
  }
  const [r, g, b] = rgbValue;
  // Fades in at the edge, opaque enough at the core to be read, never fully covering the map.
  const alpha = Math.round(255 * Math.min(0.85, 0.15 + v * 0.9));
  return [r, g, b, alpha];
}
