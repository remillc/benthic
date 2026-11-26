// Task 2026-11-26-404: the Équipement tab's Kit and Autre équipement cards, and the piece page without a visible « Image du modèle » caption.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kitMenuOptions, KIT_MANAGE, KIT_PREVIOUS } from '../../app/src/lib/detail-pick.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').split('\r\n').join('\n');
const json = (lang) => JSON.parse(read(`i18n/${lang}.json`));

test('the kit menu: previous dive, the kits with their piece counts, a divider, then « Gérer les kits »', () => {
  const words = { previous: 'P', previousLine: (n) => `n ${n}`, pieces: (n) => `${n} p`, manage: 'M' };
  const options = kitMenuOptions([{ id: 'k1', name: 'Mer', gearIds: ['a', 'b'] }], { number: 12 }, words);
  assert.deepEqual(options.map((o) => o.value), [KIT_PREVIOUS, 'k1', KIT_MANAGE]);
  assert.equal(options[0].example, 'n 12');
  assert.equal(options[1].example, '2 p');
  assert.equal(options[2].divider, true);
  assert.equal(kitMenuOptions([], null, words).length, 1, 'no previous dive: no first choice');
});

test('the Kit card has the one menu and no separate button pair', () => {
  const fields = read('components/DesktopDiveFields.svelte');
  assert.match(fields, /<DesktopKitField[\s\S]*options=\{kitOptions\}/);
  assert.doesNotMatch(fields, /changeKit|desktopDetail\.changeKit/);
});

test('Autre équipement rows say the type, or « Hors inventaire · empruntée »', () => {
  const fields = read('components/DesktopDiveFields.svelte');
  assert.match(fields, /line: t\(`gear\.inventory\.type\.\$\{g\.type\}`\)/);
  assert.match(fields, /line: t\('desktopDetail\.otherGearBorrowed'\)/);
  assert.match(read('components/DesktopOtherGear.svelte'), /bc-desktop-other-gear--line/);
  assert.equal(json('fr').desktopDetail.otherGearBorrowed, 'Hors inventaire · empruntée');
  assert.ok(json('en').desktopDetail.otherGearBorrowed);
});

test('« Ajouter de l’équipement » is a sheet on a phone and a dialog elsewhere', () => {
  const add = read('components/AddEquipmentSheet.svelte');
  assert.match(add, /\{#if layout\.phone\}[\s\S]*<Sheet[\s\S]*\{:else if opened\}[\s\S]*<Md3Dialog/);
});

test('the piece pictures keep their accessible name and draw no caption', () => {
  const page = read('pages/ProfilePiece.svelte');
  assert.match(page, /role="img" aria-label=\{t\('gear\.piece\.image'\)\}/);
  for (const f of ['pages/ProfilePiece.svelte', 'pages/ProfilePieceEdit.svelte', 'pages/ProfileComputerEdit.svelte']) {
    assert.doesNotMatch(read(f), /figcaption|bc-piece-page--caption|>\{t\('gear\.piece\.image'\)\}</, f);
  }
});
