// Christian, 27 November 2026: no « … en attente d'envoi » under the logbook's dives; each dive computer of the detail
// opens « Ordinateurs de cette plongée », which has a close button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('a dive row says nothing about changes waiting to be sent', () => {
  const row = read('app/src/components/DiveRow.svelte');
  assert.doesNotMatch(row, /pendingText|bc-dive-row--pending|dive\.pending/);
  assert.doesNotMatch(read('app/src/pages/Logbook.svelte'), /pending=\{row\.dive\.number/);
  const fr = JSON.parse(read('app/src/i18n/fr.json'));
  assert.equal(fr.dive.pending, undefined);
  assert.equal(fr.dive.pendingFields, undefined);
});

test('each dive computer is a button that opens the sheet; the « Ordinateur principal et noms » button is gone', () => {
  const fields = read('app/src/components/DesktopDiveFields.svelte');
  assert.match(fields, /<button type="button" class="bc-desktop-dive-fields--computer" data-field="computer" aria-haspopup="dialog" disabled=\{preview\} onclick=\{\(\) => \(computersSheet = true\)\}>/);
  assert.doesNotMatch(fields, /computer-manage|manageComputers/);
});

test('« Ordinateurs de cette plongée » has a close button next to its title (Android; iOS keeps OK)', () => {
  const sheet = read('app/src/components/ComputersSheet.svelte');
  assert.match(sheet, /<h2 class="bc-computers-sheet--title">\{t\('detail\.computersTitle'\)\}<\/h2>\s*<button type="button" class="bc-computers-sheet--close" onclick=\{onclose\}><Icon name="close" \/><span class="bc-sr-only">\{t\('nav\.close'\)\}<\/span><\/button>/);
});

test('Combinaison lists every suit when it opens and filters only once the text changes; Sous-vêtement opens its menu on the first tap (Christian, 27 November 2026)', () => {
  const field = read('app/src/components/DesktopEditField.svelte');
  assert.match(field, /typed \|\| \(kind === 'site' && typeof draft === 'string' && editing && siteTyped \? draft : ''\)/);
  assert.match(field, /draft = Array\.isArray\(value\) \? \[\.\.\.value\] : value;\s*typed = '';\s*siteTyped = false;/);
  assert.match(field, /oninput=\{\(\) => \(\(highlighted = -1\), \(siteTyped = true\)\)\}/);
  assert.match(read('app/src/components/DesktopDiveFields.svelte'), /name="undersuit" kind="choice" openChoiceOnClick /);
});

test('a menu that opens on the first tap waits for the finger\'s lift (Chrome\'s user gesture) and never throws', () => {
  const field = read('app/src/components/DesktopEditField.svelte');
  assert.match(field, /if \(event\.pointerType !== 'mouse'\) \{\s*fingerDown = true;\s*return;\s*\}/);
  assert.match(field, /onfocus=\{\(\) => startEdit\(fingerDown\)\}/);
  assert.match(field, /try \{\s*input\.showPicker\(\);\s*\} catch \{/);
});

test('while the logbook loads, the band keeps the place of its line: the last start\'s line as grey blocks (Christian, 27 November 2026)', async () => {
  const { buildSnapshot } = await import('../../app/src/lib/snapshot.js');
  assert.equal(buildSnapshot([], {}, '1 358 plongées · 236 sites').summary, '1 358 plongées · 236 sites');
  const page = read('app/src/pages/Logbook.svelte');
  assert.match(page, /buildSnapshot\(list, \$state\.snapshot\(prefs\), logbookSummary\(list\)\)/);
  assert.match(page, /const summaryLoading = \$derived\(logbook\.loading && !logbook\.error && logbook\.dives\.length === 0 && !releaseEmpty\);/);
  assert.match(page, /summary=\{bandSummary\} placeholder=\{summaryLoading\}>/);
  const band = read('app/src/components/SectionBand.svelte');
  assert.equal(band.match(/<span class:bc-section-band--placeholder=\{placeholder\}>\{summary\}<\/span>/g)?.length, 2);
  assert.match(band, /\.bc-section-band--placeholder \{\s*color: transparent;/);
});

test('an edit\'s and an undo\'s dive carry their water type, as getDive: the « Eau » fact stays after an edit', async () => {
  const { withWaterType } = await import('../../plugins/benthic-core/core-api.js');
  assert.equal(withWaterType({ dive: { id: 1, salinity: 10300 } }).dive.waterType, 'salt');
  assert.equal(withWaterType({ dive: { id: 1, salinity: 10000 } }).dive.waterType, 'fresh');
  assert.deepEqual(withWaterType({ list: true }), { list: true });
  const api = read('plugins/benthic-core/core-api.js');
  assert.match(api, /async editDive\(options\) \{\s*return withWaterType\(JSON\.parse\(\(await native\.editDive\(options\)\)\.json\)\);/);
  assert.match(api, /async undo\(options = \{\}\) \{\s*return withWaterType\(JSON\.parse\(\(await native\.undo\(options\)\)\.json\)\);/);
});

test('a signature row sits on the card\'s white: the signature first, 96 × 48 px, then the name · role, and a 48 px × (mock-ups)', () => {
  const sig = read('app/src/components/DiveSignatures.svelte');
  assert.match(sig, /data-field="signature">\s*\{#if v\.signature\}<img class="bc-dive-signatures--signature"[^>]*\/>\{\/if\}\s*<div class="bc-dive-signatures--text">/);
  assert.match(sig, /\.bc-dive-signatures--item \{[^}]*gap: 12px;\s*\}/);
  assert.doesNotMatch(sig, /\.bc-dive-signatures--item \{[^}]*background/);
  assert.match(sig, /\.bc-dive-signatures--signature \{[^}]*width: 96px;\s*height: 48px;/);
  assert.match(sig, /<span class="bc-dive-signatures--role">· /);
});
