// @ts-check
// Small formatting helpers of « Mon profil de plongeur » (task 2026-11-18-272).
import { formatDate as formatDay, formatDateChoice } from './format.js';
import { settings } from './settings.svelte.js';

/** A YYYY-MM-DD date in the format chosen in Settings (« 1979-03-14 »); '' when it is not a date. @param {string} iso */
export function formatDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDay(iso) : '';
}

/**
 * A date as a form field shows it, in the format Réglages › « Format de la date » shows for the choice (« 14/03/2026 »,
 * « 2026-03-14 », « 14 mars 2026 »): the same text on the phone, the tablet and the desktop, and the same numeric form as the
 * typed fields of the same form (« Date d'achat »). The device's own format is its short numeric date, as Réglages lists it,
 * not the long « 14 mars 2026 » of the read-only views (task 2026-11-24-397, point 5).
 * @param {string} iso YYYY-MM-DD; '' when it is not a date
 */
export function formatFieldDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? formatDateChoice(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))), settings.dateFormat) : '';
}

/** The year, 0-based month and day the date picker starts on. @param {string} iso @param {number} fallbackYear */
export function partsOf(iso, fallbackYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
  // No date yet: the picker opens on today (26 November 2026), or on the last day allowed when today is past it.
  const now = new Date();
  return now.getFullYear() > fallbackYear ? { year: fallbackYear, month: 11, day: 31 } : { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

/** YYYY-MM-DD from the picker's year, 0-based month and day. @param {{ year: number, month: number, day: number }} d */
export const isoOf = (d) => `${String(d.year).padStart(4, '0')}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
