// Editing a dive in place in the desktop detail pane (tasks 2026-11-15-172, 184, 191, 183):
// what a field edit sends to the core, the recorded values refused, the keys of an edit, the
// chips choice and the tab remembered.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cylinderChanges,
  editKeyAction,
  fieldChanges,
  fieldValue,
  isEditable,
  listSuggestions,
  siteChoice,
  weightChanges,
  withItem,
  withoutItem,
} from '../../app/src/lib/desktop-edit.js';
import { DEFAULT_LAYERS, LAYER_KEY, readLayers, saveLayers, setLayer } from '../../app/src/lib/profile-layers.js';
import { TAB_KEY, readTab, saveTab, stepTab } from '../../app/src/lib/detail-tab.js';

const metric = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };
const imperial = { length: 'ft', temperature: 'F', pressure: 'psi', volume: 'cuft', weight: 'lbs' };

/** @returns {any} */
const dive = (extra = {}) => ({
  id: 5,
  site: 'Lake Coleridge',
  buddies: ['Michael'],
  guides: [],
  tags: ['wreck', 'weight-ok'],
  notes: 'Cold.',
  suit: 'Étanche',
  userSalinity: 10000,
  visibility: 3,
  rating: 0,
  surfacePressureMbar: 0,
  maxDepthMm: 39000,
  durationSeconds: 4680,
  waterTempMk: 277150,
  airTempMk: 0,
  manual: false,
  computer: 'Shearwater Perdix',
  weights: [{ description: 'belt', grams: 4000 }],
  cylinders: [
    { description: 'AL80', sizeMl: 11100, workingPressureMbar: 207000, startMbar: 232000, endMbar: 70000, o2Permille: 0, hePermille: 0, use: 'OC-gas', protected: true },
    { description: 'S40', sizeMl: 5700, workingPressureMbar: 207000, startMbar: 0, endMbar: 0, o2Permille: 800, hePermille: 0, use: 'OC-gas', protected: false },
  ],
  ...extra,
});

test('a field edit builds the changes of the phone editor', () => {
  assert.deepEqual(fieldChanges(dive(), 'suit', ' Humide ', metric), { ok: true, changes: { suit: 'Humide' } });
  assert.deepEqual(fieldChanges(dive(), 'notes', 'Cold.\nClear.', metric), { ok: true, changes: { notes: 'Cold.\nClear.' } });
  assert.deepEqual(fieldChanges(dive(), 'buddies', ['Michael', 'Juha'], metric), { ok: true, changes: { buddies: ['Michael', 'Juha'] } });
  assert.deepEqual(fieldChanges(dive(), 'guides', ['Ana'], metric), { ok: true, changes: { diveguide: ['Ana'] } });
  assert.deepEqual(fieldChanges(dive(), 'waterType', 'salt', metric), { ok: true, changes: { userSalinity: 10300 } });
  assert.deepEqual(fieldChanges(dive(), 'waterType', '', metric), { ok: true, changes: { userSalinity: 0 } });
  assert.deepEqual(fieldChanges(dive(), 'visibility', 5, metric), { ok: true, changes: { visibility: 5 } });
  assert.deepEqual(fieldChanges(dive(), 'surfacePressure', '1013', metric), { ok: true, changes: { surfacePressureMbar: 1013 } });
});

test('a value that did not change writes nothing', () => {
  assert.deepEqual(fieldChanges(dive(), 'suit', 'Étanche', metric), { ok: true, changes: null });
  assert.deepEqual(fieldChanges(dive(), 'buddies', ['Michael'], metric), { ok: true, changes: null });
  assert.deepEqual(fieldChanges(dive(), 'visibility', 3, metric), { ok: true, changes: null });
});

test('the weight feedback tag is kept when the tags change', () => {
  assert.deepEqual(fieldChanges(dive(), 'tags', ['wreck', 'night'], metric), { ok: true, changes: { tags: ['wreck', 'night', 'weight-ok'] } });
  assert.deepEqual(fieldValue(dive(), 'tags', metric), ['wreck']);
});

test('what the dive computer recorded is refused, unless the dive was logged by hand', () => {
  for (const key of ['maxDepth', 'duration', 'waterTemp', 'airTemp', 'startPressure', 'endPressure']) {
    assert.equal(isEditable(dive(), key), false, key);
    assert.deepEqual(fieldChanges(dive(), key, '12', metric), { ok: false, error: 'readonly' }, key);
  }
  assert.equal(isEditable(dive(), 'site'), true);
  assert.equal(isEditable(dive(), 'unknown'), false);
  const manual = dive({ manual: true });
  assert.deepEqual(fieldChanges(manual, 'maxDepth', '30,5', metric), { ok: true, changes: { maxDepthMm: 30500 } });
  assert.deepEqual(fieldChanges(manual, 'duration', '45', metric), { ok: true, changes: { durationSeconds: 2700 } });
  assert.deepEqual(fieldChanges(manual, 'waterTemp', '18', metric), { ok: true, changes: { waterTempMk: 291150 } });
});

test('numbers follow the diver’s units and are checked while typing', () => {
  const manual = dive({ manual: true });
  assert.deepEqual(fieldChanges(manual, 'maxDepth', '100', imperial), { ok: true, changes: { maxDepthMm: 30480 } });
  assert.deepEqual(fieldChanges(manual, 'waterTemp', '64.4', imperial), { ok: true, changes: { waterTempMk: 291150 } });
  assert.deepEqual(fieldChanges(manual, 'maxDepth', 'abc', metric), { ok: false, error: 'invalid' });
  assert.deepEqual(fieldChanges(manual, 'duration', '0', metric), { ok: false, error: 'invalid' });
  assert.deepEqual(fieldChanges(dive(), 'surfacePressure', '50', metric), { ok: false, error: 'invalid' });
  assert.equal(fieldValue(manual, 'maxDepth', imperial), '128');
  assert.equal(fieldValue(manual, 'duration', metric), '78');
});

test('the site: empty clears it, a known name chooses it, another creates it', () => {
  const sites = [{ name: 'Lake Coleridge', uuid: 7 }, { name: 'Hälvälä', uuid: 9 }];
  assert.deepEqual(siteChoice('Lake Coleridge', 'Lake Coleridge', sites), { action: 'none' });
  assert.deepEqual(siteChoice('  ', 'Lake Coleridge', sites), { action: 'clear' });
  assert.deepEqual(siteChoice('hälvälä', '', sites), { action: 'existing', uuid: 9 });
  assert.deepEqual(siteChoice('Northern Arch', '', sites), { action: 'create', name: 'Northern Arch' });
});

test('the list under a chips field: what the logbook holds, then « Ajouter … comme nouveau »', () => {
  const known = [{ key: 'Juha', dives: 1 }, { key: 'Michael', dives: 4 }, { key: 'Julie', dives: 3 }];
  assert.deepEqual(listSuggestions(known, ['Michael'], 'Ju'), { matches: [{ key: 'Julie', dives: 3 }, { key: 'Juha', dives: 1 }], addNew: 'Ju' });
  assert.deepEqual(listSuggestions(known, [], 'juha'), { matches: [{ key: 'Juha', dives: 1 }], addNew: null });
  assert.deepEqual(listSuggestions(known, ['Juha'], 'Juha').addNew, null);
  assert.equal(listSuggestions(known, [], '').addNew, null);
  assert.deepEqual(withItem(['Michael'], ' Juha '), ['Michael', 'Juha']);
  assert.deepEqual(withItem(['Michael'], 'michael'), ['Michael']);
  assert.deepEqual(withoutItem(['a', 'b', 'c'], 1), ['a', 'c']);
});

test('the keys of an edit: Entrée keeps, Échap restores, Tab goes on', () => {
  assert.equal(editKeyAction({ key: 'Enter' }), 'commit');
  assert.equal(editKeyAction({ key: 'Escape' }), 'cancel');
  assert.equal(editKeyAction({ key: 'Tab' }), 'next');
  assert.equal(editKeyAction({ key: 'Tab', shiftKey: true }), 'previous');
  assert.equal(editKeyAction({ key: 'a' }), null);
  // Notes: Entrée adds a line, Ctrl or ⌘ + Entrée keeps.
  assert.equal(editKeyAction({ key: 'Enter' }, { multiline: true }), null);
  assert.equal(editKeyAction({ key: 'Enter', ctrlKey: true }, { multiline: true }), 'commit');
  assert.equal(editKeyAction({ key: 'Enter', metaKey: true }, { multiline: true }), 'commit');
});

test('the weights keep their exact grams unless their text changed', () => {
  const d = dive();
  const rows = [{ description: 'belt', text: '4', grams0: 4000, text0: '4' }];
  assert.deepEqual(weightChanges(d, rows, metric), { ok: true, changes: null });
  assert.deepEqual(weightChanges(d, [{ ...rows[0], text: '4,5' }], metric), { ok: true, changes: { weights: ['{"description":"belt","grams":4500}'] } });
  assert.deepEqual(weightChanges(d, [rows[0], { description: '', text: '2', grams0: -1, text0: '' }], metric), {
    ok: true,
    changes: { weights: ['{"description":"belt","grams":4000}', '{"description":"","grams":2000}'] },
  });
  assert.deepEqual(weightChanges(d, [], metric), { ok: true, changes: { weights: [] } });
  assert.deepEqual(weightChanges(d, [{ ...rows[0], text: 'x' }], metric), { ok: false, error: 'invalid' });
  assert.deepEqual(weightChanges(d, [{ ...rows[0], text: '10' }], imperial), { ok: true, changes: { weights: ['{"description":"belt","grams":4536}'] } });
});

test('the cylinders: add, remove, reorder and change a field', () => {
  const d = dive();
  const keep = [{ index: 0, patch: {} }, { index: 1, patch: {} }];
  assert.deepEqual(cylinderChanges(d, keep), { ok: true, changes: null });
  assert.deepEqual(cylinderChanges(d, [{ index: 0, patch: { description: 'AL100' } }, keep[1]]), {
    ok: true,
    changes: { cylinders: ['{"index":0,"description":"AL100"}', '{"index":1}'] },
  });
  assert.deepEqual(cylinderChanges(d, [keep[1], keep[0]]).changes?.cylinders, ['{"index":1}', '{"index":0}']);
  assert.deepEqual(cylinderChanges(d, [keep[0]]).changes?.cylinders, ['{"index":0}']);
  const added = cylinderChanges(d, [...keep, { index: -1, patch: {} }]).changes?.cylinders ?? [];
  assert.equal(added.length, 3);
  assert.deepEqual(JSON.parse(added[2]), { index: -1, description: '', use: 'OC-gas', sizeMl: 0, workingPressureMbar: 0, startMbar: 0, endMbar: 0, o2Permille: 210, hePermille: 0 });
  // The mix: both parts together, within 100 %.
  assert.equal(cylinderChanges(d, [{ index: 0, patch: { o2Permille: 320, hePermille: 0 } }, keep[1]]).ok, true);
  assert.deepEqual(cylinderChanges(d, [{ index: 0, patch: { o2Permille: 800, hePermille: 400 } }, keep[1]]), { ok: false, error: 'invalid' });
  // The pressures are recorded values.
  assert.deepEqual(cylinderChanges(d, [{ index: 0, patch: { endMbar: 50000 } }, keep[1]]), { ok: false, error: 'readonly' });
  assert.equal(cylinderChanges(dive({ manual: true }), [{ index: 0, patch: { endMbar: 50000 } }, keep[1]]).ok, true);
});

/** A device store in memory. */
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
};

test('the curve chips: none on by default (todo 124), the choice is kept in the device store', () => {
  const store = memory();
  assert.deepEqual(DEFAULT_LAYERS, []);
  assert.deepEqual(readLayers(store), DEFAULT_LAYERS);
  let layers = readLayers(store);
  layers = setLayer(layers, 'temperature', true);
  layers = setLayer(layers, 'ppo2', true);
  layers = setLayer(layers, 'ceiling', true);
  saveLayers(store, layers);
  assert.equal(LAYER_KEY, 'od.profileLayers');
  assert.equal(store.m.get('od.profileLayers'), '["temperature","ppo2","ceiling"]');
  // Another dive, another session: the same chips.
  assert.deepEqual(readLayers(store), ['temperature', 'ppo2', 'ceiling']);
  // Turning every chip off is a choice too.
  saveLayers(store, setLayer(setLayer(setLayer(layers, 'temperature', false), 'ppo2', false), 'ceiling', false));
  assert.deepEqual(readLayers(store), []);
  // Turning a chip on again puts it last: its scale is the one drawn.
  assert.deepEqual(setLayer(['temperature', 'ppo2'], 'temperature', true), ['ppo2', 'temperature']);
  store.setItem(LAYER_KEY, 'not json');
  assert.deepEqual(readLayers(store), DEFAULT_LAYERS);
  store.setItem(LAYER_KEY, '["gas","nonsense","gas"]');
  assert.deepEqual(readLayers(store), ['gas']);
});

test('the detail tab last chosen is kept; ← → wrap round the five tabs', () => {
  const store = memory();
  assert.equal(readTab(store), 'info');
  saveTab(store, 'gas');
  assert.equal(store.m.get(TAB_KEY), 'gas');
  assert.equal(readTab(store), 'gas');
  store.setItem(TAB_KEY, 'nonsense');
  assert.equal(readTab(store), 'info');
  assert.equal(stepTab('info', 'ArrowRight'), 'equipment');
  assert.equal(stepTab('info', 'ArrowLeft'), 'map');
  assert.equal(stepTab('map', 'ArrowRight'), 'info');
});
