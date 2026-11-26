// Settings › Types de lest (lib/weight-type-files.js) and the weight type menu of a dive's detail (DesktopWeights).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isWeightTypeFile, newWeightTypeFile, unionWeightTypes, weightTypeKey } from '../../app/src/lib/weight-type-files.js';

const core = [{ name: 'integrated', grams: 0 }, { name: 'belt', grams: 6000 }, { name: 'Poches', grams: 2000 }];
const file = (id, name, grams, updatedAt = '2026-11-26T10:00:00Z') => ({ id, name, grams, createdAt: updatedAt, updatedAt });
const source = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the list: the core types in their order, then the added ones by name; a file gives a type its usual weight', () => {
  const rows = unionWeightTypes(core, [file('a', 'Zz plombs', 1000), file('b', 'belt', 8000), file('c', 'Ankle weights', 500)]);
  assert.deepEqual(rows.map((r) => r.name), ['integrated', 'belt', 'Poches', 'Ankle weights', 'Zz plombs']);
  assert.deepEqual(rows.find((r) => r.name === 'belt'), { name: 'belt', grams: 8000, builtin: true, inLogbook: true, fileId: 'b' });
  assert.deepEqual(rows.find((r) => r.name === 'Poches'), { name: 'Poches', grams: 2000, builtin: false, inLogbook: true, fileId: null });
  assert.equal(rows.find((r) => r.name === 'Zz plombs')?.inLogbook, false);
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
