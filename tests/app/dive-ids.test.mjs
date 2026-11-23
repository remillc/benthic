// The dive ids across a reload of the log (lib/dive-ids.js): the core numbers its dives again whenever it reads the log
// again (a sync that brought a change from another device), and what held an id follows the dive by its start date-time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { BenthicCore } from 'benthic-core';
import { invalidateCoreCache, setCacheVersions } from '../../app/src/lib/core-cache.js';
import { currentDiveId, currentDiveIds, liveDiveId, matchReload, noteDiveList, onDiveIdsRenumbered, resetDiveIds } from '../../app/src/lib/dive-ids.js';
import { forgetAllDives, loadDive, preloadDives } from '../../app/src/lib/dive-preload.js';
import { isExpectedCoreMessage } from '../../plugins/benthic-core/core-api.js';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const dive = (id, date, number = 0, extra = {}) => ({ id, date, number, durationSeconds: 3000, maxDepthMm: 20000, ...extra });

beforeEach(() => resetDiveIds());

test('ids that are not renumbered change nothing (an edit, a deletion, an import)', () => {
  const before = [dive(1, '2024-01-01T10:00:00', 1), dive(2, '2024-01-02T10:00:00', 2)];
  assert.equal(noteDiveList(before, [dive(1, '2024-01-01T10:00:00', 1)]), null);
  assert.equal(noteDiveList(before, [...before, dive(3, '2024-01-03T10:00:00', 3)]), null);
  assert.equal(noteDiveList(before, [dive(1, '2024-05-05T10:00:00', 1), before[1]]), null, 'a date edited keeps its id');
  assert.equal(noteDiveList([], before), null);
  assert.equal(currentDiveId(1), 1);
});

test('a reload maps each old id to the dive with the same start date-time', () => {
  const before = [dive(10, '2024-01-01T10:00:00', 1), dive(11, '2024-01-02T10:00:00', 2), dive(12, '2024-01-03T10:00:00', 3)];
  // Another device added a dive and deleted one; every id is new.
  const after = [dive(20, '2024-01-03T10:00:00', 3), dive(21, '2024-01-01T10:00:00', 1), dive(22, '2024-02-01T10:00:00', 4)];
  const mapping = noteDiveList(before, after);
  assert.deepEqual([...mapping], [[10, 21], [11, null], [12, 20]]);
  assert.equal(currentDiveId(10), 21);
  assert.equal(currentDiveId(11), null, 'deleted on another device');
  assert.equal(liveDiveId(11), 11);
  assert.equal(currentDiveId(99), 99, 'an id never seen is left as it is');
  assert.deepEqual(currentDiveIds([10, 11, 12]), [21, 20]);
});

test('dives at the same minute are told apart by number, then by order', () => {
  const before = [dive(1, '2024-01-01T10:00:00', 5), dive(2, '2024-01-01T10:00:00', 6)];
  const after = [dive(8, '2024-01-01T10:00:00', 6), dive(9, '2024-01-01T10:00:00', 5)];
  assert.deepEqual([...matchReload(before, after)], [[1, 9], [2, 8]]);
  const noNumbers = [dive(1, '2024-01-01T10:00:00'), dive(2, '2024-01-01T10:00:00')];
  assert.deepEqual([...matchReload(noNumbers, [dive(7, '2024-01-01T10:00:00'), dive(8, '2024-01-01T10:00:00')])], [[1, 7], [2, 8]]);
});

test('a dive whose start time was edited elsewhere is found by its number', () => {
  const before = [dive(1, '2024-01-01T10:00:00', 4), dive(2, '2024-01-02T10:00:00', 5)];
  const after = [dive(8, '2024-01-01T10:30:00', 4), dive(9, '2024-01-02T10:00:00', 5)];
  assert.deepEqual([...matchReload(before, after)], [[1, 8], [2, 9]]);
});

test('several reloads in a row: an old id still leads to the dive, or to nothing once it is gone', () => {
  const a = [dive(1, '2024-01-01T10:00:00', 1), dive(2, '2024-01-02T10:00:00', 2)];
  const b = [dive(5, '2024-01-01T10:00:00', 1), dive(6, '2024-01-02T10:00:00', 2)];
  const c = [dive(9, '2024-01-01T10:00:00', 1)];
  noteDiveList(a, b);
  noteDiveList(b, c);
  assert.equal(currentDiveId(1), 9);
  assert.equal(currentDiveId(5), 9);
  assert.equal(currentDiveId(2), null);
  assert.equal(currentDiveId(6), null);
});

test('the listeners hear a reload after the mapping is in place', () => {
  const heard = [];
  const stop = onDiveIdsRenumbered(() => heard.push(currentDiveId(1)));
  noteDiveList([dive(1, '2024-01-01T10:00:00', 1)], [dive(4, '2024-01-01T10:00:00', 1)]);
  stop();
  noteDiveList([dive(4, '2024-01-01T10:00:00', 1)], [dive(7, '2024-01-01T10:00:00', 1)]);
  assert.deepEqual(heard, [4]);
});

test('a stale id asked of the core is asked again under the dive’s new id, and a gone dive is not a report', async () => {
  const asked = [];
  setCacheVersions(() => []);
  invalidateCoreCache();
  forgetAllDives();
  // @ts-ignore the stub accepts any method
  BenthicCore.getDive = async ({ id }) => {
    asked.push(id);
    if (id < 20) throw new Error('getDive: Dive not found');
    return { id, date: '2024-01-01T10:00:00' };
  };
  try {
    noteDiveList([dive(1, '2024-01-01T10:00:00', 1), dive(2, '2024-01-02T10:00:00', 2)], [dive(21, '2024-01-01T10:00:00', 1)]);
    const found = await loadDive(1);
    assert.equal(found.id, 21);
    assert.deepEqual(asked, [1, 21]);
    await assert.rejects(loadDive(2), /Dive not found/);
    // A preload of ids that are gone never throws and never warns.
    const warnings = [];
    const warn = console.warn;
    console.warn = (...a) => warnings.push(a);
    try {
      await preloadDives([2, 1]);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warnings, []);
  } finally {
    delete BenthicCore.getDive;
  }
});

test('« Dive not found » is an expected message of the core: no error report', () => {
  assert.equal(isExpectedCoreMessage('getDive: Dive not found'), true);
  assert.equal(isExpectedCoreMessage('getDive: something else'), false);
});

test('the logbook store follows a renumbering for what it holds, and the pages follow in place', () => {
  const store = src('lib/logbook.svelte.js');
  assert.match(store, /set dives\(value\)[\s\S]*noteDiveList\(before, value\)[\s\S]*followRenumbering\(\)/);
  assert.match(store, /checkedDiveIds = currentDiveIds\(/);
  const page = src('pages/DiveDetail.svelte');
  // The open dive's route is replaced where it stands: no animation, no new history entry.
  assert.match(page, /reloadDetail: true, animate: false \} : \{ reloadCurrent: true, animate: false \}/);
  assert.match(page, /detail\.deletedElsewhere/);
  const edit = src('pages/EditDive.svelte');
  assert.match(edit, /dive = \{ \.\.\.dive, id: now \}/);
  for (const lang of ['fr', 'en']) assert.ok(JSON.parse(src(`i18n/${lang}.json`)).detail.deletedElsewhere);
});
