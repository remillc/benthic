// Importing a CSV file (task 2026-11-16-224, part 8): reading the file, guessing the columns, the mapping the core's
// import takes, and the three steps of the dialog.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FIELDS,
  KNOWN_FORMATS,
  SEPARATORS,
  buildParams,
  diveDateParams,
  guessDateFormat,
  guessMapping,
  guessSeparator,
  inspectCsv,
  isCsvName,
  knownMapping,
  normaliseName,
  pickCsvFiles,
  previewTotals,
  profilePath,
  runCsvImport,
  splitCells,
} from '../../app/src/lib/csv-import.js';
import {
  back,
  canNext,
  columnCount,
  createState,
  names,
  needsDiveDate,
  needsFormats,
  next,
  paramsOf,
  rows_,
  setColumn,
  setKind,
  setKnown,
  setSeparator,
} from '../../app/src/lib/csv-dialog.js';

const text = (url) => readFileSync(url, 'utf8').split(String.fromCharCode(13)).join('');
const src = (path) => text(new URL(`../../app/src/${path}`, import.meta.url));

// Lines of Subsurface's own samples (third_party/subsurface/dives/), shortened.
const TEST41 = '#Nr,date,time,duration,maxdepth,avgdepth,buddy,suit,notes\n1,10/1/13,10:34,45:00,18,16,"Dirk, Linus","wet, 5mm","nice dive"\n2,10/1/13,12:13,41:00,16.2,13.5,Linus,"wet, 3mm","x"\n';
const SENSUS = '1,SU-10000,0023469553,2011,3,27,11,25,29,0,1214,287,67\n1,SU-10000,0023469553,2011,3,27,11,25,29,10,1507,287,69\n';
const BARE = 'time,depth,temp,batt,pressure\n0:00,0.0,24,98,200\n0:10,1.4,24,98,199\n0:20,3.2,23,97,198\n';
const SEABEAR_H3 = [
  '/* SEABEAR DIVING TECHNOLOGY',
  ' */',
  '//SEABEAR DIVING TECHNOLOGY',
  '//DIVE NR: 2',
  '//Hardware Version: H3',
  '//Firmware Version: 1.31',
  '//Serial number: 0',
  '//2012.10.01 06:22:30',
  '//Surface pressure: 0.970 bar',
  '//DIVE LOG Version: 1.01',
  '//Log interval: 5 s',
  '//Mode: CCR',
  '',
  'Depth;NDT;TTS;Ceiling;Temperature',
  '1;1;1;1;1',
  '0;1;2;3;4',
  '',
  '1.0;0;0;0;29',
  '2.5;',
  '4.0;',
].join('\n');
const SEABEAR_HUDC = [
  '/* This file was given to Subsurface under the GPLv2',
  ' * by Seabear Diving Technology.',
  ' */',
  '',
  '//SEABEAR DIVING TECHNOLOGY',
  '//DIVE NR: 26',
  '//Hardware Version: HUDC',
  '//Firmware Version: 1.06',
  '//Serial number: 130010',
  '//2014.07.10 08:46:10',
  '//Surface pressure: 0.9665 bar',
  '',
  'Time;Depth;NDT;TTS;Ceiling;Temperature;Tank pressure',
  '1;1;1;1;1;1;1',
  '0;1;2;3;4;5;6',
  '',
  '1;1.2;200;0;0;25;199',
  '6;2.7;200;0;0;25;198',
].join('\n');

test('a .csv or .tsv is a CSV file, and the .txt of the same name goes with it', () => {
  assert.ok(isCsvName('Dives.CSV'));
  assert.ok(isCsvName('test41.tsv'));
  assert.ok(!isCsvName('dives.ssrf'));
  const file = (name) => ({ name });
  const picked = pickCsvFiles([file('Poseidon_MkVILog.txt'), file('Poseidon_MkVILog.csv'), file('other.txt')]);
  assert.equal(picked.csv.name, 'Poseidon_MkVILog.csv');
  assert.equal(picked.companion.name, 'Poseidon_MkVILog.txt');
  assert.equal(pickCsvFiles([file('a.csv'), file('b.txt')]).companion, null);
  assert.equal(pickCsvFiles([file('a.ssrf')]), null);
});

test('cells are cut with quotes honoured; the separator is the one that occurs most', () => {
  assert.deepEqual(splitCells('1,10/1/13,"Dirk, Linus","say ""hi"""', ','), ['1', '10/1/13', 'Dirk, Linus', 'say "hi"']);
  assert.deepEqual(splitCells('a;b;;c', ';'), ['a', 'b', '', 'c']);
  assert.equal(guessSeparator('a;b;c;d'), 2);
  assert.equal(guessSeparator('a\tb\tc'), 0);
  assert.equal(guessSeparator('a|b|c'), 3);
  assert.equal(guessSeparator('abc'), 1, 'a comma when none stands out');
  assert.equal(guessSeparator('a,b;c'), 1, 'a tie is a comma');
  assert.deepEqual(SEPARATORS.map((s) => s.index), [0, 1, 2, 3]);
});

test('a header names whole dives or a profile; the lines are counted without it', () => {
  const dives = inspectCsv(TEST41, 'test41.csv');
  assert.equal(dives.kind, 'dives');
  assert.equal(dives.known, null);
  assert.equal(dives.separator, 1);
  assert.equal(dives.columnCount, 9);
  assert.equal(dives.lineCount, 2);
  assert.deepEqual(dives.header.slice(0, 3), ['#Nr', 'date', 'time']);
  const profile = inspectCsv(BARE, 'plongees-2024.csv');
  assert.equal(profile.kind, 'samples');
  assert.equal(profile.columnCount, 5);
  assert.equal(profile.lineCount, 3);
  const headless = inspectCsv('0,0.0\n10,1.4\n', 'x.csv');
  assert.deepEqual(headless.header, []);
  assert.equal(headless.lineCount, 2);
});

test('the columns are guessed from their names, a field in one column only', () => {
  const dives = inspectCsv(TEST41, 'test41.csv');
  assert.deepEqual(guessMapping(dives.header, 'dives'), ['number', 'date', 'start', 'duration', 'maxDepth', 'avgDepth', 'buddy', 'suit', 'notes']);
  const profile = inspectCsv(BARE, 'bare.csv');
  assert.deepEqual(guessMapping(profile.header, 'samples'), ['time', 'depth', 'temp', '', 'pressure']);
  assert.deepEqual(guessMapping(['Time', 'Time'], 'samples'), ['time', '']);
  assert.equal(normaliseName('Depth (m)'), 'depth');
  assert.equal(normaliseName('PPO2 - Setpoint (Bar)'), 'ppo2setpoint');
  assert.equal(guessDateFormat('2024-03-12'), 2);
  assert.equal(guessDateFormat('10/1/13'), 1);
  assert.equal(guessDateFormat('12.03.2024'), 0);
});

test('known formats: Seabear (its header, its columns, its date), Sensus, Poseidon MkVI', () => {
  const h3 = inspectCsv(SEABEAR_H3, 'TestDiveSeabearH3_0002SBDT.CSV');
  assert.equal(h3.known, 'seabear');
  assert.equal(h3.separator, 2);
  assert.deepEqual(h3.seabear, { hw: 'H3', delta: '5', date: '2012-10-01T06:22' });
  assert.deepEqual(h3.header, ['Depth', 'NDT', 'TTS', 'Ceiling', 'Temperature']);
  assert.equal(h3.lineCount, 3);
  assert.deepEqual(knownMapping('seabear', 5, h3.header).mapping, ['depth', 'ndl', 'tts', '', 'temp']);
  const hudc = inspectCsv(SEABEAR_HUDC, 'TestDiveSeabearHUDC.csv');
  assert.equal(hudc.known, 'seabear');
  assert.equal(hudc.seabear.delta, '', 'the older files have no log interval');
  assert.equal(hudc.seabear.date, '2014-07-10T08:46');
  assert.deepEqual(knownMapping('seabear', 7, hudc.header).mapping, ['time', 'depth', 'ndl', 'tts', '', 'temp', 'pressure']);
  const sensus = inspectCsv(SENSUS, 'TestSensusSingle.csv');
  assert.equal(sensus.known, 'sensus');
  assert.equal(sensus.lineCount, 2);
  assert.equal(knownMapping('sensus', 13).mapping[9], 'time');
  assert.equal(knownMapping('sensus', 13).mapping[10], 'depth');
  assert.equal(knownMapping('sensus', 13).template, 'SensusCSV');
  assert.deepEqual([...KNOWN_FORMATS], ['seabear', 'poseidon', 'sensus']);
});

test('the dive date is passed as the stylesheets want it, with a 1 before the time', () => {
  assert.deepEqual(diveDateParams('2024-03-12T09:40'), { date: '20240312', time: '10940' });
  assert.deepEqual(diveDateParams('2012-10-01T00:05'), { date: '20121001', time: '10005' });
  assert.deepEqual(diveDateParams(''), { date: '', time: '' });
});

/** The state of a bare profile file with its guessed columns. */
const bareState = () => createState(inspectCsv(BARE, 'bare.csv'), { lastModified: Date.UTC(2024, 2, 12, 9, 40) });

test('the mapping of a profile: every field has its column or -1, the date first, the separator and the units', () => {
  const state = bareState();
  state.diveDate = '2024-03-12T09:40';
  const params = paramsOf(state);
  assert.deepEqual(Object.keys(params).slice(0, 3), ['format', 'date', 'time'], 'the dive date comes first');
  assert.equal(params.format, 'samples');
  assert.equal(params.date, '20240312');
  assert.equal(params.time, '10940');
  assert.equal(params.timeField, 0);
  assert.equal(params.depthField, 1);
  assert.equal(params.tempField, 2);
  assert.equal(params.pressureField, 4);
  assert.equal(params.cnsField, -1);
  assert.equal(params.dateField, -1);
  assert.equal(params.separatorIndex, 1);
  assert.equal(params.units, 0);
  for (const field of FIELDS.samples) assert.ok(field.param in params, field.param);
  setColumn(state, 3, 'depth');
  assert.equal(state.mapping[1], '', 'a field is held by one column: the first one lets go');
  assert.equal(paramsOf(state).depthField, 3);
});

test('the mapping of whole dives, as Subsurface\'s own test of test41.csv gives it', () => {
  const state = createState(inspectCsv(TEST41, 'test41.csv'), { lastModified: 0 });
  assert.equal(state.kind, 'dives');
  assert.equal(state.dateFormat, 1, 'a slash is month first');
  assert.equal(state.durationFormat, 2, 'a colon is minutes:seconds');
  const params = paramsOf(state);
  assert.equal(params.format, 'dives');
  assert.equal(params.numberField, 0);
  assert.equal(params.dateField, 1);
  assert.equal(params.timeField, 2);
  assert.equal(params.durationField, 3);
  assert.equal(params.maxDepthField, 4);
  assert.equal(params.meanDepthField, 5);
  assert.equal(params.buddyField, 6);
  assert.equal(params.suitField, 7);
  assert.equal(params.notesField, 8);
  assert.equal(params.locationField, -1);
  assert.equal(params.separatorIndex, 1);
  assert.equal(params.datefmt, 1);
  assert.equal(params.durationfmt, 2);
  assert.ok(!('date' in params), 'a dive per line has its own dates');
});

test('known formats give the core their own format: Seabear (and the hardware name), Poseidon, Sensus', () => {
  const h3 = createState(inspectCsv(SEABEAR_H3, 'h3.csv'), { lastModified: 0 });
  assert.equal(h3.known, 'seabear');
  const p = paramsOf(h3);
  assert.equal(p.format, 'seabear');
  assert.equal(p.hw, 'Seabear H3');
  assert.equal(p.separatorIndex, 2);
  assert.equal(p.date, '20121001');
  assert.equal(p.time, '10622');
  const sensus = createState(inspectCsv(SENSUS, 's.csv'), { lastModified: 0 });
  assert.deepEqual(paramsOf(sensus), { format: 'samples', template: 'SensusCSV', separatorIndex: 1 });
  const poseidon = createState(inspectCsv('0,8,20\n10,8,40\n10,6,500\n', 'Poseidon_MkVILog.csv'), { lastModified: 0, hasCompanion: true });
  setKnown(poseidon, 'poseidon');
  assert.deepEqual(paramsOf(poseidon), { format: 'poseidon' });
  assert.deepEqual(rows_(poseidon), [['0', '20'], ['10', '40']], 'only the depth readings, without the type column');
});

test('the steps: type, columns, preview; « Suivant » waits for what the import needs', () => {
  const state = bareState();
  assert.equal(state.step, 1);
  assert.ok(canNext(state));
  next(state);
  assert.equal(state.step, 2);
  setColumn(state, 1, '');
  assert.ok(!canNext(state), 'no depth: no preview');
  next(state);
  assert.equal(state.step, 2);
  setColumn(state, 1, 'depth');
  assert.ok(canNext(state));
  next(state);
  assert.equal(state.step, 3);
  assert.equal(state.preview, null);
  assert.ok(!canNext(state), 'the last step ends with « Ajouter au carnet »');
  back(state);
  assert.equal(state.step, 2);
  back(state);
  assert.equal(state.step, 1);
  back(state);
  assert.equal(state.step, 1);
});

test('Poseidon needs its .txt: « Suivant » is off without it', () => {
  const state = createState(inspectCsv('0,8,20\n', 'p.csv'), { lastModified: 0 });
  setKnown(state, 'poseidon');
  assert.ok(!canNext(state));
  state.hasCompanion = true;
  assert.ok(canNext(state));
});

test('the kind of line, the known format and the separator re-fill the columns', () => {
  const state = createState(inspectCsv(TEST41, 'test41.csv'), { lastModified: 0 });
  setKind(state, 'samples');
  assert.equal(state.kind, 'samples');
  assert.equal(state.mapping.indexOf('maxDepth'), -1, 'the fields are those of a profile now');
  setKind(state, 'dives');
  assert.equal(state.mapping[4], 'maxDepth');
  setSeparator(state, 2);
  assert.equal(columnCount(state), 9);
  assert.equal(names(state).length, 9);
  assert.deepEqual(rows_(state)[0].length, 1, 'cut with a semicolon the line is one cell');
  setKnown(state, null);
  assert.equal(state.known, null);
  const sensus = createState(inspectCsv(SENSUS, 's.csv'), { lastModified: 0 });
  setKnown(sensus, null);
  assert.equal(sensus.mapping[9], '', 'no known format: the columns are not guessed from numbers');
  setKnown(sensus, 'sensus');
  assert.equal(sensus.separator, 1);
  assert.equal(sensus.mapping[9], 'time');
  assert.equal(sensus.mapping[10], 'depth');
});

test('the date is asked for only when the file does not give it', () => {
  const profile = bareState();
  assert.ok(needsDiveDate(profile));
  assert.deepEqual(needsFormats(profile), { date: false, duration: false });
  assert.equal(profile.diveDate, '2024-03-12T' + profile.diveDate.slice(11), 'the file\'s own day is proposed');
  setColumn(profile, 0, 'date');
  assert.ok(!needsDiveDate(profile));
  assert.equal(needsFormats(profile).date, true);
  const dives = createState(inspectCsv(TEST41, 't.csv'), { lastModified: 0 });
  assert.ok(!needsDiveDate(dives));
  assert.deepEqual(needsFormats(dives), { date: true, duration: true });
  const seabear = createState(inspectCsv(SEABEAR_HUDC, 'h.csv'), { lastModified: 0 });
  assert.ok(!needsDiveDate(seabear), 'Seabear writes the date in its header');
  assert.equal(seabear.diveDate, '2014-07-10T08:46');
  assert.equal(needsDiveDate(createState(inspectCsv(SENSUS, 's.csv'), { lastModified: 0 })), false);
});

test('the preview: totals, and a profile drawn from the surface down', () => {
  const preview = { dives: [{ when: 0, number: 0, durationSeconds: 2460, maxDepthMm: 18300, profile: [[0, 0], [600, 18300], [1200, 9000]] }, { when: 0, number: 0, durationSeconds: 600, maxDepthMm: 9000, profile: [] }] };
  assert.deepEqual(previewTotals(preview), { dives: 2, minutes: 41, maxDepthMm: 18300 });
  const { line, area } = profilePath(preview.dives[0].profile, 1000, 150);
  assert.equal(line, 'M0.0 0.0 L500.0 150.0 L1000.0 73.8');
  assert.ok(area.endsWith('L1000 0 L0 0 Z'));
  assert.deepEqual(profilePath([[0, 0]], 1000, 150), { line: '', area: '' });
});

test('the core is called with the staged files, which are discarded after, whatever happens', async () => {
  const log = [];
  const calls = {
    stage: async (f) => (log.push(`stage ${f.name}`), `/cache/${f.name}`),
    discard: async (p) => void log.push(`discard ${p}`),
    importCsv: async (o) => (log.push(`import ${o.path} ${o.companionPath ?? '-'} ${o.dryRun}`), { dives: [] }),
  };
  const csv = { name: 'a.csv' };
  const txt = { name: 'a.txt' };
  await runCsvImport(calls, { file: csv, companion: null, params: { format: 'samples' }, dryRun: true });
  assert.deepEqual(log, ['stage a.csv', 'import /cache/a.csv - true', 'discard /cache/a.csv']);
  log.length = 0;
  await runCsvImport(calls, { file: csv, companion: txt, params: { format: 'poseidon' }, dryRun: false });
  assert.deepEqual(log, ['stage a.csv', 'stage a.txt', 'import /cache/a.csv /cache/a.txt false', 'discard /cache/a.csv', 'discard /cache/a.txt']);
  log.length = 0;
  await assert.rejects(runCsvImport(calls, { file: csv, companion: null, params: { format: 'poseidon' }, dryRun: true }), /IMPORT_FAILED/);
  assert.deepEqual(log, ['stage a.csv', 'discard /cache/a.csv'], 'Poseidon without its .txt is refused, nothing is left behind');
  log.length = 0;
  const failing = { ...calls, importCsv: async () => { throw new Error('NO_DIVES'); } };
  await assert.rejects(runCsvImport(failing, { file: csv, companion: null, params: { format: 'samples' }, dryRun: true }), /NO_DIVES/);
  assert.deepEqual(log, ['stage a.csv', 'discard /cache/a.csv']);
});

test('the dialog is on both « Importer un fichier » paths, and CSV is in the list of formats', () => {
  const logbook = src('pages/Logbook.svelte');
  const steps = src('components/FirstLaunchSteps.svelte');
  for (const file of [logbook, steps]) {
    assert.match(file, /pickCsvFiles/);
    assert.match(file, /<CsvImportDialog/);
    assert.match(file, /<input type="file" multiple/);
  }
  assert.match(steps, /importCsvFile\(source\.file, source\.csv\.params, source\.csv\.companion\)/);
  assert.match(logbook, /importCsvFile\(chosen\.file, result\.params, result\.companion\)/);
});

test('the dialog texts exist in French and English, and the CSS follows the rules', () => {
  const keys = (obj, path = '') => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !('other' in v) ? keys(v, `${path}${k}.`) : [`${path}${k}`]));
  const fr = JSON.parse(src('i18n/fr.json'));
  const en = JSON.parse(src('i18n/en.json'));
  for (const group of ['csvImport', 'demoLogbook']) {
    assert.deepEqual(keys(fr[group]).sort(), keys(en[group]).sort(), group);
  }
  // Every field of a menu has its label.
  for (const kind of Object.values(FIELDS)) for (const f of kind) assert.ok(fr.csvImport.field[f.key], f.key);
  const dialog = src('components/CsvImportDialog.svelte');
  assert.doesNotMatch(dialog, /n: formatNumber/, 'a plural takes the number, not its text');
  assert.match(dialog, /\.od-csv-import--kind \{[^}]*cursor: pointer/s, 'the type cards have the hand pointer');
  assert.match(dialog, /\.od-csv-import--select select \{[^}]*cursor: pointer/s);
  assert.match(dialog, /\.od-csv-import--filled \{[\s\S]*?:hover:not\(:disabled\)/, 'a hover state on the main button');
  assert.doesNotMatch(dialog.slice(dialog.indexOf('<style>')), /#[0-9a-fA-F]{3,8}\b/, 'colours are variables, not values');
});
