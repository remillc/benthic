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

/** @param {string} hex #RRGGBB @returns {[number, number, number]} */
export function rgb(hex) {
  const n = parseInt(hex.trim().replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The colour of a share of the densest value (0 to 1) on the ramp: the edge colour
 * fading in, then the middle, then the centre colour at 1.
 * @param {number} t
 * @param {[[number, number, number], [number, number, number], [number, number, number]]} ramp edge, middle, centre
 * @returns {[number, number, number, number]} r, g, b, alpha 0–255
 */
export function rampColour(t, [edge, middle, centre]) {
  const v = Math.max(0, Math.min(1, t));
  if (v < 0.02) return [0, 0, 0, 0];
  const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ f) => a.map((x, i) => Math.round(x + (b[i] - x) * f));
  const [r, g, b] = v < 0.5 ? mix(edge, middle, v / 0.5) : mix(middle, centre, (v - 0.5) / 0.5);
  // Fades in at the edge, opaque enough at the core to be read, never fully covering the map.
  const alpha = Math.round(255 * Math.min(0.85, 0.15 + v * 0.9));
  return [r, g, b, alpha];
}
