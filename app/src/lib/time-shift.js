// @ts-check
// « Décaler la date et l'heure » of the logbook's selection (task 2026-11-24-383; docs/ui-specification.md, « Logbook
// selection: « Décaler la date et l'heure » »): the pure rules, shared by the phone, the tablet and the desktop. The action
// itself is `shiftDives` of lib/logbook.svelte.js, which calls the core's Command::shiftTime.

/** The wheels: days from 0 to a year, hours 0 to 23, minutes 0 to 59. */
export const MAX_SHIFT_DAYS = 365;

/** @param {number} count @param {number} [pad] digits the text is padded to */
const range = (count, pad = 0) => Array.from({ length: count }, (_, i) => String(i).padStart(pad, '0'));

/** The texts of the three wheels (the index of a text is its value). */
export const WHEEL_TEXTS = {
  days: range(MAX_SHIFT_DAYS + 1),
  hours: range(24),
  minutes: range(60, 2),
};

/**
 * The shift in seconds, negative for « Plus tôt ».
 * @param {{ later: boolean, days: number, hours: number, minutes: number }} shift
 */
export function shiftSeconds({ later, days, hours, minutes }) {
  const seconds = ((days * 24 + hours) * 60 + minutes) * 60;
  return later ? seconds : -seconds;
}

/**
 * « 2026-02-07T10:21:00 » moved by `seconds`. The dives' dates are local wall-clock times, handled on a common scale (UTC),
 * as the core does: no time zone and no daylight-saving rule applies to a shift.
 * @param {string} iso
 * @param {number} seconds
 */
export function shiftIso(iso, seconds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const start = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return new Date(start + seconds * 1000).toISOString().slice(0, 19);
}

/**
 * @typedef {Object} ShiftRow
 * @property {'first'|'last'|'only'} role
 * @property {number} number the dive's number (0: none)
 * @property {string} before its start now
 * @property {string} after its start after the shift
 * @property {boolean} dateChanges the day is not the same after the shift
 */

/**
 * The preview: the first and the last of the selected dives as the logbook lists them (the most recent one first), each
 * with its start now and after the shift. One dive gives one row.
 * @param {{ id: number, date: string, number: number }[]} dives the selected dives
 * @param {number} seconds
 * @returns {ShiftRow[]}
 */
export function shiftPreview(dives, seconds) {
  if (!dives.length) return [];
  const listed = [...dives].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.number - a.number));
  /** @param {'first'|'last'|'only'} role @param {{ date: string, number: number }} d @returns {ShiftRow} */
  const row = (role, d) => {
    const after = shiftIso(d.date, seconds);
    return { role, number: d.number, before: d.date.slice(0, 19), after, dateChanges: after.slice(0, 10) !== d.date.slice(0, 10) };
  };
  return listed.length === 1 ? [row('only', listed[0])] : [row('first', listed[0]), row('last', listed[listed.length - 1])];
}
