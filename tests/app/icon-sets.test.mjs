// SPDX-License-Identifier: GPL-2.0
// Tasks 2026-11-23-364 and 365: 89 keys of Icon.svelte are Material Symbols Rounded glyphs (`symbols`), 18 stay Benthic stroke
// drawings (`paths`), and every icon name a caller uses exists in one of the two.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const icon = read('app/src/components/Icon.svelte');

/** The `'key': 'd'` lines of one table of Icon.svelte. */
function table(start, end) {
  const body = icon.slice(icon.indexOf(start), icon.indexOf(end, icon.indexOf(start)));
  return Object.fromEntries([...body.matchAll(/^\s*([a-zA-Z0-9]+): '([^']*)',/gm)].map((m) => [m[1], m[2]]));
}
const paths = table('const paths = {', '\n  };');
const symbols = table('const symbols = {', '\n  };');

const DRAWINGS = ['account', 'bestMix', 'blank', 'blender', 'computer', 'depthGauge', 'desktop', 'diveComputer', 'folderDownload', 'git', 'logbook', 'notebook', 'plan', 'plusMark', 'simplifyProfile', 'trip', 'tripRemove', 'ungroup', 'wristComputer'];

test('89 keys are Material Symbols glyphs, the others Benthic drawings (blender is a drawing since task 365)', () => {
  assert.equal(Object.keys(symbols).length, 89);
  // `blank` is the empty placeholder, not an icon: the 18 drawings are the 19 minus it.
  assert.deepEqual(Object.keys(paths).sort(), [...DRAWINGS].sort());
  assert.equal(Object.keys(paths).filter((k) => k !== 'blank').length, 18);
  for (const k of Object.keys(symbols)) assert.ok(!(k in paths), `${k} is in both tables`);
  assert.ok(!('blender' in symbols));
  assert.match(paths.blender, /^M13\.5 10a3\.5 3\.5 0 0 1 7 0v9\.5/);
  // A Rounded glyph is a filled shape on the 960 grid: no stroke tweak applies.
  for (const [k, d] of Object.entries(symbols)) assert.match(d, /^[Mm]-?[\d.]+/, k);
  assert.ok(!/name === 'more'/.test(icon), 'the 4 px stroke of « more » is gone');
});

test('the shared glyphs are the same shape (delete and trash, place and sites, device and phone, export and upload, tools and tune)', () => {
  for (const [a, b] of [['delete', 'trash'], ['place', 'sites'], ['device', 'phone'], ['export', 'upload'], ['tools', 'tune']]) assert.equal(symbols[a], symbols[b], `${a} / ${b}`);
});

/** Every .svelte and .js file under a folder. */
function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = new URL(name, dir);
    if (statSync(p).isDirectory()) out.push(...sources(new URL(`${name}/`, dir)));
    else if (/\.(svelte|js)$/.test(name)) out.push(p);
  }
  return out;
}

test('every icon name a caller uses exists in `paths` or `symbols`', () => {
  const known = new Set([...Object.keys(paths), ...Object.keys(symbols)]);
  const missing = new Set();
  for (const file of sources(new URL('app/src/', root))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<Icon\s+name="([A-Za-z]+)"/g)) if (!known.has(m[1])) missing.add(`${m[1]} (${file.pathname.split('/').pop()})`);
  }
  assert.deepEqual([...missing], []);
});
