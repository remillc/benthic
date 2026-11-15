// Desktop Réglages (task 2026-11-15-202): the search across categories, the highlight and the
// three text sizes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORIES,
  categoryOf,
  fold,
  rowMatches,
  searchBlocks,
  highlightParts,
  categoriesOf,
  textSizeOf,
  zoomOf,
  stepTextSize,
} from '../../app/src/lib/desktop-settings.js';

const blocks = [
  { id: 'display', category: 'display', rows: [{ id: 'a', label: 'Plafond donné par l’ordinateur', text: 'Affiche le plafond' }, { id: 'b', label: 'Thème', value: 'Système' }] },
  { id: 'deco', category: 'decompression', rows: [{ id: 'c', label: 'Arrondir le PLAFOND aux paliers' }, { id: 'd', label: 'Modèle', value: 'Bühlmann' }] },
  { id: 'units', category: 'units', rows: [{ id: 'e', label: 'Profondeur', value: 'Mètres' }] },
];

test('every group belongs to one category, in the order of the left column', () => {
  assert.equal(CATEGORIES[0].id, 'language');
  assert.equal(categoryOf('deco'), 'decompression');
  assert.equal(categoryOf('profileDisplay'), 'display');
  const all = CATEGORIES.flatMap((c) => c.groups);
  assert.equal(new Set(all).size, all.length);
});

test('search ignores accents and case and spans categories', () => {
  assert.equal(fold('Bühlmann'), 'buhlmann');
  const r = searchBlocks(blocks, ' plafond ');
  assert.deepEqual(r.blocks.map((b) => b.id), ['display', 'deco']);
  assert.equal(r.count, 2);
  assert.deepEqual(categoriesOf(r.blocks), ['display', 'decompression']);
  assert.equal(searchBlocks(blocks, 'buhlmann').count, 1);
  assert.equal(searchBlocks(blocks, 'metres').count, 1);
  assert.equal(searchBlocks(blocks, 'zzz').count, 0);
});

test('every word must be found', () => {
  assert.equal(rowMatches({ label: 'Plafond en rouge', text: 'Le plafond de l’ordinateur' }, 'plafond ordinateur'), true);
  assert.equal(rowMatches({ label: 'Plafond en rouge' }, 'plafond ordinateur'), false);
});

test('empty search keeps everything', () => {
  assert.equal(searchBlocks(blocks, '').count, 5);
});

test('highlight cuts the text and gives it back', () => {
  const parts = highlightParts('Plafond donné par l’ordinateur', 'plafond');
  assert.deepEqual(parts[0], { text: 'Plafond', hit: true });
  assert.equal(parts.map((p) => p.text).join(''), 'Plafond donné par l’ordinateur');
  const accent = highlightParts('Décompression', 'decomp');
  assert.deepEqual(accent[0], { text: 'Décomp', hit: true });
  assert.deepEqual(highlightParts('abc', ''), [{ text: 'abc', hit: false }]);
});

test('text size steps through three sizes and stops at the ends', () => {
  assert.equal(textSizeOf('large'), 'large');
  assert.equal(textSizeOf('huge'), 'normal');
  assert.equal(stepTextSize('normal', 1), 'large');
  assert.equal(stepTextSize('large', 1), 'large');
  assert.equal(stepTextSize('normal', -1), 'small');
  assert.equal(stepTextSize('small', -1), 'small');
  assert.equal(zoomOf('normal'), 1);
  assert.ok(zoomOf('small') < 1 && zoomOf('large') > 1);
});
