// « Seulement sur Wi-Fi ou câble » (task 2026-11-15-202): when the automatic sync may use the connection, and that the
// sync code and the desktop bridge apply it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { syncAllowed } from '../../app/src/lib/sync-network.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the switch off allows every connection', () => {
  for (const cost of ['metered', 'unmetered', 'unknown']) assert.equal(syncAllowed({ unmeteredOnly: false, cost }), true);
  assert.equal(syncAllowed({ unmeteredOnly: false, connectionType: 'cellular' }), true);
});

test('the switch on stops a metered or cellular link, allows the rest and what nobody can tell', () => {
  assert.equal(syncAllowed({ unmeteredOnly: true, cost: 'metered' }), false);
  assert.equal(syncAllowed({ unmeteredOnly: true, connectionType: 'cellular' }), false);
  assert.equal(syncAllowed({ unmeteredOnly: true, cost: 'unmetered' }), true);
  assert.equal(syncAllowed({ unmeteredOnly: true, cost: 'unknown' }), true);
  assert.equal(syncAllowed({ unmeteredOnly: true, connectionType: 'wifi' }), true);
});

test('every automatic sync asks, the manual one does not', () => {
  const src = read('app/src/lib/logbook.svelte.js');
  // The edit timer, the online catch-up, the retry and the start-up exchange use autoSyncing().
  assert.match(src, /autoSyncing\(\) && !choiceHeld\) syncTimer/);
  assert.match(src, /const reconnect = async \(\) => \{[\s\S]*?if \(!autoSyncing\(\)\) return;/);
  assert.match(src, /syncFailure === 'server' && autoSyncing\(\)/);
  assert.match(src, /if \(!autoSyncing\(\) && !force\)/);
  assert.match(src, /onSyncAllowedAgain\(/);
  // « Synchroniser maintenant »: syncNow does not look at the network.
  const syncNow = /export async function syncNow\(\) \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
  assert.ok(syncNow.length > 0);
  assert.doesNotMatch(syncNow, /autoSyncing|syncAllowed/);
});

test('the desktop bridge exposes the connection type and the main process answers it', () => {
  assert.match(read('desktop/preload.cjs'), /network: \{[\s\S]*od:network/);
  assert.match(read('desktop/main.cjs'), /ipcMain\.handle\('od:network'/);
  assert.match(read('app/src/lib/sync-network.svelte.js'), /benthicDesktop\)?\??\.network/);
});
