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

test('your types can be deleted; standard types and the unknown type cannot', () => {
  assert.equal(deletable({ name: 'ALU 3L', standard: false }), true);
  assert.equal(deletable({ name: 'AL80', standard: true }), false);
  assert.equal(deletable({ name: UNKNOWN_CYLINDER_TYPE, standard: false }), false);
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
  // Standard types keep « Retirer ce type » (only the device's list changes).
  assert.match(src, /action: 'remove'/);
  assert.match(src, /\{#if deletable\(type\)\}/);
});

test('the texts exist in both languages', () => {
  for (const lang of ['fr', 'en']) {
    const c = JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8')).settings.cylinders;
    for (const key of ['deleteType', 'deleteTypeTitle', 'deleteTypeAction', 'deleteTypeNone', 'deleteRemoved', 'deleteKept', 'deleteIrreversible', 'unknown'])
      assert.ok(c[key], `${lang}: ${key}`);
  }
});
