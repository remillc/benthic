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
