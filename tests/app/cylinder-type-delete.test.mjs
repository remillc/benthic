// Deleting one of the diver's own cylinder types (task 2026-11-18-285): what the screen says about the
// dives (counts from the core), which types can be deleted, and how an unknown type reads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cylinderTypeLabel, deletable, deletionSentences, UNKNOWN_CYLINDER_TYPE } from '../../app/src/lib/cylinder-types.js';
import { t } from '../../app/src/lib/i18n.js';

test('the sentences give the real counts: dives that lose the cylinder, dives that keep it', () => {
  const both = deletionSentences({ removed: 9, kept: 3 });
  assert.equal(both.length, 2);
  assert.match(both[0], /9/);
  assert.match(both[1], /3/);
  assert.equal(both[0], t('settings.cylinders.deleteRemoved', { n: 9 }));
  assert.equal(both[1], t('settings.cylinders.deleteKept', { n: 3 }));
});

test('only one of the two sentences when the other count is 0', () => {
  assert.equal(deletionSentences({ removed: 12, kept: 0 }).length, 1);
  assert.match(deletionSentences({ removed: 12, kept: 0 })[0], /12/);
  assert.equal(deletionSentences({ removed: 0, kept: 2 }).length, 1);
  assert.match(deletionSentences({ removed: 0, kept: 2 })[0], /2/);
  assert.deepEqual(deletionSentences({ removed: 0, kept: 0 }), []);
});

test('one dive reads in the singular', () => {
  assert.doesNotMatch(deletionSentences({ removed: 1, kept: 0 })[0], /dives|plongées/);
  assert.doesNotMatch(deletionSentences({ removed: 0, kept: 1 })[0], /dives|plongées/);
});

// Task 2026-11-23-373: the list has no « Standard » section any more, so every type can be deleted but the type a cylinder
// keeps when its own was deleted. (Before: a type named like a standard one, « AL80 », could not be deleted.)
test('every type can be deleted but the unknown type', () => {
  assert.equal(deletable({ name: 'ALU 3L' }), true);
  assert.equal(deletable({ name: 'AL80' }), true);
  assert.equal(deletable({ name: UNKNOWN_CYLINDER_TYPE }), false);
});

test('a cylinder that kept the unknown type reads « Type inconnu »; other names are shown as they are', () => {
  assert.equal(cylinderTypeLabel(UNKNOWN_CYLINDER_TYPE), t('settings.cylinders.unknown'));
  assert.equal(cylinderTypeLabel('ALU 3L'), 'ALU 3L');
  assert.equal(cylinderTypeLabel(''), '');
});

test('the screen: an unused type is deleted without a dialog, a used one asks first with a red « Supprimer »', () => {
  const src = readFileSync(new URL('../../app/src/pages/CylinderType.svelte', import.meta.url), 'utf8');
  // No dive: deleteNow() before any confirmAction().
  assert.ok(src.indexOf('if (!type.dives)') < src.indexOf('confirmAction({\n        title: t(\'settings.cylinders.deleteTypeTitle\''));
  assert.match(src, /danger: true/);
  // One screen for every type: no « Retirer ce type » any more.
  assert.ok(!/action: 'remove'/.test(src));
  assert.match(src, /\{#if deletable\(type\)\}/);
});

test('the texts exist in both languages', () => {
  for (const lang of ['fr', 'en']) {
    const c = JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8')).settings.cylinders;
    for (const key of ['deleteType', 'deleteTypeTitle', 'deleteTypeAction', 'deleteTypeNone', 'deleteRemoved', 'deleteKept', 'deleteIrreversible', 'unknown'])
      assert.ok(c[key], `${lang}: ${key}`);
  }
});

test('the size fields and the size typed agree, in litres and bar and in cubic feet and psi', async () => {
  const { sizeFields, typedSize } = await import('../../app/src/lib/cylinder-types.js');
  const format = (value, decimals) => String(Number(value.toFixed(decimals)));
  const metric = { cuft: false, psi: false };
  assert.deepEqual(sizeFields({ ml: 3000, mbar: 200000 }, metric, format), { volume: '3', pressure: '200' });
  assert.deepEqual(typedSize('3', '200', metric), { ml: 3000, mbar: 200000 });
  const imperial = { cuft: true, psi: true };
  const fields = sizeFields({ ml: 11100, mbar: 207000 }, imperial, format);
  const back = typedSize(fields.volume, fields.pressure, imperial);
  assert.ok(Math.abs(back.mbar - 207000) < 1000);
  assert.ok(Math.abs(back.ml - 11100) < 400);
});

test('a size with a wrong volume or pressure names the field that is wrong', async () => {
  const { typedSize } = await import('../../app/src/lib/cylinder-types.js');
  const metric = { cuft: false, psi: false };
  assert.deepEqual(typedSize('0', '200', metric), { invalid: 'volume' });
  assert.deepEqual(typedSize('3', 'x', metric), { invalid: 'pressure' });
  assert.deepEqual(typedSize('80', '', { cuft: true, psi: false }), { invalid: 'pressureNeeded' });
});

test('a type with no working pressure in cubic feet: no « 0 » shown, and a volume typed without the pressure asks for the pressure', async () => {
  const { sizeFields, typedSize, sizeErrorKey } = await import('../../app/src/lib/cylinder-types.js');
  const imperial = { cuft: true, psi: true };
  const format = (v, d) => v.toFixed(d);
  assert.deepEqual(sizeFields({ ml: 15000, mbar: 0 }, imperial, format), { volume: '', pressure: '' });
  assert.deepEqual(typedSize('120', '', imperial), { invalid: 'pressureNeeded' });
  assert.equal(sizeErrorKey('pressureNeeded'), 'settings.cylinders.pressureNeeded');
  assert.equal(sizeErrorKey('volume'), 'settings.cylinders.volumeInvalid');
  assert.deepEqual(typedSize('', '', { cuft: false, psi: false }), { invalid: 'volume' });
});

test('renaming a type keeps its size when the size fields were not touched, on the phone page and the desktop dialog', () => {
  const page = readFileSync(new URL('../../app/src/pages/CylinderType.svelte', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('../../app/src/components/DesktopCylinderTypeDialog.svelte', import.meta.url), 'utf8');
  assert.match(page, /sizeUntouched && type \? \{ ml: type\.ml, mbar: type\.mbar \}/);
  assert.match(dialog, /volume === start\.volume && pressure === start\.pressure \? \{ ml: type\.ml, mbar: type\.mbar \}/);
});
