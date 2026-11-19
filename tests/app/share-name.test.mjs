// The diver's full name in the header of the PDF sheet (task 2026-11-19-312): before « Plongée n° », left out when the
// export is anonymized or no name is given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetHtml } from '../../app/src/lib/share.js';

const dive = {
  id: 1, number: 5, date: '2014-04-02T10:00:00', durationSeconds: 4680, maxDepthMm: 39000, meanDepthMm: 0, site: 'Lake Coleridge',
  siteLocation: {}, trip: null, cylinders: [], weights: [], diveComputers: [], guides: ['Taylor'], buddies: ['Michael'], tags: [], notes: '',
  samples: {}, conditions: {}, divemode: 'OC',
};
const prefs = { lengthUnit: 'metric' };

test('the name opens the header of the sheet', () => {
  const html = sheetHtml(/** @type {any} */ (dive), /** @type {any} */ (prefs), null, false, [], 'Valérie Tremblay');
  assert.ok(html.indexOf('Valérie Tremblay') > 0 && html.indexOf('Valérie Tremblay') < html.indexOf('<b>'));
});

test('no name, no trace; anonymizing removes it', () => {
  assert.ok(!sheetHtml(/** @type {any} */ (dive), /** @type {any} */ (prefs), null, false, [], '').includes('Tremblay'));
  assert.ok(!sheetHtml(/** @type {any} */ (dive), /** @type {any} */ (prefs), null, true, [], 'Valérie Tremblay').includes('Tremblay'));
});
