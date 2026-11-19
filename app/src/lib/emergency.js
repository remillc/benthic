// @ts-check
// « Fiche d’urgence » (OpenDives+, task 2026-11-19-311, docs/mockups/urgence-*.dc.html): what the sheet shows, built from the
// profile (lib/profile.js) and the documents of « Brevets et documents ». Pure: the date, the texts and the date format are
// given by the caller, so the tests set them. The sheet is made on the device from data that is already there, so it opens
// without a network.

import { agencyLabel, expiryState } from './documents.js';
import { formatInternational } from './phone-format.js';

/** @typedef {import('./profile.js').DiverInfo} DiverInfo */
/** @typedef {import('./profile.js').Certification} Doc */

/** The items the diver can turn on or off in « Contenu de la fiche »; the name is always shown. */
export const ITEMS = /** @type {const} */ (['birth', 'blood', 'contact', 'insurance', 'medical', 'certificate']);

/** @typedef {Record<(typeof ITEMS)[number], boolean>} Include */

/** What is on until the diver turns it off; the highest certificate is off (mock-up urgence-contenu-android). @type {Include} */
export const DEFAULT_INCLUDE = { birth: true, blood: true, contact: true, insurance: true, medical: true, certificate: false };

/** The device-store key of the switches (lib/device-store.js). */
export const INCLUDE_KEY = 'od.emergencyInclude';

/**
 * The switches kept on this device, completed with the defaults.
 * @param {{ getItem(key: string): string|null }} store
 * @returns {Include}
 */
export function readInclude(store) {
  try {
    const kept = JSON.parse(store.getItem(INCLUDE_KEY) ?? '{}');
    return { ...DEFAULT_INCLUDE, ...Object.fromEntries(ITEMS.filter((k) => typeof kept?.[k] === 'boolean').map((k) => [k, kept[k]])) };
  } catch {
    return { ...DEFAULT_INCLUDE };
  }
}

/** @param {{ setItem(key: string, value: string): void }} store @param {Include} include */
export const writeInclude = (store, include) => store.setItem(INCLUDE_KEY, JSON.stringify(include));

/**
 * The age in whole years on a day; null when the birth date is not a date or lies after the day.
 * @param {string} dateOfBirth YYYY-MM-DD
 * @param {string} today YYYY-MM-DD
 */
export function ageOn(dateOfBirth, today) {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!b || !n) return null;
  const years = Number(n[1]) - Number(b[1]) - (n[2] + n[3] < b[2] + b[3] ? 1 : 0);
  return years >= 0 ? years : null;
}

/** The documents of a kind that are still valid, the one expiring last first. @param {Doc[]} docs @param {Doc['kind']} kind @param {string} today */
function validOf(docs, kind, today) {
  return docs
    .filter((d) => d.kind === kind && expiryState(d.expiresOn, today).state !== 'expired')
    .sort((a, b) => (b.expiresOn || '9999').localeCompare(a.expiresOn || '9999'));
}

/**
 * Rank of a certification on one scale across agencies (the highest certificate is the one of the highest rank).
 *   5    instructor: the « Brevet de moniteur » switch, or a level naming an instructor (Instructor, Moniteur, MF1, MF2, CMAS Instructor)
 *   4    Divemaster / Dive Master / Dive Leader / First Class Diver / CMAS 3 star / FFESSM Niveau 4
 *   3.5  Master Scuba Diver / Master Diver (a Rescue Diver plus specialties)
 *   3    Rescue Diver / Stress & Rescue / Niveau 3 / BSAC Advanced Diver
 *   2    Advanced (Open Water) Diver / Sport Diver / CMAS 2 star / Niveau 2 / Initiateur / Recreational Diver 2
 *   1.5  SSI Advanced Adventurer
 *   1    Open Water / Scuba Diver / Ocean Diver / CMAS 1 star / Niveau 1 / Recreational Diver 1
 *   0.5  specialty, technical and rebreather cards (Nitrox, Deep, Solo, Tec, Trimix, Decompression, Extended Range, Fundamentals, Tech 1/2...):
 *        below every recreational level, above a level that is not recognised
 *   0    free text that is not recognised, or no level
 * @param {Pick<Doc, 'agency'|'level'|'instructorCert'>} c
 */
export function certificateRank(c) {
  if (c.instructorCert) return 5;
  const t = (c.level || '').toLocaleLowerCase();
  if (!t.trim()) return 0;
  if (/instructor|instructeur|moniteur|\bmf[12]\b/.test(t)) return 5;
  const star = /\b([1-3])\s*(star|stars|etoile|étoile|étoiles|\*|★)/.exec(t);
  if (star) return [0, 1, 2, 4][Number(star[1])];
  const niveau = /\b(?:niveau|level)\s*([1-4])\b|\bn([1-4])\b/.exec(t);
  if (niveau) return Number(niveau[1] ?? niveau[2]);
  if (/divemaster|dive master|dive leader|first class/.test(t)) return 4;
  if (/master/.test(t)) return 3.5;
  if (/rescue|sauveteur/.test(t)) return 3;
  if (/nitrox|enriched|trimix|\btec\b|\btec ?\d|\btech\b|deep|solo|decompression|extended|normoxic|fundamentals|rebreather|ccr|cave|wreck/.test(t)) {
    const rec = /recreational diver ([12])/.exec(t);
    return rec ? Number(rec[1]) : 0.5;
  }
  if (/advanced adventurer/.test(t)) return 1.5;
  if (/advanced/.test(t)) return c.agency === 'BSAC' ? 3 : 2;
  if (/sport diver|initiateur/.test(t)) return 2;
  if (/open water|ocean diver|scuba diver|recreational diver 1/.test(t)) return 1;
  return 0;
}

/** The highest certificate by level (certificateRank); on equal ranks the most recent issue date. @param {Doc[]} docs */
export function highestCertificate(docs) {
  return (
    docs
      .filter((d) => d.kind === 'certification')
      .sort((a, b) => certificateRank(b) - certificateRank(a) || (b.issuedOn || '').localeCompare(a.issuedOn || ''))[0] ?? null
  );
}

/** A number as a `tel:` address for the system's dialer. @param {string} number */
export const telHref = (number) => `tel:${number.replace(/[^+\d]/g, '')}`;

/**
 * @typedef {Object} Sheet
 * @property {string} name the diver's name, '' when none (the sheet then asks to fill it in)
 * @property {{ date: string, age: number|null }|null} birth
 * @property {string|null} blood a blood group, or 'unknown'
 * @property {{ name: string, relation: string, phone: string }|null} contact
 * @property {Doc|null} insurance
 * @property {Doc|null} medical
 * @property {Doc|null} certificate
 */

/**
 * What the sheet shows: the name, then each item that is on and has something to show.
 * @param {{ info: DiverInfo, docs: Doc[], include: Include, consent: boolean, today: string }} input
 * @returns {Sheet}
 */
export function buildSheet({ info, docs, include, consent, today }) {
  const phone = formatInternational(info.emergency.phone);
  const hasContact = !!(info.emergency.name || phone);
  return {
    name: info.fullName,
    birth: include.birth && info.dateOfBirth ? { date: info.dateOfBirth, age: ageOn(info.dateOfBirth, today) } : null,
    blood: include.blood && consent && info.bloodGroup ? info.bloodGroup : null,
    contact: include.contact && hasContact ? { name: info.emergency.name, relation: info.emergency.relation, phone } : null,
    insurance: include.insurance ? (validOf(docs, 'insurance', today)[0] ?? null) : null,
    medical: include.medical ? (validOf(docs, 'medical', today)[0] ?? null) : null,
    certificate: include.certificate ? highestCertificate(docs) : null,
  };
}

/**
 * The words of the sheet, shared by the screen, the image and the PDF.
 * @typedef {Object} Words
 * @property {(key: string, params?: Record<string, string|number>) => string} t
 * @property {(iso: string) => string} date a YYYY-MM-DD date in the format of Settings
 * @property {string} otherAgency
 * @property {string} unknownBlood
 */

/**
 * @typedef {Object} Block
 * @property {'contact'|'insurance'|'medical'|'certificate'} kind
 * @property {string} title
 * @property {string} name
 * @property {string} line
 * @property {{ label: string, tel: string }|null} call the button that calls the contact
 * @property {{ label: string, number: string, tel: string }|null} hotline
 * @property {string} docId the document the block opens, '' for the contact
 */

/**
 * The sheet as lines of text, section by section.
 * @param {Sheet} sheet
 * @param {Words} w
 * @returns {{ name: string, birthLine: string, blood: string, blocks: Block[] }}
 */
export function sheetText(sheet, w) {
  const { t } = w;
  /** @type {Block[]} */
  const blocks = [];
  if (sheet.contact) {
    const c = sheet.contact;
    const first = c.name.split(/\s+/)[0] ?? '';
    blocks.push({
      kind: 'contact',
      title: t('emergency.contact'),
      name: c.name || c.phone,
      line: [c.relation ? c.relation.charAt(0).toLocaleUpperCase() + c.relation.slice(1) : '', c.name ? c.phone : ''].filter(Boolean).join(' · '),
      call: c.phone ? { label: first ? t('emergency.call', { name: first }) : t('emergency.callNumber'), tel: telHref(c.phone) } : null,
      hotline: null,
      docId: '',
    });
  }
  if (sheet.insurance) {
    const d = sheet.insurance;
    blocks.push({
      kind: 'insurance',
      title: t('emergency.insurance'),
      name: [d.insurer, d.plan].filter(Boolean).join(' · '),
      line: [d.policyNumber ? t('emergency.policy', { number: d.policyNumber }) : '', d.expiresOn ? t('emergency.validUntil', { date: w.date(d.expiresOn) }) : ''].filter(Boolean).join(' · '),
      call: null,
      hotline: d.emergencyPhone ? { label: t('emergency.hotline'), number: d.emergencyPhone, tel: telHref(d.emergencyPhone) } : null,
      docId: d.id,
    });
  }
  if (sheet.medical) {
    const d = sheet.medical;
    blocks.push({
      kind: 'medical',
      title: t('emergency.medical'),
      name: '',
      line: [d.expiresOn ? t('emergency.validUntil', { date: w.date(d.expiresOn) }) : '', d.documents.length ? t('emergency.pages', { n: d.documents.length }) : ''].filter(Boolean).join(' · '),
      call: null,
      hotline: null,
      docId: d.id,
    });
  }
  if (sheet.certificate) {
    const d = sheet.certificate;
    blocks.push({
      kind: 'certificate',
      title: t('emergency.certificate'),
      name: [agencyLabel(d, w.otherAgency), d.level].filter(Boolean).join(' '),
      line: d.number ? t('emergency.cardNumber', { number: d.number }) : '',
      call: null,
      hotline: null,
      docId: d.id,
    });
  }
  return {
    name: sheet.name,
    birthLine: sheet.birth ? (sheet.birth.age == null ? t('emergency.born', { date: w.date(sheet.birth.date) }) : t('emergency.bornAge', { date: w.date(sheet.birth.date), age: t('emergency.age', { n: sheet.birth.age }) })) : '',
    blood: sheet.blood ? (sheet.blood === 'unknown' ? w.unknownBlood : sheet.blood) : '',
    blocks,
  };
}
