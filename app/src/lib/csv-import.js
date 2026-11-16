// @ts-check
// Importing a CSV file (task 2026-11-16-224, part 8): reading the file, guessing what its columns are, and
// the column mapping the core's import takes (`importCsv` of the plugin, import_csv in opendives.h). The
// dialog (components/CsvImportDialog.svelte) only draws it. Pure, so that node:test can run it.
//
// The core reads a .csv only through the column mapping Subsurface's desktop asks for
// (DiveLogImportDialog); the same parameters are built here: a column index per field (-1 for none), the
// separator, the units, the date and the duration formats. « Format connu » prefills them the way the
// desktop does for its known apps (CSVApps in desktop-widgets/divelogimportdialog.cpp): Seabear, Sensus,
// and Poseidon MkVI, whose profile is in the .csv and the rest of the dive in the .txt next to it.

/** The separators of the mapping, by the index the stylesheets know (`separatorIndex`). */
export const SEPARATORS = /** @type {const} */ ([
  { index: 0, char: '\t', key: 'tab' },
  { index: 1, char: ',', key: 'comma' },
  { index: 2, char: ';', key: 'semicolon' },
  { index: 3, char: '|', key: 'pipe' },
]);

/** What a line of the file is: a point of one dive's profile, or a whole dive. */
export const KINDS = /** @type {const} */ (['samples', 'dives']);

/** The known formats of « Format connu », after « Aucun ». */
export const KNOWN_FORMATS = /** @type {const} */ (['seabear', 'poseidon', 'sensus']);

/**
 * The fields a column can hold, per kind: the key the dialog works with, the parameter the stylesheet reads,
 * and the unit family the label shows (`csvImport.column.<key>`). The first fields of `samples` describe the
 * dive and are read from the file's own date columns when it has them.
 * @typedef {{ key: string, param: string, unit?: 'depth'|'temperature'|'pressure'|'time' }} Field
 * @type {Record<'samples'|'dives', Field[]>}
 */
export const FIELDS = {
  samples: [
    { key: 'time', param: 'timeField', unit: 'time' },
    { key: 'depth', param: 'depthField', unit: 'depth' },
    { key: 'temp', param: 'tempField', unit: 'temperature' },
    { key: 'pressure', param: 'pressureField', unit: 'pressure' },
    { key: 'ndl', param: 'ndlField' },
    { key: 'tts', param: 'ttsField' },
    { key: 'stopdepth', param: 'stopdepthField', unit: 'depth' },
    { key: 'cns', param: 'cnsField' },
    { key: 'setpoint', param: 'setpointField' },
    { key: 'po2', param: 'po2Field' },
    { key: 'sensor1', param: 'o2sensor1Field' },
    { key: 'sensor2', param: 'o2sensor2Field' },
    { key: 'sensor3', param: 'o2sensor3Field' },
    { key: 'heartrate', param: 'heartBeat' },
    { key: 'number', param: 'numberField' },
    { key: 'date', param: 'dateField' },
    { key: 'start', param: 'starttimeField' },
  ],
  dives: [
    { key: 'number', param: 'numberField' },
    { key: 'date', param: 'dateField' },
    { key: 'start', param: 'timeField' },
    { key: 'duration', param: 'durationField' },
    { key: 'maxDepth', param: 'maxDepthField', unit: 'depth' },
    { key: 'avgDepth', param: 'meanDepthField', unit: 'depth' },
    { key: 'mode', param: 'modeField' },
    { key: 'location', param: 'locationField' },
    { key: 'gps', param: 'gpsField' },
    { key: 'buddy', param: 'buddyField' },
    { key: 'divemaster', param: 'divemasterField' },
    { key: 'suit', param: 'suitField' },
    { key: 'notes', param: 'notesField' },
    { key: 'tags', param: 'tagsField' },
    { key: 'weight', param: 'weightField' },
    { key: 'cylSize', param: 'cylindersizeField' },
    { key: 'startPressure', param: 'startpressureField', unit: 'pressure' },
    { key: 'endPressure', param: 'endpressureField', unit: 'pressure' },
    { key: 'o2', param: 'o2Field' },
    { key: 'he', param: 'heField' },
    { key: 'airTemp', param: 'airtempField', unit: 'temperature' },
    { key: 'waterTemp', param: 'watertempField', unit: 'temperature' },
    { key: 'visibility', param: 'visibilityField' },
    { key: 'rating', param: 'ratingField' },
  ],
};

/** The names a header can give a column, once normalised (see `normaliseName`), per kind and field. */
const SYNONYMS = {
  samples: {
    time: ['time', 'divetime', 'elapsedtime', 'sampletime', 'runtime', 'timemin', 'timesec', 'seconds'],
    depth: ['depth', 'sampledepth', 'profondeur'],
    temp: ['temp', 'temperature', 'watertemp', 'ambienttemp', 'sampletemperature'],
    pressure: ['pressure', 'tankpressure', 'cylinderpressure', 'samplepressure'],
    ndl: ['ndl', 'ndt', 'nodecotime', 'samplendl'],
    tts: ['tts', 'sampletts'],
    stopdepth: ['stopdepth', 'samplestopdepth'],
    cns: ['cns', 'cnsexposure', 'samplecns'],
    setpoint: ['setpoint', 'ppo2setpoint', 'samplesetpoint'],
    po2: ['po2', 'ppo2', 'samplepo2'],
    sensor1: ['po21', 'ppo2c1cell1', 'sensor1'],
    sensor2: ['po22', 'ppo2c1cell2', 'sensor2'],
    sensor3: ['po23', 'ppo2c1cell3', 'sensor3'],
    heartrate: ['heartrate', 'hr', 'pulse', 'sampleheartrate'],
    number: ['nr', 'number', 'dive', 'divenr', 'divenumber'],
    date: ['date'],
    start: ['starttime'],
  },
  dives: {
    number: ['nr', 'number', 'dive', 'divenr', 'divenumber'],
    date: ['date'],
    start: ['time', 'starttime'],
    duration: ['duration', 'divetime', 'bottomtime'],
    maxDepth: ['maxdepth', 'maximumdepth', 'depthmax', 'maxdepthm'],
    avgDepth: ['avgdepth', 'meandepth', 'averagedepth'],
    mode: ['mode'],
    location: ['location', 'site', 'divesite', 'place'],
    gps: ['gps', 'coordinates'],
    buddy: ['buddy', 'buddies'],
    divemaster: ['divemaster', 'guide'],
    suit: ['suit'],
    notes: ['notes', 'comments', 'remarks'],
    tags: ['tags'],
    weight: ['weight'],
    cylSize: ['cylsize', 'cylindersize', 'tanksize'],
    startPressure: ['startpressure'],
    endPressure: ['endpressure'],
    o2: ['o2', 'oxygen'],
    he: ['he', 'helium'],
    airTemp: ['airtemp'],
    waterTemp: ['watertemp'],
    visibility: ['visibility'],
    rating: ['rating'],
  },
};

/**
 * @param {string} name a file name
 * @returns {boolean} true for a .csv (or .tsv) file
 */
export function isCsvName(name) {
  return /\.(csv|tsv)$/i.test(name);
}

/**
 * The .csv among the files chosen, and its companion: a Poseidon MkVI dive is a .csv (the profile) and a .txt
 * of the same name (the rest of the dive). Null when no .csv was chosen.
 * @param {ArrayLike<File>} files
 * @returns {{ csv: File, companion: File|null }|null}
 */
export function pickCsvFiles(files) {
  const list = Array.from(files);
  const csv = list.find((f) => isCsvName(f.name));
  if (!csv) return null;
  const base = csv.name.replace(/\.[^.]*$/, '').toLowerCase();
  const companion = list.find((f) => /\.txt$/i.test(f.name) && f.name.replace(/\.[^.]*$/, '').toLowerCase() === base) ?? null;
  return { csv, companion };
}

/**
 * A header's name made comparable: lower case, no quotes, no unit in brackets, only letters and digits.
 * @param {string} name
 */
export function normaliseName(name) {
  return name
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * One line cut into cells, quotes honoured (a cell in quotes may hold the separator and doubled quotes).
 * @param {string} line
 * @param {string} separator one character
 * @returns {string[]}
 */
export function splitCells(line, separator) {
  /** @type {string[]} */
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) {
      cells.push(cell);
      cell = '';
    } else cell += c;
  }
  cells.push(cell);
  return cells;
}

/**
 * The separator a line most likely uses, as the desktop dialog guesses it: the one that occurs most;
 * a comma when none stands out.
 * @param {string} line
 * @returns {number} an index of SEPARATORS
 */
export function guessSeparator(line) {
  const counts = SEPARATORS.map((s) => line.split(s.char).length - 1);
  const best = Math.max(...counts);
  if (best === 0) return 1;
  const winners = counts.filter((n) => n === best);
  return winners.length === 1 ? counts.indexOf(best) : 1;
}

/** @param {string} cell */
const hasLetter = (cell) => /[a-z#]/i.test(cell);

/**
 * Whether a line looks like the column names: every cell that is filled has a letter (a data line has numbers).
 * @param {string[]} cells
 */
export function isHeaderRow(cells) {
  const filled = cells.map((c) => c.trim()).filter(Boolean);
  return filled.length > 0 && filled.every(hasLetter);
}

/**
 * What the file holds, read from its text.
 * @typedef {{
 *   name: string,
 *   known: 'seabear'|'sensus'|null,
 *   separator: number,
 *   header: string[],
 *   lines: string[],
 *   lineCount: number,
 *   columnCount: number,
 *   kind: 'samples'|'dives',
 *   seabear: { hw: string, delta: string, date: string }|null,
 * }} CsvInspection
 * `lines` are the data lines (the header and, for Seabear, its metadata are left out); `header` the column
 * names when the file gives them (else empty); `seabear.date` is the dive's date and time from the file's
 * header, as `YYYY-MM-DDTHH:mm`, empty when it has none.
 */

const SENSUS_LINE = /^\d+,SU-\d+,\d+,\d{4},\d+,\d+,\d+,\d+,\d+,/;

/**
 * @param {string} text the file's text
 * @param {string} name the file's name
 * @returns {CsvInspection}
 */
export function inspectCsv(text, name) {
  const all = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const nonEmpty = all.filter((l) => l.trim().length > 0);
  /** @type {CsvInspection} */
  const result = {
    name,
    known: null,
    separator: 1,
    header: [],
    lines: [],
    lineCount: 0,
    columnCount: 0,
    kind: 'samples',
    seabear: null,
  };

  if (/SEABEAR/.test(text.slice(0, 1200))) {
    // Metadata, an empty line, the column names and two lines that describe them, an empty line, the data.
    const first = all.findIndex((l, i) => l.trim() === '' && i > 0 && all.slice(0, i).some((x) => /\/\/SEABEAR/.test(x)));
    const names = first >= 0 ? all.findIndex((l, i) => i > first && l.trim() !== '') : -1;
    const second = names >= 0 ? all.findIndex((l, i) => i > names && l.trim() === '') : -1;
    if (names >= 0 && second >= 0) {
      result.known = 'seabear';
      result.separator = 2;
      result.header = splitCells(all[names], ';');
      result.lines = all.slice(second + 1).filter((l) => l.trim() !== '');
      result.lineCount = result.lines.length;
      result.columnCount = result.header.length;
      const meta = all.slice(0, first);
      const hw = meta.map((l) => /\/\/Hardware Version:\s*(.+)/.exec(l)?.[1]?.trim()).find(Boolean) ?? '';
      const delta = meta.map((l) => /\/\/Log interval:\s*(\d+)/.exec(l)?.[1]).find(Boolean) ?? '';
      const stamp = meta.map((l) => /^\/\/(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})/.exec(l.trim())).find(Boolean);
      result.seabear = { hw, delta, date: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}` : '' };
      return result;
    }
  }

  const firstLine = nonEmpty[0] ?? '';
  if (SENSUS_LINE.test(firstLine)) {
    result.known = 'sensus';
    result.separator = 1;
    result.lines = nonEmpty;
    result.lineCount = nonEmpty.length;
    result.columnCount = splitCells(firstLine, ',').length;
    return result;
  }

  result.separator = guessSeparator(firstLine);
  const char = SEPARATORS[result.separator].char;
  const firstCells = splitCells(firstLine, char);
  const hasHeader = isHeaderRow(firstCells);
  if (hasHeader) result.header = firstCells.map((c) => c.trim().replace(/^#/, '#'));
  result.lines = hasHeader ? nonEmpty.slice(1) : nonEmpty;
  result.lineCount = result.lines.length;
  result.columnCount = firstCells.length;
  // A header that names a date column describes whole dives; the others, one dive's profile.
  const names = result.header.map(normaliseName);
  result.kind = names.includes('date') && !names.includes('depth') ? 'dives' : 'samples';
  return result;
}

/**
 * The first lines of the file cut into cells with the separator in use (the table of the second step).
 * @param {CsvInspection} inspection
 * @param {number} separator an index of SEPARATORS
 * @param {number} [count]
 * @returns {string[][]}
 */
export function previewRows(inspection, separator, count = 7) {
  const char = SEPARATORS[separator]?.char ?? ',';
  return inspection.lines.slice(0, count).map((l) => splitCells(l, char));
}

/**
 * The column names above the table: the file's own names for the separator in use, else « A », « B »….
 * @param {CsvInspection} inspection
 * @param {number} separator
 * @param {number} width the number of columns to show
 * @returns {string[]}
 */
export function columnNames(inspection, separator, width) {
  const char = SEPARATORS[separator]?.char ?? ',';
  const fromHeader = inspection.separator === separator ? inspection.header : [];
  return Array.from({ length: width }, (_, i) => (fromHeader[i] ?? '').trim() || String.fromCharCode(65 + (i % 26)));
}

/**
 * The field each column most likely holds, from the file's column names (the desktop does the same with
 * its own names); a field is given to one column only. An empty string for a column that is not known.
 * @param {string[]} names the column names
 * @param {'samples'|'dives'} kind
 * @returns {string[]}
 */
export function guessMapping(names, kind) {
  /** @type {Set<string>} */
  const used = new Set();
  const table = /** @type {Record<string, string[]>} */ (SYNONYMS[kind]);
  return names.map((name) => {
    const n = normaliseName(name);
    if (!n) return '';
    const key = Object.keys(table).find((k) => !used.has(k) && table[k].includes(n));
    if (!key) return '';
    used.add(key);
    return key;
  });
}

/**
 * The columns a known format fills in advance, as the desktop dialog does (CSVApps).
 * @param {'seabear'|'sensus'|'poseidon'} known
 * @param {number} width the number of columns of the file
 * @param {string[]} [names] the column names of the file (Seabear gives its own)
 * @returns {{ kind: 'samples', separator: number, mapping: string[], template?: string }}
 */
export function knownMapping(known, width, names = []) {
  /** @type {string[]} */
  const mapping = Array.from({ length: width }, () => '');
  if (known === 'seabear') {
    /** @type {Record<string, string>} */
    const byName = { Time: 'time', Depth: 'depth', Temperature: 'temp', NDT: 'ndl', TTS: 'tts', pO2_1: 'sensor1', pO2_2: 'sensor2', pO2_3: 'sensor3', 'Tank pressure': 'pressure' };
    names.forEach((n, i) => {
      if (i < width) mapping[i] = byName[n.trim()] ?? '';
    });
    // The fixed layout of the older files, when the names say nothing.
    if (!mapping.some(Boolean)) Object.assign(mapping, { 0: 'time', 1: 'depth', 5: 'temp', 2: 'ndl' });
    return { kind: 'samples', separator: 2, mapping };
  }
  if (known === 'sensus') {
    mapping[9] = 'time';
    mapping[10] = 'depth';
    if (width > 11) mapping[11] = 'temp';
    return { kind: 'samples', separator: 1, mapping, template: 'SensusCSV' };
  }
  // Poseidon MkVI: the .csv rows are « time, type, value »; depth is type 8 (see the table's rows below).
  mapping[0] = 'time';
  if (width > 1) mapping[1] = 'depth';
  return { kind: 'samples', separator: 1, mapping };
}

/**
 * The rows of a Poseidon MkVI .csv the table shows: only the depth readings (type 8), without the type
 * column, as the desktop dialog shows them.
 * @param {string[][]} rows
 * @returns {string[][]}
 */
export function poseidonRows(rows) {
  return rows.filter((r) => r.length >= 3 && r[1] === '8').map((r) => [r[0], ...r.slice(2)]);
}

/**
 * The guess of the date format from a date as the file writes it (the desktop's own rule): a dash is year-first,
 * a slash month-first, else day-first with dots.
 * @param {string} date
 * @returns {number} 0: dd.mm.yyyy, 1: mm/dd/yyyy, 2: yyyy-mm-dd
 */
export function guessDateFormat(date) {
  if (date.includes('-')) return 2;
  if (date.includes('/')) return 1;
  return 0;
}

/**
 * @param {string} duration a duration as the file writes it
 * @returns {number} 0: seconds, 1: minutes, 2: minutes:seconds
 */
export function guessDurationFormat(duration) {
  return duration.includes(':') ? 2 : 1;
}

/**
 * The date and the time the stylesheets take for a dive whose file gives none: `YYYYMMDD`, and `1HHMM` (the
 * leading 1 keeps the leading zero of the hour, which a number would lose).
 * @param {string} local `YYYY-MM-DDTHH:mm`
 * @returns {{ date: string, time: string }}
 */
export function diveDateParams(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return { date: '', time: '' };
  return { date: `${m[1]}${m[2]}${m[3]}`, time: `1${m[4]}${m[5]}` };
}

/**
 * What the second step holds.
 * @typedef {{
 *   kind: 'samples'|'dives',
 *   known: 'seabear'|'poseidon'|'sensus'|null,
 *   mapping: string[],
 *   separator: number,
 *   units: 0|1,
 *   dateFormat: number,
 *   durationFormat: number,
 *   diveDate: string,
 *   seabearHw: string,
 * }} CsvChoices
 */

/**
 * The mapping the core's import takes. A key the dive needs and the file does not give is -1. The dive's own
 * date and time (`date`, `time`) come first, as the stylesheets need, and only when no column holds the date.
 * @param {CsvChoices} choices
 * @returns {import('opendives-core').CsvParams}
 */
export function buildParams(choices) {
  const { kind, known, mapping } = choices;
  const columnOf = (/** @type {string} */ key) => mapping.indexOf(key);
  /** @type {import('opendives-core').CsvParams} */
  const params = { format: known === 'poseidon' ? 'poseidon' : known === 'seabear' ? 'seabear' : kind };
  if (known === 'poseidon') return params;
  if (known === 'sensus') {
    params.template = 'SensusCSV';
    params.separatorIndex = choices.separator;
    return params;
  }
  if (kind === 'samples' && columnOf('date') < 0) {
    const { date, time } = diveDateParams(choices.diveDate);
    if (date) {
      params.date = date;
      params.time = time;
    }
  }
  for (const field of FIELDS[kind]) params[field.param] = columnOf(field.key);
  params.separatorIndex = choices.separator;
  params.units = choices.units;
  if (kind === 'dives' || columnOf('date') >= 0) params.datefmt = choices.dateFormat;
  if (kind === 'dives') params.durationfmt = choices.durationFormat;
  if (known === 'seabear') params.hw = choices.seabearHw ? `Seabear ${choices.seabearHw}` : 'Seabear';
  return params;
}

/**
 * The date and the time a dive starts at, as `YYYY-MM-DDTHH:mm` in the device's time zone, from a file's
 * modification time: the date the second step proposes when the file gives none.
 * @param {number} millis
 * @returns {string}
 */
export function localDateTime(millis) {
  const d = new Date(millis);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The preview the core answers, ready for the third step.
 * @typedef {{ when: number, number: number, durationSeconds: number, maxDepthMm: number, profile: number[][] }} PreviewDive
 * @typedef {{ dives: PreviewDive[] }} CsvPreview
 */

/**
 * The summary line of the third step: the dives, the longest time, the greatest depth.
 * @param {CsvPreview} preview
 * @returns {{ dives: number, minutes: number, maxDepthMm: number }}
 */
export function previewTotals(preview) {
  const seconds = Math.max(0, ...preview.dives.map((d) => d.durationSeconds));
  return {
    dives: preview.dives.length,
    minutes: Math.round(seconds / 60),
    maxDepthMm: Math.max(0, ...preview.dives.map((d) => d.maxDepthMm)),
  };
}

/**
 * The points of a profile as an SVG path in a `width` × `height` box, the surface at the top and the greatest
 * depth at the bottom (the curve and its area of the third step).
 * @param {number[][]} profile pairs of seconds and millimetres
 * @param {number} width
 * @param {number} height
 * @returns {{ line: string, area: string }}
 */
export function profilePath(profile, width, height) {
  if (profile.length < 2) return { line: '', area: '' };
  const last = profile[profile.length - 1][0] || 1;
  const deepest = Math.max(1, ...profile.map((p) => p[1]));
  const points = profile.map(([s, mm]) => `${((s / last) * width).toFixed(1)} ${((mm / deepest) * height).toFixed(1)}`);
  const line = `M${points.join(' L')}`;
  return { line, area: `${line} L${width} 0 L0 0 Z` };
}

/**
 * The calls the steps make, with the staging of the files done by the caller: the preview is a dry run of the
 * core's import, the import adds the dives.
 * @typedef {{
 *   stage: (file: File) => Promise<string>,
 *   discard: (path: string) => Promise<unknown>,
 *   importCsv: (o: { path: string, companionPath?: string, name: string, params: import('opendives-core').CsvParams, dryRun: boolean }) => Promise<any>,
 * }} CsvCalls
 */

/**
 * Runs the core's import on the file with the mapping, once, staging and discarding the files around it.
 * @param {CsvCalls} calls
 * @param {{ file: File, companion: File|null, params: import('opendives-core').CsvParams, dryRun: boolean }} request
 * @returns {Promise<any>} the preview, or the import's result
 * @throws {Error} the plugin's error (IMPORT_FAILED, NO_DIVES…)
 */
export async function runCsvImport(calls, { file, companion, params, dryRun }) {
  const staged = [];
  try {
    const path = await calls.stage(file);
    staged.push(path);
    let companionPath = '';
    if (params.format === 'poseidon') {
      if (!companion) throw new Error('IMPORT_FAILED');
      companionPath = await calls.stage(companion);
      staged.push(companionPath);
    }
    return await calls.importCsv({ path, companionPath: companionPath || undefined, name: file.name, params, dryRun });
  } finally {
    for (const path of staged) await calls.discard(path).catch(() => {});
  }
}
