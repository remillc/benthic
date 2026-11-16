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
  assert.match(css, /html\.od-desktop-app \* \{\s*scrollbar-width: thin;/);
  assert.match(css, /html\.od-desktop-app body \{\s*scrollbar-width: none;/);
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
  assert.match(page, /fittingColumns\(columns, tableRoom\)/);
  assert.match(page, /\.od-desktop-logbook--titles \{[^}]*flex: 1 0\.2 auto/);
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
    ['app/src/pages/DesktopLogbook.svelte', 'od-desktop-logbook--scroll" data-od-scroll'],
    ['app/src/pages/DesktopSites.svelte', 'od-desktop-sites--scroll" data-od-scroll'],
    ['app/src/pages/DesktopStatistics.svelte', 'od-desktop-statistics--list" data-od-scroll'],
    ['app/src/pages/DesktopTools.svelte', 'od-desktop-tools--pane" data-od-scroll'],
    ['app/src/pages/Settings.svelte', 'od-desktop-settings--pane" data-od-scroll'],
    ['app/src/components/Md3Dialog.svelte', 'od-md3-dialog--content" data-od-scroll'],
  ]) {
    assert.ok(read(file).includes(mark), `${file}: ${mark}`);
  }
});
