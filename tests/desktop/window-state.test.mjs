// SPDX-License-Identifier: GPL-2.0
// A window never opens with its bottom (and the account button at the foot of the rail) outside the screen's
// work area: remembered sizes and the cascade of later windows are clamped. Run: node --test tests/desktop/window-state.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { clamp } = require('../../desktop/window-state.cjs');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const screen = { x: 0, y: 0, width: 2560, height: 1392 };
const bottom = (w) => w.y + w.height;

test('a window as tall as the screen, cascaded by 28 dp, is moved back up', () => {
  const cascaded = clamp({ x: 128, y: 28, width: 1440, height: 1392 }, [screen]);
  assert.equal(cascaded.y, 0);
  assert.ok(bottom(cascaded) <= screen.y + screen.height);
});

test('several cascades never push the bottom edge off the screen', () => {
  let w = { x: 100, y: 50, width: 1440, height: 1000 };
  for (let i = 0; i < 20; i++) w = clamp({ ...w, x: w.x + 28, y: w.y + 28 }, [screen]);
  assert.ok(bottom(w) <= screen.height && w.x + w.width <= screen.width);
});

test('a remembered size larger than the work area is cut to it', () => {
  const w = clamp({ x: 10, y: 10, width: 3200, height: 2000 }, [screen]);
  assert.deepEqual([w.width, w.height, w.x, w.y], [2560, 1392, 0, 0]);
  assert.deepEqual(clamp({ width: 3200, height: 2000 }, [screen]), { width: 2560, height: 1392 });
});

test('a window that fits is left alone, on the display it is on', () => {
  const second = { x: 2560, y: 0, width: 1920, height: 1040 };
  const w = { x: 2700, y: 100, width: 1200, height: 800 };
  assert.deepEqual(clamp(w, [screen, second]), w);
  assert.equal(clamp({ ...w, y: 400 }, [screen, second]).y, 240);
});

test('the window manager clamps the cascade, and the rail can scroll or compact when the window is low', () => {
  assert.match(fs.readFileSync(path.join(root, 'desktop/windows.cjs'), 'utf8'), /windowState\.clamp\(place, windowState\.workAreas\(\)\)/);
  const rail = fs.readFileSync(path.join(root, 'app/src/components/NavRail.svelte'), 'utf8');
  assert.match(rail, /max-height: 520px/);
  assert.match(rail, /overflow-y: auto/);
});
