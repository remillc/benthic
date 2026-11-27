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
