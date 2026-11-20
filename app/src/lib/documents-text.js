// @ts-check
// The words of « Brevets et documents » that more than one screen needs: the badge, the lines of a row, the line of
// « Mon profil de plongeur ».
import { t, locale } from './i18n.js';
import { badgeKey, expiryState, agencyLabel } from './documents.js';
import { addDays } from './maintenance.js';

/** @typedef {import('./profile.js').Certification} Doc */

/**
 * « Expire dans 20 jours », « Dans 4 mois », « Expiré depuis 3 jours »; '' when there is no expiry.
 * @param {{ state: string, days: number }} status
 */
export function badgeText(status) {
  const k = badgeKey(status);
  return k ? t(`docs.badge.${k.key}`, { n: k.n }) : '';
}

/** The title of a row and of a sheet. @param {Doc} doc */
export function documentTitle(doc) {
  if (doc.kind === 'insurance') return doc.plan ? t('docs.insurance.titlePlan', { insurer: doc.insurer, plan: doc.plan }) : doc.insurer;
  if (doc.kind === 'medical') return t('docs.medical.title');
  if (doc.kind === 'other') return doc.title;
  return doc.level;
}

/** The small capital line above the title: the agency of a card, else the kind. @param {Doc} doc */
export const kindLabel = (doc) => (doc.kind === 'certification' ? agencyLabel(doc, t('diverProfile.cert.agencyOther')) : t(`docs.kind.${doc.kind}`));

/**
 * The line under the title: a card's number and date, else the expiry, else the notes of another document.
 * @param {Doc} doc
 * @param {(iso: string) => string} formatDate
 * @param {string} today
 */
export function documentLine(doc, formatDate, today) {
  if (doc.kind === 'certification') {
    if (!doc.number.trim()) return doc.issuedOn ? formatDate(doc.issuedOn) : '';
    return doc.issuedOn ? t('diverProfile.certs.line', { number: doc.number, date: formatDate(doc.issuedOn) }) : t('diverProfile.certs.lineNoDate', { number: doc.number });
  }
  if (doc.expiresOn) return t(expiryState(doc.expiresOn, today).state === 'expired' ? 'docs.expiredOn' : 'docs.expiresOn', { date: formatDate(doc.expiresOn) });
  return doc.notes;
}

/**
 * « 3 brevets, assurance, certificat médical » under « Brevets et documents » in the profile.
 * @param {Doc[]} docs
 */
export function documentsLine(docs) {
  const certs = docs.filter((d) => d.kind === 'certification').length;
  const others = docs.filter((d) => d.kind === 'other').length;
  const parts = [
    certs ? t('docs.line.certs', { n: certs }) : '',
    docs.some((d) => d.kind === 'insurance') ? t('docs.line.insurance') : '',
    docs.some((d) => d.kind === 'medical') ? t('docs.line.medical') : '',
    others ? t('docs.line.others', { n: others }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : t('docs.line.none');
}

/**
 * The line of the expiry banner of a sheet: « Le 9 décembre 2026. Rappel reçu le 9 novembre. »
 * @param {Doc} doc
 * @param {(iso: string) => string} formatDate
 * @param {string} today
 */
export function bannerLine(doc, formatDate, today) {
  const lead = addDays(doc.expiresOn, -doc.notifyDays);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(`${lead}T12:00:00`));
  const reminder = t(lead <= today ? 'docs.reminderSent' : 'docs.reminderComing', { date: day });
  return t('docs.bannerLine', { date: formatDate(doc.expiresOn), reminder });
}
