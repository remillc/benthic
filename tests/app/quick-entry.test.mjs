// SPDX-License-Identifier: GPL-2.0
// The quick entry after a download (task 2026-11-14-151): which new dives it opens for, and in which order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDivesWithoutSite, quickEntryUrl } from '../../app/src/lib/quick-entry.js';
import { logbook, saveDiveChanges } from '../../app/src/lib/logbook.svelte.js';
import { BenthicCore } from 'benthic-core';

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

test('saving a site refreshes the logbook list while preserving the edit and undo', async () => {
  const before = [{ id: 7, site: '', buddies: [] }];
  const after = [{ id: 7, site: 'Lock 23', buddies: ['Alex'] }];
  const detail = { id: 7, site: 'Lock 23' };
  const calls = [];
  logbook.dives = before;
  BenthicCore.editDive = async (args) => {
    calls.push(['edit', args]);
    return { dive: detail, undo: 'edit', redo: '' };
  };
  BenthicCore.listLoadedDives = async () => { calls.push(['list']); return after; };
  BenthicCore.saveLocal = async () => { calls.push(['save']); };
  BenthicCore.pendingChanges = async () => [];
  try {
    await saveDiveChanges(7, { site: 23, buddies: ['Alex'] });
    assert.deepEqual(logbook.dives, after);
    assert.notEqual(logbook.dives, before);
    assert.deepEqual(logbook.edited, { id: 7, dive: detail });
    assert.equal(logbook.undoText, 'edit');
    assert.deepEqual(calls, [['edit', { id: 7, changes: { site: 23, buddies: ['Alex'] } }], ['list'], ['save']]);
  } finally {
    for (const name of ['editDive', 'listLoadedDives', 'saveLocal', 'pendingChanges']) delete BenthicCore[name];
  }
});

test('a failed dive edit does not replace the logbook list', async () => {
  const before = [{ id: 7, site: '' }];
  logbook.dives = before;
  BenthicCore.editDive = async () => { throw new Error('WRITE_LOCKED'); };
  try {
    await assert.rejects(saveDiveChanges(7, { site: 23 }), /WRITE_LOCKED/);
    assert.equal(logbook.dives, before);
  } finally {
    delete BenthicCore.editDive;
  }
});
