import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renumberFromPlan } from '../../app/src/lib/renumber-from.js';

test('renumber from the selected dive in core order, suggesting the preceding number plus one', () => {
  const dives = [{ id: 8, number: 12 }, { id: 2, number: 0 }, { id: 7, number: 22 }, { id: 4, number: 40 }];
  assert.deepEqual(renumberFromPlan(dives, 2), { ids: [2, 7, 4], suggested: 13, conflict: null });
  assert.deepEqual(renumberFromPlan(dives, 7), { ids: [7, 4], suggested: 1, conflict: null });
  assert.deepEqual(renumberFromPlan(dives, 8), { ids: [8, 2, 7, 4], suggested: 1, conflict: null });
  assert.equal(renumberFromPlan(dives, 99), null);
});

test('reject any new number used by an earlier dive, not just the first number', () => {
  const dives = [{ id: 1, number: 30 }, { id: 2, number: 4 }, { id: 3, number: 50 }, { id: 4, number: 60 }];
  assert.equal(renumberFromPlan(dives, 3, 29).conflict, 30);
  assert.equal(renumberFromPlan(dives, 3, 30).conflict, 30);
  assert.equal(renumberFromPlan(dives, 3, 31).conflict, null);
});
