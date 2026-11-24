// Dates follow Settings > Language and date everywhere (task 2026-11-19-311).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dateHint, formatDate, formatDateChoice, formatDateRange, formatMonthChoice, formatMonthYear, readTypedDate, typedDate } from '../../app/src/lib/format.js';
import { settings } from '../../app/src/lib/settings.svelte.js';

const day = new Date(Date.UTC(2026, 10, 6));
const CHOICES = ['iso', 'dmy', 'mdy', 'medium', 'system'];

test('a date in each format of the setting', () => {
  assert.equal(formatDateChoice(day, 'iso'), '2026-11-06');
  assert.equal(formatDateChoice(day, 'dmy'), '06/11/2026');
  assert.equal(formatDateChoice(day, 'mdy'), '11/06/2026');
});

test('a month-only date uses the same order', () => {
  const march = new Date(Date.UTC(2022, 2, 1));
  assert.equal(formatMonthChoice(march, 'iso'), '2022-03');
  assert.equal(formatMonthChoice(march, 'dmy'), '03/2022');
  assert.equal(formatMonthChoice(march, 'mdy'), '03/2022');
  assert.match(formatMonthChoice(march, 'medium'), /2022/);
  assert.match(formatMonthChoice(march, 'system'), /03.*2022|2022.*03/);
});

test('the hint, the typed text and the reading agree for each format', () => {
  const hints = { iso: /^[^-]+-[^-]+-[^-]+$/, dmy: /^[^/]+\/[^/]+\/[^/]+$/, mdy: /^[^/]+\/[^/]+\/[^/]+$/ };
  for (const choice of CHOICES) {
    settings.dateFormat = choice;
    assert.ok(dateHint().length > 4, choice);
    if (hints[choice]) assert.match(dateHint(), hints[choice]);
    const text = typedDate('2026-11-06');
    assert.equal(readTypedDate(text), '2026-11-06', `${choice}: ${text}`);
    assert.equal(readTypedDate('2026-11-06'), '2026-11-06');
    assert.equal(readTypedDate('2026-02-30'), null);
    assert.equal(readTypedDate('hier'), null);
  }
  settings.dateFormat = 'iso';
  assert.equal(typedDate('2026-11-06'), '2026-11-06');
  settings.dateFormat = 'dmy';
  assert.equal(typedDate('2026-11-06'), '06/11/2026');
  settings.dateFormat = 'mdy';
  assert.equal(typedDate('2026-11-06'), '11/06/2026');
});

test('every shown date follows the setting, with or without a time', () => {
  settings.dateFormat = 'iso';
  assert.equal(formatDate('2026-11-06T10:30:00'), '2026-11-06');
  assert.equal(formatDate('2026-11-06'), '2026-11-06');
  assert.equal(formatMonthYear('2022-03-01'), '2022-03');
  assert.match(formatDateRange('2026-11-06T09:00:00', '2026-11-08T09:00:00'), /^2026-11-06.+2026-11-08$/);
  settings.dateFormat = 'dmy';
  assert.equal(formatDate('2026-11-06T10:30:00'), '06/11/2026');
  settings.dateFormat = 'system';
});

// Task 2026-11-24-397, point 5: a date inside a form field (the piece, certification, document and profile forms, on the phone, the
// tablet and the desktop) reads like Réglages › « Format de la date » lists the choice, and like the typed dates of the same form.
test('a date field shows the date as the setting lists it, for every choice, never the long form of the read-only views', async () => {
  const { formatFieldDate } = await import('../../app/src/lib/profile-format.js');
  const march = new Date(Date.UTC(2026, 2, 14));
  for (const choice of CHOICES) {
    settings.dateFormat = choice;
    assert.equal(formatFieldDate('2026-03-14'), formatDateChoice(march, choice), choice);
  }
  settings.dateFormat = 'iso';
  assert.equal(formatFieldDate('2026-03-14'), '2026-03-14');
  settings.dateFormat = 'dmy';
  assert.equal(formatFieldDate('2026-03-14'), '14/03/2026');
  settings.dateFormat = 'mdy';
  assert.equal(formatFieldDate('2026-03-14'), '03/14/2026');
  // The device's own format: the numeric date of the device, the one the form's typed dates use, not « 14 mars 2026 ».
  settings.dateFormat = 'system';
  assert.equal(formatFieldDate('2026-03-14'), typedDate('2026-03-14'));
  assert.notEqual(formatFieldDate('2026-03-14'), formatDate('2026-03-14'), 'the read-only views keep the medium date');
  assert.equal(formatFieldDate(''), '');
  assert.equal(formatFieldDate('hier'), '');
  // The field uses it, so every form that has a DateField follows the setting.
  const field = (await import('node:fs')).readFileSync(new URL('../../app/src/components/DateField.svelte', import.meta.url), 'utf8');
  assert.match(field, /value \? formatFieldDate\(value\) : placeholder/);
});
