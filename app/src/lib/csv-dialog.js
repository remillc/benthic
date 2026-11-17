// @ts-check
// The three steps of the CSV import dialog (task 2026-11-16-224, part 8; mock-ups docs/mockups/android-tablette-
// import-csv-{type,colonnes,apercu}-paysage.dc.html), as pure functions over one state object so that node:test
// can drive them. The dialog (components/CsvImportDialog.svelte) holds the state and draws it; the file is read
// and the mapping built in lib/csv-import.js.
import {
  buildParams,
  columnNames,
  diveDateParams,
  guessDateFormat,
  guessDurationFormat,
  guessMapping,
  knownMapping,
  localDateTime,
  previewRows,
  poseidonRows,
  FIELDS,
} from './csv-import.js';

/** @typedef {import('./csv-import.js').CsvInspection} CsvInspection */
/** @typedef {import('./csv-import.js').CsvPreview} CsvPreview */

/**
 * @typedef {{
 *   step: 1|2|3,
 *   inspection: CsvInspection,
 *   hasCompanion: boolean,
 *   lastModified: number,
 *   kind: 'samples'|'dives',
 *   known: 'seabear'|'poseidon'|'sensus'|null,
 *   mapping: string[],
 *   separator: number,
 *   units: 0|1,
 *   dateFormat: number,
 *   durationFormat: number,
 *   diveDate: string,
 *   preview: CsvPreview|null,
 *   previewError: string,
 *   busy: boolean,
 * }} CsvState
 */

/**
 * The state of a file just read: its kind and known format guessed, its columns guessed from their names, the
 * Seabear header's date (or the file's own date) proposed for the dive.
 * @param {CsvInspection} inspection
 * @param {{ lastModified: number, hasCompanion?: boolean }} file
 * @returns {CsvState}
 */
export function createState(inspection, file) {
  /** @type {CsvState} */
  const state = {
    step: 1,
    inspection,
    hasCompanion: Boolean(file.hasCompanion),
    lastModified: file.lastModified,
    kind: inspection.kind,
    known: inspection.known,
    mapping: [],
    separator: inspection.separator,
    units: 0,
    dateFormat: 2,
    durationFormat: 1,
    diveDate: inspection.seabear?.date || localDateTime(file.lastModified),
    preview: null,
    previewError: '',
    busy: false,
  };
  fillMapping(state);
  return state;
}

/** The columns the table has: the widest of the rows shown, or the file's own count. @param {CsvState} state */
export function columnCount(state) {
  const rows = rows_(state);
  return Math.max(state.inspection.columnCount, ...rows.map((r) => r.length), 0);
}

/**
 * The rows the second step shows with the separator now in use.
 * @param {CsvState} state
 * @returns {string[][]}
 */
export function rows_(state) {
  const rows = previewRows(state.inspection, state.separator);
  return state.known === 'poseidon' ? poseidonRows(rows) : rows;
}

/** The column names above the table. @param {CsvState} state */
export function names(state) {
  return columnNames(state.inspection, state.separator, columnCount(state));
}

/**
 * The mapping from what the file says (a known format, else the column names), and the formats from its first
 * date and duration cells.
 * @param {CsvState} state
 */
export function fillMapping(state) {
  const width = columnCount(state);
  if (state.known) {
    const preset = knownMapping(state.known, width, state.inspection.header);
    state.kind = preset.kind;
    state.separator = preset.separator;
    state.mapping = preset.mapping.slice(0, columnCount(state));
  } else {
    state.mapping = guessMapping(names(state).map((n, i) => (state.inspection.header[i] ? n : '')), state.kind);
  }
  while (state.mapping.length < columnCount(state)) state.mapping.push('');
  const dateColumn = state.mapping.indexOf('date');
  if (dateColumn >= 0) {
    const cell = previewRows(state.inspection, state.separator, 1)[0]?.[dateColumn] ?? '';
    state.dateFormat = guessDateFormat(cell);
  }
  const durationColumn = state.mapping.indexOf('duration');
  if (durationColumn >= 0) {
    const cell = previewRows(state.inspection, state.separator, 1)[0]?.[durationColumn] ?? '';
    state.durationFormat = guessDurationFormat(cell);
  }
}

/**
 * « Que contient chaque ligne ? » (a known format goes: its kind is its own).
 * @param {CsvState} state
 * @param {'samples'|'dives'} kind
 */
export function setKind(state, kind) {
  if (state.kind === kind && !state.known) return;
  state.known = null;
  state.kind = kind;
  state.preview = null;
  fillMapping(state);
}

/**
 * « Format connu »: Aucun, or a format whose columns are filled in advance.
 * @param {CsvState} state
 * @param {'seabear'|'poseidon'|'sensus'|null} known
 */
export function setKnown(state, known) {
  state.known = known;
  state.preview = null;
  if (known === 'seabear' && state.inspection.known !== 'seabear') {
    // Not a Seabear file: its columns are filled as Seabear's fixed layout, which the diver can change.
    state.separator = 2;
  }
  if (!known) state.separator = state.inspection.separator;
  fillMapping(state);
}

/**
 * The menu of a column: the field it holds, or none. A field belongs to one column: the column that had it
 * becomes « Ignorer ».
 * @param {CsvState} state
 * @param {number} column
 * @param {string} key a field key, or '' for « Ignorer »
 */
export function setColumn(state, column, key) {
  if (key) {
    state.mapping = state.mapping.map((k, i) => (k === key && i !== column ? '' : k));
  }
  state.mapping[column] = key;
  state.preview = null;
}

/**
 * The separator changed: the rows are cut again, the columns guessed again from the names.
 * @param {CsvState} state
 * @param {number} separator
 */
export function setSeparator(state, separator) {
  state.separator = separator;
  state.preview = null;
  if (!state.known) fillMapping(state);
  else while (state.mapping.length < columnCount(state)) state.mapping.push('');
}

/**
 * The fields of the menus for the kind, with the key and the parameter.
 * @param {CsvState} state
 */
export function fieldsOf(state) {
  return FIELDS[state.kind];
}

/**
 * Whether « Suivant » works on step 2: the columns the import needs are there.
 * @param {CsvState} state
 * @returns {boolean}
 */
export function columnsReady(state) {
  const has = (/** @type {string} */ k) => state.mapping.includes(k);
  if (state.known === 'poseidon') return state.hasCompanion;
  if (state.known === 'sensus') return true;
  if (state.kind === 'samples') {
    // Seabear's newer files give a log interval instead of a time column.
    const timeless = state.known === 'seabear' && Boolean(state.inspection.seabear?.delta);
    return has('depth') && (has('time') || timeless);
  }
  return state.mapping.some(Boolean);
}

/**
 * « Suivant » enabled.
 * @param {CsvState} state
 */
export function canNext(state) {
  if (state.step === 1) return state.known !== 'poseidon' || state.hasCompanion;
  if (state.step === 2) return columnsReady(state) && !state.busy;
  return false;
}

/** Whether the dive's own date is asked for: no column holds it (a Seabear or a Sensus file gives its own). @param {CsvState} state */
export function needsDiveDate(state) {
  if (state.known === 'poseidon' || state.known === 'sensus') return false;
  if (state.kind === 'dives') return false;
  return !state.mapping.includes('date') && !(state.known === 'seabear' && state.inspection.seabear?.date);
}

/** The date and the duration formats are asked for when the file has such a column. @param {CsvState} state */
export function needsFormats(state) {
  return {
    date: state.kind === 'dives' || state.mapping.includes('date'),
    duration: state.kind === 'dives' && state.mapping.includes('duration'),
  };
}

/** @param {CsvState} state */
export function next(state) {
  if (state.step === 1 && canNext(state)) {
    state.step = 2;
    if (state.known === 'poseidon') state.mapping = knownMapping('poseidon', columnCount(state)).mapping;
  } else if (state.step === 2 && canNext(state)) {
    state.step = 3;
    state.preview = null;
    state.previewError = '';
  }
}

/** @param {CsvState} state */
export function back(state) {
  if (state.step === 3) state.step = 2;
  else if (state.step === 2) state.step = 1;
  state.preview = null;
  state.previewError = '';
}

/**
 * The mapping the core's import takes for the state.
 * @param {CsvState} state
 * @returns {import('opendives-core').CsvParams}
 */
export function paramsOf(state) {
  return buildParams({
    kind: state.kind,
    known: state.known,
    mapping: state.mapping,
    separator: state.separator,
    units: state.units,
    dateFormat: state.dateFormat,
    durationFormat: state.durationFormat,
    diveDate: state.diveDate,
    seabearHw: state.inspection.seabear?.hw ?? '',
  });
}

/** The dive's date and time, for the preview's card when the core cannot say. @param {CsvState} state */
export function proposedDate(state) {
  return diveDateParams(state.diveDate).date ? state.diveDate : '';
}
