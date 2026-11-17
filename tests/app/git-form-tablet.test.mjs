// « Utiliser mon propre dépôt git » on a tablet (task 2026-11-16-257): the shared git form in the first-launch frame,
// the help swapping the form inside the same column, the texts of the tablet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GIT_HELP, helpStepKeys } from '../../app/src/lib/git-help.js';
import { deviceKey } from '../../app/src/lib/first-launch.js';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');
const lookup = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const fr = JSON.parse(src('i18n/fr.json'));
const en = JSON.parse(src('i18n/en.json'));
const page = src('pages/GitRepository.svelte');
const editorial = src('components/EditorialPage.svelte');

test('the texts of the tablet: « cette tablette » in the form sentence and in the snackbar', () => {
  assert.equal(deviceKey('gitRepo.introPhone', false), 'gitRepo.introPhoneTablet');
  assert.equal(fr.gitRepo.introPhoneTablet, 'Gardez votre carnet dans votre dépôt git, avec une copie sur cette tablette.');
  assert.equal(fr.firstLaunch.snackbar.gitDownloadedTablet, 'Carnet téléchargé depuis votre dépôt. Il reste sur cette tablette, même sans réseau.');
  assert.match(en.gitRepo.introPhoneTablet, /this tablet/);
  assert.match(en.firstLaunch.snackbar.gitDownloadedTablet, /this tablet/);
  assert.match(src('components/GitForm.svelte'), /t\(deviceKey\('gitRepo\.introPhone', layout\.phone\)\)/);
  // The download names the tablet through the Subsurface account's keys, and the repository with its branch.
  assert.equal(fr.firstLaunch.download.copyTablet, 'Copie du carnet sur cette tablette');
});

test('the help: every host has its steps in both languages, and the two helps share one list', () => {
  for (const kind of ['repository', 'token']) {
    for (const p of GIT_HELP[kind].providers) {
      const keys = helpStepKeys(kind, p);
      assert.equal(keys.length, p.steps);
      for (const [lang, json] of [['fr', fr], ['en', en]]) for (const key of keys) assert.ok(lookup(json, key), `${lang}: ${key}`);
      assert.match(p.page, /^https:\/\//);
    }
    assert.deepEqual(GIT_HELP[kind].providers.map((p) => p.id), ['github', 'gitlab', 'codeberg']);
  }
});

test('on a tablet the form opens in the first-launch frame, and the help replaces it in the same column', () => {
  // The panel, still, is EditorialPage's (firstLaunch on a tablet); the form has no button of its own there.
  assert.match(page, /const panelled = \$derived\(welcome && !ios && !layout\.phone\);/);
  const block = page.slice(page.indexOf('{:else if panelled}'), page.indexOf('{:else if phone}'));
  assert.match(block, /<EditorialPage[^>]*\s+firstLaunch\s+helpLink=\{!help\}/);
  assert.match(block, /<GitHelp kind=\{help\} embedded \/>/);
  assert.match(block, /<GitForm \{form\} onhelp=\{openHelp\} action=\{false\} \/>/);
  assert.match(block, /onback=\{help \? closeHelp : undefined\}/);
  assert.match(block, /actionDisabled=\{!form\.canConnect\}/);
  // The links do not leave the page on a tablet: they set the help; « Retour » brings the form back (the state is
  // the controller's, so the fields stay as they were).
  assert.match(page, /if \(panelled\) \{\s*help = which;/);
  assert.match(page, /function closeHelp\(\) \{[\s\S]*help = null;/);
  // The connection goes through the download, then the logbook with the snackbar, as on the phone.
  assert.match(page, /if \(welcome && !ios && !empty\) \{[\s\S]*navigate\('\/welcome\/git\/downloading'/);
});

test('« Retour » in the help is a button, the column scrolls and the panel does not move', () => {
  assert.match(editorial, /\{#if !noRetour && onback\}\s*<button type="button" class="od-editorial-page--retour" onclick=\{onback\}>/);
  assert.match(editorial, /\.od-editorial-page--panel-body \{[\s\S]*?overflow-y: auto;/);
  // The panel is not in the column: it is the page's other child, and the page itself does not scroll.
  assert.match(editorial, /\.od-editorial-page--panelled \.page-content\) \{[\s\S]*?overflow: hidden;/);
  // The column starts at the top again when the heading changes.
  assert.match(editorial, /panelBody\.scrollTop = 0/);
  // Portrait: the panel of the steps is 540 dp tall, as the mock-ups of the steps draw it.
  assert.match(src('components/FirstLaunchPanel.svelte'), /od-first-launch-panel--step \{\s*@media \(orientation: portrait\) \{\s*height: 540px;/);
});

test('the embedded help keeps the colours and the pointer of the phone\'s', () => {
  const help = src('components/GitHelp.svelte');
  assert.match(help, /class:od-git-help--embedded=\{embedded\}/);
  assert.match(help, /\.od-git-help--tab \{[\s\S]*?cursor: pointer;[\s\S]*?@media \(hover: hover\)/);
  assert.doesNotMatch(help.slice(help.indexOf('<style>')), /#[0-9a-f]{3,6}\b/i);
});
