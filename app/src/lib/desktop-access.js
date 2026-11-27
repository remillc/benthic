// @ts-check
// Who may use the desktop app (tasks 2026-11-27-414 and 416). The desktop app has no licence key: signing in to a Benthic account that
// holds the right unlocks it (Benthic+, the annual subscription, or Benthic Desktop, the one-time web purchase with no end date;
// the server returns the two apart, lib/server-api.js `benthicPlus` and `benthicDesktop`, and the desktop access computed from them). The app checks the right in the background each time it is online and keeps
// the time of the last check that worked. Offline, the right stands for a grace period of 30 days from that check (the count
// restarts at each success); from day 25 a banner asks to connect. With no valid right the whole logbook opens read only:
// viewed and exported, never changed. A diver is never locked out of their own logbook.
//
// Pure, with the clock given, so that node:test can check every rule. The reactive copy is lib/desktop-access.svelte.js.

/** Days the right stands from the last successful check. */
export const GRACE_DAYS = 30;
/** From this day since the last check the banner asks the diver to connect. */
export const WARNING_FROM_DAY = 25;

const DAY_MS = 24 * 3600 * 1000;

/** The device-store keys (`bc.<name>`, values as text). */
export const KEYS = Object.freeze({
  /** When the right was last checked with the server and answered (ms since the epoch). */
  checkedAt: 'bc.desktopAccessCheckedAt',
  /** The answer of that check: `'1'` the account holds the right, `'0'` it does not. */
  granted: 'bc.desktopAccessGranted',
  /** The day the Benthic+ subscription ended, as the server said (`YYYY-MM-DD`), kept for the read-only banner. */
  endedOn: 'bc.desktopAccessEndedOn',
  /** The latest time the clock has shown: a clock set back does not give back days of grace. */
  seenAt: 'bc.desktopAccessSeenAt',
});

/**
 * @typedef {'ok'|'warning'|'readOnly'} AccessStatus
 * @typedef {'never'|'none'|'ended'|'graceOver'} ReadOnlyReason
 *   `never`: no account signed in (or nothing known yet); `none`: the account holds neither Benthic+ nor Benthic Desktop;
 *   `ended`: the server says the Benthic+ subscription ended (a Benthic Desktop purchase never ends, so it never leads here);
 *   `graceOver`: the right was there at the last check, which is more than 30 days ago.
 * @typedef {{
 *   status: AccessStatus,
 *   reason: ReadOnlyReason|null,
 *   daysSinceCheck: number|null,
 *   daysLeft: number|null,
 *   endedOn: string,
 * }} AccessState
 */

/**
 * The state of the right, from what the device remembers.
 * @param {{ signedIn: boolean, granted: boolean|null, endedOn?: string, checkedAt: number|null, now: number }} input
 *   `granted`: the answer of the last successful check (null: none yet); `now`: ms since the epoch
 * @returns {AccessState}
 */
export function accessState({ signedIn, granted, endedOn = '', checkedAt, now }) {
  if (!signedIn || granted === null) return { status: 'readOnly', reason: 'never', daysSinceCheck: null, daysLeft: null, endedOn: '' };
  if (granted === false) return { status: 'readOnly', reason: endedOn ? 'ended' : 'none', daysSinceCheck: null, daysLeft: null, endedOn };
  // Signed in and granted, but no time was ever kept: nothing proves the check, so the grace is over.
  if (checkedAt === null || !Number.isFinite(checkedAt)) return { status: 'readOnly', reason: 'graceOver', daysSinceCheck: null, daysLeft: 0, endedOn: '' };
  const elapsed = Math.max(0, now - checkedAt);
  const daysSinceCheck = Math.floor(elapsed / DAY_MS);
  // The grace ends 30 days after the check, to the millisecond: at exactly 30 days the right still stands, a day later it does not.
  if (elapsed > GRACE_DAYS * DAY_MS) return { status: 'readOnly', reason: 'graceOver', daysSinceCheck, daysLeft: 0, endedOn: '' };
  const daysLeft = Math.ceil((GRACE_DAYS * DAY_MS - elapsed) / DAY_MS);
  return { status: daysSinceCheck >= WARNING_FROM_DAY ? 'warning' : 'ok', reason: null, daysSinceCheck, daysLeft, endedOn: '' };
}

/** Whether the logbook is read only in this state. @param {AccessState} state */
export const isReadOnly = (state) => state.status === 'readOnly';

/**
 * The clock the grace period is counted on: never earlier than the latest time seen, so that setting the clock back does not
 * give back the days.
 * @param {number} clock `Date.now()`
 * @param {number|null} seenAt
 */
export const trustedNow = (clock, seenAt) => (seenAt !== null && Number.isFinite(seenAt) && seenAt > clock ? seenAt : clock);

/**
 * The right the desktop app keeps from the server's account answer (lib/server-api.js `overviewOf`): the desktop access the
 * server computed (Benthic+ active OR Benthic Desktop purchased), and the day the Benthic+ subscription ended, which the banner of a
 * read-only logbook names. A Benthic Desktop purchase has no end date, so only a refund (or no purchase) leaves the app without it.
 * Null when the answer does not say.
 * @param {import('./server-api.js').AccountOverview} overview
 * @returns {{ granted: boolean, endedOn?: string }|null}
 */
export function rightFromOverview(overview) {
  const access = overview.desktopAccess;
  if (!access) return null;
  return { granted: access.granted, ...(overview.benthicPlus?.endedOn ? { endedOn: overview.benthicPlus.endedOn } : {}) };
}

/**
 * What a check that worked leaves on the device.
 * @param {{ granted: boolean, endedOn?: string }} right the server's `desktopAccess.granted` and the day `benthicPlus` ended
 * @param {number} now
 * @returns {Record<string, string>} the values to store, by key
 */
export function checkResult(right, now) {
  return {
    [KEYS.checkedAt]: String(now),
    [KEYS.granted]: right.granted ? '1' : '0',
    [KEYS.endedOn]: right.granted ? '' : right.endedOn ?? '',
    [KEYS.seenAt]: String(now),
  };
}

/**
 * What the device remembers, read from a store with `getItem`.
 * @param {{ getItem: (key: string) => string|null }} store
 * @returns {{ granted: boolean|null, endedOn: string, checkedAt: number|null, seenAt: number|null }}
 */
export function remembered(store) {
  const granted = store.getItem(KEYS.granted);
  const num = (/** @type {string|null} */ v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    granted: granted === '1' ? true : granted === '0' ? false : null,
    endedOn: store.getItem(KEYS.endedOn) ?? '',
    checkedAt: num(store.getItem(KEYS.checkedAt)),
    seenAt: num(store.getItem(KEYS.seenAt)),
  };
}

/**
 * Where the desktop app is bought on the web (the payment provider is not chosen yet, so the address is configuration:
 * `VITE_DESKTOP_PURCHASE_URL`, else the public site's page).
 * @param {unknown} configured
 * @returns {string}
 */
export function purchaseUrl(configured) {
  const url = typeof configured === 'string' ? configured.trim() : '';
  return /^https:\/\//.test(url) ? url : 'https://benthicdivelog.app/desktop';
}

/**
 * The rules of what a read-only logbook may do, in one list so that the screens and the tests read the same thing.
 * `false` while read only.
 * @param {boolean} readOnly
 */
export function allowed(readOnly) {
  return Object.freeze({
    view: true,
    export: true,
    add: !readOnly,
    edit: !readOnly,
    delete: !readOnly,
    import: !readOnly,
    sync: !readOnly,
  });
}

/**
 * The commands and menu entries of the desktop logbook that add, change, delete or send something. In a read-only logbook
 * none of them is offered, and a shortcut for one does nothing but say so.
 */
export const WRITE_COMMANDS = Object.freeze(
  new Set([
    'new', 'import', 'download', 'manual', 'edit', 'editTogether', 'delete', 'merge', 'paste', 'addToTrip', 'shiftTime', 'sign',
    'renumberFrom', 'renumber', 'undo', 'redo', 'mergePrevious', 'mergeNext',
  ]),
);

/**
 * The menu entries a read-only logbook keeps: the writing ones go, and a divider left first, last or doubled goes with them.
 * @template {{ key: string }} E
 * @param {E[]} entries
 * @returns {E[]}
 */
export function readOnlyEntries(entries) {
  const kept = entries.filter((e) => !WRITE_COMMANDS.has(e.key));
  /** @type {E[]} */
  const out = [];
  for (const e of kept) {
    if (e.key === 'separator' && (!out.length || out[out.length - 1].key === 'separator')) continue;
    out.push(e);
  }
  while (out.length && out[out.length - 1].key === 'separator') out.pop();
  return out;
}
