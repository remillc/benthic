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
 * @property {14|30|60|null} [notifyDays] this reminder's own lead time before the due date (null or absent: the default of
 *   Réglages › Notifications; a stored 7 from before task 2026-11-19-308 reads as 14)
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

/**
 * `battery` and `travelCheck` are no longer offered (task 2026-11-19-308: a dive computer has no reminder, and a check
 * before a trip is noted by hand as an inspection); files that already hold them stay readable.
 * @typedef {'service'|'inspection'|'hydrostatic'|'battery'|'seals'|'travelCheck'|'custom'} Task
 */

/** @type {Task[]} */
export const TASKS = ['service', 'inspection', 'hydrostatic', 'seals', 'custom'];

/** The lead times of « Me prévenir avant » and of the default: 2 weeks, 30 days, 60 days. @type {(14|30|60)[]} */
export const NOTIFY_CHOICES = [14, 30, 60];

/** The default lead time until the diver chooses another. */
export const DEFAULT_NOTIFY_DAYS = 30;

/** What a reminder stores for the lead time the diver chose: nothing when it is the default (it follows the default). @param {number} chosen @param {number} fallback @returns {14|30|60|null} */
export const ownLeadDays = (chosen, fallback) => (chosen === fallback ? null : leadDays({ notifyDays: chosen }, fallback));

/** The lead time of a reminder: its own, else the default; a stored 7 days reads as 2 weeks. @param {{ notifyDays?: number|null }} item @param {number} [fallback] */
export function leadDays(item, fallback = DEFAULT_NOTIFY_DAYS) {
  const own = item.notifyDays == null ? fallback : item.notifyDays;
  return NOTIFY_CHOICES.includes(/** @type {any} */ (own)) ? /** @type {14|30|60} */ (own) : own < 14 ? 14 : DEFAULT_NOTIFY_DAYS;
}

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
  // A dive computer has no reminder (task 2026-11-19-308).
  computer: [],
  regulator: [{ task: 'service', months: 24, dives: 100 }],
  suit: [{ task: 'seals', months: 12 }],
  cylinder: [
    { task: 'inspection', months: 12 },
    { task: 'hydrostatic', months: 60 },
  ],
  bcd: [{ task: 'service', months: 12 }],
};

/**
 * @param {string} type
 * @param {Record<string, string>} [details] the piece's fields: only a drysuit has seals to change (docs/equipment-fields.md);
 *   without them the suggestion of the type stands
 * @returns {Suggestion[]}
 */
export function suggestionsFor(type, details) {
  if (type === 'suit' && details && details.suitType !== 'dry') return [];
  return SUGGESTIONS[type] ?? [];
}

/**
 * The date stamped on a cylinder (« 03/22 »: March 2022) as the first of that month, or null when the text is not one.
 * @param {string} text @returns {string|null}
 */
export function parseStamp(text) {
  const m = /^\s*(0?[1-9]|1[0-2])\s*\/\s*(\d{2})\s*$/.exec(text);
  return m ? `20${m[2]}-${m[1].padStart(2, '0')}-01` : null;
}

/** The stamp of a date, « 03/22 ». @param {string} iso YYYY-MM-DD */
export const stampOf = (iso) => `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

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
 * @property {string|null} overdueSince the day it fell due while overdue: the due date, or the day of the dive that reached
 *   the count (the earlier of the two); null when not overdue
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
  const sinceDays = days.filter((d) => (serviced ? d > base : d >= base)).sort();
  const divesSince = sinceDays.length;

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

  const reachedOn = item.intervalDives != null && divesReached ? (sinceDays[item.intervalDives - 1] ?? today) : null;
  const overdueSince = !overdue ? null : [timeReached ? dueDate : null, reachedOn].filter((d) => !!d).sort()[0] ?? today;

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
    overdueSince: active ? overdueSince : null,
  };
}

/**
 * Every reminder with its due date, for the pieces that count: a piece that is retired leaves the reminders (it keeps
 * its history), and a dive computer has none (task 2026-11-19-308).
 * @param {{ items: MaintenanceItem[], pieces: { id: string, type: string, retired?: boolean }[], diveKeysOf: (gearId: string) => string[], today: string }} input
 * @returns {Evaluation[]}
 */
export function evaluateAll({ items, pieces, diveKeysOf, today }) {
  const live = new Set(pieces.filter((g) => !g.retired && g.type !== 'computer').map((g) => g.id));
  return items.filter((m) => live.has(m.gearId)).map((m) => evaluate(m, diveKeysOf(m.gearId), today));
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
 * @property {string} id stable: `<item id>:lead`, `<item id>:due` or `<item id>:overdue:<day>`
 * @property {string} itemId
 * @property {'lead'|'due'|'overdue'} kind
 * @property {string} on the day it comes (at 9:00 local time, lib/maintenance-notify.js)
 */

/**
 * @typedef {Object} NotificationOptions Réglages › Notifications
 * @property {boolean} [enabled] « Rappels d'entretien »: off, nothing is planned
 * @property {number} [defaultDays] « Délai par défaut »: 14, 30 or 60
 * @property {boolean} [remindOverdue] « Rappeler si en retard »: once a week until the maintenance is recorded
 * @property {Record<string, string>} [snoozed] item id → the first day a late reminder may come again (« Me le rappeler dans 1 semaine »)
 */

/** Hour of the day the maintenance notifications come, local time. The flight reminder is apart: it comes when the wait ends. */
export const NOTIFICATION_HOUR = 9;

/** The moment a planned day's notification comes: 9:00 local time. @param {string} day YYYY-MM-DD */
export const notificationMoment = (day) => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), NOTIFICATION_HOUR, 0, 0);

/** How far ahead the weekly late reminders are planned; the plan is made again at every start of the app. */
export const OVERDUE_HORIZON_WEEKS = 8;

/**
 * The notifications to schedule: one `leadDays` before each due date (the reminder's own, else the default) and one
 * on the day. The due date is the duration's, or, for a dive criterion, the day the dives are expected to be reached
 * (from the pace of the last year; no notification without a pace). Days already past are left out. A reminder that is
 * overdue gets one notification a week, from the week after it fell due (or from the snooze day), until the service
 * is noted, when « Rappeler si en retard » is on. Evaluations come from `evaluateAll`: retired pieces are not in them.
 * @param {Evaluation[]} evaluations
 * @param {string} today
 * @param {NotificationOptions} [options]
 * @returns {PlannedNotification[]}
 */
export function notificationPlan(evaluations, today, options = {}) {
  const { enabled = true, defaultDays = DEFAULT_NOTIFY_DAYS, remindOverdue = true, snoozed = {} } = options;
  /** @type {PlannedNotification[]} */
  const plan = [];
  if (!enabled) return plan;
  for (const e of evaluations) {
    if (!e.active) continue;
    if (e.status === 'overdue') {
      if (!remindOverdue) continue;
      // Weekly from the day it fell due, never before tomorrow; a snooze moves the first one.
      const from = e.overdueSince ?? today;
      const snooze = snoozed[e.item.id];
      let day = addDays(from, 7);
      while (day <= today) day = addDays(day, 7);
      // A snooze asks for a precise day: the first reminder comes then, the next ones a week apart.
      if (snooze && snooze > today) day = snooze;
      for (let n = 0; n < OVERDUE_HORIZON_WEEKS; n++, day = addDays(day, 7)) plan.push({ id: `${e.item.id}:overdue:${day}`, itemId: e.item.id, kind: 'overdue', on: day });
      continue;
    }
    const candidates = [e.dueDate, e.estimatedDays != null ? addDays(today, e.estimatedDays) : null].filter((d) => !!d);
    if (!candidates.length) continue;
    const due = /** @type {string} */ (candidates.sort()[0]);
    const lead = addDays(due, -leadDays(e.item, defaultDays));
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
