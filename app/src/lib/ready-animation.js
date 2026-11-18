// @ts-check
// « Votre carnet est prêt » (task 2026-11-18-270; mock-up docs/mockups-release/android-odplus-pret.dc.html): the logo
// turns into the check mark in 2 s while the header's bubbles rise. The sequence plays once, the first time the
// screen is shown; coming back to it shows the end state (check mark, no bubbles, which have left long ago).

/** The wave (the app logo's line) and the check mark: same commands, so the path can be interpolated (24 × 24 box). */
export const WAVE_PATH = 'M5 13 Q8.5 10 12 13 Q15.5 16 19 13';
export const CHECK_PATH = 'M5 12.5 Q7.25 14.75 9.5 17 Q14.25 12.25 19 7.5';

/** The morph: still until 65 % (1.3 s), then 1.3 to 1.8 s (90 %) with an ease-out spline, then still. */
export const MORPH = {
  values: `${WAVE_PATH};${WAVE_PATH};${CHECK_PATH};${CHECK_PATH}`,
  keyTimes: '0;0.65;0.9;1',
  keySplines: '0 0 1 1;0.2 0.9 0.3 1;0 0 1 1',
  dur: '2s',
};

/**
 * The header's bubbles in the mock-up's 390 × 372 box. `dy`: how far each rises (px, negative, out of the header);
 * `duration`: ms, 1.6 to 2.5 s, the lowest the longest (speed is constant); `phase`: ms of the sway already done.
 * @type {ReadonlyArray<{ cx: number, cy: number, r: number, dy: number, duration: number, phase: number }>}
 */
export const BUBBLES = [
  { cx: 40, cy: 210, r: 5, dy: -250, duration: 1980, phase: 230 },
  { cx: 78, cy: 250, r: 3, dy: -290, duration: 2268, phase: 460 },
  { cx: 330, cy: 190, r: 6, dy: -230, duration: 1785, phase: 690 },
  { cx: 352, cy: 236, r: 3.5, dy: -276, duration: 2097, phase: 220 },
  { cx: 300, cy: 120, r: 4, dy: -160, duration: 1729, phase: 450 },
  { cx: 64, cy: 140, r: 3, dy: -180, duration: 1582, phase: 680 },
  { cx: 250, cy: 260, r: 2.5, dy: -300, duration: 2205, phase: 210 },
  { cx: 120, cy: 300, r: 4, dy: -340, duration: 2492, phase: 440 },
  { cx: 346, cy: 300, r: 3, dy: -340, duration: 2261, phase: 670 },
];

let played = false;

/** @returns {boolean} the system asks for less motion */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * What to show now; call once per display of the screen. The first call starts the sequence (it plays once per launch).
 * Reduced motion: nothing moves, the check mark is shown at once and the bubbles stay in place.
 * @param {boolean} [reduce]
 * @returns {{ play: boolean, bubbles: boolean, still: boolean }} `still`: the bubbles are shown but do not move
 */
export function claimReadyMotion(reduce = prefersReducedMotion()) {
  if (reduce) return { play: false, bubbles: true, still: true };
  const first = !played;
  played = true;
  return { play: first, bubbles: first, still: false };
}

/** For tests: the screen has not been shown yet. */
export function resetReadyMotion() {
  played = false;
}
