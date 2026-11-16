// @ts-check
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
 * @returns {string}
 */
export function exportFileName(scope, numbers, format, day, words) {
  const clean = (/** @type {string} */ w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase();
  const ext = exportExtension(format);
  const sorted = [...numbers].filter((n) => n > 0).sort((a, b) => a - b);
  if (scope === 'selection' && sorted.length && sorted.length <= 4) return `${clean(words.dives)}-${sorted.join('-')}.${ext}`;
  if (scope === 'all') return `${clean(words.logbook)}-${day}.${ext}`;
  return `${clean(words.dives)}-${day}.${ext}`;
}
