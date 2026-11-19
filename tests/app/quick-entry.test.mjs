// SPDX-License-Identifier: GPL-2.0
// The quick entry after a download (task 2026-11-14-151): which new dives it opens for, and in which order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDivesWithoutSite, quickEntryUrl } from '../../app/src/lib/quick-entry.js';

test('the address of the quick entry carries the following dives', () => {
  assert.equal(quickEntryUrl([7]), '/dives/7/complete');
  assert.equal(quickEntryUrl([7, 9, 12]), '/dives/7/complete?next=9,12');
});

test('it opens for the new dives without a site, the oldest first', () => {
  const dives = [
    { id: 1, date: '2026-01-01T10:00:00', site: '' }, // already there
    { id: 2, date: '2026-02-02T10:00:00', site: '' },
    { id: 3, date: '2026-02-01T10:00:00', site: '' },
    { id: 4, date: '2026-02-03T10:00:00', site: 'Lock 23' }, // has a site
    { id: 5, date: '2026-02-04T10:00:00', site: '' }, // merged into a dive already there
  ];
  assert.deepEqual(newDivesWithoutSite(dives, new Set([1]), [5]), [3, 2]);
});

test('nothing opens when every new dive has a site, or nothing is new', () => {
  const dives = [{ id: 1, date: '2026-01-01T10:00:00', site: 'Lock 23' }];
  assert.deepEqual(newDivesWithoutSite(dives, new Set()), []);
  assert.deepEqual(newDivesWithoutSite(dives, new Set([1])), []);
});
