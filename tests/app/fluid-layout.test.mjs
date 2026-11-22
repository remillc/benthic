// Fluid desktop layout (docs/system-design.md, section 7): the overflow audit script exists and the key components
// keep their fluid rules. The audit itself runs against a live window (desktop/scripts/overflow-audit.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the overflow audit exists, refuses the developer window and documents its options', () => {
  const script = read('desktop/scripts/overflow-audit.mjs');
  assert.match(script, /port === 9333/);
  for (const option of ['--size', '--reload', '--pre', '--shot', '--json', '--root']) assert.ok(script.includes(option), option);
  assert.match(script, /data-od-scroll/);
  assert.match(read('desktop/README.md'), /overflow-audit\.mjs/);
  assert.match(read('docs/system-design.md'), /Fluid layout \(decided on 16 November 2026\)/);
});

test('scrollbars: thin in the desktop app, never on the page itself', () => {
  const css = read('app/src/theme.css');
  assert.match(css, /& \* \{\s*scrollbar-width: thin;/);
  assert.match(css, /html\.bc-desktop-app body \{\s*scrollbar-width: none;/);
});

test('backup panes show a scrollbar in each scrollable section', () => {
  const css = read('app/src/components/backup.css');
  for (const selector of [
    '.bc-backup-panes--list',
    '.bc-backup-panes--detail',
  ]) {
    assert.ok(css.includes(`${selector}::-webkit-scrollbar`), selector);
  }
  assert.match(css, /scrollbar-color: color-mix/);
});

test('backup history shows loading skeletons and keeps restore beside the dive details', () => {
  const timeline = read('app/src/components/BackupTimeline.svelte');
  assert.match(timeline, /bc-backup-main--skeleton-list skeleton-effect-wave" role="status" aria-busy="true"/);
  assert.match(read('app/src/components/BackupMain.svelte'), /bc-backup-main--badge-skeleton/);

  // Task 2026-11-22-319: a deleted dive is a row (name, « date · duration · depth », « Supprimée le … ») with a text button.
  const deleted = read('app/src/components/BackupDeleted.svelte');
  assert.match(deleted, /bc-backup-deleted--facts/);
  assert.match(deleted, /bc-backup-deleted--removed/);
  const css = read('app/src/components/backup.css');
  assert.match(css, /\.bc-backup-deleted--restore,\s*\.bc-backup-deleted--state button \{\s*width: auto;/);
});

test('the tools, the site sheet and the clean-up lay out by their pane, not the window', () => {
  assert.match(read('app/src/pages/DesktopTools.svelte'), /container: od-tool \/ inline-size/);
  for (const file of ['DesktopBestMix', 'DesktopBlender', 'DesktopEadMod', 'DesktopPlanner']) {
    assert.match(read(`app/src/components/${file}.svelte`), /@container od-tool \(max-width: \d+px\)/, file);
  }
  for (const file of ['DesktopSiteSheet', 'DesktopSiteNew', 'DesktopSitesCleanup']) {
    const source = read(`app/src/components/${file}.svelte`);
    assert.match(source, /container-type: inline-size/, file);
    assert.match(source, /@container \(max-width: \d+px\)/, file);
  }
});

test('the logbook follows the window: its table pane, its columns, its header', () => {
  const page = read('app/src/pages/DesktopLogbook.svelte');
  assert.match(page, /new ResizeObserver\(place\)/);
  assert.match(page, /fittingColumns\(columns, tableRoom, desk\.columnWidths\)/);
  assert.match(page, /\.bc-desktop-logbook--titles \{[^}]*flex: 1 0\.2 auto/);
  assert.match(read('app/src/components/DiveProfile.svelte'), /flex-wrap: wrap;\s*overflow-x: visible;/);
});

test('short windows: the first launch, the tools and the new-logbook dialog give way', () => {
  assert.match(read('app/src/components/FirstLaunchPanel.svelte'), /@media \(max-height: 700px\)/);
  assert.match(read('app/src/components/EditorialPage.svelte'), /@media \(max-height: 640px\)/);
  assert.match(read('app/src/pages/DesktopTools.svelte'), /@media \(max-height: 700px\)/);
  assert.match(read('app/src/components/DesktopNewLogbook.svelte'), /@media \(max-height: 640px\)/);
  assert.match(read('app/src/pages/DesktopStatistics.svelte'), /Math\.max\(200, Math\.min\(380, windowHeight - 330\)\)/);
});

test('panes that scroll as lists are marked for the audit', () => {
  for (const [file, mark] of [
    ['app/src/pages/DesktopLogbook.svelte', 'bc-desktop-logbook--scroll" data-od-scroll'],
    ['app/src/pages/DesktopSites.svelte', 'bc-desktop-sites--scroll" data-od-scroll'],
    ['app/src/pages/DesktopStatistics.svelte', 'bc-desktop-statistics--list" data-od-scroll'],
    ['app/src/pages/DesktopTools.svelte', 'bc-desktop-tools--pane" data-od-scroll'],
    ['app/src/pages/Settings.svelte', 'bc-desktop-settings--pane" data-od-scroll'],
    ['app/src/components/Md3Dialog.svelte', 'bc-md3-dialog--content" data-od-scroll'],
  ]) {
    assert.ok(read(file).includes(mark), `${file}: ${mark}`);
  }
});
