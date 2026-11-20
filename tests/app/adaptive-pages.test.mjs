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

test('every adaptive route hands its selection over when the layout changes', () => {
  const page = read('app/src/components/AdaptivePage.svelte');
  assert.match(page, /handOver\?\.\(rest\.f7router\)/);
  assert.match(app, /detailRoutes: \[\{ path: '\/settings\/:section', component: Settings \}, PANE_EMPTY\]/);
  for (const hook of ['logbookToNarrow', 'statisticsToWide', 'statisticsToNarrow', 'settingsToWide', 'settingsToNarrow', 'toolsToWide', 'toolsToNarrow']) {
    assert.ok(app.includes(hook), hook);
  }
});

test('Statistiques has one selection for both layouts', () => {
  const selection = read('app/src/lib/statistics-selection.svelte.js');
  assert.match(selection, /export const statSelection = \$state/);
  const wide = read('app/src/pages/DesktopStatistics.svelte');
  assert.match(wide, /statSelection\.key/);
  assert.ok(!/let selected = \$state/.test(wide), 'the wide layout keeps no selection of its own');
  const narrow = read('app/src/pages/Statistics.svelte');
  assert.match(narrow, /chooseStatistic\(`saved:\$\{s\.id\}`\)/);
  assert.match(narrow, /savedHref\(statSelection\.key\)/);
});

test('the hand-over functions move the open item and leave no hidden page', () => {
  const handoff = read('app/src/lib/adaptive-handoff.js');
  // Narrow to wide: the pane is emptied (one page of the right layout), the tool page is removed.
  assert.match(handoff, /export function statisticsToWide[\s\S]*emptyPane\(router\)/);
  assert.match(handoff, /export function settingsToWide[\s\S]*emptyPane\(router\)/);
  assert.match(handoff, /export function toolsToWide[\s\S]*openTool\(id\);[\s\S]*router\.navigate\(root, \{ reloadAll: true/);
  // Wide to narrow: the chosen item opens, the first-dive start-up is not blocked by the emptied pane.
  assert.match(handoff, /export function toolsToNarrow[\s\S]*desktopTools\.chosen/);
  assert.match(handoff, /export function logbookToNarrow[\s\S]*\/pane\/selection/);
  assert.match(read('app/src/pages/Logbook.svelte'), /bc-pane-empty/);
});

test('each tool has a page in the narrow layout, and back', async () => {
  const { TOOL_PAGES, toolOfPath, pathOfTool, DESKTOP_TOOLS } = await import('../../app/src/lib/desktop-tools.js');
  assert.deepEqual(TOOL_PAGES.map((p) => p.id), DESKTOP_TOOLS.map((tool) => tool.id));
  for (const { id, path } of TOOL_PAGES) {
    assert.equal(toolOfPath(path), id);
    assert.equal(pathOfTool(id), path);
  }
  assert.equal(toolOfPath('/tools/'), null);
  assert.equal(pathOfTool('nothing'), null);
});
