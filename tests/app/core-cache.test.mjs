// Answers of the core that do not depend on the dive (lib/core-cache.js) and the details of the dives
// (lib/dive-preload.js): read once, shared by the panes that ask at the same time, read again after a change.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { BenthicCore } from 'benthic-core';
import { cachedCylinderTypes, cachedPlannerSetup, cachedSites, cachedValues, currentStamp, invalidateCoreCache, sameStamp, setCacheVersions } from '../../app/src/lib/core-cache.js';
import { readRegions } from '../../app/src/lib/desktop-sites.js';
import { keepDive, loadDive, readyDive } from '../../app/src/lib/dive-preload.js';

/** @type {Record<string, number>} */
let calls;
let dives = [];
let sitesVersion = 0;

beforeEach(() => {
  calls = {};
  dives = [];
  sitesVersion = 0;
  setCacheVersions(() => [dives, sitesVersion]);
  invalidateCoreCache();
  /** @param {string} name @param {(o: any) => any} answer */
  const count = (name, answer) => {
    // @ts-ignore the stub accepts any method
    BenthicCore[name] = async (/** @type {any} */ o) => {
      calls[name] = (calls[name] ?? 0) + 1;
      return answer(o);
    };
  };
  count('siteQuery', () => [{ uuid: 1, name: 'Reef' }]);
  count('statsQuery', (o) => [{ key: o.field, dives: 1 }]);
  count('plannerSetup', () => ({ reserveMbar: 50000 }));
  count('toolQuery', () => ({ types: [] }));
  count('getDive', (o) => ({ id: o.id, site: 'Reef' }));
});
afterEach(() => {
  for (const name of ['siteQuery', 'statsQuery', 'plannerSetup', 'toolQuery', 'getDive']) delete BenthicCore[name];
});

test('the same question asked by several panes is one call', async () => {
  const [a, b] = await Promise.all([cachedSites(), cachedSites()]);
  assert.equal(a, b);
  await cachedSites();
  assert.equal(calls.siteQuery, 1);
});

test('each field has its own answer; the planner setup and the cylinder types are read once', async () => {
  await Promise.all([cachedValues('buddy'), cachedValues('guide'), cachedValues('tag'), cachedValues('buddy')]);
  await Promise.all([cachedPlannerSetup(), cachedPlannerSetup(), cachedCylinderTypes(), cachedCylinderTypes()]);
  assert.equal(calls.statsQuery, 3);
  assert.equal(calls.plannerSetup, 1);
  assert.equal(calls.toolQuery, 1);
  assert.deepEqual(await cachedValues('guide'), [{ key: 'guide', dives: 1 }]);
});

test('a new dive list, a site change or an explicit invalidation read again', async () => {
  await cachedSites();
  dives = [{}];
  await cachedSites();
  assert.equal(calls.siteQuery, 2);
  sitesVersion++;
  await cachedSites();
  assert.equal(calls.siteQuery, 3);
  invalidateCoreCache();
  await cachedSites();
  assert.equal(calls.siteQuery, 4);
  await cachedSites();
  assert.equal(calls.siteQuery, 4);
});

test('a failed read is not kept', async () => {
  // @ts-ignore
  BenthicCore.plannerSetup = async () => {
    calls.plannerSetup = (calls.plannerSetup ?? 0) + 1;
    throw new Error('offline');
  };
  await assert.rejects(cachedPlannerSetup());
  await assert.rejects(cachedPlannerSetup());
  assert.equal(calls.plannerSetup, 2);
});

test('stamps compare by identity of each part', () => {
  const a = currentStamp();
  assert.ok(sameStamp(a, currentStamp()));
  dives = [];
  assert.ok(!sameStamp(a, currentStamp()));
});

test('a dive is read once while the logbook does not change, and by every screen that asks together', async () => {
  const [a, b] = await Promise.all([loadDive(101), loadDive(101)]);
  assert.equal(a, b);
  await loadDive(101);
  assert.equal(calls.getDive, 1);
  assert.equal(readyDive(101), a);
});

test('a dive is read again after the list changed or an edit', async () => {
  await loadDive(102);
  dives = [{}];
  await loadDive(102);
  assert.equal(calls.getDive, 2);
  invalidateCoreCache();
  await loadDive(102);
  assert.equal(calls.getDive, 3);
});

test('a detail kept after an edit is shown at once and read again only when it is stale', async () => {
  keepDive(103, /** @type {any} */ ({ id: 103, site: 'Edited' }));
  assert.equal((await loadDive(103)).site, 'Edited');
  assert.equal(calls.getDive ?? 0, 0);
  dives = [{}];
  assert.equal(readyDive(103)?.site, 'Edited'); // still drawn first, then read again
  assert.equal((await loadDive(103)).site, 'Reef');
  assert.equal(calls.getDive, 1);
});

test('a read that started before a change is not kept as current', async () => {
  let release = () => {};
  // @ts-ignore
  BenthicCore.getDive = (/** @type {any} */ o) => {
    calls.getDive = (calls.getDive ?? 0) + 1;
    return new Promise((resolve) => (release = () => resolve({ id: o.id, site: 'Old' })));
  };
  const first = loadDive(104);
  dives = [{}]; // the list was read again while the dive was in flight
  release();
  await first;
  // @ts-ignore
  BenthicCore.getDive = async (/** @type {any} */ o) => ((calls.getDive = (calls.getDive ?? 0) + 1), { id: o.id, site: 'New' });
  assert.equal((await loadDive(104)).site, 'New');
  assert.equal(calls.getDive, 2);
});

test('the regions of the sites are read side by side, a failed read leaves the region empty', async () => {
  let running = 0;
  let most = 0;
  let reads = 0;
  const sites = Array.from({ length: 60 }, (_, i) => ({ uuid: i + 1 }));
  const regions = await readRegions(sites, async (uuid) => {
    reads++;
    most = Math.max(most, ++running);
    await new Promise((r) => setTimeout(r, 1));
    running--;
    if (uuid === 5) throw new Error('gone');
    return 'R' + uuid;
  });
  assert.equal(reads, 60);
  assert.ok(most > 1 && most <= 16, `concurrency ${most}`);
  assert.equal(regions.size, 60);
  assert.equal(regions.get(7), 'R7');
  assert.equal(regions.get(5), '');
  assert.equal((await readRegions([], async () => 'x')).size, 0);
});
