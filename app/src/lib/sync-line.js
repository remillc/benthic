// @ts-check
// The sync progress line (task 2026-11-23-340): while the app exchanges with the server at start, a white line is drawn
// on the header's faint dive profile (components/SyncProfileLine.svelte). The logic is here so that node:test can run it.
//
// Phases: idle (nothing drawn), running (the exchange goes on), completing (the line fills to 100 % and stays),
// fading (the line goes out). The line is drawn with `pathLength="100"`, so every length below is a share of the curve.

/** @typedef {'idle'|'running'|'completing'|'fading'} LinePhase */
/** @typedef {{ visible: boolean, mode: 'none'|'sliding'|'still'|'known'|'done', dash: string, opacity: number, groupOpacity: number, value: number|undefined, transition: string }} LineView */

export const SYNC_LINE = {
  /** The sliding segment, as a share of the line. */
  segment: 25,
  /** One pass of the sliding segment, in seconds. */
  passSeconds: 1.6,
  /** The line fills to 100 % in this time (ms), stays `holdMs`, then fades out in `fadeMs`. */
  completeMs: 600,
  holdMs: 300,
  fadeMs: 1100,
  /** A still line while the progress is unknown and motion is reduced. */
  stillOpacity: 0.5,
  /** How a known fraction follows the core's stages (ms). */
  followMs: 300,
};

/** A dash longer than the line: what is drawn is `shown` of 100, the rest a gap. */
const dashOf = (/** @type {number} */ shown) => `${shown} 101`;

/**
 * The phase after the exchange starts or stops. A stopped exchange completes the line; a failed one, or reduced motion,
 * simply removes it.
 * @param {LinePhase} phase
 * @param {boolean} active the exchange is running and the list is on screen
 * @param {{ reduced?: boolean, failed?: boolean }} [how]
 * @returns {LinePhase}
 */
export function nextLinePhase(phase, active, how = {}) {
  if (active) return 'running';
  if (phase === 'running') return how.reduced || how.failed ? 'idle' : 'completing';
  return phase;
}

/**
 * What the line looks like.
 * @param {LinePhase} phase
 * @param {number} fraction the progress, 0 while unknown
 * @param {boolean} reduced the user asks for less motion
 * @returns {LineView}
 */
export function lineView(phase, fraction, reduced) {
  const none = { visible: false, mode: /** @type {const} */ ('none'), dash: dashOf(0), opacity: 0, groupOpacity: 0, value: undefined, transition: 'none' };
  if (phase === 'idle') return none;
  if (phase === 'running') {
    if (!(fraction > 0)) {
      return reduced
        ? { visible: true, mode: 'still', dash: dashOf(100), opacity: SYNC_LINE.stillOpacity, groupOpacity: 1, value: undefined, transition: 'none' }
        : { visible: true, mode: 'sliding', dash: dashOf(SYNC_LINE.segment), opacity: 1, groupOpacity: 1, value: undefined, transition: 'none' };
    }
    const shown = Math.min(100, Math.max(0, fraction * 100));
    return { visible: true, mode: 'known', dash: dashOf(shown), opacity: 1, groupOpacity: 1, value: Math.round(shown), transition: reduced ? 'none' : `stroke-dasharray ${SYNC_LINE.followMs}ms linear` };
  }
  const full = { visible: true, mode: /** @type {const} */ ('done'), dash: dashOf(100), opacity: 1, value: 100 };
  if (phase === 'completing') return { ...full, groupOpacity: 1, transition: `stroke-dasharray ${SYNC_LINE.completeMs}ms ease-out` };
  return { ...full, groupOpacity: 0, transition: 'none' };
}
