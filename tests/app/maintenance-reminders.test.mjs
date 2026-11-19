// SPDX-License-Identifier: GPL-2.0
// The maintenance reminders of task 2026-11-19-308: the two deadlines of a bottle, the lead times 14, 30 and 60 days
// (the default of Réglages › Notifications and a reminder's own), the weekly reminder of a late one and its snooze, the
// 9:00 moment (not the flight reminder's), retired pieces and dive computers left out.
// Run: node --import ./tests/app/register.mjs --test tests/app/maintenance-reminders.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluate,
  evaluateAll,
  notificationPlan,
  notificationMoment,
  NOTIFICATION_HOUR,
  NOTIFY_CHOICES,
  leadDays,
  ownLeadDays,
  suggestionsFor,
  OVERDUE_HORIZON_WEEKS,
} from '../../app/src/lib/maintenance.js';
import { flightNotice } from '../../app/src/lib/flight-notice.js';
import { flightDives } from '../../app/src/lib/tools.js';

const today = '2026-11-19';

const item = (extra = {}) => ({
  format: 1,
  id: 'm1',
  createdAt: '',
  updatedAt: '',
  gearId: 'g1',
  task: 'service',
  intervalMonths: 12,
  intervalDives: null,
  startOn: '2026-01-01',
  lastDoneOn: '2026-06-01',
  notifyDays: null,
  warnInDive: true,
  history: [],
  ...extra,
});
const ev = (extra, keys = []) => evaluate(item(extra), keys, today);

test('a bottle has two deadlines, each its own reminder: visual inspection yearly, hydrostatic test every 5 years', () => {
  assert.deepEqual(suggestionsFor('cylinder'), [
    { task: 'inspection', months: 12 },
    { task: 'hydrostatic', months: 60 },
  ]);
  // The AL80 of the mock-up: inspected on 2 October 2025 (due 2 October 2026, late), tested in March 2022 (due March 2027).
  const inspection = evaluate(item({ id: 'i', gearId: 'al80', task: 'inspection', intervalMonths: 12, lastDoneOn: '2025-10-02' }), [], today);
  const hydro = evaluate(item({ id: 'h', gearId: 'al80', task: 'hydrostatic', intervalMonths: 60, lastDoneOn: '2022-03-01' }), [], today);
  assert.equal(inspection.status, 'overdue');
  assert.equal(inspection.dueDate, '2026-10-02');
  assert.equal(hydro.status, 'ok');
  assert.equal(hydro.dueDate, '2027-03-01');
  // One late does not make the other late, and each plans its own notifications.
  const plan = notificationPlan([inspection, hydro], today);
  assert.ok(plan.some((p) => p.itemId === 'i' && p.kind === 'overdue'));
  assert.ok(plan.some((p) => p.itemId === 'h' && p.kind === 'lead'));
  assert.ok(plan.some((p) => p.itemId === 'h' && p.kind === 'due'));
  assert.ok(!plan.some((p) => p.itemId === 'i' && p.kind !== 'overdue'));
});

test('the lead times are 2 weeks, 30 days and 60 days; a stored 7 reads as 2 weeks', () => {
  assert.deepEqual(NOTIFY_CHOICES, [14, 30, 60]);
  assert.equal(leadDays({ notifyDays: 7 }), 14);
  assert.equal(leadDays({ notifyDays: null }, 60), 60);
  assert.equal(leadDays({}), 30);
  assert.equal(ownLeadDays(30, 30), null, 'the default is not stored');
  assert.equal(ownLeadDays(14, 30), 14);
});

test('the lead notification comes 14, 30 or 60 days before the due date, from the default or the own lead time of the reminder', () => {
  const due = '2027-06-01'; // 12 months after 2026-06-01
  const lead = (extra, options) => notificationPlan([ev(extra)], today, options).find((p) => p.kind === 'lead')?.on;
  assert.equal(lead({}, { defaultDays: 14 }), '2027-05-18');
  assert.equal(lead({}, { defaultDays: 30 }), '2027-05-02');
  assert.equal(lead({}, { defaultDays: 60 }), '2027-04-02');
  // The own lead time of the reminder wins over the default.
  assert.equal(lead({ notifyDays: 60 }, { defaultDays: 14 }), '2027-04-02');
  assert.equal(lead({ notifyDays: 14 }, { defaultDays: 60 }), '2027-05-18');
  assert.equal(notificationPlan([ev({})], today).find((p) => p.kind === 'due')?.on, due);
});

test('the switch off plans nothing', () => {
  assert.deepEqual(notificationPlan([ev({}), ev({ id: 'x', lastDoneOn: '2025-01-01' })], today, { enabled: false }), []);
});

test('a late reminder comes once a week until the maintenance is recorded', () => {
  const late = ev({ lastDoneOn: '2025-10-02' }); // due 2026-10-02
  assert.equal(late.status, 'overdue');
  assert.equal(late.overdueSince, '2026-10-02');
  const plan = notificationPlan([late], today);
  assert.equal(plan.length, OVERDUE_HORIZON_WEEKS);
  assert.ok(plan.every((p) => p.kind === 'overdue'));
  // Every 7 days from the due date, none in the past: 2 Oct + 7k, the first after 19 Nov is 20 Nov.
  assert.equal(plan[0].on, '2026-11-20');
  for (let i = 1; i < plan.length; i++) assert.equal((Date.parse(plan[i].on) - Date.parse(plan[i - 1].on)) / 86400000, 7);
  // « Rappeler si en retard » off: nothing.
  assert.deepEqual(notificationPlan([late], today, { remindOverdue: false }), []);
  // Recorded: it is not late any more, and no late reminder remains.
  const done = ev({ lastDoneOn: today });
  assert.ok(!notificationPlan([done], today).some((p) => p.kind === 'overdue'));
});

test('a late reminder by dives counts from the dive that reached the number', () => {
  const keys = ['2026-11-10', '2026-11-11', '2026-11-12'].map((d) => `${d}T10:00:00`);
  const late = ev({ intervalMonths: null, intervalDives: 2, lastDoneOn: '2026-11-01' }, keys);
  assert.equal(late.status, 'overdue');
  assert.equal(late.overdueSince, '2026-11-11');
  assert.equal(notificationPlan([late], today)[0].on, '2026-11-25');
});

test('« Me le rappeler dans 1 semaine »: the first late reminder comes on the snooze day, then weekly', () => {
  const late = ev({ lastDoneOn: '2025-10-02' });
  const plan = notificationPlan([late], today, { snoozed: { m1: '2026-11-26' } });
  assert.equal(plan[0].on, '2026-11-26');
  assert.equal(plan[1].on, '2026-12-03');
  // A snooze already past changes nothing.
  assert.equal(notificationPlan([late], today, { snoozed: { m1: '2026-11-10' } })[0].on, '2026-11-20');
});

test('notifications come at 9:00 local time; the flight reminder keeps the end of the wait', () => {
  assert.equal(NOTIFICATION_HOUR, 9);
  const at = notificationMoment('2026-12-12');
  assert.deepEqual([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()], [2026, 11, 12, 9, 0]);
  const now = '2026-11-06T18:30:00';
  const dives = flightDives([{ date: '2026-11-06T13:40:00', endDate: '2026-11-06T14:35:00', durationSeconds: 3300, maxDepthMm: 20000 }], now);
  const notice = flightNotice(dives, 'auto', now);
  assert.ok(notice);
  assert.notEqual(`${notice.at.getHours()}:${notice.at.getMinutes()}`, '9:0', 'the flight notification is not moved to 9:00');
  // And the flight reminder does not use the 9:00 moment.
  const source = readFileSync(new URL('../../app/src/lib/flight-reminder.svelte.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('notificationMoment'));
});

test('a retired piece and a dive computer have no reminder, no badge and no notification; their history stays', () => {
  const items = [
    item({ id: 'a', gearId: 'reg' }),
    item({ id: 'b', gearId: 'old', lastDoneOn: '2025-01-01' }),
    item({ id: 'c', gearId: 'dc', task: 'battery', lastDoneOn: '2025-01-01', history: [{ id: 'h', kind: 'service', doneOn: '2025-01-01' }] }),
  ];
  const pieces = [
    { id: 'reg', type: 'regulator' },
    { id: 'old', type: 'regulator', retired: true },
    { id: 'dc', type: 'computer' },
  ];
  const all = evaluateAll({ items, pieces, diveKeysOf: () => [], today });
  assert.deepEqual(all.map((e) => e.item.id), ['a']);
  assert.ok(notificationPlan(all, today).every((p) => p.itemId === 'a'));
  // Put back in service: the reminder returns with its history (nothing was deleted).
  const back = evaluateAll({ items, pieces: [{ id: 'reg', type: 'regulator' }, { id: 'old', type: 'regulator' }], diveKeysOf: () => [], today });
  assert.deepEqual(back.map((e) => e.item.id).sort(), ['a', 'b']);
});

test('the stamp on a bottle: 03/22 is the first of March 2022, and back', async () => {
  const { parseStamp, stampOf } = await import('../../app/src/lib/maintenance.js');
  assert.equal(parseStamp('03/22'), '2022-03-01');
  assert.equal(parseStamp(' 3 / 22 '), '2022-03-01');
  assert.equal(parseStamp('13/22'), null);
  assert.equal(parseStamp('2022-03-01'), null);
  assert.equal(stampOf('2022-03-01'), '03/22');
});

test('adding an overdue piece to a dive: it stays selectable and says what is late, only when its reminder warns', () => {
  const source = readFileSync(new URL('../../app/src/components/AddEquipmentSheet.svelte', import.meta.url), 'utf8');
  assert.match(source, /e\.status !== 'overdue' \|\| !e\.item\.warnInDive\) continue/);
  assert.match(source, /warning=\{\(g\) => lateOf\.get\(g\.id\) \?\? ''\}/);
  const picker = readFileSync(new URL('../../app/src/components/GearPicker.svelte', import.meta.url), 'utf8');
  assert.match(picker, /\{#if warning\(g\)\}<span class="od-gear-picker--warning"><Icon name="warning"/);
  // The row is a checkbox button like any other: the warning does not disable it.
  assert.match(picker, /role="checkbox" aria-checked=\{on\} \{disabled\}/);
});
