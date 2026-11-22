import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BenthicCore } from 'benthic-core';
import { cachedSites } from '../../app/src/lib/core-cache.js';
import { logbook, syncNow } from '../../app/src/lib/logbook.svelte.js';

test('a sync that reloads the logbook refreshes site views and cached sites', async () => {
  const initial = logbook.sitesVersion;
  let sites = [{ uuid: 1, name: 'Old name' }];
  BenthicCore.siteQuery = async () => sites;
  BenthicCore.syncChanges = async () => {
    sites = [{ uuid: 1, name: 'New name' }];
    return { status: 'pulled', reloaded: true };
  };
  BenthicCore.listLoadedDives = async () => [];
  BenthicCore.pendingChanges = async () => [];
  logbook.email = 'test@example.invalid';
  logbook.loading = false;
  logbook.error = '';
  logbook.sync = 'cloud';
  logbook.conflict = null;
  try {
    assert.equal((await cachedSites())[0].name, 'Old name');
    assert.equal(await syncNow(), 'done');
    assert.equal(logbook.sitesVersion, initial + 1);
    assert.equal((await cachedSites())[0].name, 'New name');
    BenthicCore.syncChanges = async () => ({ status: 'up_to_date', reloaded: false });
    assert.equal(await syncNow(), 'done');
    assert.equal(logbook.sitesVersion, initial + 1);
  } finally {
    for (const name of ['siteQuery', 'syncChanges', 'listLoadedDives', 'pendingChanges']) delete BenthicCore[name];
  }
});
