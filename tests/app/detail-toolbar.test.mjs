import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/src/pages/DiveDetail.svelte', import.meta.url), 'utf8');
const logbook = readFileSync(new URL('../../app/src/pages/Logbook.svelte', import.meta.url), 'utf8');
const lang = (l) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${l}.json`, import.meta.url), 'utf8'));

test('the dive detail toolbar: edit, plan, share, more, in that order, and no map', () => {
  const block = src.slice(src.indexOf('<FloatingToolbar'), src.indexOf('/>', src.indexOf('<FloatingToolbar')));
  const keys = [...block.matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['edit', 'plan', 'share', 'more']);
  assert.match(block, /\/plan\/\$\{diveId\}/);
});

test('the overflow menu names its items in the menu order, validation only with Benthic+', () => {
  assert.match(src, /benthicPlusSubscriber\(\) \? t\('detail\.moreItemValidate'\)/);
  assert.match(src, /removableFromTrip \? t\('detail\.moreItemTrip'\)/);
  const order = ['moreItemValidate', 'moreItemRenumber', 'moreItemTrip', 'moreItemDelete'].map((k) => src.indexOf(`detail.${k}`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  for (const l of ['fr', 'en']) {
    const d = lang(l).detail;
    assert.match(d.moreOptionsList, /\{items\}/);
    for (const k of ['moreItemValidate', 'moreItemRenumber', 'moreItemTrip', 'moreItemDelete']) assert.ok(d[k]);
  }
});

test('checked dives on a tablet move detail actions to the top menu and add bulk delete', () => {
  assert.match(src, /const selectionMenuActive = \$derived\(layout\.split && !desk && !f7route\.params\.trip && logbook\.checkedDiveIds\.length > 0\)/);
  assert.match(src, /{:else if selectionMenuActive}\s*<Link iconOnly popoverOpen="#\{menuId\}">/);
  assert.match(src, /!desk && !selectionMenuActive/);
  assert.match(src, /detail\.deleteSelected/);
  assert.match(src, /await deleteDives\(ids\)/);
  assert.match(logbook, /logbook\.checkedDiveIds = checkedIds/);
  for (const l of ['fr', 'en']) assert.ok(lang(l).detail.deleteSelected);
});
