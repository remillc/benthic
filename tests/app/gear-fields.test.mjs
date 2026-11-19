// The form of a piece adapts to its type (task 2026-11-19-309, point 1, docs/equipment-fields.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SPECS, detailFields, derivedName, detailProblems, detailsToKeep, parseStampText, stampText, detailRows, isNamedByHand } from '../../app/src/lib/gear-fields.js';
import { GEAR_TYPES } from '../../app/src/lib/inventory.js';

const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(fs.readFileSync(new URL(`../../app/src/i18n/${l}.json`, import.meta.url), 'utf8'))]));
const at = (/** @type {any} */ o, /** @type {string} */ path) => path.split('.').reduce((n, k) => n?.[k], o);

test('every one of the 16 types has a form', () => {
  assert.equal(GEAR_TYPES.length, 16);
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
  assert.deepEqual(keys('scooter'), ['battery', 'burnTime', 'speed']);
  assert.deepEqual(keys('camera'), ['housingDepth']);
  assert.deepEqual(keys('dsmb'), ['lift']);
  assert.deepEqual(keys('floatBuoy'), ['colour']);
  assert.deepEqual(keys('knife'), []);
  assert.deepEqual(keys('other'), ['typeName']);
  // Photo: the types of the document that list one.
  for (const type of ['computer', 'regulator', 'bcd', 'light', 'scooter', 'camera', 'other']) assert.equal(SPECS[type].photo, true, type);
  for (const type of ['suit', 'undersuit', 'cylinder', 'weights', 'mask', 'fins', 'dsmb', 'floatBuoy', 'knife']) assert.ok(!SPECS[type].photo, type);
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
      const { before, after } = detailFields(type);
      for (const f of [...before, ...after]) {
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
