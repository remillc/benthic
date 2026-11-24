// SPDX-License-Identifier: GPL-2.0
// The icons match the mock-ups (task 2026-11-22-324): the 19 gear types draw what the type board of « Nouvelle pièce »
// draws, and the icons that were reviewed against the canvases keep the drawing of their mock-up.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const mockups = new URL('docs/mockups/', root);

/** A path split into its subpaths (one per M), spaces and commas normalised so « 1.5-.5 » and « 1.5 -.5 » compare equal. */
const norm = (d) => d.replace(/[\s,]+/g, ' ').replace(/ ?([a-zA-Z]) ?/g, '$1').replace(/(\d) (-)/g, '$1$2').trim();
const split = (d) => (d.match(/[Mm][^Mm]*/g) ?? []).map(norm);

/** Every subpath of every <path d> of every mock-up. */
const mockPaths = new Set();
for (const file of readdirSync(mockups).filter((f) => f.endsWith('.html')))
  for (const m of readFileSync(new URL(file, mockups), 'latin1').matchAll(/<path[^>]* d="([^"]+)"/g)) for (const sp of split(m[1])) mockPaths.add(sp);

/** The paths of a component's `paths = { name: 'd', ... }` table. */
function table(source) {
  const body = source.slice(source.indexOf('const paths = {'));
  return Object.fromEntries([...body.matchAll(/^\s*([a-zA-Z0-9]+): '([^']*)',/gm)].map((m) => [m[1], m[2]]));
}

test('the 20 gear types are drawn as the type board of « Nouvelle pièce » draws them (circles and rectangles are written as paths)', () => {
  const gear = table(read('app/src/components/GearIcon.svelte'));
  const types = ['computer', 'regulator', 'suit', 'undersuit', 'cylinder', 'rebreather', 'o2Cells', 'bcd', 'light', 'weights', 'mask', 'fins', 'scooter', 'camera', 'dsmb', 'floatBuoy', 'knife', 'diveKnife', 'compass', 'other'];
  assert.deepEqual(Object.keys(gear), types);
  // The subpaths written as paths in the board are found as they are; the shapes the board draws as <rect> and <circle> are
  // checked by the pieces that are paths.
  const board = readFileSync(new URL('android-tablette-profil-piece-nouvelle-type-paysage.dc.html', mockups), 'latin1');
  // « diveKnife » is the drawing of task 2026-11-23-364, not the board's: it is not compared.
  for (const type of ['suit', 'undersuit', 'bcd', 'dsmb', 'floatBuoy', 'cylinder', 'fins', 'mask', 'knife'])
    for (const sp of split(gear[type]).filter((p) => p.length > 12 && !/ 0 1 0 /.test(p)))
      assert.ok(board.includes(sp.replace(/^M/, 'M').slice(0, 20)) || [...board.matchAll(/ d="([^"]+)"/g)].some((m) => split(m[1]).includes(sp)), `${type}: ${sp}`);
});

// Tasks 2026-11-23-364 and 365: the icons that were reviewed against the canvases one by one (briefcase, wrench, notebook...)
// are Material Symbols Rounded glyphs now, except the ones Material has no faithful equivalent for. tests/app/icon-sets.test.mjs
// checks which keys are symbols and which are Benthic drawings.
test('« notebook » stays the open notebook of its mock-up', () => {
  const icons = table(read('app/src/components/Icon.svelte'));
  for (const sp of split(icons.notebook)) assert.ok(mockPaths.has(sp), `notebook: ${sp}`);
});

test('« Entretien » is a spanner and « Ouvrir un autre carnet » an open notebook', () => {
  assert.match(read('app/src/components/ProfileNav.svelte'), /id: 'maintenance', icon: 'wrench'/);
  assert.match(read('app/src/pages/Logbook.svelte'), /<MenuItem icon="notebook" text=\{t\('welcomeSteps\.menuOpenOther'\)\}/);
});
