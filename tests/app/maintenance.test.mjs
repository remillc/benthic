// Maintenance of the equipment (task 2026-11-18-274) and the equipment changes of task 273: a new piece of each type,
// a kit duplicated and deleted, « Remplir avec », the due dates by time and by dives, the first criterion reached
// winning, the badge count, the warning in a dive, and the notification seam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createInventory, GEAR_TYPES, groupGear, applyKit, copyEquipment, emptyEquipment, kitUse, uniqueKitName, entryProblems, diveKeyOf } from '../../app/src/lib/inventory.js';
import {
  addMonths,
  daysBetween,
  evaluate,
  sections,
  overdueCount,
  diveWarnings,
  notificationPlan,
  applyNotificationPlan,
  setNotificationDeliverer,
  suggestionsFor,
  ruleProblems,
  nextDueAfter,
} from '../../app/src/lib/maintenance.js';

function setup() {
  let tick = 0;
  const inventory = createInventory(createFileStore(memoryBackend()), { now: () => new Date(Date.UTC(2026, 10, 17, 12, 0, tick++)) });
  return { inventory };
}

/** n dives, one per day, ending on `last` (YYYY-MM-DD): the keys the inventory uses. */
const keys = (n, last) => Array.from({ length: n }, (_, i) => `${new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7) - 1, +last.slice(8, 10) - i)).toISOString().slice(0, 10)}T10:00:00`);

const rule = (extra = {}) => ({
  format: 1,
  id: 'm1',
  createdAt: '',
  updatedAt: '',
  gearId: 'g1',
  task: 'service',
  intervalMonths: null,
  intervalDives: null,
  startOn: '2024-12-12',
  lastDoneOn: '2024-12-12',
  notifyDays: 30,
  warnInDive: true,
  history: [],
  ...extra,
});

test('a new piece can be created for each equipment type', async () => {
  assert.deepEqual(GEAR_TYPES, ['computer', 'regulator', 'suit', 'undersuit', 'cylinder', 'bcd', 'light', 'weights', 'mask', 'fins', 'scooter', 'camera', 'dsmb', 'floatBuoy', 'knife', 'diveKnife', 'compass', 'other']);
  const { inventory } = setup();
  for (const type of GEAR_TYPES) await inventory.saveGear({ type, name: `piece ${type}`, brand: 'Apeks' });
  const all = await inventory.listGear();
  assert.equal(all.length, GEAR_TYPES.length);
  assert.deepEqual(new Set(all.map((g) => g.type)), new Set(GEAR_TYPES));
  // The vest, weight belt and accessories go in « Autres », with the lamps.
  const groups = groupGear(all);
  assert.deepEqual(groups.find((g) => g.group === 'other').items.map((g) => g.type).sort(), ['bcd', 'camera', 'compass', 'diveKnife', 'dsmb', 'fins', 'floatBuoy', 'knife', 'light', 'mask', 'other', 'scooter', 'weights']);
});

test('a kit can be duplicated under a name no other kit has, then deleted without touching the dives', async () => {
  const { inventory } = setup();
  const a = await inventory.saveGear({ type: 'regulator', name: 'Apeks' });
  const kit = await inventory.saveKit({ name: 'Eau froide', gearIds: [a.id] });
  const copy = (n) => (n === 1 ? 'Eau froide (copie)' : `Eau froide (copie ${n})`);
  const name1 = uniqueKitName('Eau froide', (await inventory.listKits()).map((k) => k.name), copy);
  assert.equal(name1, 'Eau froide (copie)');
  const dup = await inventory.duplicateKit(kit.id, name1);
  assert.notEqual(dup.id, kit.id);
  assert.deepEqual(dup.gearIds, [a.id]);
  assert.equal(uniqueKitName('Eau froide', (await inventory.listKits()).map((k) => k.name), copy), 'Eau froide (copie 2)');
  await assert.rejects(inventory.duplicateKit(kit.id, 'Eau froide'), /INVALID_KIT:name/);

  await inventory.saveDiveEquipment('2026-11-03T10:00:00', { ...emptyEquipment(), gearIds: [a.id], kitId: kit.id });
  const use = kitUse(kit.id, await inventory.listDiveEquipment(), [{ date: '2026-11-03T10:00:00' }, { date: '2026-11-04T10:00:00' }]);
  assert.deepEqual(use, { dives: 1, last: '2026-11-03T10:00:00' });
  await inventory.deleteKit(kit.id);
  assert.equal((await inventory.listKits()).length, 1);
  const rec = (await inventory.listDiveEquipment())[0];
  assert.deepEqual(rec.gearIds, [a.id], 'the dive keeps its equipment');
  assert.equal(rec.kitId, '', 'only the kit link goes');
});

test('« Remplir avec »: a kit fills the dive, the previous dive copies its equipment, both can be undone by keeping the old value', () => {
  const suit = { id: 's', type: 'suit', name: 'D7', retired: false };
  const lamp = { id: 'l', type: 'light', name: 'VL4200P', retired: false };
  const map = new Map([suit, lamp].map((g) => [g.id, g]));
  const before = emptyEquipment();
  const filled = applyKit(before, { id: 'k', gearIds: ['s', 'l'] }, map);
  assert.equal(filled.suitGearId, 's');
  assert.deepEqual(filled.gearIds, ['l']);
  assert.equal(filled.kitId, 'k');
  assert.deepEqual(before, emptyEquipment(), 'the old value is intact');
  const copied = copyEquipment({ ...filled, adhoc: [{ id: 'x', name: 'Bouée' }] });
  assert.equal(copied.suitGearId, 's');
  assert.notEqual(copied.adhoc[0].id, 'x');
});

test('suggestions per type, and the rule fields are validated', () => {
  // Decided 19 November 2026 (task 309, docs/equipment-fields.md): the suggested service of a regulator is every 2
  // years or 100 dives (18 November had said yearly); a vest every year (it was every 2 years).
  assert.deepEqual(suggestionsFor('regulator')[0], { task: 'service', months: 24, dives: 100 });
  assert.deepEqual(suggestionsFor('bcd')[0], { task: 'service', months: 12 });
  // Only a drysuit has seals to change.
  assert.deepEqual(suggestionsFor('suit', { suitType: 'dry' }), [{ task: 'seals', months: 12 }]);
  assert.deepEqual(suggestionsFor('suit', { suitType: 'wet' }), []);
  assert.deepEqual(suggestionsFor('suit', {}), []);
  // Task 2026-11-19-308: « Contrôle avant voyage » is gone (an inspection noted by hand), and a computer has no reminder.
  assert.equal(suggestionsFor('regulator').length, 1);
  assert.deepEqual(suggestionsFor('computer'), []);
  assert.deepEqual(suggestionsFor('cylinder').map((s) => s.task), ['inspection', 'hydrostatic']);
  assert.deepEqual(suggestionsFor('weights'), []);
  assert.deepEqual(ruleProblems({ months: null, dives: null }), { criteria: 'none' });
  assert.deepEqual(ruleProblems({ months: 24, dives: null }), {});
  assert.deepEqual(ruleProblems({ months: 0, dives: 5000 }), { months: 'range' });
  assert.deepEqual(ruleProblems({ months: 2.5, dives: 0 }), { months: 'range', dives: 'range' });
});

test('months are added to the day, clamped at the end of the month', () => {
  assert.equal(addMonths('2024-12-12', 24), '2026-12-12');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(daysBetween('2026-11-17', '2026-12-12'), 25);
});

test('due by time: every 2 years from the last service', () => {
  const e = evaluate(rule({ intervalMonths: 24 }), [], '2026-11-17');
  assert.equal(e.dueDate, '2026-12-12');
  assert.equal(e.daysLeft, 25);
  assert.equal(e.status, 'soon');
  assert.equal(e.first, 'time');
  const late = evaluate(rule({ intervalMonths: 24, lastDoneOn: '2024-10-02', startOn: '2024-10-02' }), [], '2026-11-17');
  assert.equal(late.daysLeft, -46);
  assert.equal(late.status, 'overdue');
  assert.equal(evaluate(rule({ intervalMonths: 24, lastDoneOn: '2026-05-01' }), [], '2026-11-17').status, 'ok');
});

test('due by dives: only the dives with the piece after the last service count', () => {
  const dives = [...keys(82, '2026-11-10'), '2024-12-12T09:00:00', '2024-11-01T09:00:00'];
  const e = evaluate(rule({ intervalDives: 100 }), dives, '2026-11-17');
  assert.equal(e.divesSince, 82, 'the service day and the dives before it are not counted');
  assert.equal(e.divesLeft, 18);
  assert.equal(e.dueDate, null);
  assert.equal(e.first, 'dives');
  assert.equal(evaluate(rule({ intervalDives: 82 }), dives, '2026-11-17').status, 'overdue');
  assert.equal(evaluate(rule({ intervalDives: 83 }), dives, '2026-11-17').status, 'soon');
  assert.equal(evaluate(rule({ intervalDives: 82 }), dives, '2026-11-17').divesReached, true);
  // Before any service, the count starts the day the rule was set.
  const fresh = evaluate(rule({ intervalDives: 10, lastDoneOn: undefined, startOn: '2026-11-05' }), keys(20, '2026-11-17'), '2026-11-17');
  assert.equal(fresh.divesSince, 13);
});

test('with both criteria the first reached wins', () => {
  // Time not reached, dives reached: overdue by the dives.
  let e = evaluate(rule({ intervalMonths: 24, intervalDives: 10 }), keys(10, '2026-05-01'), '2026-11-17');
  assert.equal(e.status, 'overdue');
  assert.equal(e.first, 'dives');
  assert.equal(e.timeReached, false);
  // Time reached, dives not: overdue by the time.
  e = evaluate(rule({ intervalMonths: 24, intervalDives: 100, lastDoneOn: '2024-10-02' }), keys(5, '2026-11-01'), '2026-11-17');
  assert.equal(e.status, 'overdue');
  assert.equal(e.first, 'time');
  assert.equal(e.divesReached, false);
  // Neither reached: the nearer one is named. 18 dives left at this pace take 81 days, the date is in 25.
  e = evaluate(rule({ intervalMonths: 24, intervalDives: 100 }), keys(82, '2026-11-16'), '2026-11-17');
  assert.equal(e.status, 'soon');
  assert.equal(e.daysLeft, 25);
  assert.equal(e.divesLeft, 18);
  assert.equal(e.estimatedDays, 81);
  assert.equal(e.first, 'time');
  // 5 dives left at a pace of 95 a year take 20 days, the date is in 104.
  e = evaluate(rule({ intervalMonths: 24, intervalDives: 100, lastDoneOn: '2025-03-01' }), keys(95, '2026-11-16'), '2026-11-17');
  assert.equal(e.daysLeft, 104);
  assert.equal(e.estimatedDays, 20);
  assert.equal(e.first, 'dives');
  assert.equal(e.status, 'soon');
});

test('the sections order the reminders by urgency and the badge counts the overdue ones', () => {
  const today = '2026-11-17';
  const evals = [
    evaluate(rule({ id: 'a', intervalMonths: 24, lastDoneOn: '2024-10-02' }), [], today), // 46 days late
    evaluate(rule({ id: 'b', intervalMonths: 24, lastDoneOn: '2024-12-12' }), [], today), // in 25 days
    evaluate(rule({ id: 'c', intervalMonths: 12, lastDoneOn: '2026-03-14' }), [], today), // in 4 months
    evaluate(rule({ id: 'd', intervalMonths: 12, lastDoneOn: '2025-11-01' }), [], today), // 15 days late
    evaluate(rule({ id: 'e', intervalMonths: null, intervalDives: null }), [], today), // no rule
  ];
  const s = sections(evals);
  assert.deepEqual(s.overdue.map((e) => e.item.id), ['a', 'd']);
  assert.deepEqual(s.soon.map((e) => e.item.id), ['b']);
  assert.deepEqual(s.ok.map((e) => e.item.id), ['c']);
  assert.deepEqual(s.counts, { overdue: 2, soon: 1, ok: 1 });
  assert.equal(overdueCount(evals), 2);
});

test('the dive edit warns about an overdue piece that is in the equipment, only when the warning is on', () => {
  const today = '2026-11-17';
  const overdue = evaluate(rule({ id: 'a', gearId: 'reg', intervalMonths: 12, lastDoneOn: '2025-01-01' }), [], today);
  const quiet = evaluate(rule({ id: 'b', gearId: 'lamp', intervalMonths: 12, lastDoneOn: '2025-01-01', warnInDive: false }), [], today);
  const fine = evaluate(rule({ id: 'c', gearId: 'suit', intervalMonths: 12, lastDoneOn: '2026-10-01' }), [], today);
  const all = [overdue, quiet, fine];
  const equipment = { ...emptyEquipment(), suitGearId: 'suit', gearIds: ['reg', 'lamp'] };
  assert.deepEqual(diveWarnings(equipment, all).map((e) => e.item.id), ['a']);
  assert.deepEqual(diveWarnings({ ...emptyEquipment(), gearIds: ['lamp'] }, all), []);
});

test('the notifications: 30 days before and on the day, the lead set by the rule, nothing for what is past', () => {
  const today = '2026-11-17';
  const e1 = evaluate(rule({ id: 'a', intervalMonths: 24 }), [], today); // due 2026-12-12
  const e2 = evaluate(rule({ id: 'b', intervalMonths: 24, notifyDays: 14, lastDoneOn: '2025-02-01' }), [], today); // due 2027-02-01
  const e3 = evaluate(rule({ id: 'c', intervalMonths: 24, lastDoneOn: '2024-10-02' }), [], today); // overdue
  const e4 = evaluate(rule({ id: 'd', intervalMonths: 6, notifyDays: 60, lastDoneOn: '2026-06-01' }), [], today); // due 2026-12-01, lead already past
  const all = notificationPlan([e1, e2, e3, e4], today);
  // Task 2026-11-19-308: an overdue reminder (c) now gets a weekly reminder; the lead and the due day are what this test reads.
  const plan = all.filter((p) => p.kind !== 'overdue');
  assert.ok(all.filter((p) => p.itemId === 'c').every((p) => p.kind === 'overdue'));
  assert.deepEqual(
    plan.map((p) => [p.id, p.on]),
    [
      ['d:due', '2026-12-01'],
      ['a:due', '2026-12-12'],
      ['b:lead', '2027-01-18'],
      ['b:due', '2027-02-01'],
    ],
  );
  // a's lead (12 November) is before today: only the day itself comes.
  assert.ok(!plan.some((p) => p.id === 'a:lead'));
  assert.ok(!plan.some((p) => p.itemId === 'c'));
  // 60 days before 1 December is in the past, so no lead for d.
  assert.ok(!plan.some((p) => p.id === 'd:lead'));
});

test('a lead that is still to come is planned, and a dive criterion is dated from the pace of the last year', () => {
  const today = '2026-11-17';
  const far = evaluate(rule({ id: 'a', intervalMonths: 24, lastDoneOn: '2025-03-01' }), [], today); // due 2027-03-01
  assert.deepEqual(notificationPlan([far], today).map((p) => [p.kind, p.on]), [['lead', '2027-01-30'], ['due', '2027-03-01']]);
  // 100 dives in a year, 40 left in the rule: the dives are expected in 146 days, 2027-04-12.
  const byDives = evaluate(rule({ id: 'b', intervalDives: 140, lastDoneOn: '2026-01-01' }), keys(100, '2026-11-16'), today);
  assert.equal(byDives.divesLeft, 40);
  assert.equal(byDives.estimatedDays, 146);
  assert.deepEqual(notificationPlan([byDives], today).map((p) => p.on), ['2027-03-13', '2027-04-12']);
  // No pace, no notification.
  assert.deepEqual(notificationPlan([evaluate(rule({ id: 'c', intervalDives: 100 }), [], today)], today), []);
});

test('the seam receives the plan; by default nothing is delivered', async () => {
  const today = '2026-11-17';
  const plan = notificationPlan([evaluate(rule({ id: 'a', intervalMonths: 24, lastDoneOn: '2025-03-01' }), [], today)], today);
  await applyNotificationPlan(plan); // the default deliverer does nothing and does not throw
  const calls = [];
  setNotificationDeliverer(async (p) => void calls.push(p));
  await applyNotificationPlan(plan);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map((p) => p.on), ['2027-01-30', '2027-03-01']);
  setNotificationDeliverer(async () => {});
});

test('the store: a reminder, a service noted, the next date, the rule removed, the piece deleted', async () => {
  const { inventory } = setup();
  const reg = await inventory.saveGear({ type: 'regulator', name: 'Apeks XTX50' });
  await assert.rejects(inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: null, intervalDives: null }), /INVALID_RULE:criteria/);
  const item = await inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: 24, intervalDives: 100 });
  assert.equal(item.notifyDays, null, 'a new reminder follows the default lead time');
  assert.equal(item.warnInDive, true);
  assert.deepEqual(item.history, []);
  const photo = await inventory.savePhoto('data:image/jpeg;base64,AAAA');
  assert.equal(await inventory.readPhoto(photo), 'data:image/jpeg;base64,AAAA');
  const noted = await inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-11-17', doneBy: ' Plongée Nordique ', cost: 190, notes: 'Membranes', invoicePhotoId: photo });
  assert.equal(noted.lastDoneOn, '2026-11-17');
  assert.equal(noted.history[0].doneBy, 'Plongée Nordique');
  assert.equal(nextDueAfter(noted, '2026-11-17'), '2028-11-17', 'the next date is the new service plus two years');
  await inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'inspection', doneOn: '2024-02-03' });
  const again = (await inventory.listMaintenance())[0];
  assert.equal(again.lastDoneOn, '2026-11-17', 'an older entry does not move the last service back');
  assert.deepEqual(again.history.map((h) => h.doneOn), ['2026-11-17', '2024-02-03']);
  await assert.rejects(inventory.noteMaintenance({ gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-13-40' }), /INVALID_ENTRY:doneOn/);
  assert.deepEqual(entryProblems({ doneOn: '2026-11-17', cost: '190,50' }), {});
  assert.deepEqual(entryProblems({ doneOn: '2026-11-17', cost: '1a' }), { cost: 'number' });

  await inventory.removeRule(item.id);
  const kept = (await inventory.listMaintenance())[0];
  assert.equal(kept.intervalMonths, null);
  assert.equal(kept.history.length, 2, 'the history stays');

  // A note on a piece with no reminder creates a reminder without a rule.
  const lamp = await inventory.saveGear({ type: 'light', name: 'Lampe' });
  const created = await inventory.noteMaintenance({ gearId: lamp.id, task: 'service' }, { kind: 'other', doneOn: '2026-01-02' });
  assert.equal(created.intervalMonths, null);

  await inventory.deleteGear(reg.id);
  const left = await inventory.listMaintenance();
  assert.deepEqual(left.map((m) => m.gearId), [lamp.id], 'the piece takes its reminders with it');
  assert.equal(await inventory.readPhoto(photo), '', 'and the invoice photo');
});

test('the dive key of a row is its start to the second', () => {
  assert.equal(diveKeyOf({ date: '2026-11-17T10:00:00Z' }), '2026-11-17T10:00:00');
});

// --- Text keys: every key the maintenance and equipment screens use exists in fr and en; fr-CA says « entretien ». ---
import { readFileSync } from 'node:fs';
import { TASKS, SUGGESTIONS } from '../../app/src/lib/maintenance.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const catalog = (n) => JSON.parse(read(`i18n/${n}.json`));
const has = (o, key) => key.split('.').reduce((n, k) => (n == null ? undefined : n[k]), o) != null;

test('every literal maintenance key used by the screens exists in fr and en', () => {
  const files = [
    'pages/ProfileMaintenance.svelte',
    'pages/ProfilePieceMaintenance.svelte',
    'pages/ProfileMaintenanceNote.svelte',
    'pages/ProfilePieceEdit.svelte',
    'pages/ProfileGear.svelte',
    'pages/ProfileDiver.svelte',
    'pages/ProfilePiece.svelte',
    'pages/ProfileKit.svelte',
    'components/MaintenanceRuleSheet.svelte',
    'components/DiveGearTop.svelte',
    'lib/maintenance-text.js',
    'lib/maintenance-notify.js',
    'lib/maintenance-export.js',
  ];
  for (const f of files) {
    for (const [, key] of read(f).matchAll(/['`]((?:maintenance|gear\.pieceNew|gear\.kit|gear\.diveGear)\.[A-Za-z.]+)['`]/g)) {
      for (const lang of ['fr', 'en']) assert.ok(has(catalog(lang), key), `${f}: ${key} missing in ${lang}`);
    }
  }
});

test('the dynamic maintenance keys exist for every task, kind, type and figure', () => {
  for (const lang of ['fr', 'en']) {
    const c = catalog(lang);
    for (const task of TASKS.filter((x) => x !== 'custom')) assert.ok(has(c, `maintenance.task.${task}`), `${lang} task ${task}`);
    for (const kind of ['service', 'inspection', 'other']) assert.ok(has(c, `maintenance.kind.${kind}`) && has(c, `maintenance.kindHelp.${kind}`), `${lang} kind ${kind}`);
    for (const type of Object.keys(SUGGESTIONS)) assert.ok(has(c, `maintenance.reminderCard.suggest.${type}`), `${lang} suggest ${type}`);
    for (const type of GEAR_TYPES) assert.ok(has(c, `gear.pieceNew.tile.${type}`), `${lang} tile ${type}`);
    for (const k of ['overdue', 'soon', 'ok']) assert.ok(has(c, `maintenance.figures.${k}`) && has(c, `maintenance.sections.${k}`));
  }
});

test('the vocabulary: fr-CA entretien and épreuve hydraulique, fr révision and requalification, en Service', () => {
  const fr = catalog('fr');
  const ca = catalog('fr-CA');
  const en = catalog('en');
  assert.equal(fr.maintenance.task.service, 'Révision');
  assert.equal(ca.maintenance.task.service, 'Entretien');
  assert.equal(en.maintenance.task.service, 'Service');
  assert.equal(fr.maintenance.task.hydrostatic, 'Requalification');
  assert.equal(ca.maintenance.task.hydrostatic, 'Épreuve hydraulique');
  assert.equal(en.maintenance.task.hydrostatic, 'Hydrostatic test');
  assert.equal(ca.maintenance.note.title, 'Noter un entretien');
  assert.equal(fr.maintenance.note.title, 'Noter une révision');
  assert.equal(ca.maintenance.ruleSheet.title, 'Rappel d’entretien');
  assert.equal(fr.maintenance.ruleSheet.title, 'Rappel de révision');
});

test('the routes exist in the release edition, and the notification seam is wired at start', () => {
  const app = read('App.svelte');
  for (const path of ["'/profile/maintenance/'", "'/profile/gear/:id/maintenance'", "'/profile/gear/:id/maintenance/note'"]) assert.ok(app.includes(path), path);
  assert.match(app, /isRelease\s*\)\s*\{[\s\S]*?startMaintenanceNotifications\(\)/);
  assert.match(read('lib/maintenance-notify.js'), /setNotificationDeliverer\(deliver\)/);
  // The flight reminder's listener leaves the maintenance notifications to theirs.
  assert.match(read('lib/flight-reminder.svelte.js'), /extra\?\.maintenance === true\) return/);
});

test('the release notes mention the new equipment and the maintenance', () => {
  for (const lang of ['fr', 'en']) {
    const notes = catalog(lang).about.releaseNotes;
    assert.ok(notes.some((n) => /(Remplir avec|Fill with)/.test(n)));
    assert.ok(notes.some((n) => /(Révisions de l’équipement|Equipment service)/.test(n)));
  }
});
