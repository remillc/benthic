// « Décaler la date et l'heure » (task 2026-11-24-383): the shift in seconds, the shifted times and the preview of the
// first and the last selected dive; the menu entry of the desktop's right-click menu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHIFT_DAYS, WHEEL_TEXTS, shiftIso, shiftPreview, shiftSeconds } from '../../app/src/lib/time-shift.js';
import { contextMenuEntries } from '../../app/src/lib/desktop-table.js';

test('the shift is signed: later is positive, earlier negative', () => {
  assert.equal(shiftSeconds({ later: true, days: 0, hours: 1, minutes: 5 }), 3900);
  assert.equal(shiftSeconds({ later: false, days: 0, hours: 1, minutes: 5 }), -3900);
  assert.equal(shiftSeconds({ later: true, days: 2, hours: 0, minutes: 0 }), 172800);
  assert.equal(shiftSeconds({ later: true, days: 0, hours: 0, minutes: 0 }), 0);
});

test('the wheels offer days up to a year, hours 0 to 23, minutes 00 to 59', () => {
  assert.equal(WHEEL_TEXTS.days.length, MAX_SHIFT_DAYS + 1);
  assert.deepEqual([WHEEL_TEXTS.hours[0], WHEEL_TEXTS.hours[23], WHEEL_TEXTS.hours.length], ['0', '23', 24]);
  assert.deepEqual([WHEEL_TEXTS.minutes[3], WHEEL_TEXTS.minutes[59], WHEEL_TEXTS.minutes.length], ['03', '59', 60]);
  // The longest shift stays within what the core accepts (ten years).
  assert.ok(shiftSeconds({ later: true, days: MAX_SHIFT_DAYS, hours: 23, minutes: 59 }) < 3650 * 86400);
});

test('a time moves as a wall-clock time, over midnight and over a month', () => {
  assert.equal(shiftIso('2026-02-07T10:21:00', 3900), '2026-02-07T11:26:00');
  assert.equal(shiftIso('2026-02-07T23:30:00', 3900), '2026-02-08T00:35:00');
  assert.equal(shiftIso('2026-02-28T23:30:00', 3600), '2026-03-01T00:30:00');
  assert.equal(shiftIso('2026-02-07T10:21:00', -3900), '2026-02-07T09:16:00');
  assert.equal(shiftIso('2026-03-29T01:30:00', 3600), '2026-03-29T02:30:00', 'no daylight-saving rule applies');
  assert.equal(shiftIso('2026-02-07T10:21', 60), '2026-02-07T10:22:00');
});

test('the preview shows the first and the last selected dive, the most recent first', () => {
  const dives = [
    { id: 3, number: 7, date: '2022-04-24T10:30:00' },
    { id: 1, number: 6, date: '2015-05-23T13:23:00' },
    { id: 2, number: 5, date: '2018-01-01T09:00:00' },
  ];
  const rows = shiftPreview(dives, 3900);
  assert.deepEqual(
    rows.map((r) => [r.role, r.number, r.before, r.after, r.dateChanges]),
    [
      ['first', 7, '2022-04-24T10:30:00', '2022-04-24T11:35:00', false],
      ['last', 6, '2015-05-23T13:23:00', '2015-05-23T14:28:00', false],
    ],
  );
});

test('the preview says when the day changes, and shows one dive once', () => {
  const [row] = shiftPreview([{ id: 1, number: 9, date: '2026-02-07T23:30:00' }], 3900);
  assert.equal(row.role, 'only');
  assert.equal(row.dateChanges, true);
  assert.equal(row.after, '2026-02-08T00:35:00');
  assert.deepEqual(shiftPreview([], 60), []);
});

test('the intervals between the dives do not change', () => {
  const dives = [
    { id: 1, number: 2, date: '2013-02-02T14:05:00' },
    { id: 2, number: 1, date: '2013-02-02T08:21:00' },
  ];
  const [first, last] = shiftPreview(dives, -5 * 3600);
  const gap = (a, b) => (Date.parse(a + 'Z') - Date.parse(b + 'Z')) / 1000;
  assert.equal(gap(first.after, last.after), gap(first.before, last.before));
});

test('« Décaler la date et l’heure… » follows « Modifier » in the right-click menu, for one dive or several', () => {
  const available = new Set(['merge', 'addToTrip', 'edit', 'editTogether', 'shiftTime', 'renumberFrom', 'copy', 'export', 'share', 'delete']);
  const keys = (entries) => entries.map((e) => e.key);
  assert.deepEqual(keys(contextMenuEntries(1, { mac: false, available })).slice(0, 4), ['addToTrip', 'edit', 'shiftTime', 'renumberFrom']);
  assert.deepEqual(keys(contextMenuEntries(2, { mac: false, available })).slice(0, 4), ['merge', 'addToTrip', 'editTogether', 'shiftTime']);
  const entry = contextMenuEntries(2, { mac: false, available }).find((e) => e.key === 'shiftTime');
  assert.equal(entry.icon, 'history');
  assert.equal(entry.shortcut, undefined, 'no shortcut');
});
