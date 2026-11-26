import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/src/pages/DiveDetail.svelte', import.meta.url), 'utf8');
const logbook = readFileSync(new URL('../../app/src/pages/Logbook.svelte', import.meta.url), 'utf8');
const lang = (l) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${l}.json`, import.meta.url), 'utf8'));

// Tasks 2026-11-24-382, 386 and 387: no floating action bar and no « Modifier » on a phone or a tablet; the actions are in the ⋮ menu
// at the top right and every field is edited in place. The checks below replace those of the floating toolbar (edit, plan, share, more).

test('the dive detail has no floating toolbar and no way to the edit screen; its ⋮ menu is in the top bar', () => {
  assert.doesNotMatch(src, /FloatingToolbar/);
  assert.doesNotMatch(src, /\/dives\/\$\{diveParam\}\/edit|href="\/dives\/\{diveParam\}\/edit"/);
  assert.match(src, /\{#snippet right\(\)\}\s*\{#if !desk\}\s*<Link iconOnly popoverOpen="#\{menuId\}">/);
  assert.match(src, /<Icon name=\{theme\.ios \? 'moreCircle' : 'more'\} \/>/);
});

test('the ⋮ menu: plan, share, renumber, renumber from here, remove from the trip, a divider, delete', () => {
  const menu = src.slice(src.indexOf('<Popover id={menuId}'), src.indexOf('</Popover>'));
  const keys = ['detail.plan', 'share.title', 'renumberDive.title', 'renumberFrom.title', 'detail.removeFromTrip', 'bc-menu-divider', 'detail.delete'].map((k) => menu.indexOf(k));
  assert.ok(keys.every((i) => i >= 0), 'every item is there');
  assert.deepEqual([...keys].sort((a, b) => a - b), keys, 'in this order');
  assert.doesNotMatch(menu, /detail\.edit|validation\.menuOne/, 'neither « Modifier la plongée » nor « Faire signer »');
  assert.match(menu, /\{#if removableFromTrip\}/);
  assert.match(src, /f7router\.navigate\(`\/plan\/\$\{diveParam\}`\)/);
});

test('checked dives on a tablet keep their actions in the top menu and add bulk delete', () => {
  assert.match(src, /const selectionMenuActive = \$derived\(layout\.split && !desk && !f7route\.params\.trip && logbook\.checkedDiveIds\.length > 0\)/);
  assert.match(src, /detail\.deleteSelected/);
  assert.match(src, /await deleteDives\(ids\)/);
  assert.match(logbook, /logbook\.checkedDiveIds = checkedIds/);
  for (const l of ['fr', 'en']) assert.ok(lang(l).detail.deleteSelected);
});

test('the tablet and the phone show the desktop’s tabs: the chosen one on a tablet, the five groups on a phone with a sticky row', () => {
  assert.match(src, /<DesktopDiveFields \{\.\.\.fieldProps\} \{tab\} \/>/);
  assert.match(src, /<DesktopDiveFields \{\.\.\.fieldProps\} tab=\{key\} hint=\{false\} \/>/);
  assert.match(src, /data-group=\{key\}/);
  assert.match(src, /\.bc-dive-detail--tabs-wrap \{\s*position: sticky;\s*top: 0;/);
  assert.match(src, /scrollToGroup\(key\)/);
  for (const l of ['fr', 'en']) {
    const d = lang(l);
    assert.ok(d.detail.tabs && d.desktop.tab.infoShort && d.desktopDetail.diveType.title, l);
  }
});

// Task 2026-11-26-400: one level-1 section per tab, in the tab's order, under the sticky bar; the groups are level-3 card titles
// with an icon, never styled like a tab or a section title.
const fields = readFileSync(new URL('../../app/src/components/DesktopDiveFields.svelte', import.meta.url), 'utf8');
const detailTab = readFileSync(new URL('../../app/src/lib/detail-tab.js', import.meta.url), 'utf8');

test('the phone page has one h2 section per tab, in the tab order, after the sticky bar', () => {
  assert.match(detailTab, /DETAIL_TABS = .*\['info', 'equipment', 'gas', 'notes', 'map'\]/);
  const bar = src.indexOf('bc-dive-detail--tabs-wrap');
  const sections = src.indexOf('<section class="bc-dive-detail--group-tab"');
  assert.ok(bar > 0 && sections > bar, 'the sections come after the tab bar');
  assert.match(src, /<h2 class="bc-dive-detail--group-title"[^>]*>\{t\(`desktop\.tab\.\$\{key\}`\)\}<\/h2>/);
  assert.match(src, /\.bc-dive-detail--group-title \{[^}]*font-size: 14px;[^}]*font-weight: 600;/);
});

test('the Informations cards come in the mock-up order and every card title is a level-3 heading with an icon', () => {
  const info = fields.slice(fields.indexOf("{#if tab === 'info'}"), fields.indexOf("{:else if tab === 'equipment'}"));
  const names = [...info.matchAll(/<DesktopEquipmentCard name="(\w+)"|<DiveSignatures/g)].map((m) => m[1] ?? 'signatures');
  const order = ['datetime', 'site', 'people', 'signatures', 'rating'];
  assert.deepEqual(names.filter((n) => order.includes(n)), order);
  assert.equal(names.at(-1), 'tags');
  const card = readFileSync(new URL('../../app/src/components/DesktopEquipmentCard.svelte', import.meta.url), 'utf8');
  assert.match(card, /<h3 class="bc-desktop-equipment-card--title"/);
  assert.match(card, /bc-desktop-equipment-card--icon/);
});
