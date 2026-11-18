// @ts-check
// Maintenance of the equipment (task 2026-11-18-274, OpenDives+): the reminder rule of a piece (a duration, a number
// of dives, or both: the first reached wins), when it falls due, and the notifications that go with it.
//
// Everything here is pure: dates are 'YYYY-MM-DD' strings and `today` is given by the caller, so the tests set the
// clock. The records live in the inventory (maintenance/<uuid>.json, lib/inventory.js).

/**
 * One reminder of a piece, with its history.
 * @typedef {Object} MaintenanceItem
 * @property {number} format
 * @property {string} id UUID version 4
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} gearId
 * @property {Task} task
 * @property {string} [label] the name of a `custom` task
 * @property {number|null} intervalMonths since the last service; null: no duration criterion
 * @property {number|null} intervalDives dives with the piece since the last service; null: no dive criterion
 * @property {string} startOn the day the rule was set: the start of the count until a first service is noted
 * @property {string} [lastDoneOn] the latest service in the history
 * @property {7|30|60} notifyDays how long before the due date the first notification comes
 * @property {boolean} warnInDive warn in the edit of a dive that uses the piece while the service is overdue
 * @property {HistoryEntry[]} history
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {'service'|'inspection'|'other'} kind
 * @property {string} doneOn YYYY-MM-DD
 * @property {string} [doneBy] the shop or person
 * @property {number} [cost] in the diver's currency, as typed
 * @property {string} [notes]
 * @property {string} [invoicePhotoId] a file of media/
 */

/** @typedef {'service'|'inspection'|'hydrostatic'|'battery'|'seals'|'travelCheck'|'custom'} Task */

/** @type {Task[]} */
export const TASKS = ['service', 'inspection', 'hydrostatic', 'battery', 'seals', 'travelCheck', 'custom'];

/** The lead times of « Me prévenir avant ». @type {(7|30|60)[]} */
export const NOTIFY_CHOICES = [7, 30, 60];

/** A reminder counts as « Bientôt » from this many days before the due date. */
export const SOON_DAYS = 60;

/** Without a dive rate to estimate from, a dive criterion is « Bientôt » at this many dives left. */
export const SOON_DIVES = 10;

/** @typedef {{ task: Task, months?: number, dives?: number }} Suggestion */

/**
 * The reminders suggested for a type of piece: the first is the one the « Rappel d'entretien » card of a new piece
 * offers; the others are offered in turn on the piece's maintenance page.
 * @type {Record<string, Suggestion[]>}
 */
export const SUGGESTIONS = {
  computer: [{ task: 'battery', months: 24 }],
  regulator: [
    { task: 'service', months: 24 },
    { task: 'travelCheck', months: 12 },
  ],
  suit: [{ task: 'seals', months: 12 }],
  cylinder: [
    { task: 'inspection', months: 12 },
    { task: 'hydrostatic', months: 60 },
  ],
  bcd: [{ task: 'service', months: 24 }],
};

/** @param {string} type @returns {Suggestion[]} */
export const suggestionsFor = (type) => SUGGESTIONS[type] ?? [];

/** @param {string} iso YYYY-MM-DD @returns {number} UTC midnight in ms */
const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Whole days from `a` to `b` (negative when `b` is before `a`). @param {string} a @param {string} b */
export const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);

/** @param {string} iso @param {number} n */
export function addDays(iso, n) {
  return new Date(day(iso) + n * 86400000).toISOString().slice(0, 10);
}

/**
 * A date plus whole months. The day is kept, or the last day of the month when it does not exist (31 January + 1 month
 * = 28 or 29 February).
 * @param {string} iso
 * @param {number} months
 */
export function addMonths(iso, months) {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 + months;
  const d = +iso.slice(8, 10);
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** The local day, YYYY-MM-DD. @param {Date} [now] */
export function todayIso(now = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * What is wrong with a rule's fields, for live validation.
 * @param {{ months: number|null, dives: number|null }} rule
 * @returns {{ criteria?: 'none', months?: 'range', dives?: 'range' }}
 */
export function ruleProblems({ months, dives }) {
  /** @type {{ criteria?: 'none', months?: 'range', dives?: 'range' }} */
  const out = {};
  if (months == null && dives == null) out.criteria = 'none';
  if (months != null && !(Number.isInteger(months) && months >= 1 && months <= 600)) out.months = 'range';
  if (dives != null && !(Number.isInteger(dives) && dives >= 1 && dives <= 10000)) out.dives = 'range';
  return out;
}

/** An item has a rule when one of its criteria is set. @param {Pick<MaintenanceItem, 'intervalMonths'|'intervalDives'>} item */
export const hasRule = (item) => item.intervalMonths != null || item.intervalDives != null;

/**
 * @typedef {Object} Evaluation
 * @property {MaintenanceItem} item
 * @property {boolean} active the item has a rule
 * @property {string} base the day the count starts from: the last service, else the day the rule was set
 * @property {string|null} dueDate the day the duration criterion falls due
 * @property {number|null} daysLeft days until `dueDate` (negative once past)
 * @property {number} divesSince dives with the piece since `base`
 * @property {number|null} divesLeft dives left on the dive criterion (0 or less once reached)
 * @property {number|null} estimatedDays days until the dive criterion is reached, from the dives of the last year
 * @property {boolean} timeReached
 * @property {boolean} divesReached
 * @property {'time'|'dives'|null} first the criterion reached first, or, when none is yet, the one nearer
 * @property {'overdue'|'soon'|'ok'|'none'} status
 * @property {number|null} sortDays days until the earliest trigger, negative when overdue; null when no rule
 */

/**
 * When a reminder falls due. The dives counted are those where the piece is in the equipment (`diveKeys`: the start
 * times that the inventory keeps, lib/inventory.js `diveKeyOf`), after the last service (the service day itself is
 * not counted), or, before any service, from the day the rule was set. The first criterion reached wins: the reminder
 * is overdue as soon as the duration is past or the dives are reached.
 * @param {MaintenanceItem} item
 * @param {string[]} diveKeys the dives where the piece was used
 * @param {string} today
 * @returns {Evaluation}
 */
export function evaluate(item, diveKeys, today) {
  const base = item.lastDoneOn || item.startOn || today;
  const serviced = !!item.lastDoneOn;
  const days = diveKeys.map((k) => k.slice(0, 10));
  const divesSince = days.filter((d) => (serviced ? d > base : d >= base)).length;

  const dueDate = item.intervalMonths != null ? addMonths(base, item.intervalMonths) : null;
  const daysLeft = dueDate ? daysBetween(today, dueDate) : null;
  const divesLeft = item.intervalDives != null ? item.intervalDives - divesSince : null;

  // The pace of the last 365 days, to say when the dives will be reached.
  const yearAgo = addDays(today, -365);
  const lastYear = days.filter((d) => d > yearAgo && d <= today).length;
  const estimatedDays = divesLeft != null && divesLeft > 0 && lastYear > 0 ? Math.ceil((divesLeft * 365) / lastYear) : null;

  const timeReached = daysLeft != null && daysLeft < 0;
  const divesReached = divesLeft != null && divesLeft <= 0;
  const overdue = timeReached || divesReached;

  /** @type {'time'|'dives'|null} */
  let first = null;
  if (timeReached && !divesReached) first = 'time';
  else if (divesReached && !timeReached) first = 'dives';
  else if (timeReached && divesReached) first = 'time';
  else if (daysLeft != null && (estimatedDays == null || daysLeft <= estimatedDays)) first = 'time';
  else if (divesLeft != null) first = 'dives';

  const soon =
    !overdue &&
    ((daysLeft != null && daysLeft <= SOON_DAYS) ||
      (divesLeft != null && (estimatedDays != null ? estimatedDays <= SOON_DAYS : divesLeft <= SOON_DIVES)));

  const triggers = [daysLeft, divesReached ? 0 : estimatedDays].filter((x) => x != null);
  const sortDays = triggers.length ? Math.min(...triggers) : divesLeft != null ? 9999 : null;

  const active = hasRule(item);
  return {
    item,
    active,
    base,
    dueDate,
    daysLeft,
    divesSince,
    divesLeft,
    estimatedDays,
    timeReached,
    divesReached,
    first,
    status: !active ? 'none' : overdue ? 'overdue' : soon ? 'soon' : 'ok',
    sortDays: active ? sortDays : null,
  };
}

/**
 * The reminders in the three sections of the list, each from the most urgent. Reminders without a rule are left out.
 * @param {Evaluation[]} evaluations
 * @returns {{ overdue: Evaluation[], soon: Evaluation[], ok: Evaluation[], counts: { overdue: number, soon: number, ok: number } }}
 */
export function sections(evaluations) {
  const byUrgency = (/** @type {Evaluation} */ a, /** @type {Evaluation} */ b) => (a.sortDays ?? 9999) - (b.sortDays ?? 9999);
  const pick = (/** @type {string} */ s) => evaluations.filter((e) => e.status === s).sort(byUrgency);
  const overdue = pick('overdue');
  const soon = pick('soon');
  const ok = pick('ok');
  return { overdue, soon, ok, counts: { overdue: overdue.length, soon: soon.length, ok: ok.length } };
}

/** The number on the red badge of « Mon profil » and of the « Entretien » card. @param {Evaluation[]} evaluations */
export const overdueCount = (evaluations) => evaluations.filter((e) => e.status === 'overdue').length;

/**
 * The reminders to warn about in the edit of a dive: overdue, with « Avertir dans une plongée » on, and the piece in
 * the dive's equipment.
 * @param {{ suitGearId: string, undersuitGearId: string, gearIds: string[] }} equipment
 * @param {Evaluation[]} evaluations
 * @returns {Evaluation[]}
 */
export function diveWarnings(equipment, evaluations) {
  const used = new Set([equipment.suitGearId, equipment.undersuitGearId, ...equipment.gearIds].filter(Boolean));
  return evaluations.filter((e) => e.status === 'overdue' && e.item.warnInDive && used.has(e.item.gearId));
}

/**
 * The next service date once a service is noted: the duration criterion counted from it. Null without a duration.
 * @param {{ intervalMonths: number|null }} rule
 * @param {string} doneOn
 */
export const nextDueAfter = (rule, doneOn) => (rule.intervalMonths != null ? addMonths(doneOn, rule.intervalMonths) : null);

/**
 * @typedef {Object} PlannedNotification
 * @property {string} id stable: `<item id>:lead` or `<item id>:due`
 * @property {string} itemId
 * @property {'lead'|'due'} kind
 * @property {string} on the day it comes (the app shows it in the morning)
 */

/**
 * The notifications to schedule: one `notifyDays` before each due date and one on the day. The due date is the
 * duration's, or, for a dive criterion, the day the dives are expected to be reached (from the pace of the last year;
 * no notification without a pace). Days already past are left out. An overdue reminder has none to come.
 * @param {Evaluation[]} evaluations
 * @param {string} today
 * @returns {PlannedNotification[]}
 */
export function notificationPlan(evaluations, today) {
  /** @type {PlannedNotification[]} */
  const plan = [];
  for (const e of evaluations) {
    if (!e.active || e.status === 'overdue') continue;
    const candidates = [e.dueDate, e.estimatedDays != null ? addDays(today, e.estimatedDays) : null].filter((d) => !!d);
    if (!candidates.length) continue;
    const due = /** @type {string} */ (candidates.sort()[0]);
    const lead = addDays(due, -e.item.notifyDays);
    if (lead >= today && lead < due) plan.push({ id: `${e.item.id}:lead`, itemId: e.item.id, kind: 'lead', on: lead });
    if (due >= today) plan.push({ id: `${e.item.id}:due`, itemId: e.item.id, kind: 'due', on: due });
  }
  return plan.sort((a, b) => (a.on === b.on ? (a.id < b.id ? -1 : 1) : a.on < b.on ? -1 : 1));
}

/**
 * The one place a local-notification plugin will plug into. The plugin is not installed yet (it waits for the
 * project owner's go-ahead on native dependencies), so by default nothing is delivered: `applyNotificationPlan`
 * hands the whole plan to the deliverer, which cancels what it scheduled before and schedules this plan.
 * @typedef {(plan: PlannedNotification[]) => Promise<void>} NotificationDeliverer
 */

/** @type {NotificationDeliverer} */
let deliverer = async () => {};

/** Installs the deliverer a plugin provides (and, in the tests, a spy). @param {NotificationDeliverer} fn */
export function setNotificationDeliverer(fn) {
  deliverer = fn;
}

/** Cancel everything scheduled and schedule `plan`. @param {PlannedNotification[]} plan */
export const applyNotificationPlan = (plan) => deliverer(plan);
