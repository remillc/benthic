// Matching a dive's computer text to the image catalog (tasks 2026-11-19-302 and 303). The model strings are
// the ones of Subsurface's sample logs (third_party/subsurface/dives); the catalog is data/dive-computer-images.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelKey, findEntry, imageEntry, suggest } from '../../app/src/lib/dc-model.js';

const catalog = JSON.parse(readFileSync(new URL('../../data/dive-computer-images/catalog.json', import.meta.url), 'utf8'));
const slugOf = (model, vendor) => findEntry(catalog, model, vendor)?.slug ?? null;

test('modelKey ignores case, spacing, hyphens and reads + as plus', () => {
  assert.equal(modelKey('Shearwater  Perdix-AI'), modelKey('shearwater perdix ai'));
  assert.equal(modelKey('OSTC 3+'), modelKey('ostc 3 plus'));
  assert.notEqual(modelKey('OSTC 3'), modelKey('OSTC Plus'));
});

test('real model strings of the sample logs find their entry', () => {
  assert.equal(slugOf('Shearwater Petrel 3'), 'shearwater-petrel-3');
  assert.equal(slugOf('Shearwater Perdix 2'), 'shearwater-perdix-2');
  assert.equal(slugOf('Shearwater Petrel'), 'shearwater-petrel');
  assert.equal(slugOf('Heinrichs Weikamp OSTC 3'), 'heinrichs-weikamp-ostc-3');
  assert.equal(slugOf('Suunto EON Core'), 'suunto-eon-core');
  assert.equal(slugOf('Suunto Vyper Air'), 'suunto-vyper-air');
  assert.equal(slugOf('Uwatec Galileo Sol'), 'uwatec-galileo-sol');
  assert.equal(slugOf('SHEARWATER   perdix ai'), 'shearwater-perdix-ai');
});

test('a note in brackets is ignored; the product alone works when it is unique', () => {
  assert.equal(slugOf('Divesoft Freedom (Imported from file)'), 'divesoft-freedom');
  assert.equal(slugOf('Perdix AI'), 'shearwater-perdix-ai');
  assert.equal(slugOf('Perdix 2'), 'shearwater-perdix-2');
});

test('models that are not computers or not in the catalog give nothing', () => {
  for (const m of ['manually added dive', 'csv', 'planned dive', 'Uemis Zurich', 'Garmin Descent Mk2/Mk2i', 'Divecomputer 1', '', null, undefined]) {
    assert.equal(findEntry(catalog, m), null, String(m));
  }
  assert.equal(findEntry([], 'Shearwater Petrel'), null);
});

test('the vendor given apart narrows the match; imageEntry needs an image', () => {
  assert.equal(slugOf('Petrel 3', 'Shearwater'), 'shearwater-petrel-3');
  assert.equal(slugOf('Petrel 3', 'Suunto'), null);
  const bare = [{ vendor: 'A', product: 'B', slug: 'a-b', hasImage: false }];
  assert.equal(findEntry(bare, 'A B')?.slug, 'a-b');
  assert.equal(imageEntry(bare, 'A B'), null);
});

test('suggestions begin with what is typed, any case, else contain it', () => {
  const list = ['Perdix', 'Perdix 2', 'Petrel', 'Teric'];
  assert.deepEqual(suggest(list, 'per'), ['Perdix', 'Perdix 2']);
  assert.deepEqual(suggest(list, 'eric'), ['Teric']);
  assert.deepEqual(suggest(list, ''), list);
});

import { brandModels } from '../../app/src/lib/dc-model.js';

test('brands and models merge the core list and the catalog, once each, any brand spelling', () => {
  const { vendors, modelsOf } = brandModels(
    [{ vendor: 'Shearwater', products: [{ name: 'Perdix' }, { name: 'Petrel 3' }] }],
    [
      { vendor: 'SHEARWATER', product: 'perdix', slug: 'a', hasImage: true },
      { vendor: 'Shearwater', product: 'Teric', slug: 'b', hasImage: true },
      { vendor: 'Suunto', product: 'D5', slug: 'c', hasImage: true },
    ],
  );
  assert.deepEqual(vendors, ['Shearwater', 'Suunto']);
  assert.deepEqual(modelsOf('shearwater'), ['Perdix', 'Petrel 3', 'Teric']);
  assert.deepEqual(modelsOf('Unknown brand'), []);
});

test('sameComputer: brand, model and serial number must match (task 306)', async () => {
  const { sameComputer, serialKey } = await import('../../app/src/lib/dc-model.js');
  assert.equal(serialKey('0x00A1'), 'a1');
  const logbook = { model: 'Shearwater Perdix 2', serial: '4A21F7' };
  assert.equal(sameComputer({ name: 'Perdix', brand: 'Shearwater', model: 'Perdix 2', serial: '4a21f7' }, logbook), true);
  assert.equal(sameComputer({ name: 'Shearwater Perdix 2', computerModel: 'Shearwater Perdix 2', computerSerial: '4A21F7' }, logbook), true);
  assert.equal(sameComputer({ name: 'Shearwater Perdix 2', brand: 'Shearwater', model: 'Perdix 2', serial: '99' }, logbook), false);
  assert.equal(sameComputer({ name: 'Shearwater Perdix 2', brand: 'Shearwater', model: 'Perdix 2' }, logbook), false);
  assert.equal(sameComputer({ name: 'Shearwater Petrel 3', brand: 'Shearwater', model: 'Petrel 3', serial: '4A21F7' }, logbook), false);
});
