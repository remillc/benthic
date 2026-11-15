// @ts-check
// The decorative dive profile as a smooth curve (task 2026-11-15-214): a Catmull-Rom spline through
// every point, as cubic Béziers (tension 1/6), so no corner and no point lost. The real profile of a
// dive (detail, planner, statistics) is not drawn with this: it keeps its recorded samples.

/** The profile of a dive (time in s, depth in m) drawn as decoration, as in the mock-ups. */
export const DECORATIVE_DIVE = [
  [0, 0], [170, 24], [390, 46.4], [610, 57.3], [830, 59.6], [1050, 55.5], [1160, 52.9], [1380, 32.4],
  [1553, 20.7], [1632, 20.6], [1676, 21.1], [1750, 22.4], [1970, 20.7], [2190, 22.3], [2410, 24], [2630, 22.6],
  [2850, 18.2], [3070, 16.5], [3290, 16.5], [3510, 14.3], [3730, 16.2], [3950, 13.3], [4170, 10], [4390, 10.9],
  [4610, 10.5], [4830, 9.9], [5050, 7.5], [5270, 6.1], [5490, 7.6], [5710, 6.3], [5930, 4.5], [6150, 5], [6240, 0],
];

const f = (/** @type {number} */ n) => n.toFixed(1);

/**
 * An SVG path through every point: `M P0` then, for each segment Pi → Pi+1, `C C1 C2 Pi+1` with
 * C1 = Pi + (Pi+1 − Pi−1) / 6 and C2 = Pi+1 − (Pi+2 − Pi) / 6; a missing neighbour at an end is the end point.
 * @param {number[][]} points [x, y] in drawing coordinates
 */
export function smoothPath(points) {
  if (!points.length) return '';
  const p = (/** @type {number} */ i) => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(c[0])} ${f(c[1])}`;
  }
  return d;
}

/**
 * The decorative dive in a `width`-wide drawing: depth 0 at `top`, the deepest point `depthHeight` below it.
 * @param {number} width @param {number} top @param {number} depthHeight
 */
export function decorativeProfilePath(width, top, depthHeight) {
  const end = DECORATIVE_DIVE[DECORATIVE_DIVE.length - 1][0];
  return smoothPath(DECORATIVE_DIVE.map(([s, d]) => [(s / end) * width, top + (d / 60.2) * depthHeight]));
}
