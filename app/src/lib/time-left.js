// Time left of a long operation (a download, an import, an upload), estimated from the speed so far.
// Pure: the clock is given by the caller.

/** Fewest items measured before an estimate is given. */
export const MIN_ITEMS = 3;
/** Shortest measured time (ms) before an estimate is given, when fewer items were done. */
export const MIN_MS = 3000;
/** An operation expected to take less than this (ms) in all never shows a time left. */
export const SHORT_MS = 5000;
/** Shortest span (ms) a speed is measured over: counts that arrive closer together are added up first. */
const MIN_STEP_MS = 400;
/** Time constant (ms) of the smoothing of the speed. */
const TAU_MS = 10000;

/**
 * @typedef {Object} TimeLeft
 * @property {'seconds'|'minutes'} unit
 * @property {number} n
 */

/**
 * Rounds a number of seconds the way it is shown: seconds under a minute (steps of 5 above 10), minutes after.
 * @param {number} seconds
 * @returns {TimeLeft}
 */
export function roundTimeLeft(seconds) {
  const s = seconds <= 10 ? Math.max(1, Math.round(seconds)) : Math.round(seconds / 5) * 5;
  if (s < 60) return { unit: 'seconds', n: s };
  return { unit: 'minutes', n: Math.max(1, Math.round(seconds / 60)) };
}

/**
 * One estimator per operation. `update` is called each time the count moves (or at any time) and returns the time
 * left to show, or `null` while nothing should be shown.
 * @returns {{ update: (done: number, total: number, now: number) => TimeLeft|null, reset: () => void }}
 */
export function createTimeLeft() {
  /** @type {{ startMs: number, startDone: number, lastMs: number, lastDone: number, rate: number|null, shown: boolean }|null} */
  let st = null;

  function reset() {
    st = null;
  }

  /** @param {number} done @param {number} total @param {number} now */
  function update(done, total, now) {
    if (!(total > 0) || done >= total) {
      if (done >= total) st = null;
      return null;
    }
    if (!st || done < st.lastDone || now < st.lastMs) {
      st = { startMs: now, startDone: done, lastMs: now, lastDone: done, rate: null, shown: false };
      return null;
    }
    if (done > st.lastDone && now - st.lastMs >= MIN_STEP_MS) {
      const dt = now - st.lastMs;
      const instant = (done - st.lastDone) / dt;
      st.rate = st.rate === null ? instant : st.rate + (1 - Math.exp(-dt / TAU_MS)) * (instant - st.rate);
      st.lastMs = now;
      st.lastDone = done;
    }
    const elapsed = now - st.startMs;
    const sent = done - st.startDone;
    if (st.rate === null || sent < 1 || (sent < MIN_ITEMS && elapsed < MIN_MS)) return null;
    // The time since the last item counts as well: a stalled operation does not look faster than it is.
    const idle = now - st.lastMs;
    const remainingMs = (total - done) / st.rate - idle;
    const expectedMs = elapsed + Math.max(0, remainingMs);
    if (!st.shown && expectedMs < SHORT_MS) return null;
    st.shown = true;
    if (remainingMs < 1000) return null;
    return roundTimeLeft(remainingMs / 1000);
  }

  return { update, reset };
}

/**
 * The text of a time left, short or spoken.
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {TimeLeft|null} left
 * @param {boolean} [spoken] « 20 secondes restantes » instead of « 20 s restantes »
 * @returns {string} empty when there is none
 */
export function timeLeftText(t, left, spoken = false) {
  if (!left) return '';
  const key = left.unit === 'seconds' ? (spoken ? 'timeLeft.secondsSpoken' : 'timeLeft.seconds') : spoken ? 'timeLeft.minutesSpoken' : 'timeLeft.minutes';
  return t(key, { n: left.n });
}
