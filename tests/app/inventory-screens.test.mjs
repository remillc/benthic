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

// Task 2026-11-18-272 builds Brevets and Informations: they are links now, no row is inert any more.
test('Brevets and Informations open their pages', () => {
  const page = read('pages/ProfileDiver.svelte');
  assert.equal((page.match(/aria-disabled="true"/g) ?? []).length, 0);
  assert.match(page, /href="\/profile\/gear\/"/);
  assert.match(page, /href="\/profile\/certs\/"/);
  assert.match(page, /href="\/profile\/info"/);
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

test('the BCD has the vest icon, the buoy the board tapered icon, and « Nouvelle pièce » a large model picture', async () => {
  const { readFileSync } = await import('node:fs');
  const icon = readFileSync(new URL('../../app/src/components/GearIcon.svelte', import.meta.url), 'utf8');
  // Task 2026-11-26-406: the jacket BCD seen from the front (it replaced the vest of task 324), and the drysuit; both at a 1.5 stroke.
  assert.match(icon, /bcd: 'M9 3\.5C7\.5 3\.5 6 4 5\.5 5\.5L5 8v11/, 'jacket: two halves, chest strap, pockets, hose');
  assert.match(icon, /suit: 'M10 3h4l3\.5 2 1\.8 7\.5/, 'drysuit: arms, legs, boots, valves');
  assert.match(icon, /THIN = new Set\(\['suit', 'bcd'\]\)/);
  assert.match(icon, /\.bc-gear-icon--thin \{\s*stroke-width: 1\.5;/);
  // Task 2026-11-22-324: the icons are the type board's (android-tablette-profil-piece-nouvelle-type-paysage); a buoy is drawn as « Parachute de palier ».
  assert.match(icon, /dsmb: 'M7 3h10l-2 14H9zM12 17v4'/, 'buoy: the board tapered tube');
  assert.match(icon, /floatBuoy: 'M10 3h4v13a2 2 0 0 1-4 0zM12 18v4'/, 'float buoy: the board flat-top tube');
  const edit = readFileSync(new URL('../../app/src/pages/ProfilePieceEdit.svelte', import.meta.url), 'utf8');
  assert.match(edit, /<DcTile model=\{computer \? catalogModel : ''\}[^>]*photo=\{photoUrl\} fallback=\{pictureIcon\}/, 'the photo');
  assert.match(edit, /snippet pictureIcon\(\)\}[\s\S]*?<GearIcon \{type\} \{name\} size=\{96\}/, 'else the type icon');
  assert.match(edit, /width: 192px;\s*height: 192px;\s*border-radius: 28px/, 'the 192 box of the phone');
  assert.doesNotMatch(edit, /gear\.pieceNew\.photoAdd/, 'no « Ajouter une photo »');
  assert.ok(!/fetch\(|https?:\/\//.test(edit.split('<style>')[0].replace(/\/\/.*/g, '')), 'no product photo from the web');
});

test('Équipement follows the mock-ups: wrapping kit chips, iPhone kit list, secondary-container add button', () => {
  const page = read('pages/ProfileGear.svelte');
  assert.match(page, /\.bc-gear-page--chips \{[^}]*flex-wrap: wrap/);
  assert.doesNotMatch(page, /overflow-x: auto/);
  assert.match(page, /\{#if ios\}[\s\S]{0,200}bc-gear-page--kit-list/);
  assert.match(page, /--f7-fab-bg-color: var\(--bc-secondary-container\)/);
  const list = read('components/ProfileGearList.svelte');
  assert.match(list, /gear\.addSheet\.kitChip/);
  // Task 2026-11-26-406: outlined buttons 40 dp high with 20 dp corners, 12 dp apart (32 dp chips 8 dp apart before); the phone's 12 dp apart too.
  assert.match(list, /\.bc-gear-list--chip \{[^}]*height: 40px;[^}]*border-radius: 20px/);
  assert.match(list, /\.bc-gear-list--chips \{[^}]*gap: 12px/);
  assert.match(page, /\.bc-gear-page--chips \{[^}]*gap: 12px/);
  // Side by side, not stretched by Framework7's unlayered button { width: 100% }.
  assert.match(list, /\.bc-gear-list--chip \{\s*flex: none;\s*width: auto;/);
  assert.match(list, /inset-inline-end: 24px;\s*bottom: 24px/);
  assert.match(list, /background: var\(--bc-secondary-container\)/);
});
