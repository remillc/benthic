// The desktop export dialog's defaults and proposed file names (task 2026-11-15-189).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultScope, exportFileName } from '../../app/src/lib/desktop-export.js';

const fr = { dives: 'plongées', logbook: 'carnet' };

test('the default choice: selection, else filter, else everything', () => {
  assert.equal(defaultScope(2, true), 'selection');
  assert.equal(defaultScope(0, true), 'filtered');
  assert.equal(defaultScope(0, false), 'all');
});

test('the proposed file names', () => {
  assert.equal(exportFileName('selection', [7, 6], 'ssrf', '2026-11-15', fr), 'plongees-6-7.ssrf');
  assert.equal(exportFileName('all', [], 'uddf', '2026-11-15', fr), 'carnet-2026-11-15.uddf');
  assert.equal(exportFileName('filtered', [], 'csvProfiles', '2026-11-15', fr), 'plongees-2026-11-15.csv');
  assert.equal(exportFileName('selection', [1, 2, 3, 4, 5], 'pdf', '2026-11-15', fr), 'plongees-2026-11-15.pdf');
  assert.equal(exportFileName('selection', [3], 'ssrf', '2026-11-15', { dives: 'dives', logbook: 'logbook' }), 'dives-3.ssrf');
});
