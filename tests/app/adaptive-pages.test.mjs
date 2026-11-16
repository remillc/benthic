// Adaptive pages (docs/system-design.md, section 7): one route per desktop section, no navigation on the
// 1200 dp threshold. Checks the wiring in App.svelte and the page-swap component.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app/src/App.svelte');

test('Carnet, Sites, Statistiques, Outils and Réglages are adaptive routes', () => {
  for (const [wide, narrow] of [['DesktopLogbook', 'Logbook'], ['DesktopSites', 'Sites'], ['DesktopStatistics', 'Statistics'], ['DesktopTools', 'Tools']]) {
    assert.ok(app.includes(`wide: ${wide}, narrow: ${narrow}`), wide);
  }
  assert.match(app, /wideProps: \{ desk: true \}, narrowProps: \{ desk: false \}/);
  assert.ok(app.includes("import AdaptivePage from './components/AdaptivePage.svelte'"));
});

test('crossing 1200 dp never navigates', () => {
  assert.ok(!/reloadView/.test(app), 'the navigation-based swap is gone');
  assert.ok(!/layout\.desktop \? (Desktop|Settings)/.test(app), 'no route picks its component when it is opened');
  assert.ok(!/master: \(\) => !layout\.desktop/.test(app));
});

test('the adaptive page swaps on the layout and keeps the router in step', () => {
  const page = read('app/src/components/AdaptivePage.svelte');
  assert.match(page, /\{#if layout\.desktop\}<Wide/);
  assert.ok(!page.includes('navigate('), 'no navigation');
  for (const call of ['setPagePosition', 'currentPageEl', 'f7Page']) assert.ok(page.includes(call), call);
});

test('the wide logbook takes the dive shown in the narrow layout, Réglages the category', () => {
  assert.match(read('app/src/pages/DesktopLogbook.svelte'), /arriving from the tablet layout/);
  const settings = read('app/src/pages/Settings.svelte');
  assert.match(settings, /deskState\.category = categoryOf\(selected\.id\)/);
  assert.match(settings, /selected\.id = group/);
});

test('the rule is written in the design system', () => {
  assert.match(read('docs/system-design.md'), /Adaptive pages \(decided on 16 November 2026\)/);
});
