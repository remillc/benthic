// @ts-check
// Which samples of a dive profile to draw. A 3 hour dive at one sample per second is 10,800 points; the
// plot is a few hundred pixels wide, so each pixel column keeps four points: the first, the lowest, the
// highest and the last, in time order. The curve keeps its extremes (the maximum depth is exact) and looks
// the same; the SVG path is a fraction of the size. Nothing changes for a profile that has no more than two
// samples per pixel. The hover and the tooltip keep reading the full arrays.

/**
 * @param {ArrayLike<number>} times seconds, ascending
 * @param {ArrayLike<number>} values the series drawn (depth, temperature...)
 * @param {object} options
 * @param {number} options.width the plot's width in px
 * @param {number} options.tMax the time at the right edge, in seconds
 * @param {(i: number) => boolean} [options.valid] samples the series has no value for are left out of the extremes (a gap breaks the line)
 * @param {(i: number) => boolean} [options.must] samples that stay whatever the zoom (a gas switch, a ceiling violation)
 * @returns {ArrayLike<number>|null} the indices to draw, ascending; null when every sample is drawn
 */
export function decimate(times, values, { width, tMax, valid = () => true, must = () => false }) {
  const n = times.length;
  const columns = Math.max(1, Math.floor(width));
  if (n <= 2 * columns || !(tMax > 0)) return null;
  /** @type {number[]} */
  const out = [];
  let column = -1;
  let first = -1;
  let last = -1;
  let low = -1;
  let high = -1;
  /** @type {number[]} */
  let extra = [];
  const flush = () => {
    const picked = [...extra];
    if (first >= 0) picked.push(first, low, high, last);
    picked.sort((a, b) => a - b);
    for (let k = 0; k < picked.length; k++) if (k === 0 || picked[k] !== picked[k - 1]) out.push(picked[k]);
    first = last = low = high = -1;
    extra = [];
  };
  let before = true;
  for (let i = 0; i < n; i++) {
    const c = Math.min(columns - 1, Math.max(0, Math.floor((times[i] / tMax) * columns)));
    if (c !== column) {
      flush();
      column = c;
    }
    const ok = valid(i);
    // Where a gap starts or ends: both sides stay, so the line breaks in the same place.
    if (ok !== before) {
      extra.push(i);
      if (i > 0) extra.push(i - 1);
    }
    before = ok;
    if (must(i)) extra.push(i);
    if (!ok) continue;
    if (first < 0) first = low = high = i;
    last = i;
    if (values[i] < values[low]) low = i;
    if (values[i] > values[high]) high = i;
  }
  flush();
  // The ends of the series are always drawn.
  if (out[0] !== 0) out.unshift(0);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/**
 * The indices where the cylinder changes: a gas switch is drawn on the profile, so it stays exact.
 * @param {ArrayLike<number>|undefined} cylinder
 * @returns {(i: number) => boolean}
 */
export function changesAt(cylinder) {
  return (i) => !!cylinder && i > 0 && cylinder[i] !== cylinder[i - 1];
}
