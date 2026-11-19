// The photo tile sends events that read the state it writes. Called inside an $effect without `untrack`, the effect depends
// on its own output and Svelte stops it with effect_update_depth_exceeded, which froze the Download screen under the
// error report sheet. The effects that call `send` must run it untracked. The start must not ask for the device copy of
// a cloud log when no account is remembered.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('DcTile runs its state events untracked inside effects', () => {
  const src = read('app/src/components/DcTile.svelte');
  assert.match(src, /import \{ untrack \} from 'svelte'/);
  const effects = src.split('$effect(() => {').slice(1);
  for (const body of effects) {
    const block = body.slice(0, body.indexOf('\n  });'));
    if (/\bsend\(/.test(block)) assert.match(block, /untrack\(/, 'an effect calls send without untrack');
  }
});

test('the start asks for the cached cloud log only when an account is remembered', () => {
  const src = read('app/src/lib/logbook.svelte.js');
  assert.match(src, /deviceStore\.getItem\(ACCOUNT_HINT\) \? OpenDivesCore\.listCloudDives\(\{ cached: true \}\) : null/);
});

test('expected core rejections are not offered as reports', async () => {
  const src = read('app/src/lib/error-reports.svelte.js');
  for (const code of ['CORE_ERROR', 'NO_ACCOUNT', 'CANCELLED', 'NETWORK', 'PERMISSION']) assert.ok(src.includes(`'${code}'`), code);
});

test('a core failure that only says « account not configured » is not a report', async () => {
  const { isExpectedCoreMessage } = await import('../../plugins/opendives-core/core-api.js');
  assert.ok(isExpectedCoreMessage('Cloud account not configured'));
  assert.ok(isExpectedCoreMessage('Repository not configured'));
  assert.ok(!isExpectedCoreMessage('Out of memory'));
  assert.ok(!isExpectedCoreMessage(undefined));
});

test('the report of a core failure carries the JS caller', () => {
  assert.match(read('plugins/opendives-core/core-api.js'), /new Error\(\)\.stack/);
  assert.match(read('app/src/lib/error-reports.svelte.js'), /called from/);
});
