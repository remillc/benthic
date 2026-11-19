// @ts-check
// « Brevets et documents » (task 2026-11-19-309): how a document is listed, when it expires, which notifications it
// plans. Pure: dates are 'YYYY-MM-DD' strings and `today` is given by the caller, so the tests set the clock. The
// documents themselves are in lib/profile.js (sealed on the device).

import { AGENCIES } from './profile.js';
import { addDays, daysBetween } from './maintenance.js';

/** @typedef {import('./profile.js').Certification} Doc */

/** A document counts as « soon » from this many days before its expiry (the badge turns amber). */
export const SOON_DAYS = 60;

/**
 * Where a document stands against its expiry date.
 * @param {string} expiresOn YYYY-MM-DD or ''
 * @param {string} today
 * @returns {{ state: 'none'|'valid'|'soon'|'expired', days: number }} `days`: whole days left (negative once past)
 */
export function expiryState(expiresOn, today) {
  if (!expiresOn) return { state: 'none', days: 0 };
  const days = daysBetween(today, expiresOn);
  return { state: days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'valid', days };
}

/**
 * The words of the badge, as keys of `docs.badge.*` and the number that goes with them: « Expire dans 20 jours »,
 * « Dans 4 mois », « Dans 2 ans », « Expiré depuis 3 jours ».
 * @param {{ state: string, days: number }} status
 * @returns {{ key: string, n: number }|null}
 */
export function badgeKey(status) {
  if (status.state === 'none') return null;
  const d = status.days;
  if (status.state === 'expired') {
    const late = -d;
    return late < 60 ? { key: 'expiredDays', n: late } : late < 730 ? { key: 'expiredMonths', n: Math.round(late / 30.4) } : { key: 'expiredYears', n: Math.round(late / 365) };
  }
  if (d === 0) return { key: 'today', n: 0 };
  if (d === 1) return { key: 'tomorrow', n: 1 };
  if (d <= SOON_DAYS) return { key: 'inDays', n: d };
  if (d < 730) return { key: 'inMonths', n: Math.round(d / 30.4) };
  return { key: 'inYears', n: Math.round(d / 365) };
}

/** Whether a document has gone out of date. @param {Doc} doc @param {string} today */
export const isExpired = (doc, today) => doc.kind !== 'certification' && expiryState(doc.expiresOn, today).state === 'expired';

/**
 * The list of « Brevets et documents »: Brevets, Assurance et santé, Autres documents, and the folded Expirés.
 * An expired document leaves its section for Expirés; a card never expires.
 * @param {Doc[]} docs
 * @param {string} today
 * @returns {{ certs: Doc[], health: Doc[], others: Doc[], expired: Doc[] }}
 */
export function groupDocuments(docs, today) {
  const live = docs.filter((d) => !isExpired(d, today));
  const byExpiry = (/** @type {Doc} */ a, /** @type {Doc} */ b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999');
  return {
    // The oldest card first, as the mock-up lists them.
    certs: live.filter((d) => d.kind === 'certification').sort((a, b) => (a.issuedOn || '9999').localeCompare(b.issuedOn || '9999')),
    health: live.filter((d) => d.kind === 'insurance' || d.kind === 'medical').sort(byExpiry),
    others: live.filter((d) => d.kind === 'other').sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    expired: docs.filter((d) => isExpired(d, today)).sort((a, b) => b.expiresOn.localeCompare(a.expiresOn)),
  };
}

/** The tone of a document's card: the agency's for a card, red for an insurance, red-brown for a medical certificate. @param {Doc} doc @returns {'blue'|'green'|'amber'|'violet'|'neutral'|'red'} */
export function cardTone(doc) {
  if (doc.kind === 'insurance') return 'red';
  if (doc.kind === 'medical') return 'red';
  if (doc.kind === 'other') return 'neutral';
  return AGENCIES.find((a) => a.id === doc.agency)?.tone ?? 'neutral';
}

/** The agency of a card, or its name when « other ». @param {Doc} doc @param {string} otherLabel */
export const agencyLabel = (doc, otherLabel) => (doc.agency === 'other' ? doc.agencyName || otherLabel : doc.agency);

/**
 * What the app draws on a card without a photo: a short heading and up to two lines, from the details entered.
 * @param {Doc} doc
 * @param {{ agencyOther: string, medical: string }} words
 * @returns {{ heading: string, lines: string[] }}
 */
export function drawnCard(doc, words) {
  if (doc.kind === 'insurance') return { heading: doc.insurer.toUpperCase().slice(0, 14), lines: [doc.plan, doc.policyNumber].filter(Boolean) };
  if (doc.kind === 'medical') return { heading: words.medical.toUpperCase(), lines: [doc.doctor].filter(Boolean) };
  if (doc.kind === 'other') return { heading: doc.title.toUpperCase().slice(0, 14), lines: [doc.notes].filter(Boolean).map((s) => s.slice(0, 40)) };
  return { heading: agencyLabel(doc, words.agencyOther), lines: [doc.level] };
}

// ---- Notifications ----

/** The day a snoozed document may remind again, 2 weeks after « Me le rappeler dans 2 semaines ». */
export const SNOOZE_DAYS = 14;

/**
 * @typedef {Object} PlannedDocumentNotification
 * @property {string} id `<docId>:lead`, `<docId>:day`, `<docId>:snooze`
 * @property {string} docId
 * @property {'lead'|'day'|'snooze'} kind
 * @property {string} on the day, YYYY-MM-DD (the moment is 9:00)
 */

/**
 * The notifications to schedule for the documents that expire: one the diver's lead time before the expiry, one on the
 * day, and the one a snooze put 2 weeks ahead. Days already past are left out, and a card never expires.
 * @param {Doc[]} docs
 * @param {string} today
 * @param {{ enabled: boolean, snoozed?: Record<string, string> }} options
 * @returns {PlannedDocumentNotification[]}
 */
export function documentNotificationPlan(docs, today, { enabled, snoozed = {} }) {
  if (!enabled) return [];
  /** @type {PlannedDocumentNotification[]} */
  const out = [];
  for (const doc of docs) {
    if (doc.kind === 'certification' || !doc.expiresOn || doc.expiresOn < today) continue;
    const lead = addDays(doc.expiresOn, -doc.notifyDays);
    if (lead >= today && lead < doc.expiresOn) out.push({ id: `${doc.id}:lead`, docId: doc.id, kind: 'lead', on: lead });
    out.push({ id: `${doc.id}:day`, docId: doc.id, kind: 'day', on: doc.expiresOn });
    const snooze = snoozed[doc.id];
    if (snooze && snooze >= today && snooze < doc.expiresOn) out.push({ id: `${doc.id}:snooze`, docId: doc.id, kind: 'snooze', on: snooze });
  }
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

/** The day to remind again after « Me le rappeler dans 2 semaines ». @param {string} today */
export const snoozeDay = (today) => addDays(today, SNOOZE_DAYS);
