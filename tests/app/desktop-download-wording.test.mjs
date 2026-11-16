// « Télécharger mes plongées » on the desktop (task 2026-11-16-243): the empty logbook's main action and the
// macOS File menu use the short label, like every other screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const json = (lang) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8'));

test('the new logbook\'s ready screen and the macOS File menu say « Télécharger mes plongées »', () => {
  const fr = json('fr');
  const en = json('en');
  assert.equal(fr.desktopLogbooks.ready.download, 'Télécharger mes plongées');
  assert.equal(en.desktopLogbooks.ready.download, 'Download my dives');
  assert.equal(fr.desktop.macMenu.download, 'Télécharger mes plongées…');
  assert.equal(en.desktop.macMenu.download, 'Download my dives…');
});
