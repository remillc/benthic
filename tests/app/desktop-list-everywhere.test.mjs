// Task 2026-11-19-288: one logbook list on the desktop, the « Saucisse » icon in the desktop detail, and the
// model thumbnail of « Nouvelle pièce » on every layout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isBuoyName } from '../../app/src/lib/inventory.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (/** @type {string} */ dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test('the desktop logbook list is one component: the only table of dives, used by the one wide route', () => {
  const sources = walk('app/src').filter((f) => f.endsWith('.svelte'));
  const tables = sources.filter((f) => /od-desktop-logbook--table/.test(read(f)) && /<table/.test(read(f)));
  assert.deepEqual(tables, ['app/src/pages/DesktopLogbook.svelte']);
  // Every other desktop screen that opens over the logbook (selector, export, columns, menus, editing in place,
  // account, server) is a component of that page, not a page with its own list of dives.
  const app = read('app/src/App.svelte');
  assert.equal((app.match(/wide: DesktopLogbook\b/g) ?? []).length, 1);
  for (const f of ['DesktopLogbookSelector', 'DesktopExportDialog', 'DesktopContextMenu', 'DesktopAccountSheet', 'DesktopEditTogetherDialog']) {
    assert.doesNotMatch(read(`app/src/components/${f}.svelte`), /<table|<DiveRow|<TripRow/, `${f} has no list of its own`);
  }
});

test('the list: weekday in the date, one sticky year line, no Profile column by default', () => {
  const page = read('app/src/pages/DesktopLogbook.svelte');
  assert.match(page, /od-desktop-logbook--year-row/);
  assert.equal((page.match(/od-desktop-logbook--year-row"/g) ?? []).length, 1);
  assert.match(read('app/src/lib/desktop-table.js'), /key: 'profile'[^}]*defaultShown: false/);
});

test('« Saucisse » gets the buoy icon wherever the app shows a piece, desktop included', () => {
  assert.ok(isBuoyName('Saucisse'));
  assert.ok(isBuoyName('Parachute de palier'));
  assert.ok(isBuoyName('Surface marker buoy'));
  const tile = read('app/src/components/DesktopOtherGear.svelte');
  assert.match(tile, /<GearIcon type=\{item\.type \?\? 'other'\} name=\{item\.name\}/);
  assert.doesNotMatch(tile, /name="tune"/);
});

test('« Nouvelle pièce » has the model thumbnail on every layout: one form, no layout of its own', () => {
  const form = read('app/src/pages/ProfilePieceEdit.svelte');
  assert.match(form, /data-testid="piece-thumb"/);
  assert.match(form, /od-piece-edit--thumb/);
  assert.doesNotMatch(form, /isTablet|isDesktop|desk\b/);
  const routes = read('app/src/App.svelte').match(/ProfilePieceEdit\.svelte/g) ?? [];
  assert.equal(routes.length, 2); // new and edit: the same page on the phone, the tablet and the desktop
  const others = walk('app/src').filter((f) => /\.svelte$/.test(f) && /data-testid="piece-thumb"|name="model"|gear\.pieceEdit\.model/.test(read(f)));
  assert.deepEqual(others, ['app/src/pages/ProfilePieceEdit.svelte']);
});
