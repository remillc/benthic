// @ts-check
// Formats and units (docs/ui-specification.md, section 2).
// Values come from the core in integer SI units; conversion happens here, at
// display time, never in the data.

import { keepUnits } from './nbsp.js';
import { t, locale } from './i18n.js';
import { settings } from './settings.svelte.js';
import { dateInputPattern, formatDateInput, parseDateInput } from './date-time-picker.js';

/** Units only: the full preferences (logbook.prefs) can be passed. @typedef {import('benthic-core').Units} Prefs */

/** Locale of the formats (lib/i18n.js): the device's, or fr-CA when the interface is fr-CA. */
export { locale };

const NBSP = ' '; // non-breaking space before units
/** @type {Map<string, Intl.NumberFormat>} */
const formats = new Map();

/** @param {number} decimals */
function numberFormat(decimals) {
  const key = String(decimals);
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formats.set(key, f);
  }
  return f;
}

/**
 * @param {number} value
 * @param {number} decimals
 */
export function formatNumber(value, decimals = 0) {
  return numberFormat(decimals).format(value);
}

/** @type {Prefs} */
export const defaultPrefs = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };

/**
 * Depth: 1 decimal in meters, integer in feet.
 * @param {number} mm
 * @param {Prefs} prefs
 */
export function depthValue(mm, prefs) {
  return prefs.length === 'ft' ? formatNumber(mm / 304.8, 0) : formatNumber(mm / 1000, 1);
}

/** @param {Prefs} prefs */
export function depthUnit(prefs) {
  return prefs.length === 'ft' ? t('units.feet') : t('units.meters');
}

/**
 * @param {number} mm
 * @param {Prefs} prefs
 */
export function formatDepth(mm, prefs) {
  return `${depthValue(mm, prefs)}${NBSP}${depthUnit(prefs)}`;
}

/**
 * Dive duration in whole minutes, as the Duration setting says (the core's
 * units.duration_units): automatic, "45 min" under an hour and from an hour
 * as the language writes it ("1 h 12", "1:12"), or always minutes ("72 min").
 * @param {number} seconds
 * @param {'mixed'|'minutes'} [mode]
 */
export function formatDuration(seconds, mode = settings.duration) {
  const minutes = Math.round(seconds / 60);
  if (mode === 'mixed' && minutes >= 60) return formatHours(seconds);
  return `${formatNumber(minutes, 0)}${NBSP}${t('units.minutes')}`;
}

/** Hours and minutes as the language writes them (units.hoursMinutes): "11 h 26", "11:26". @param {number} seconds */
export function formatHours(seconds) {
  const minutes = Math.round(seconds / 60);
  return t('units.hoursMinutes', {
    h: formatNumber(Math.floor(minutes / 60), 0),
    mm: String(minutes % 60).padStart(2, '0'),
  });
}

/**
 * A total of time under water (a sum of dive durations). Under 24 h it reads
 * as hours and minutes ("11 h 26"); from 24 h as days and hours without
 * minutes ("80 j 16 h"). Rounding: the total is rounded to the minute first
 * (as formatHours does), then the hours are rounded down, so 24 h 59 min reads
 * "1 j 0 h" and 23 h 59 min stays "23 h 59".
 * @param {number} seconds
 */
export function formatTotalTime(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 24 * 60) return formatHours(seconds);
  const hours = Math.floor(minutes / 60);
  return t('units.daysHours', { d: formatNumber(Math.floor(hours / 24), 0), h: formatNumber(hours % 24, 0) });
}

/** One duration of a statistic: "59 min" under an hour, else "1 h 06". @param {number} seconds */
export function formatLongDuration(seconds) {
  return seconds < 3570 ? formatDuration(seconds, 'minutes') : formatHours(seconds);
}

/** Time in the profile: min:s. @param {number} seconds */
export function formatMinSec(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Temperature: 1 decimal. 0 mK means "unknown" in the core.
 * @param {number} mk
 * @param {Prefs} prefs
 * @returns {string|null}
 */
export function formatTemperature(mk, prefs) {
  if (!mk) return null;
  return `${temperatureValue(mk, prefs)}${NBSP}${t(prefs.temperature === 'F' ? 'units.fahrenheit' : 'units.celsius')}`;
}

/**
 * Temperature without its unit, for a range ("4,0 à 26,0 °C").
 * @param {number} mk
 * @param {Prefs} prefs
 */
export function temperatureValue(mk, prefs) {
  const c = (mk - 273150) / 1000;
  return formatNumber(prefs.temperature === 'F' ? c * 9 / 5 + 32 : c, 1);
}

/**
 * Pressure: integer.
 * @param {number} mbar
 * @param {Prefs} prefs
 */
export function formatPressure(mbar, prefs) {
  return prefs.pressure === 'psi'
    ? `${formatNumber(mbar / 68.947572932, 0)}${NBSP}${t('units.psi')}`
    : `${formatNumber(mbar / 1000, 0)}${NBSP}${t('units.bar')}`;
}

/** The label of every partial pressure: "bar" or "ATA" (Settings › Unités). */
export function ppUnitLabel() {
  return t(settings.ppUnit === 'ata' ? 'units.ata' : 'units.bar');
}

/**
 * A partial pressure given in bar, with the unit of the settings. Same number
 * whatever the unit (1 bar is taken as 1 ATA): only the label changes.
 * @param {number} bar
 * @param {number} decimals
 */
export function formatPartialPressure(bar, decimals) {
  return `${formatNumber(bar, decimals)}${NBSP}${ppUnitLabel()}`;
}

/**
 * Gas consumption (SAC), per minute: 1 decimal in litres, 2 in cubic feet (0,36 cuft/min).
 * @param {number} mlPerMin
 * @param {Prefs} prefs
 */
export function formatSac(mlPerMin, prefs) {
  return prefs.volume === 'cuft'
    ? `${formatNumber(mlPerMin / 28316.8466, 2)}${NBSP}${t('units.cubicFeetPerMinute')}`
    : `${formatNumber(mlPerMin / 1000, 1)}${NBSP}${t('units.litersPerMinute')}`;
}

/**
 * Cylinder size: 1 decimal. In cubic feet, like Subsurface, the gas volume at
 * working pressure.
 * @param {number} ml
 * @param {number} workingPressureMbar
 * @param {Prefs} prefs
 * @returns {string|null}
 */
export function formatCylinderSize(ml, workingPressureMbar, prefs) {
  if (!ml) return null;
  if (prefs.volume === 'cuft') {
    if (!workingPressureMbar) return null;
    return `${formatNumber((ml / 28316.8466) * (workingPressureMbar / 1013.25), 1)}${NBSP}${t('units.cubicFeet')}`;
  }
  return `${formatNumber(ml / 1000, 1)}${NBSP}${t('units.liters')}`;
}

/** Percentage from a per-mille value. @param {number} permille */
export function formatPercent(permille) {
  return `${formatNumber(permille / 10, 0)}${NBSP}${t('units.percent')}`;
}

// The core gives the dive's local time without a time zone: it is read and
// shown in UTC so that it is never shifted.
const dateTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const dateOnlyFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });

/** @param {string} iso */
function toDate(iso) {
  // A date alone (2026-11-06) is read at midnight; a date with a time (2026-11-06T10:30:00) as it is.
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`);
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const chosenFormats = new Map();

/** @param {string} key @param {Intl.DateTimeFormatOptions} options */
function chosenFormat(key, options) {
  let f = chosenFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    chosenFormats.set(key, f);
  }
  return f;
}

/**
 * A date in one of the formats of the "Date format" setting: the device's
 * short format, 2026-11-06, 6 nov. 2026, 06/11/2026 or 11/06/2026.
 * @param {Date} date read in UTC (see toDate)
 * @param {'system'|'iso'|'medium'|'dmy'|'mdy'} choice
 */
export function formatDateChoice(date, choice) {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  if (choice === 'iso') return `${y}-${m}-${d}`;
  if (choice === 'dmy') return `${d}/${m}/${y}`;
  if (choice === 'mdy') return `${m}/${d}/${y}`;
  if (choice === 'medium') return chosenFormat('medium', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return chosenFormat('short', { dateStyle: 'short' }).format(date);
}

/**
 * A month and year, for a date known to the month only (a cylinder's stamped test), in the order of the "Date format"
 * setting: 2022-03, 03/2022, mars 2022.
 * @param {Date} date read in UTC
 * @param {'system'|'iso'|'medium'|'dmy'|'mdy'} choice
 */
export function formatMonthChoice(date, choice) {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (choice === 'iso') return `${y}-${m}`;
  if (choice === 'dmy' || choice === 'mdy') return `${m}/${y}`;
  if (choice === 'medium') return chosenFormat('monthMedium', { month: 'short', year: 'numeric' }).format(date);
  return chosenFormat('monthShort', { month: '2-digit', year: 'numeric' }).format(date);
}

/**
 * The format of the "Date format" setting written as the hint of a date field: "aaaa-mm-jj", "jj/mm/aaaa". The
 * names (system) and the long ones (medium) follow the device's numeric order.
 * @param {'system'|'iso'|'medium'|'dmy'|'mdy'} [choice]
 */
export function dateHint(choice = settings.dateFormat) {
  const { order, separator } = dateInputPattern(locale, choice);
  return order.map((k) => t(`datePicker.pattern.${k}`)).join(separator);
}

/** A YYYY-MM-DD date as typed in a field, in the numeric order of the "Date format" setting ("06/11/2026"); '' when it is not one. @param {string} iso */
export function typedDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? formatDateInput({ year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) }, locale, settings.dateFormat) : '';
}

/**
 * A date typed in a field, read in the format of the "Date format" setting (the ISO form is always accepted): the
 * YYYY-MM-DD date, or null when it is not a real date.
 * @param {string} text
 */
export function readTypedDate(text) {
  const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(text);
  const d = iso ? { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) } : parseDateInput(text, locale, 1900, 2100, settings.dateFormat);
  if (!d || d.month < 0 || d.month > 11 || d.day < 1 || d.day > new Date(Date.UTC(d.year, d.month + 1, 0)).getUTCDate()) return null;
  return `${String(d.year).padStart(4, '0')}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/**
 * A time of day as the "Time format" setting says: the device's, 24-hour or 12-hour.
 * @param {Date} date read in UTC
 * @param {'system'|'24'|'12'} choice
 */
export function formatTimeChoice(date, choice) {
  // « 9:35 AM », « 14 h 30 »: the time and its AM/PM or « h » never part (lib/nbsp.js).
  if (choice === 'system') return keepUnits(timeFormat.format(date));
  return keepUnits(chosenFormat(`time${choice}`, { hour: 'numeric', minute: '2-digit', hour12: choice === '12' }).format(date));
}

/** The local wall-clock date and time of an instant, as the dives' own dates are written. @param {Date} date */
function localIso(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

/** A moment (a file's change time, a version's) as a date in the format chosen in Settings. @param {Date|number} instant */
export function formatInstantDate(instant) {
  return formatDate(localIso(new Date(instant)));
}

/** A moment as a date and time in the formats chosen in Settings. @param {Date|number} instant */
export function formatInstantDateTime(instant) {
  return formatDateTime(localIso(new Date(instant)));
}

/** Short date and time, for a list row, in the formats chosen in Settings. @param {string} iso */
export function formatDateTime(iso) {
  if (settings.dateFormat === 'system' && settings.timeFormat === 'system') return keepUnits(dateTimeFormat.format(toDate(iso)));
  const date = toDate(iso);
  const day = settings.dateFormat === 'system' ? dateOnlyFormat.format(date) : formatDateChoice(date, settings.dateFormat);
  return `${day} ${formatTimeChoice(date, settings.timeFormat)}`;
}

/** Date without the time, in the format chosen in Settings: "2026-11-09". @param {string} iso */
export function formatDate(iso) {
  const date = toDate(iso);
  return settings.dateFormat === 'system' ? dateOnlyFormat.format(date) : formatDateChoice(date, settings.dateFormat);
}

const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });

/**
 * Short date with the day of the week before it, in the format chosen in Settings: "lun. 14 sept. 2026" (the desktop
 * logbook's Date column; the time follows it in small grey text).
 * @param {string} iso
 */
export function formatWeekdayDate(iso) {
  return `${weekdayFormat.format(toDate(iso))} ${formatDate(iso)}`;
}

/** Month and year, for a date that is only known to the month (a cylinder's stamped test), in the format chosen in Settings: "2022-03". @param {string} iso */
export function formatMonthYear(iso) {
  return formatMonthChoice(toDate(iso), settings.dateFormat);
}

/** Duration in whole minutes, as in a site's dive rows: "104 min". @param {number} seconds */
export function formatMinutes(seconds) {
  return `${Math.round(seconds / 60)}${NBSP}${t('units.minutes')}`;
}

const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' });

/** Date and time with the weekday, for the dive detail: "dimanche 2026-04-24 10:30". @param {string} iso */
export function formatFullDate(iso) {
  return `${weekdayLong.format(toDate(iso))} ${formatDateTime(iso)}`;
}

/** Date with the weekday, capitalised for the start of a line: "Dimanche 2022-04-24". @param {string} iso */
export function formatDiveDay(iso) {
  const text = `${weekdayLong.format(toDate(iso))} ${formatDate(iso)}`;
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * Time of day, optionally some seconds after the given moment (exit time).
 * @param {string} iso
 * @param {number} [afterSeconds]
 */
export function formatTimeOfDay(iso, afterSeconds = 0) {
  return formatTimeChoice(new Date(toDate(iso).getTime() + afterSeconds * 1000), settings.timeFormat);
}

/**
 * Full gas name, for the cylinder list: "Air", "Nitrox 32", "Trimix 18/45", "Oxygen".
 * @param {number} o2Permille
 * @param {number} hePermille
 */
export function formatGasLong(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he > 0) return t('gasLong.trimix', { o2: String(o2), he: String(he) });
  if (o2 >= 100) return t('gasLong.oxygen');
  // The core stores air as 0 per mille (meaning 21 %).
  if (o2 === 0 || o2 === 21) return t('gasLong.air');
  return t('gasLong.nitrox', { o2: String(o2) });
}

/**
 * Gas volume at surface pressure, as computed by the core: whole liters or cubic feet.
 * @param {number} ml
 * @param {Prefs} prefs
 */
export function formatGasVolume(ml, prefs) {
  return prefs.volume === 'cuft'
    ? `${formatNumber(ml / 28316.8466, 0)}${NBSP}${t('units.cubicFeet')}`
    : `${formatNumber(ml / 1000, 0)}${NBSP}${t('units.liters')}`;
}

/**
 * Weight (ballast): up to one decimal, in kilograms or pounds.
 * @param {number} grams
 * @param {Prefs} prefs
 */
export function formatWeight(grams, prefs) {
  const value = prefs.weight === 'lbs' ? grams / 453.59237 : grams / 1000;
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return `${text}${NBSP}${t(prefs.weight === 'lbs' ? 'units.pounds' : 'units.kilograms')}`;
}

/**
 * Short gas name, as divers write it: "Air", "O2", "Nx 32", "Tx 18/45".
 * @param {number} o2Permille
 * @param {number} hePermille
 */
export function formatGas(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he > 0) return t('gas.trimix', { o2: String(o2), he: String(he) });
  if (o2 >= 100) return t('gas.oxygen');
  // The core stores air as 0 per mille (meaning 21 %).
  if (o2 === 0 || o2 === 21) return t('gas.air');
  return t('gas.nitrox', { o2: String(o2) });
}

/**
 * The decompression settings in a few words, for the rows that open their
 * page: "Bühlmann ZH-L16, GF 30/75" or "VPM-B, +3".
 * @param {{ decoModel?: string, gfLow?: number, gfHigh?: number, vpmbConservatism?: number }} prefs
 */
export function decoSummary(prefs) {
  return prefs.decoModel === 'vpmb'
    ? `${t('settings.deco.vpmb')}, +${prefs.vpmbConservatism ?? 0}`
    : `${t('settings.deco.buehlmann')}, GF ${prefs.gfLow ?? 30}/${prefs.gfHigh ?? 75}`;
}

/**
 * Mix name as the core writes it (gasname in Subsurface's gas.cpp): air,
 * EAN32, oxygen, (18/45).
 * @param {number} o2Permille
 * @param {number} hePermille
 */
export function formatMixName(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he === 0 && (o2 === 0 || o2 === 21)) return t('gas.air');
  if (he === 0 && o2 >= 100) return t('gas.oxygen');
  if (he === 0) return `EAN${o2}`;
  return `(${o2}/${he})`;
}

/** Now as a local wall-clock date, like the dates of dives: "2026-11-09T14:30:00". */
export function localNowIso() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

/**
 * A relative time on one line: its words joined with non-breaking spaces, so that a
 * long status breaks before it, never inside it (docs/ui-writing.md, task 2026-11-14-159).
 * @param {string} text
 */
export const oneLine = (text) => text.replace(/ /g, '\u00a0');

/**
 * Time since a local date, in days, weeks, months or years: "il y a 9 mois".
 * Days are days of the calendar: last night's dive is "hier", even under 24 h ago.
 * @param {string} iso
 */
export function formatTimeAgo(iso) {
  const DAY = 86400000;
  const days = Math.floor(toDate(localNowIso()).getTime() / DAY) - Math.floor(toDate(iso).getTime() / DAY);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (days < 7) return oneLine(rtf.format(-days, 'day'));
  if (days < 60) return oneLine(rtf.format(-Math.floor(days / 7), 'week'));
  if (days < 365) return oneLine(rtf.format(-Math.floor(days / 30.44), 'month'));
  return oneLine(rtf.format(-Math.floor(days / 365.25), 'year'));
}

/**
 * Time since a recent local moment, for the sync state: "à l'instant", "il y a 2 min",
 * "il y a 3 h", then days as `formatTimeAgo`.
 * @param {string} iso local time without zone, as `localNowIso` writes it
 * @param {string} [now]
 */
export function formatShortAgo(iso, now = localNowIso()) {
  const minutes = Math.floor((toDate(now).getTime() - toDate(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (minutes < 1) return oneLine(rtf.format(0, 'second'));
  if (minutes < 60) return oneLine(rtf.format(-minutes, 'minute'));
  if (minutes < 24 * 60) return oneLine(rtf.format(-Math.floor(minutes / 60), 'hour'));
  return formatTimeAgo(iso);
}

/**
 * Date and time with relative days: "Aujourd'hui, 13:40", "Hier, 13:40"; older
 * dates as usual.
 * @param {string} iso
 * @param {string} [now]
 * @param {boolean} [capital] false in the middle of a sentence
 */
export function formatRelativeDateTime(iso, now = localNowIso(), capital = true) {
  const DAY = 86400000;
  const days = Math.floor(toDate(now).getTime() / DAY) - Math.floor(toDate(iso).getTime() / DAY);
  if (days !== 0 && days !== 1) return formatDateTime(iso);
  const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  const text = capital ? day.charAt(0).toLocaleUpperCase(locale) + day.slice(1) : day;
  return oneLine(`${text}, ${formatTimeChoice(toDate(iso), settings.timeFormat)}`);
}

/**
 * A moment in the middle of a sentence, with the day in words: "demain à 8 h 35",
 * "aujourd'hui à 8 h 35", "hier à 8 h 35"; another day as the date and time of a list row.
 * @param {string} iso
 * @param {string} [now]
 */
export function formatDayAt(iso, now = localNowIso()) {
  const DAY = 86400000;
  const days = Math.floor(toDate(now).getTime() / DAY) - Math.floor(toDate(iso).getTime() / DAY);
  if (days < -1 || days > 1) return formatDateTime(iso);
  const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  return oneLine(t('flight.at', { day, time: formatTimeChoice(toDate(iso), settings.timeFormat) }));
}

/**
 * A range of days in the format chosen in Settings, e.g. "2013-02-02 – 2013-02-04"; a single day when both are the same.
 * @param {string} isoStart
 * @param {string} isoEnd
 */
export function formatDateRange(isoStart, isoEnd) {
  const start = formatDate(isoStart);
  const end = formatDate(isoEnd);
  return start === end ? start : `${start}${NBSP}–${NBSP}${end}`;
}
