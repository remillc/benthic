// @ts-check
// The state the Tools page shows on its Désaturation card (task 2026-11-14-122): the wait
// before flying and the time since the last dive, from the logbook's dives, as the Carnet's
// banner reads them (tools.js flightWaitFor). Pure: the page gives the clock and the setting.

import { flightDives, flightWait } from './tools.js';

/** After this long without a dive, the card says « Au repos ». */
export const REST_AFTER_SECONDS = 48 * 3600;

/**
 * @typedef {object} DesaturationState
 * @property {'waiting'|'allowed'|'rest'|'empty'} kind waiting: the wait before flying runs;
 *   allowed: it is over and the last dive is less than 48 h old; rest: no dive in the last
 *   48 h; empty: no dive in the logbook
 * @property {number} remainingSeconds what is left of the wait (0 unless waiting)
 * @property {number} sinceSeconds time since the last dive surfaced (-1 for rest and empty)
 * @property {number} share the bar's filled part, 0 to 1: time since surfacing ÷ (time since
 *   surfacing + remaining wait); 0 unless waiting
 */

/**
 * @param {{date: string, durationSeconds: number}[]} logbookDives the logbook's dives, any order
 * @param {import('./tools.js').FlightWaitMode} mode the « Attente avant l'avion » setting
 * @param {string} now local time (ISO, no time zone)
 * @returns {DesaturationState}
 */
export function desaturationState(logbookDives, mode, now) {
  if (!logbookDives.length) return { kind: 'empty', remainingSeconds: 0, sinceSeconds: -1, share: 0 };
  const dives = flightDives(logbookDives, now);
  // The latest surfacing of the last day's dives, whatever their order (a long dive may end last).
  const lastEnd = dives.length ? Math.max(...dives.map((d) => Date.parse(`${d.endDate}Z`))) : NaN;
  const since = Math.round((Date.parse(`${now}Z`) - lastEnd) / 1000);
  if (!dives.length || since > REST_AFTER_SECONDS) return { kind: 'rest', remainingSeconds: 0, sinceSeconds: -1, share: 0 };
  const sinceSeconds = Math.max(0, since);
  const wait = flightWait(dives, now, mode);
  const remainingSeconds = wait?.remainingSeconds ?? 0;
  if (remainingSeconds <= 0) return { kind: 'allowed', remainingSeconds: 0, sinceSeconds, share: 0 };
  return { kind: 'waiting', remainingSeconds, sinceSeconds, share: sinceSeconds / (sinceSeconds + remainingSeconds) };
}
