// « Télécharger mes plongées » on the desktop (task 2026-11-16-243): the empty logbook's main action uses the short
// label. Task 2026-11-22-323: the macOS File menu no longer has the item (downloading from the dive computer is in
// the « + » menu of the logbook, as on the other platforms), nor « Enregistrer une copie… » (saving is automatic;
// a copy is made with the export, in the .benthic format).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const json = (lang) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8'));
const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the new logbook\'s ready screen says « Télécharger mes plongées »', () => {
  assert.equal(json('fr').desktopLogbooks.ready.download, 'Télécharger mes plongées');
  assert.equal(json('en').desktopLogbooks.ready.download, 'Download my dives');
});

test('the macOS File menu has neither « Télécharger mes plongées… » nor « Enregistrer une copie… »', () => {
  const menu = source('desktop/menu.cjs');
  assert.doesNotMatch(menu, /saveCopy|m\.download|'download'/);
  assert.match(menu, /item\(m\.export, 'export', 'Shift\+Cmd\+E'\)/, 'Exporter… (⇧⌘E) stays');
  for (const lang of ['fr', 'en']) {
    const texts = json(lang);
    assert.equal(texts.desktop.macMenu.download, undefined);
    assert.equal(texts.desktopLogbooks.menu.saveCopy, undefined);
    assert.equal(texts.desktopLogbooks.selector.saveCopy, undefined);
    assert.equal(texts.desktopLogbooks.copy, undefined);
  }
});

test('the Windows and Linux selector and the desktop ⋮ menu have no save-a-copy nor whole-logbook export item', () => {
  const selector = source('app/src/components/DesktopLogbookSelector.svelte');
  assert.doesNotMatch(selector, /saveCopy/);
  assert.match(selector, /desktop\.export\.logbook[\s\S]{0,80}Ctrl\+Maj\+E/, 'Exporter le carnet… (Ctrl+Maj+E) stays');
  const desktop = source('app/src/pages/DesktopLogbook.svelte');
  assert.doesNotMatch(desktop, /key: 'exportWhole'/);
  assert.doesNotMatch(source('desktop/preload.cjs') + source('desktop/windows.cjs') + source('desktop/bridge.cjs'), /saveCopy/);
});
