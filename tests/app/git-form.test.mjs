// The git form of the alpha phone, shared by the first launch and Compte (task 2026-11-16-247), the repository help
// (« Créer un dépôt », tasks 247 and 252) and the 16 dp side margins of the step pages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stripMarked } from '../../app/src/lib/marked-text.js';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');
const lookup = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const fr = JSON.parse(src('i18n/fr.json'));
const en = JSON.parse(src('i18n/en.json'));
const form = src('components/GitForm.svelte');
const page = src('pages/GitRepository.svelte');
// The help: the hosts and their steps (lib/git-help.js), drawn by one component (components/GitHelp.svelte) that the
// phone's two pages and the tablet's first-launch column share.
const helpData = src('lib/git-help.js');
const help = src('components/GitHelp.svelte');
const app = src('App.svelte');

test('the texts of the mock-ups, in French', () => {
  assert.equal(fr.gitRepo.titlePhone, 'Votre propre dépôt git');
  assert.equal(fr.gitRepo.introPhone, 'Gardez votre carnet dans votre dépôt git, avec une copie sur ce téléphone.');
  assert.equal(fr.gitRepo.repositoryHow, 'Comment créer un dépôt');
  assert.equal(fr.gitRepo.address, 'Adresse du dépôt (HTTPS)');
  assert.equal(fr.gitRepo.addressPublic, 'Dépôt trouvé, avec un carnet existant.');
  assert.equal(fr.gitRepo.addressPrivate, 'Dépôt privé ou introuvable : il sera vérifié avec le jeton.');
  assert.equal(fr.gitRepo.addressNone, 'Aucun dépôt git à cette adresse. Vérifiez l’adresse, elle se termine souvent par .git');
  assert.equal(fr.gitRepo.tokenHelper, 'Un jeton d’accès personnel avec le droit d’écriture, pas votre mot de passe.');
  assert.equal(fr.gitRepo.tokenDenied, 'Accès refusé par le serveur. Vérifiez le jeton et son droit d’écriture sur ce dépôt.');
  assert.equal(fr.gitRepo.branchWaiting, 'La liste des branches s’affiche quand le dépôt est trouvé.');
  assert.equal(fr.gitRepo.branchWaitingAccess, 'La liste des branches s’affiche quand l’accès est accepté.');
  assert.equal(fr.gitRepo.branchesRead.other.replace('{n}', '3').replace('{list}', 'main, ordi, essais'), '3 branches lues dans le dépôt : main, ordi, essais.');
  assert.equal(fr.firstLaunch.snackbar.gitDownloaded, 'Carnet téléchargé depuis votre dépôt. Il reste sur ce téléphone, même sans réseau.');
  assert.equal(fr.firstLaunch.download.gitConnect, 'Connexion au dépôt');
});

test('every new key exists in both languages', () => {
  const keys = ['gitRepo.titlePhone', 'gitRepo.introPhone', 'gitRepo.repositoryHow', 'gitRepo.branchWaitingAccess', 'firstLaunch.snackbar.gitDownloaded', 'firstLaunch.download.gitConnect',
    'repoHelp.title', 'repoHelp.tabs', 'repoHelp.afterwards', 'repoHelp.open'];
  for (const [id, count] of [['github', 6], ['gitlab', 7], ['codeberg', 6]]) {
    keys.push(`repoHelp.${id}.name`, `repoHelp.${id}.intro`, `repoHelp.${id}.page`, `repoHelp.${id}.note`);
    for (let i = 1; i <= count; i++) keys.push(`repoHelp.${id}.s${i}`);
  }
  for (const [lang, json] of [['fr', fr], ['en', en]]) for (const key of keys) assert.ok(lookup(json, key), `${lang}: ${key}`);
  // No step beyond the count: a leftover would be a text nobody shows.
  for (const json of [fr, en]) {
    assert.equal(Object.keys(json.repoHelp.gitlab).filter((k) => /^s\d+$/.test(k)).length, 7);
    assert.equal(Object.keys(json.repoHelp.codeberg).filter((k) => /^s\d+$/.test(k)).length, 6);
  }
});

test('the help page: the three hosts, their links, the steps of task 252', () => {
  assert.match(helpData, /github\.com\/new/);
  assert.match(helpData, /https:\/\/gitlab\.com\/projects\/new#blank_project/);
  assert.match(helpData, /https:\/\/codeberg\.org\/repo\/create/);
  assert.match(helpData, /steps: 6[\s\S]*steps: 7[\s\S]*steps: 6/);
  assert.match(help, /target="_blank" rel="noopener"/);
  assert.equal(stripMarked(fr.repoHelp.gitlab.s7), 'Touchez Code, puis copiez l’adresse sous Cloner avec HTTPS, par exemple https://gitlab.com/vous/carnet-plongee.git.');
  assert.equal(stripMarked(fr.repoHelp.codeberg.s4), 'Laissez Initialiser le dépôt décoché. Le dépôt doit rester vide.');
  assert.equal(stripMarked(fr.repoHelp.codeberg.s6), 'Choisissez HTTPS au-dessus de l’adresse du dépôt, puis copiez-la, par exemple https://codeberg.org/vous/carnet-plongee.git.');
  assert.equal(fr.repoHelp.open.replace('{page}', fr.repoHelp.gitlab.page).replace('{name}', 'GitLab'), 'Ouvrir la page « Nouveau projet » de GitLab');
  // The active tab: semi-bold, text colour, a 3 dp underline.
  assert.match(help, /aria-selected='true'\] \{\s*color: var\(--od-text\);\s*font-weight: 600;[\s\S]*border-bottom: 3px solid var\(--od-text\)/);
});

test('the routes: the help pages and the download of the repository', () => {
  assert.match(app, /'\/welcome\/git\/repository', component: RepositoryHelp/);
  assert.match(app, /'\/account\/git\/repository', component: RepositoryHelp/);
  assert.match(app, /'\/welcome\/git\/downloading', component: FirstDownload/);
  assert.match(page, /navigate\('\/welcome\/git\/downloading', \{ props: \{ git: true, repository, branch: form\.branch \} \}\)/);
  const download = src('pages/FirstDownload.svelte');
  assert.match(download, /announceFirstLaunch\(git \? 'gitDownloaded' : 'downloaded'\)/);
  assert.match(download, /f7router\.back\(git \? '\/welcome\/git' : '\/welcome\/sign-in'/);
});

test('one form for the first launch and Compte', () => {
  // The phone's first launch: the band, « Retour » (EditorialPage firstLaunch), the About link; Compte: the app bar.
  assert.match(page, /\{#if phone && welcome\}\s*<EditorialPage[^>]*\s+firstLaunch\s+helpLink[\s\S]*<GitForm \{form\}/);
  assert.match(page, /<Navbar title=\{heading\}>[\s\S]*<GitForm \{form\}/);
  // Compte keeps no close button, no card, no decorative profile on the phone.
  const compte = page.slice(page.indexOf('{:else if phone}'), page.indexOf('{:else}'));
  assert.doesNotMatch(compte, /EditorialPage|DecorativeProfile|close/);
  // The fields are outlined, the address in a monospace face.
  assert.ok((form.match(/\boutlined\b/g) ?? []).length >= 4);
  assert.match(form, /mono\b/);
  assert.match(form, /type="submit" class="od-git-form--connect"/);
});

test('MD3 spacing of the form (4 dp grid)', () => {
  assert.match(form, /--od-outlined-gap: 16px;/);
  // 8 dp title to sentence; 16 dp sentence to link to first field (a 48 dp link with negative margins).
  assert.match(form, /\.od-git-form--intro \{\s*margin: 8px 0 0;/);
  assert.match(form, /min-height: 48px;/);
  assert.match(form, /od-git-form--link-repository \{\s*margin: 2px 0 -14px;/);
  // 4 dp field to help line; the token link 4 dp under the token help line.
  assert.match(form, /\.od-git-form--status \{\s*margin: 4px 0 0 16px;/);
  assert.match(form, /od-git-form--link-token \{\s*margin: -10px 0 -14px;/);
  // 24 dp before « Connecter », full width.
  assert.match(form, /\.od-git-form--connect \{\s*margin-top: 24px;\s*width: 100%;/);
  // The page: no gap under the title (the sentence carries its 8 dp), 16 dp sides under Compte's app bar.
  assert.match(page, /\.od-editorial-page--title\) \{\s*margin-bottom: 0;/);
  assert.match(page, /compte-body \{\s*padding: 8px 16px/);
  // The outlined fields read the shared gap.
  assert.match(src('components/AccountField.svelte'), /margin-top: var\(--od-outlined-gap, 14px\)/);
  assert.match(src('components/SelectField.svelte'), /od-select-field--outlined \{\s*margin: var\(--od-outlined-gap, 14px\) 0 0;/);
});

test('every link has a hand pointer and a hover', () => {
  assert.match(form, /od-git-form--link \{[\s\S]*cursor: pointer;[\s\S]*@media \(hover: hover\) \{\s*&:hover/);
  assert.match(form, /od-git-form--connect \{[\s\S]*cursor: pointer;[\s\S]*&:hover:not\(:disabled\)/);
});

test('side margins of 16 dp on the phone step pages', () => {
  assert.match(src('components/EditorialPage.svelte'), /\.od-editorial-page--band-body,\s*\.od-editorial-page--panel-body \{\s*padding: 16px 16px 0;/);
});

test('the branch list waits for the repository, then for the access', async () => {
  const { branchWaitingKey, repositoryLabel, repositoryName } = await import('../../app/src/lib/git-address.js');
  for (const s of ['idle', 'checking', 'none', 'notHttps', 'invalid']) assert.equal(branchWaitingKey(s), 'gitRepo.branchWaiting');
  for (const s of ['public', 'publicEmpty', 'private']) assert.equal(branchWaitingKey(s), 'gitRepo.branchWaitingAccess');
  assert.equal(repositoryLabel('https://github.com/vous/carnet-plongee.git'), 'github.com/vous/carnet-plongee');
  assert.equal(repositoryName('https://github.com/vous/carnet-plongee.git'), 'vous/carnet-plongee');
  assert.equal(repositoryLabel('not an address'), 'not an address');
});
