// The beta never opens a logbook on the Subsurface cloud (lib/subsurface-cloud.js), and a dive that cannot be read
// shows a styled error state (pages/DiveDetail.svelte).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isIgnoredCloudAccount } from '../../app/src/lib/subsurface-cloud.js';

const src = (/** @type {string} */ p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');

test('release: a Subsurface-cloud account is ignored, a git repository and no account are not', () => {
  assert.equal(isIgnoredCloudAccount({ available: true, email: 'a@b.c' }, true), true);
  assert.equal(isIgnoredCloudAccount({ available: true, mode: 'cloud' }, true), true);
  assert.equal(isIgnoredCloudAccount({ available: true, mode: 'git' }, true), false);
  assert.equal(isIgnoredCloudAccount({ available: false }, true), false);
  assert.equal(isIgnoredCloudAccount(null, true), false);
});

test('alpha: nothing is ignored', () => {
  assert.equal(isIgnoredCloudAccount({ available: true, email: 'a@b.c' }, false), false);
});

test('the logbook loader applies the rule and the beta keeps its own start state, hint and snapshot keys', () => {
  const lb = src('lib/logbook.svelte.js');
  assert.match(lb, /isIgnoredCloudAccount\(account, isRelease\)/g);
  assert.equal(lb.match(/isIgnoredCloudAccount\(/g).length, 2); // startApp + loadCloud
  assert.match(lb, /WELCOME_KEY = isRelease \? 'od\.welcomeBeta' : 'od\.welcome'/);
  assert.match(lb, /ACCOUNT_HINT = isRelease \? 'od\.repositoryAccount' : 'od\.cloudAccount'/);
  assert.match(src('lib/snapshot.js'), /isRelease \? 'od\.logbookSnapshotBeta' : 'od\.logbookSnapshot'/);
});

test('the Subsurface-cloud sign-in routes exist only in the alpha', () => {
  const app = src('App.svelte');
  for (const route of ['/account/sign-in', '/account/create', '/account/code', '/welcome/sign-in', '/welcome/create', '/welcome/code']) {
    const at = app.indexOf(`path: '${route}'`);
    assert.ok(at > 0, route);
    assert.match(app.slice(Math.max(0, at - 520), at), /isRelease\s*\?\s*\[\]/, `${route} sits in the alpha-only branch`);
  }
  // The pitch and the three choices of the Account page without an account (create, sign in, own git) are the alpha's.
  assert.match(src('pages/Account.svelte'), /\{#if !isRelease\}\s*<p class="bc-account--pitch">[\s\S]*<a href="\/account\/create"[\s\S]*<a href="\/account\/git\/new"/);
});

test('the beta never offers to open a logbook in a personal git repository: no route, no link (18 November 2026)', () => {
  const app = src('App.svelte');
  for (const route of ['/account/git', '/account/git/token', '/account/git/repository', '/account/git/new', '/welcome/git', '/welcome/git/token', '/welcome/git/repository', '/welcome/git/downloading']) {
    const at = app.indexOf(`path: '${route}'`);
    assert.ok(at > 0, route);
    assert.match(app.slice(Math.max(0, at - 700), at), /isRelease\s*\?\s*\[\]/, `${route} sits in the alpha-only branch`);
  }
  // « Modifier le dépôt » of the Account page, and the sync failure's way to the git form.
  const account = src('pages/Account.svelte');
  assert.match(account, /\{:else if git && !isRelease\}/);
  assert.match(account, /\{:else if !git\}/);
  const sheet = src('components/SyncFailureSheet.svelte');
  assert.match(sheet, /\} else if \(isRelease\) \{[^}]*navigate\('\/account'\)/);
  // The desktop's « Nouveau carnet » keeps the computer only.
  assert.match(src('components/DesktopNewLogbook.svelte'), /\{#if !isRelease\}[\s\S]*where === 'cloud'[\s\S]*where === 'git'[\s\S]*\{\/if\}/);
});

test('the error state of a dive has the app styling: own class, title font, tokens only, a way on', () => {
  const page = src('pages/DiveDetail.svelte');
  const block = page.slice(page.indexOf('{#if failed}'), page.indexOf('{:else if !dive}'));
  assert.match(block, /class="bc-dive-detail--error"/);
  assert.match(block, /bc-state-title/);
  assert.match(block, /t\('detail\.errorTitle'\)/);
  assert.match(block, /t\('detail\.retry'\)/);
  const css = page.slice(page.indexOf('.bc-dive-detail--error {'), page.indexOf('.bc-dive-detail--error-text {') + 200);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'no hard-coded colour');
  assert.match(css, /var\(--bc-text\)/);
  for (const lang of ['en', 'fr']) {
    const j = JSON.parse(src(`i18n/${lang}.json`));
    assert.ok(j.detail.retry && j.detail.errorTitle && j.detail.errorText);
  }
});
