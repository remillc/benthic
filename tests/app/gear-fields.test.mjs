// The form of a piece adapts to its type (task 2026-11-19-309, point 1, docs/equipment-fields.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SPECS, detailFields, derivedName, detailProblems, detailsToKeep, parseStampText, stampText, detailRows, isNamedByHand, hasPurchaseDate } from '../../app/src/lib/gear-fields.js';
import { GEAR_TYPES } from '../../app/src/lib/inventory.js';

const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(fs.readFileSync(new URL(`../../app/src/i18n/${l}.json`, import.meta.url), 'utf8'))]));
const at = (/** @type {any} */ o, /** @type {string} */ path) => path.split('.').reduce((n, k) => n?.[k], o);

test('every equipment type has a form', () => {
  for (const type of GEAR_TYPES) assert.ok(SPECS[type], type);
});

test('the fields of the two examples of the mock-ups: the cylinder and the suit', () => {
  const cylinder = detailFields('cylinder');
  assert.deepEqual([...cylinder.before, ...cylinder.after].map((f) => f.key), ['cylinderType', 'material', 'valve', 'o2Clean', 'lastInspection', 'lastHydro']);
  assert.equal(isNamedByHand('cylinder'), true);
  assert.equal(SPECS.cylinder.photo, undefined, 'no photo is asked for a cylinder');
  const suit = detailFields('suit');
  assert.deepEqual(suit.after.map((f) => f.key), ['suitType', 'thickness', 'size', 'material']);
  assert.deepEqual(suit.after[0].options, ['wet', 'semi', 'dry']);
  assert.equal(SPECS.suit.photo, undefined, 'a suit has no photo');
  assert.equal(SPECS.suit.serial, true, 'the serial number of a suit is optional, not absent');
});

test('the fields of each type follow docs/equipment-fields.md', () => {
  const keys = (/** @type {any} */ type) => [...detailFields(type).before, ...detailFields(type).after].map((f) => f.key);
  assert.deepEqual(keys('regulator'), ['serialSecond', 'connection', 'secondStages', 'nitrox', 'coldWater']);
  assert.deepEqual(keys('undersuit'), ['size']);
  assert.deepEqual(keys('bcd'), ['bcdType', 'lift', 'weightCapacity', 'size']);
  assert.deepEqual(keys('light'), ['lumens', 'battery', 'burnTime']);
  assert.deepEqual(keys('weights'), ['weightsType']);
  assert.deepEqual(keys('mask'), ['corrective']);
  assert.deepEqual(keys('fins'), ['finType', 'size']);
  assert.deepEqual(keys('scooter'), []);
  assert.deepEqual(keys('camera'), []);
  assert.deepEqual(keys('dsmb'), ['lift']);
  assert.deepEqual(keys('floatBuoy'), []);
  assert.deepEqual(keys('knife'), []);
  assert.deepEqual(SPECS.diveKnife, SPECS.knife, 'a knife has the same fields as a line cutter');
  assert.deepEqual(SPECS.compass, { brand: true });
  assert.deepEqual(keys('other'), ['typeName']);
  // Photo: the types of the document that list one.
  for (const type of ['computer', 'regulator', 'bcd', 'light', 'scooter', 'camera', 'other']) assert.equal(SPECS[type].photo, true, type);
  for (const type of ['suit', 'undersuit', 'cylinder', 'weights', 'mask', 'fins', 'dsmb', 'floatBuoy', 'knife', 'diveKnife', 'compass']) assert.ok(!SPECS[type].photo, type);
  // The types without a brand are named by hand.
  for (const type of ['cylinder', 'weights', 'other']) assert.equal(isNamedByHand(type), true, type);
  assert.equal(isNamedByHand('mask'), false);
});

test('every label, hint and option the forms show exists in French and English', () => {
  for (const lang of ['fr', 'en']) {
    const catalog = langs[lang];
    for (const type of GEAR_TYPES) {
      for (const root of ['gear.pieceNew.tile', 'gear.inventory.type', 'gear.inventory.typePlural']) {
        if (type === 'computer' && root.endsWith('typePlural')) continue;
        assert.ok(at(catalog, `${root}.${type}`), `${lang} ${root}.${type}`);
      }
      const { before, after, late } = detailFields(type);
      for (const f of [...before, ...after, ...late]) {
        assert.ok(at(catalog, `gear.field.${f.key}`), `${lang} gear.field.${f.key}`);
        if (f.hint) assert.ok(at(catalog, `gear.fieldHint.${f.key}`), `${lang} gear.fieldHint.${f.key}`);
        for (const o of f.options ?? []) assert.ok(at(catalog, `gear.fieldOption.${f.key}.${o}`), `${lang} gear.fieldOption.${f.key}.${o}`);
      }
    }
  }
});

test('the type is the only required field: nothing typed names the piece by its type', () => {
  assert.equal(derivedName({}, 'Masque'), 'Masque');
  assert.equal(derivedName({ brand: ' Cressi ', model: 'Big Eyes' }, 'Masque'), 'Cressi Big Eyes');
  assert.equal(derivedName({ brand: '', model: 'Evo' }, 'Palmes'), 'Evo');
  assert.deepEqual(detailProblems('mask', {}), {});
});

test('numbers, dates and the stamped date are checked', () => {
  assert.deepEqual(detailProblems('regulator', { secondStages: 'x' }), { secondStages: 'number' });
  assert.deepEqual(detailProblems('regulator', { secondStages: '2' }), {});
  assert.deepEqual(detailProblems('light', { lumens: '1 000' }), { lumens: 'number' });
  assert.deepEqual(detailProblems('cylinder', { lastInspection: '2025-02-30' }), { lastInspection: 'date' });
  assert.deepEqual(detailProblems('cylinder', { lastInspection: '2025-10-02' }), {});
  assert.deepEqual(detailProblems('cylinder', {}, { stampText: '13/22' }), { lastHydro: 'stamp' });
  assert.deepEqual(detailProblems('cylinder', {}, { stampText: '03/22' }), {});
  assert.equal(parseStampText('03/22'), '2022-03-01');
  assert.equal(parseStampText('3/2022'), '2022-03-01');
  assert.equal(parseStampText('mars 2022'), null);
  assert.equal(stampText('2022-03-01'), '03/22');
});

test('what is kept: the fields of the type, the unknown keys of the file, not another type\'s', () => {
  const kept = detailsToKeep('mask', { corrective: 'yes', suitType: 'dry', size: ' ' }, { futureField: 'x', suitType: 'wet' });
  assert.deepEqual(kept, { futureField: 'x', corrective: 'yes' });
  assert.deepEqual(detailsToKeep('knife', {}), {});
});

test('the rows of a piece\'s sheet: the type\'s own fields in the order of the form, empty ones left out', () => {
  const text = { label: (/** @type {string} */ k) => `L:${k}`, option: (/** @type {string} */ k, /** @type {string} */ id) => `O:${k}.${id}`, yes: 'Oui', date: (/** @type {string} */ d) => `D:${d}` };
  assert.deepEqual(detailRows('cylinder', { material: 'steel', o2Clean: 'yes', lastInspection: '2025-10-02', lastHydro: '2022-03-01', cylinderType: 'AL80' }, text), [
    { label: 'L:cylinderType', value: 'AL80' },
    { label: 'L:material', value: 'O:material.steel' },
    { label: 'L:o2Clean', value: 'Oui' },
    { label: 'L:lastInspection', value: 'D:2025-10-02' },
    { label: 'L:lastHydro', value: '03/22' },
  ]);
  assert.deepEqual(detailRows('mask', undefined, text), []);
});

test('a rebreather (Recycleur): its last service comes after the purchase date and is kept; the O₂ cells are no longer its fields (task 397)', () => {
  assert.equal(GEAR_TYPES[GEAR_TYPES.indexOf('cylinder') + 1], 'rebreather', 'right after the bottle');
  const { before, after, late } = detailFields('rebreather');
  assert.deepEqual([before, after], [[], []]);
  assert.deepEqual(late.map((f) => [f.key, f.kind]), [['lastService', 'date']]);
  assert.deepEqual([SPECS.rebreather.brand, SPECS.rebreather.serial, SPECS.rebreather.photo, SPECS.rebreather.serialHint], [true, true, true, 'rebreather']);
  assert.deepEqual(detailsToKeep('rebreather', { lastService: '2025-11-08', thickness: '5' }), { lastService: '2025-11-08' });
  assert.deepEqual(detailProblems('rebreather', { lastService: '08/11' }), { lastService: 'date' });
  assert.deepEqual(detailRows('rebreather', { lastService: '2025-11-08' }, { label: (k) => k, option: (k, o) => o, yes: 'yes', date: (d) => d }), [{ label: 'lastService', value: '2025-11-08' }]);
  // The dates of the old fields stay in the file of a rebreather that still holds them (unknown keys are kept, never shown).
  assert.deepEqual(detailsToKeep('rebreather', { lastService: '2025-11-08' }, { o2CellsOn: '2026-03-14', o2CellsMadeOn: '2025-06-10' }), { o2CellsOn: '2026-03-14', o2CellsMadeOn: '2025-06-10', lastService: '2025-11-08' });
  assert.deepEqual(detailRows('rebreather', { o2CellsOn: '2026-03-14' }, { label: (k) => k, option: (k, o) => o, yes: 'yes', date: (d) => d }), []);
});

test('the O₂ cells (task 397): after the rebreather, brand, number, the two dates; no model, serial, photo or purchase date', () => {
  assert.equal(GEAR_TYPES[GEAR_TYPES.indexOf('rebreather') + 1], 'o2Cells', 'right after the rebreather');
  const { before, after, late } = detailFields('o2Cells');
  assert.deepEqual(before, []);
  assert.deepEqual(after.map((f) => [f.key, f.kind, !!f.hint]), [['cellsNumber', 'text', true]]);
  assert.deepEqual(late.map((f) => [f.key, f.kind]), [['cellsMadeOn', 'date'], ['cellsInstalledOn', 'date']]);
  assert.deepEqual([SPECS.o2Cells.brand, SPECS.o2Cells.brandOnly, SPECS.o2Cells.serial, SPECS.o2Cells.photo, SPECS.o2Cells.named], [true, true, undefined, undefined, undefined]);
  assert.equal(hasPurchaseDate('o2Cells'), false);
  assert.ok(['rebreather', 'regulator', 'other'].every((t) => hasPurchaseDate(/** @type {any} */ (t))));
  assert.deepEqual(detailProblems('o2Cells', { cellsInstalledOn: '14/03' }), { cellsInstalledOn: 'date' });
  assert.deepEqual(detailsToKeep('o2Cells', { cellsNumber: ' 7 ', cellsMadeOn: '2025-12-15', lastService: '2025-01-01' }), { cellsNumber: '7', cellsMadeOn: '2025-12-15' });
  for (const l of ['fr', 'en']) for (const k of ['cellsNumber', 'cellsMadeOn', 'cellsInstalledOn']) assert.ok(at(langs[l], 'gear.field.' + k), l + ' ' + k);
  assert.equal(langs.fr.gear.fieldHint.cellsNumber, 'Sur l’étiquette de la cellule');
  assert.equal(langs.fr.gear.pieceNew.tile.o2Cells, 'Cellules O₂');
});

test('task 334: the cylinder has a brand after its name, the three types lose their fields, a rebreather has a manufacture date', () => {
  assert.equal(SPECS.cylinder.brand, true);
  assert.equal(SPECS.cylinder.brandOnly, true, 'brand without model');
  assert.equal(SPECS.cylinder.named, true, 'the typed name stays');
  const keys = (/** @type {any} */ type) => [...detailFields(type).before, ...detailFields(type).after, ...detailFields(type).late].map((f) => f.key);
  assert.deepEqual(keys('scooter'), []);
  assert.deepEqual(keys('camera'), []);
  assert.deepEqual(keys('floatBuoy'), []);
  assert.deepEqual(keys('rebreather'), ['lastService']);
  assert.equal(detailProblems('rebreather', { lastService: '2026-02-30' }).lastService, 'date');
});

test('task 334: a removed field\'s saved value stays in the file, not shown, while the piece keeps its type', () => {
  const stored = { battery: '12 Ah', burnTime: '3 h', speed: '2,5 km/h', note2: 'x' };
  assert.deepEqual(detailsToKeep('scooter', {}, stored), stored);
  assert.deepEqual(detailsToKeep('camera', {}, { housingDepth: '60 m' }), { housingDepth: '60 m' });
  assert.deepEqual(detailsToKeep('floatBuoy', { colour: '' }, { colour: 'orange' }), { colour: 'orange' });
  assert.deepEqual(detailRows('scooter', stored, { label: (k) => k, option: (k, i) => i, yes: 'yes', date: (d) => d }), [], 'nothing shown');
  // Changed to a lamp: the lamp's own fields win, the typed value of the form replaces the stored one.
  assert.deepEqual(detailsToKeep('light', { battery: 'new' }, stored, 'scooter'), { battery: 'new', note2: 'x', speed: '2,5 km/h' });
});

test('task 334: the new labels exist in French and English', () => {
  for (const l of ['fr', 'en']) {
    assert.ok(!at(langs[l], 'gear.field.o2CellsMadeOn') && !at(langs[l], 'gear.field.o2CellsOn'), l);
    assert.ok(!at(langs[l], 'gear.field.speed') && !at(langs[l], 'gear.field.housingDepth') && !at(langs[l], 'gear.field.colour'), l);
  }
  assert.equal(langs.fr.maintenance.reminderCard.suggestRebreather, 'Suggéré pour un recycleur : révision chaque année');
});
