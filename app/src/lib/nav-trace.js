// @ts-check
// The navigation trace: the last events that moved the app from one screen to another, kept in memory (a ring of
// 200). It is what an error report carries about navigation (lib/error-reports.svelte.js) and what the development
// menu shows (« Journal de navigation »), so that a screen left in a broken state can be explained after the fact.
// Pure: no DOM, no Framework7. What is traced, and by whom, is listed in docs/architecture.md, section 13.
//
// An event holds a time, a short type and a short text. A route is kept as its path only (no query, no fragment:
// they can hold a search or a name), like the route of an error report.

/** Events kept. */
export const TRACE_EVENTS = 200;

/** @typedef {{ t: number, type: string, detail: string }} NavEvent */

/** @type {NavEvent[]} */
const ring = [];
/** @type {Set<(event: NavEvent) => void>} */
const listeners = new Set();
/** @type {() => number} */
let clock = () => Date.now();

/** A route as the trace keeps it: its path. @param {unknown} url */
export const pathOf = (url) => (typeof url === 'string' ? url.split(/[?#]/)[0].slice(0, 80) : '');

/**
 * Adds an event.
 * @param {string} type a short word: `nav`, `back`, `route`, `lock`, `anim`, `swipe`, `modal`, `sys-back`, `broken`…
 * @param {string|number|null} [detail]
 */
export function trace(type, detail = '') {
  const event = { t: clock(), type, detail: String(detail ?? '').slice(0, 160) };
  ring.push(event);
  if (ring.length > TRACE_EVENTS) ring.splice(0, ring.length - TRACE_EVENTS);
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A listener's fault must not stop a navigation.
    }
  }
}

/**
 * Calls `listener` with each new event (lib/nav-health.js looks at the page once the events stop).
 * @param {(event: NavEvent) => void} listener
 * @returns {() => void} stops calling it
 */
export function onTrace(listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The events, oldest first (a copy). @returns {NavEvent[]} */
export function traceEvents() {
  return ring.map((e) => ({ ...e }));
}

/**
 * Time of day with milliseconds, UTC: `10:27:42:829`. A colon before the milliseconds, not a point: the scrubber of the
 * error reports (lib/error-scrub.js) takes « 42.829 » for a coordinate.
 * @param {number} t
 */
const stamp = (t) => new Date(t).toISOString().slice(11, 23).replace('.', ':');

/** One event per line: `10:27:42:829 back logbook from /dives/3`. @returns {string} */
export function traceText() {
  return ring.map((e) => `${stamp(e.t)} ${e.type}${e.detail ? ` ${e.detail}` : ''}`).join('\n');
}

/**
 * The trace packed for an error report: several events per line, each line at most `perLine` characters and starting
 * with `nav `. The first event of a line carries its time, the next ones the milliseconds since the one before.
 * @param {number} [perLine]
 * @returns {string[]}
 */
export function traceLines(perLine = 300) {
  /** @type {string[]} */
  const lines = [];
  let line = '';
  let last = 0;
  for (const e of ring) {
    const text = `${e.type}${e.detail ? ` ${e.detail}` : ''}`;
    const next = `+${Math.max(0, e.t - last)} ${text}`;
    if (line && line.length + 3 + next.length <= perLine) line += ` | ${next}`;
    else {
      if (line) lines.push(line);
      line = `nav ${stamp(e.t)} ${text}`.slice(0, perLine);
    }
    last = e.t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Empties the trace (tests). */
export function clearTrace() {
  ring.length = 0;
}

/** Replaces the clock (tests). @param {(() => number)|null} fn */
export function setTraceClock(fn) {
  clock = fn ?? (() => Date.now());
}
