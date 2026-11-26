// Settings › Types de lest (lib/weight-type-files.js) and the weight type menu of a dive's detail (DesktopWeights).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isWeightTypeFile, newWeightTypeFile, unionWeightTypes, weightTypeKey } from '../../app/src/lib/weight-type-files.js';

const core = [{ name: 'integrated', grams: 0, dives: 31 }, { name: 'belt', grams: 6000, dives: 18 }, { name: 'Poches', grams: 2000, dives: 1 }, { name: 'ankle', grams: 0, dives: 0 }];
const file = (id, name, grams, updatedAt = '2026-11-26T10:00:00Z') => ({ id, name, grams, createdAt: updatedAt, updatedAt });
const source = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('one list: the core types and the diver files, with their dive counts, sorted ignoring accents and case', () => {
  const rows = unionWeightTypes(core, [file('a', 'Zz plombs', 1000), file('b', 'belt', 8000), file('c', 'Étoile', 500), file('d', 'abeille', 0)]);
  assert.deepEqual(rows.map((r) => r.name), ['abeille', 'ankle', 'belt', 'Étoile', 'integrated', 'Poches', 'Zz plombs']);
  assert.deepEqual(rows.find((r) => r.name === 'belt'), { name: 'belt', grams: 8000, dives: 18, fileId: 'b' });
  assert.deepEqual(rows.find((r) => r.name === 'Poches'), { name: 'Poches', grams: 2000, dives: 1, fileId: null });
  assert.deepEqual(rows.find((r) => r.name === 'Zz plombs'), { name: 'Zz plombs', grams: 1000, dives: 0, fileId: 'a' });
  // A file with no weight leaves the weight last used.
  assert.equal(unionWeightTypes(core, [file('e', 'belt', 0)]).find((r) => r.name === 'belt')?.grams, 6000);
});

test('the sort uses the name as shown', () => {
  const shown = { belt: 'Ceinture', integrated: 'Intégré', ankle: 'Chevilles' };
  const rows = unionWeightTypes(core, [file('a', 'Étoile', 0)], (name) => shown[name] ?? name);
  assert.deepEqual(rows.map((r) => r.name), ['belt', 'ankle', 'Étoile', 'integrated', 'Poches']);
});

test('two files of one name (two devices) count once, the newer; names match whatever their case and spaces', () => {
  const rows = unionWeightTypes([], [file('a', 'Poches  stab', 1000, '2026-11-01T00:00:00Z'), file('b', 'poches stab', 3000, '2026-11-20T00:00:00Z')]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].grams, 3000);
  assert.equal(weightTypeKey(' Poches  Stab '), 'poches stab');
});

test('a file is checked before it is used; a new one is tidied', () => {
  assert.ok(isWeightTypeFile(file('a', 'X', 0)));
  assert.ok(!isWeightTypeFile({ id: 'a', name: ' ', grams: 1 }));
  assert.ok(!isWeightTypeFile({ id: 'a', name: 'X', grams: -1 }));
  assert.deepEqual(newWeightTypeFile({ id: 'z', name: '  Poches   stab ', grams: 1999.6, stamp: 's' }), { id: 'z', name: 'Poches stab', grams: 2000, createdAt: 's', updatedAt: 's' });
});

test('the detail: a sheet of the types instead of the system list, « Gérer les types de lest », the previous dive first', () => {
  const src = source('components/DesktopWeights.svelte');
  assert.doesNotMatch(src, /<select/);
  assert.match(src, /<DetailSheet title=\{t\('desktopDetail\.weightPlace'\)\} options=\{sheetOptions\}/);
  assert.match(src, /label: t\('desktopDetail\.manageWeightTypes'\), icon: 'settings', divider: true/);
  assert.match(src, /openOver\('\/settings\/weights\/'\)/);
  assert.match(src, /previous\.find\(\(w\) => w\.description === name && w\.grams > 0\)\?\.grams \|\| types\.find/);
  assert.match(source('components/DesktopDiveFields.svelte'), /previous=\{previousWeights\}/);
  assert.match(source('lib/account-sync.js'), /'weight-types\/'\]/);
  assert.match(source('App.svelte'), /path: '\/settings\/weights\/'/);
  // Adding a weight keeps the others in sight, and « Ajouter » keeps it without Enter.
  assert.match(src, /const others = \$derived\(shown\.chips\.filter\(\(chip\) => chip\.index !== editing\?\.index\)\)/);
  assert.match(src, /\{#if !editing \|\| others\.length\}/);
  assert.match(src, /class="bc-desktop-weights--confirm".*onclick=\{\(\) => keep\(\)\}>\{editing\.index < 0 \? t\('desktopDetail\.add'\)/);
});

test('the pages: one list with no mention of Subsurface, a name that can always be changed, a confirmation for a type in use', () => {
  const list = source('pages/WeightTypes.svelte');
  assert.doesNotMatch(list, /builtin|settings\.weights\.added/);
  assert.match(list, /settings\.weights\.inNoDive.*settings\.weights\.inOneDive.*settings\.weights\.inDives/);
  const page = source('pages/WeightType.svelte');
  assert.doesNotMatch(page, /nameLocked|fromLogbook|inLogbook/);
  assert.match(page, /settings\.weights\.editTitleIos/);
  assert.match(page, /if \(!type\.dives\) \{\s*removeNow\(\);/);
  assert.match(page, /confirmActionSheet|confirmAction\(/);
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    for (const key of ['builtin', 'fromLogbook', 'added', 'noWeight', 'deleteUsual']) assert.equal(json.settings.weights[key], undefined);
    assert.doesNotMatch(JSON.stringify(json.settings.weights) + JSON.stringify(json.settings.weightTypes), /habituel|usual|Subsurface/i);
  }
  assert.match(source('lib/weight-types.svelte.js'), /BenthicCore\.weightTypes\(\{ action: 'list' \}\)/);
  assert.match(source('lib/logbook.svelte.js'), /BenthicCore\.weightTypes\(\{ action: 'rename'/);
});
