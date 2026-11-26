// Every date of a piece of gear is chosen in the calendar (Christian, 26 November 2026): DateField (the Material 3 date
// picker), not a typed text field. A hydrostatic test note still takes a stamp typed by hand.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the purchase dates and the maintenance dates use the calendar', () => {
  const piece = source('pages/ProfilePieceEdit.svelte');
  assert.match(piece, /<DateField label=\{t\('gear\.pieceEdit\.purchasedOn'\)\} bind:value=\{purchasedOn\}/);
  assert.match(piece, /\{:else if f\.kind === 'date'\}\s*<DateField/);
  const computer = source('pages/ProfileComputerEdit.svelte');
  assert.match(computer, /<DateField label=\{t\('gear\.pieceEdit\.purchasedOn'\)\} bind:value=\{purchasedOn\}/);
  assert.match(computer, /class="bc-computer-edit--ios-row bc-computer-edit--ios-date" onclick=\{\(\) => \(pickingDate = true\)\}/);
  assert.match(computer, /<DatePickerDialog/);
  const note = source('pages/ProfileMaintenanceNote.svelte');
  assert.match(note, /\{#if hydro\}\s*<TextField label=\{t\('maintenance\.note\.date'\)\}/);
  assert.match(note, /<DateField label=\{t\('maintenance\.note\.date'\)\} bind:value=\{doneDay\}/);
});
