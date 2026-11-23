// @ts-check
// The faint dive profile drawn at the bottom of a header band (task 2026-11-23-340): one curve, in a 300 x 140 box,
// shared by every band (BandBackdrop, SectionBand, NavMenu, the first-launch screens) and by the sync progress line,
// which runs exactly on it (components/SyncProfileLine.svelte).

/** The curve: absolute cubic segments, the small corners of the old polyline rounded, the overall shape unchanged. */
export const BAND_PROFILE =
  'M0 30 C4 31.6 11 30 20 38 C29 46 35 59.2 45 70 C55 80.8 60 86.8 70 92 C80 97.2 85 96.8 95 96 C105 95.2 111 88.4 120 88 C129 87.6 131 95.6 140 94 C149 92.4 156 86.4 165 80 C174 73.6 176 66.4 185 62 C194 57.6 200 60.4 210 58 C220 55.6 226 52.4 235 50 C244 47.6 247 48 255 46 C263 44 266 42 275 40 C284 38 295 36.8 300 36';

/** The box the curve is drawn in. */
export const BAND_PROFILE_BOX = { width: 300, height: 140 };

/**
 * The curve in real pixels (the numbers of a path are x, y pairs), so a stroke and its dashes keep their true size
 * instead of being stretched by a non-uniform `preserveAspectRatio="none"` scale.
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function bandProfileInPixels(width, height) {
  const sx = width / BAND_PROFILE_BOX.width;
  const sy = height / BAND_PROFILE_BOX.height;
  let index = 0;
  return BAND_PROFILE.replace(/-?\d+\.?\d*/g, (n) => (Number(n) * (index++ % 2 === 0 ? sx : sy)).toFixed(2));
}
