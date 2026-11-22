// The desktop export dialog's defaults and proposed file names (task 2026-11-15-189).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultScope, exportFileName, exportFormats, isUpload, rememberable, usableFormat } from '../../app/src/lib/desktop-export.js';

const fr = { dives: 'plongées', logbook: 'carnet' };

test('the default choice: selection, else filter, else everything', () => {
  assert.equal(defaultScope(2, true), 'selection');
  assert.equal(defaultScope(0, true), 'filtered');
  assert.equal(defaultScope(0, false), 'all');
});

test('the proposed file names', () => {
  assert.equal(exportFileName('selection', [7, 6], 'ssrf', '2026-11-15', fr), 'plongees-6-7.ssrf');
  assert.equal(exportFileName('all', [], 'uddf', '2026-11-15', fr), 'carnet-2026-11-15.uddf');
  // The whole logbook in .ssrf is named after the logbook (rule of 19 November 2026).
  assert.equal(exportFileName('all', [], 'ssrf', '2026-11-19', fr, 'Carnet de Roger'), 'carnet-de-roger-2026-11-19.ssrf');
  assert.equal(exportFileName('all', [], 'ssrf', '2026-11-19', fr, ''), 'carnet-2026-11-19.ssrf');
  assert.equal(exportFileName('filtered', [], 'csvProfiles', '2026-11-15', fr), 'plongees-2026-11-15.csv');
  assert.equal(exportFileName('selection', [1, 2, 3, 4, 5], 'pdf', '2026-11-15', fr), 'plongees-2026-11-15.pdf');
  assert.equal(exportFileName('selection', [3], 'ssrf', '2026-11-15', { dives: 'dives', logbook: 'logbook' }), 'dives-3.ssrf');
});

test('« Fichier Benthic (.benthic) » is offered first, and only when the whole logbook is exported (task 323)', () => {
  // Task 2026-11-22-324: UDDF before SSRF, the divelogs.de upload last.
  assert.deepEqual(exportFormats(true), ['benthic', 'uddf', 'ssrf', 'csv', 'csvProfiles', 'pdf', 'divelogs']);
  assert.deepEqual(exportFormats(false), ['uddf', 'ssrf', 'csv', 'csvProfiles', 'pdf', 'divelogs']);
  assert.equal(usableFormat('benthic', true), 'benthic');
  assert.equal(usableFormat('benthic', false), 'ssrf', 'a remembered .benthic falls back for a selection');
  assert.equal(usableFormat('pdf', false), 'pdf');
  assert.equal(usableFormat('', true), 'benthic', 'nothing remembered: .benthic for the whole logbook');
  assert.equal(usableFormat('', false), 'ssrf');
  assert.ok(isUpload('divelogs') && !isUpload('pdf'));
  assert.ok(!rememberable('divelogs') && rememberable('uddf'), 'the upload is never remembered');
});

test('the .benthic file is named after the logbook', () => {
  assert.equal(exportFileName('all', [], 'benthic', '2026-11-22', fr, 'Carnet de Roger'), 'carnet-de-roger.benthic');
  assert.equal(exportFileName('all', [], 'benthic', '2026-11-22', fr, ''), 'carnet.benthic');
});
