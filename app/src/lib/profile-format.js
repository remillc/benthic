// @ts-check
// Small formatting helpers of « Mon profil de plongeur » (task 2026-11-18-272).
import { locale } from './format.js';

/** « 14 mars 1979 » for a YYYY-MM-DD date; '' when it is not a date. @param {string} iso */
export function formatLongDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

/** The date of an ISO timestamp (the consent's), written out. @param {string} timestamp */
export const formatStampDate = (timestamp) => formatLongDate(timestamp.slice(0, 10));

/** The year, 0-based month and day the date picker starts on. @param {string} iso @param {number} fallbackYear */
export function partsOf(iso, fallbackYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) } : { year: fallbackYear - 30, month: 0, day: 1 };
}

/** YYYY-MM-DD from the picker's year, 0-based month and day. @param {{ year: number, month: number, day: number }} d */
export const isoOf = (d) => `${String(d.year).padStart(4, '0')}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
