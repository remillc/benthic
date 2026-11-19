import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/src/pages/DiveDetail.svelte', import.meta.url), 'utf8');
const lang = (l) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${l}.json`, import.meta.url), 'utf8'));

test('the dive detail toolbar: edit, plan, share, more, in that order, and no map', () => {
  const block = src.slice(src.indexOf('<FloatingToolbar'), src.indexOf('/>', src.indexOf('<FloatingToolbar')));
  const keys = [...block.matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['edit', 'plan', 'share', 'more']);
  assert.match(block, /\/plan\/\$\{diveId\}/);
});

test('the overflow menu names its items in the menu order, validation only with OpenDives+', () => {
  assert.match(src, /odplusSubscriber\(\) \? t\('detail\.moreItemValidate'\)/);
  assert.match(src, /removableFromTrip \? t\('detail\.moreItemTrip'\)/);
  const order = ['moreItemValidate', 'moreItemRenumber', 'moreItemTrip', 'moreItemDelete'].map((k) => src.indexOf(`detail.${k}`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  for (const l of ['fr', 'en']) {
    const d = lang(l).detail;
    assert.match(d.moreOptionsList, /\{items\}/);
    for (const k of ['moreItemValidate', 'moreItemRenumber', 'moreItemTrip', 'moreItemDelete']) assert.ok(d[k]);
  }
});
