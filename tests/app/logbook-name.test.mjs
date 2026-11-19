import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slugify, logbookExportName, localDay } from '../../app/src/lib/logbook-name.js';

test('slugify: accents, spaces, apostrophes, emojis, extension', () => {
  assert.equal(slugify('Carnet de Roger'), 'carnet-de-roger');
  assert.equal(slugify("L'île d'Yeu"), 'l-ile-d-yeu');
  assert.equal(slugify('  Été 2026 !! '), 'ete-2026');
  assert.equal(slugify('🤿 Plongées 🌊'), 'plongees');
  assert.equal(slugify('plongees.ssrf'), 'plongees');
  assert.equal(slugify('🤿'), '');
  assert.equal(slugify(''), '');
});

test('logbookExportName: name, date, fallback', () => {
  assert.equal(logbookExportName('Carnet de Roger', '2026-11-19', 'carnet'), 'carnet-de-roger-2026-11-19.ssrf');
  assert.equal(logbookExportName('essai.ssrf', '2026-11-19', 'carnet'), 'essai-2026-11-19.ssrf');
  assert.equal(logbookExportName('🤿', '2026-11-19', 'Carnet'), 'carnet-2026-11-19.ssrf');
  assert.equal(logbookExportName('', '2026-11-19', ''), 'logbook-2026-11-19.ssrf');
});

test('localDay is the local date', () => {
  assert.equal(localDay(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
});
