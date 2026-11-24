// Actions on several dives (task 178): the merge rule and the « Plusieurs valeurs » state of
// « Modifier ensemble », and the changes it sends to the core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canMerge, chipsOf, mergeErrorKey, multiEditChanges, multiEditState } from '../../app/src/lib/multi-dive.js';

/** A dive of the list: `start` as « HH:MM » on 5 November 2012, `minutes` long. */
const dive = (id, start, minutes, date = '2012-11-05') => ({ id, number: id, date: `${date}T${start}:00`, durationSeconds: minutes * 60 });

const day = [dive(1, '08:00', 40), dive(2, '09:00', 45), dive(3, '10:20', 30), dive(4, '14:00', 50)];

test('merge numbering conflicts are explained without hiding other errors', () => {
  assert.equal(mergeErrorKey('CORE_ERROR: NUMBERING_CONFLICT'), 'multiDive.mergeNumberConflict');
  assert.equal(mergeErrorKey('WRITE_LOCKED'), 'edit.writeLocked');
  assert.equal(mergeErrorKey('OTHER_ERROR'), 'multiDive.mergeFailed');
});

test('two dives following each other, 20 minutes apart, can be merged', () => {
  // Dive 1 ends at 08:40, dive 2 starts at 09:00.
  assert.deepEqual(canMerge(day, [1, 2]), { ok: true, reason: '' });
});

test('the selection order does not matter', () => {
  assert.equal(canMerge(day, [2, 1]).ok, true);
});

test('exactly an hour apart qualifies, a minute more does not', () => {
  const hour = [dive(1, '08:00', 40), dive(2, '09:40', 30)];
  assert.equal(canMerge(hour, [1, 2]).ok, true);
  const more = [dive(1, '08:00', 40), dive(2, '09:41', 30)];
  assert.deepEqual(canMerge(more, [1, 2]), { ok: false, reason: 'gap' });
});

test('dives 2 hours apart cannot be merged', () => {
  // Dive 3 ends at 10:50; dive 4 starts at 14:00.
  assert.deepEqual(canMerge(day, [3, 4]), { ok: false, reason: 'gap' });
});

test('another dive between the selected ones leaves the item disabled', () => {
  assert.deepEqual(canMerge(day, [1, 3]), { ok: false, reason: 'notConsecutive' });
  assert.deepEqual(canMerge(day, [1, 2, 4]), { ok: false, reason: 'notConsecutive' });
});

test('overlapping dives (two dive computers) qualify', () => {
  const two = [dive(1, '08:00', 60), dive(2, '08:10', 45)];
  assert.equal(canMerge(two, [1, 2]).ok, true);
});

test('a long first dive that outlasts the next one still counts as the end', () => {
  // 1 ends 10:00, 2 (08:10 to 08:20) is inside it, 3 starts 10:50: 50 minutes after dive 1 ends.
  const nested = [dive(1, '08:00', 120), dive(2, '08:10', 10), dive(3, '10:50', 20)];
  assert.equal(canMerge(nested, [1, 2, 3]).ok, true);
  const far = [dive(1, '08:00', 120), dive(2, '08:10', 10), dive(3, '11:10', 20)];
  assert.deepEqual(canMerge(far, [1, 2, 3]), { ok: false, reason: 'gap' });
});

test('three dives in a chain can be merged; one dive, none or an unknown dive cannot', () => {
  assert.equal(canMerge(day, [1, 2, 3]).ok, true);
  assert.deepEqual(canMerge(day, [1]), { ok: false, reason: 'count' });
  assert.deepEqual(canMerge(day, []), { ok: false, reason: 'count' });
  assert.deepEqual(canMerge(day, [1, 99]), { ok: false, reason: 'count' });
});

test('dives on two days are compared by their real times', () => {
  const night = [dive(1, '23:30', 40, '2012-11-05'), dive(2, '00:30', 30, '2012-11-06')];
  // Ends 00:10, next starts 00:30.
  assert.equal(canMerge(night, [1, 2]).ok, true);
});

// --- « Modifier ensemble » ---------------------------------------------------

const detail = (id, over) => ({
  id,
  site: 'Blue Hole',
  notes: '',
  suit: '5 mm',
  userSalinity: 10300,
  buddies: [],
  guides: [],
  tags: [],
  ...over,
});

const three = [
  detail(1, { site: 'Blue Hole', buddies: ['Ann', 'Bob'], tags: ['boat'] }),
  detail(2, { site: 'Reef', buddies: ['Ann'], tags: ['boat', 'night'], notes: 'cold' }),
  detail(3, { site: 'Blue Hole', buddies: ['Ann', 'Cy'], tags: ['boat'] }),
];

test('a field whose values differ is « Plusieurs valeurs »; the others show their value', () => {
  const state = multiEditState(three);
  assert.equal(state.count, 3);
  assert.equal(state.site.mixed, true);
  assert.equal(state.notes.mixed, true);
  assert.deepEqual(state.suit, { mixed: false, value: '5 mm' });
  assert.deepEqual(state.salinity, { mixed: false, value: 10300 });
});

test('chips: those of every dive first, then those of some with their count', () => {
  const state = multiEditState(three);
  assert.deepEqual(state.buddies, [
    { name: 'Ann', count: 3, common: true },
    { name: 'Bob', count: 1, common: false },
    { name: 'Cy', count: 1, common: false },
  ]);
  assert.deepEqual(state.tags, [
    { name: 'boat', count: 3, common: true },
    { name: 'night', count: 1, common: false },
  ]);
  assert.deepEqual(state.guides, []);
});

test('chips of some dives are ordered by number of dives, then name', () => {
  const chips = chipsOf([['b', 'c'], ['c', 'a'], ['c', 'a'], ['d']]);
  assert.deepEqual(chips.map((c) => `${c.name}:${c.count}`), ['c:3', 'a:2', 'b:1', 'd:1']);
});

test('nothing edited sends nothing', () => {
  assert.deepEqual(multiEditChanges(multiEditState(three), {}), {});
});

test('a mixed field left alone is not sent; changed, it is, even to the value of one dive', () => {
  const state = multiEditState(three);
  assert.deepEqual(multiEditChanges(state, { notes: undefined }), {});
  assert.deepEqual(multiEditChanges(state, { notes: 'cold' }), { notes: 'cold' });
  assert.deepEqual(multiEditChanges(state, { site: 7 }), { site: 7 });
});

test('a shared field is sent only when it changes', () => {
  const state = multiEditState(three);
  assert.deepEqual(multiEditChanges(state, { suit: '5 mm', salinity: 10300 }), {});
  assert.deepEqual(multiEditChanges(state, { suit: '7 mm', salinity: 10000 }), { suit: '7 mm', userSalinity: 10000 });
});

test('chips: a chip removed is sent as removed, a chip added as added, nothing is replaced', () => {
  const state = multiEditState(three);
  // Bob and Cy are left as they are; Ann is removed from all; Dee is added to all.
  const changes = multiEditChanges(state, { buddies: ['Bob', 'Cy', 'Dee'], tags: ['boat', 'night', 'wreck'] });
  assert.deepEqual(changes, { buddiesAdd: ['Dee'], buddiesRemove: ['Ann'], tagsAdd: ['wreck'] });
});

test('chips left as they are send nothing, a chip of only some dives included', () => {
  const state = multiEditState(three);
  assert.deepEqual(multiEditChanges(state, { buddies: ['Ann', 'Bob', 'Cy'], tags: ['boat', 'night'] }), {});
});

test('guides go through the diveguide keys', () => {
  const state = multiEditState([detail(1, { guides: ['Zoe'] }), detail(2, { guides: [] })]);
  assert.deepEqual(multiEditChanges(state, { guides: [] }), { diveguideRemove: ['Zoe'] });
  assert.deepEqual(multiEditChanges(state, { guides: ['Zoe', 'Yan'] }), { diveguideAdd: ['Yan'] });
});

// --- Tabs and new fields (tasks 2026-11-24-384 and 385) ----------------------------------------------------------------

import { spreadOf, spreadText } from '../../app/src/lib/multi-dive.js';

/** A dive as the core's getDive gives it, with the fields « Modifier ensemble » reads. */
const diveDetail = (over = {}) => ({
  site: '', notes: '', suit: '', userSalinity: 0, buddies: [], guides: [], tags: [], rating: 0, visibility: 0, divemode: 'OC', weights: [],
  ...over,
});

test('the state holds note, visibility, dive mode and the total weight, mixed or shared', () => {
  const state = multiEditState([
    diveDetail({ rating: 3, visibility: 4, divemode: 'CCR', weights: [{ grams: 8000, description: 'belt' }, { grams: 4000, description: 'integrated' }] }),
    diveDetail({ rating: 3, visibility: 2, divemode: 'OC', weights: [{ grams: 12000, description: 'belt' }] }),
  ]);
  assert.deepEqual(state.rating, { mixed: false, value: 3 });
  assert.equal(state.visibility.mixed, true);
  assert.equal(state.mode.mixed, true);
  assert.deepEqual(state.weight, { mixed: false, value: 12000 }, 'two weight entries are one total');
  assert.deepEqual(multiEditState([diveDetail(), diveDetail({ divemode: '' })]).mode, { mixed: false, value: 'OC' }, 'no mode is open circuit');
});

test('the spread names each value once with the number of dives, in the order they first appear', () => {
  assert.deepEqual(spreadOf(['Taylor', '', '']), [{ value: 'Taylor', count: 1 }, { value: '', count: 2 }]);
  assert.equal(spreadText(['Taylor', '', ''], (v) => v || 'aucun'), 'Taylor (1), aucun (2)');
  assert.equal(spreadText([12000, 12000, 14000], (g) => `${g / 1000} kg`), '12 kg (2), 14 kg (1)');
  assert.equal(spreadText(['OC', 'OC', 'CCR'], (m) => m), 'OC (2), CCR (1)');
});

test('the new fields are sent only when they are touched and differ, or when the dives differ', () => {
  const state = multiEditState([
    diveDetail({ rating: 3, visibility: 4, divemode: 'CCR', weights: [{ grams: 12000, description: 'belt' }] }),
    diveDetail({ rating: 3, visibility: 2, divemode: 'CCR', weights: [{ grams: 12000, description: 'belt' }] }),
  ]);
  // Same note, same mode and same weight on both dives: giving them back is no change.
  assert.deepEqual(multiEditChanges(state, { rating: 3, mode: 'CCR', weightGrams: 12000 }), {});
  // Visibility differs: even the value of the first dive is a change for the second.
  assert.deepEqual(multiEditChanges(state, { visibility: 4 }), { visibility: 4 });
  assert.deepEqual(multiEditChanges(state, { rating: 5, mode: 'PSCR', weightGrams: 9000 }), { rating: 5, divemode: 'PSCR', weightGrams: 9000 });
  // Clearing the stars sends 0.
  assert.deepEqual(multiEditChanges(state, { rating: 0 }), { rating: 0 });
});

test('« Ajouter aux notes » is sent as a text to append, trimmed, and nothing when empty', () => {
  const state = multiEditState([diveDetail({ notes: 'a' }), diveDetail({ notes: 'b' })]);
  assert.deepEqual(multiEditChanges(state, { notesAppend: '  Mer calme\n' }), { notesAppend: 'Mer calme' });
  assert.deepEqual(multiEditChanges(state, { notesAppend: '   ' }), {});
  assert.deepEqual(multiEditChanges(state, {}), {});
});

test('the subtitle is only the dive numbers, the most recent first', async () => {
  const { subtitleOf } = await import('../../app/src/lib/multi-dive.js');
  const text = (dives) => subtitleOf(dives).replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(text([{ number: 7, date: '2026-02-07T09:00:00' }, { number: 9, date: '2026-09-14T10:15:00' }, { number: 8, date: '2026-06-30T13:40:00' }]), 'N° 9, 8 et 7');
  assert.equal(text([{ number: 6, date: '2015-05-23T13:23:00' }, { number: 7, date: '2022-04-24T10:30:00' }]), 'N° 7 et 6');
  assert.equal(text([{ number: 0, date: '2026-02-07T09:09:00' }]), '2026-02-07T09:09');
});
