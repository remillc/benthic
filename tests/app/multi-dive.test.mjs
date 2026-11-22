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
