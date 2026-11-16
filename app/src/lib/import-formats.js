// @ts-check
// The file formats « Importer un carnet » accepts, in one place (task 2026-11-16-223, release edition).
// The dialog « Formats acceptés », the help line under « Un fichier » and the error message all read this
// list, and the number they show is its length. Every entry is a « works » line of docs/import-formats.md
// (task 2026-11-16-221: checked with real files through the façade); `tests/app/import-formats.test.mjs`
// parses that report and compares. A format the core cannot read as the app opens it (DL7, SmartTrak) is not
// here; add it when its import exists. CSV is: the core reads it through the column mapping of the CSV dialog
// (task 2026-11-16-224). Names are product names and are never translated.

/** The three columns of the dialog, in order; their titles are `importFormats.column.<key>`. */
export const FORMAT_COLUMNS = /** @type {const} */ (['open', 'devices', 'logbooks']);

/**
 * @typedef {{
 *   report: string,
 *   column: 'open'|'devices'|'logbooks',
 *   name: string,
 *   extensions: string[],
 * }} ImportFormat
 * `report` is the format's name in the first column of docs/import-formats.md.
 */

/** @type {ImportFormat[]} */
export const IMPORT_FORMATS = [
  { report: 'Subsurface log and XML', column: 'open', name: 'OpenDives, Subsurface', extensions: ['.ssrf', '.xml'] },
  { report: 'UDDF 3.0 to 3.2', column: 'open', name: 'UDDF', extensions: ['.uddf'] },
  { report: 'UDDF of the APD Inspiration', column: 'open', name: 'UDDF APD Inspiration', extensions: ['.uddf'] },
  { report: 'UDCF', column: 'open', name: 'UDCF', extensions: ['.udcf'] },
  { report: 'CSV with a column mapping', column: 'open', name: 'CSV', extensions: ['.csv', '.tsv'] },

  { report: 'FIT (Garmin Descent, Suunto)', column: 'devices', name: 'Garmin et Suunto (FIT)', extensions: ['.fit'] },
  { report: 'Suunto app JSON', column: 'devices', name: 'Suunto, appli', extensions: ['.json'] },
  { report: 'Suunto Dive Manager 3', column: 'devices', name: 'Suunto Dive Manager 3', extensions: ['.sde'] },
  { report: 'Suunto Dive Manager 4', column: 'devices', name: 'Suunto Dive Manager 4', extensions: ['.db'] },
  { report: 'Suunto Dive Manager 5', column: 'devices', name: 'Suunto Dive Manager 5', extensions: ['.db'] },
  { report: 'Shearwater Cloud', column: 'devices', name: 'Shearwater Cloud', extensions: ['.db'] },
  { report: 'Seac Sync', column: 'devices', name: 'Seac Sync', extensions: ['.db'] },
  { report: 'OSTCtools', column: 'devices', name: 'OSTC (OSTCtools)', extensions: ['.dive'] },
  { report: 'Divesoft Freedom and Liberty', column: 'devices', name: 'Divesoft Freedom, Liberty', extensions: ['.dlf'] },
  { report: 'DataTrak', column: 'devices', name: 'Uwatec DataTrak', extensions: ['.log'] },

  { report: 'divelogs.de', column: 'logbooks', name: 'divelogs.de', extensions: ['.dld'] },
  { report: 'divelogs.de export', column: 'logbooks', name: 'divelogs.de, export', extensions: ['.divelogs'] },
  { report: 'JDiveLog', column: 'logbooks', name: 'JDiveLog', extensions: ['.jlb'] },
  { report: 'Diving Log 4.1', column: 'logbooks', name: 'Diving Log 4.1', extensions: ['.sql'] },
];

/** The number of accepted formats: what the help line and the dialog say. */
export const IMPORT_FORMAT_COUNT = IMPORT_FORMATS.length;

/**
 * The formats of one column, in order.
 * @param {'open'|'devices'|'logbooks'} column
 */
export function formatsOf(column) {
  return IMPORT_FORMATS.filter((f) => f.column === column);
}

/**
 * The dialog's open state, as pure functions so that a test can drive it: the link opens it, « Fermer »,
 * a tap on the scrim and the system Back all end in `closeFormats` (Md3Dialog sends them all to `oncancel`).
 * @param {{ formatsOpen: boolean }} state
 */
export const openFormats = (state) => void (state.formatsOpen = true);
/** @param {{ formatsOpen: boolean }} state */
export const closeFormats = (state) => void (state.formatsOpen = false);
