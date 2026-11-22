// @ts-check
import { slugify, logbookExportName, benthicExportName } from './logbook-name.js';
// The desktop export dialog (task 2026-11-15-189): which dives by default, and the file name
// proposed in the system's save dialog (« plongees-6-7.ssrf », « carnet-2026-11-15.uddf »).

/** @typedef {'selection'|'filtered'|'all'} ExportScope */

/**
 * The selection when dives are selected, else the filter when one is on, else the whole logbook.
 * @param {number} selected @param {boolean} filtered @returns {ExportScope}
 */
export function defaultScope(selected, filtered) {
  return selected > 0 ? 'selection' : filtered ? 'filtered' : 'all';
}

/** The formats of a selection of dives, in the order the dialogs list them. */
export const DIVE_FORMATS = /** @type {const} */ (['ssrf', 'uddf', 'csv', 'csvProfiles', 'pdf']);

/**
 * The formats a dialog offers (task 2026-11-22-323): « Fichier Benthic (.benthic) », the archive of
 * the whole logbook and the diver's Benthic data, comes first and only when the whole logbook is exported,
 * never for a selection or the filtered dives.
 * @param {boolean} whole the whole logbook is being exported
 * @returns {('benthic'|'ssrf'|'uddf'|'csv'|'csvProfiles'|'pdf')[]}
 */
export function exportFormats(whole) {
  return whole ? ['benthic', ...DIVE_FORMATS] : [...DIVE_FORMATS];
}

/** The format that will be written: the remembered one, or the first dive format when it is not offered. @param {string} format @param {boolean} whole */
export function usableFormat(format, whole) {
  const offered = exportFormats(whole);
  return /** @type {any} */ (offered.includes(/** @type {any} */ (format)) ? format : 'ssrf');
}

/** The file extension of an export format. @param {string} format */
export const exportExtension = (format) => (format === 'csvProfiles' ? 'csv' : format);

/**
 * The proposed file name. The words come from the translations (« plongees », « carnet »),
 * without accents or spaces so that every system takes them.
 * @param {ExportScope} scope
 * @param {number[]} numbers the dives' numbers (the selection's)
 * @param {string} format
 * @param {string} day YYYY-MM-DD
 * @param {{dives: string, logbook: string}} words
 * @param {string} [logbookName] the logbook's name: a whole-logbook .ssrf is « <name slug>-<day>.ssrf »
 * @returns {string}
 */
export function exportFileName(scope, numbers, format, day, words, logbookName = '') {
  const clean = (/** @type {string} */ w) => slugify(w);
  if (format === 'benthic') return benthicExportName(logbookName, words.logbook);
  const ext = exportExtension(format);
  const sorted = [...numbers].filter((n) => n > 0).sort((a, b) => a - b);
  if (scope === 'selection' && sorted.length && sorted.length <= 4) return `${clean(words.dives)}-${sorted.join('-')}.${ext}`;
  if (scope === 'all' && format === 'ssrf') return logbookExportName(logbookName, day, words.logbook);
  if (scope === 'all') return `${clean(words.logbook)}-${day}.${ext}`;
  return `${clean(words.dives)}-${day}.${ext}`;
}
