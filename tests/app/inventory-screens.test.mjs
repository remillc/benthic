// The equipment screens (task 2026-11-17-267): every text key they use exists in French and English, the routes and
// the account sheet card are release-only, the inert entries are inert, the CSV export, and the release note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gearCsv } from '../../app/src/lib/gear-export.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const fr = JSON.parse(read('i18n/fr.json'));
const en = JSON.parse(read('i18n/en.json'));
const has = (o, key) => key.split('.').reduce((n, k) => (n == null ? undefined : n[k]), o) != null;

const files = [
  ...readdirSync(new URL('pages/', root)).filter((f) => /^Profile/.test(f)).map((f) => `pages/${f}`),
  ...readdirSync(new URL('components/', root)).filter((f) => /^(Gear|DiveGear|AddEquipment|RenameComputer|ReadOnlyNotice)/.test(f)).map((f) => `components/${f}`),
  'components/EquipmentCard.svelte',
  'components/AccountSheet.svelte',
];

test('every literal gear key used by the screens exists in fr and en', () => {
  for (const f of files) {
    for (const [, key] of read(f).matchAll(/['`](gear\.[A-Za-z.]+)['`]/g)) {
      assert.ok(has(fr, key), `${f}: ${key} missing in fr`);
      assert.ok(has(en, key), `${f}: ${key} missing in en`);
    }
  }
});

test('the dynamic gear keys have every type and group in both languages', () => {
  for (const lang of [fr, en]) {
    for (const type of ['computer', 'regulator', 'suit', 'undersuit', 'cylinder', 'bcd', 'light', 'weights', 'other']) assert.ok(lang.gear.inventory.type[type], type);
    for (const g of ['computer', 'regulator', 'suit', 'cylinder', 'other']) assert.ok(lang.gear.inventory.group[g], g);
    for (const g of ['regulator', 'suit', 'undersuit', 'cylinder', 'bcd', 'light', 'weights', 'other']) assert.ok(lang.gear.inventory.typePlural[g], g);
  }
  assert.equal(fr.gear.inventory.exportHeader.split('|').length, 9);
  assert.equal(en.gear.inventory.exportHeader.split('|').length, 9);
});

test('the routes and the account card exist in the release edition only', () => {
  const app = read('App.svelte');
  assert.match(app, /\.\.\.\(isRelease\s*\?\s*\[[\s\S]*?'\/profile\/gear\/'[\s\S]*?'\/profile\/kits\/new'[\s\S]*?\]\s*:\s*\[\]\)/);
  assert.ok(app.indexOf("'/profile/gear/new'") < app.indexOf("'/profile/gear/:id'"), 'new before :id');
  assert.match(read('components/AccountSheet.svelte'), /isRelease && !desktopApp/);
});

test('Brevets and Informations are shown and inert', () => {
  const page = read('pages/ProfileDiver.svelte');
  assert.equal((page.match(/aria-disabled="true"/g) ?? []).length, 2);
  assert.match(page, /href="\/profile\/gear\/"/);
});

test('the dive editor uses the inventory in the release edition only, and the rename dialog says it is logbook-wide', () => {
  const edit = read('pages/EditDive.svelte');
  assert.match(edit, /\{#if isRelease\}\s*<DiveGearTop/);
  assert.match(edit, /isRelease && computer\.serial/);
  assert.match(fr.gear.diveGear.renameText, /toutes les plongées/);
  assert.match(en.gear.diveGear.renameText, /every dive/);
});

test('a download adds the computer to the inventory in the release edition', () => {
  const lb = read('lib/logbook.svelte.js');
  assert.match(lb, /isRelease[\s\S]{0,120}noteDownloadedComputer/);
});

test('the read-only switch is development only', () => {
  assert.match(read('pages/ProfileGear.svelte'), /import\.meta\.env\?\.DEV\) items\.push/);
});

test('the CSV has a header, quotes where needed and a line per piece', () => {
  const csv = gearCsv([{ type: 'regulator', name: 'Apeks, "XTX"', retired: true }], ['T', 'N'], (t) => t.toUpperCase());
  assert.equal(csv, 'T,N\r\nREGULATOR,"Apeks, ""XTX"""\r\n'.replace('REGULATOR,"Apeks, ""XTX"""', 'REGULATOR,"Apeks, ""XTX""",,,,,,,1'));
});

test('the release notes mention the profile and the equipment', () => {
  for (const lang of [fr, en]) assert.ok(lang.about.releaseNotes.some((n) => /profil|profile/i.test(n) && /(quipment|quipement)/.test(n)));
});
