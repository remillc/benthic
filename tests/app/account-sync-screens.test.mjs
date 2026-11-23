// The account sync screens (task 2026-11-23-338): the pure rules (recovery key, countdown, join answers), and source
// checks that every text of the screens is in fr and en, that the screens import neither the engine nor the key
// modules, and that the locked state and the account-sheet row stay off until the wiring sets them.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import fr from '../../app/src/i18n/fr.json' with { type: 'json' };
import en from '../../app/src/i18n/en.json' with { type: 'json' };
import {
  joinCounters,
  joinResolutions,
  normalizeRecoveryKey,
  recoveryKeyGroups,
  recoveryKeyProblem,
  recoveryKeyText,
  remainingMs,
  remainingText,
  PAIRING_LIFETIME_MS,
} from '../../app/src/lib/account-sync-screens.js';

const KEY = 'ABCDEFGHIJKLMNOPQRSTUV2345';

test('the recovery key is shown in groups of four', () => {
  assert.equal(KEY.length, 26);
  assert.deepEqual(recoveryKeyGroups(KEY), ['ABCD', 'EFGH', 'IJKL', 'MNOP', 'QRST', 'UV23', '45']);
  assert.equal(recoveryKeyText(KEY), 'ABCD EFGH IJKL MNOP QRST UV23 45');
});

test('what was typed is normalised: spaces, dashes and case do not matter', () => {
  assert.equal(normalizeRecoveryKey('abcd-efgh ijkl mnop_qrst uv23 45'), KEY);
  assert.equal(normalizeRecoveryKey(' ab–cd '), 'ABCD');
  assert.equal(normalizeRecoveryKey(recoveryKeyText(KEY)), KEY);
});

test('the key is checked while typing', () => {
  assert.equal(recoveryKeyProblem(''), 'empty');
  assert.equal(recoveryKeyProblem('abcd efgh'), 'length');
  assert.equal(recoveryKeyProblem(KEY + 'A'), 'length');
  assert.equal(recoveryKeyProblem('ABCDEFGHIJKLMNOPQRSTUV2341'), 'characters', '1 is not base32');
  assert.equal(recoveryKeyProblem('ABCDEFGHIJKLMNOPQRSTUV234!'), 'characters');
  assert.equal(recoveryKeyProblem(recoveryKeyText(KEY).toLowerCase()), '');
});

test('the pairing countdown reads « 9 min 42 s » and never « 0 s » while it works', () => {
  const nbsp = ' ';
  assert.equal(remainingText(9 * 60000 + 42000), `9${nbsp}min${nbsp}42${nbsp}s`);
  assert.equal(remainingText(PAIRING_LIFETIME_MS), `10${nbsp}min${nbsp}0${nbsp}s`);
  assert.equal(remainingText(59000), `59${nbsp}s`);
  assert.equal(remainingText(100), `1${nbsp}s`);
  assert.equal(remainingText(0), `0${nbsp}s`);
  assert.equal(remainingText(-5), `0${nbsp}s`);
  assert.equal(remainingMs(1000, 400), 600);
  assert.equal(remainingMs(1000, 4000), 0);
});

test('the join answers follow the segmented choices', () => {
  const matches = [
    { id: 'a', thisDevice: 'Apeks MTX-R', account: 'Apeks MTX R' },
    { id: 'b', thisDevice: 'Shearwater Peregrine', account: 'Shearwater Peregrine TX' },
    { id: 'c', thisDevice: 'Combinaison 5 mm', account: 'Combinaison 5 mm' },
  ];
  assert.deepEqual(joinResolutions(matches, { b: 'two' }), [
    { id: 'a', same: true },
    { id: 'b', same: false },
    { id: 'c', same: true },
  ]);
  assert.deepEqual(joinResolutions(matches, {}, 'two').map((r) => r.same), [false, false, false]);
  assert.deepEqual(joinCounters({ recognised: 12, added: 3, matches: matches.slice(0, 2) }), [
    { id: 'recognised', value: 12 },
    { id: 'added', value: 3 },
    { id: 'toConfirm', value: 2 },
  ]);
});

const app = new URL('../../app/src/', import.meta.url);
const screens = [
  'AccountUnlockDialog',
  'PairShowCode',
  'PairConfirmDialog',
  'PairedDialog',
  'RecoveryKeyOffer',
  'RecoveryKeyShow',
  'RecoveryKeyEnter',
  'JoinSummaryDialog',
  'LockedDataCard',
  'StartOverDialog',
  'AccountDifferentDialog',
].map((n) => [`components/${n}.svelte`, readFileSync(new URL(`components/${n}.svelte`, app), 'utf8')]);
const libs = ['lib/two-device-notice.js', 'lib/pair-scan.js', 'lib/account-sync-screens.js'].map((f) => [f, readFileSync(new URL(f, app), 'utf8')]);
// The wiring: the host picks the screen, the flows hold the texts of the snackbars and the names of the items.
const wiring = ['components/AccountSyncHost.svelte', 'lib/account-sync-flows.svelte.js'].map((f) => [f, readFileSync(new URL(f, app), 'utf8')]);
const everything = [...screens, ...libs, ...wiring];

/** @param {any} root @param {string} path */
const lookup = (root, path) => path.split('.').reduce((node, k) => node?.[k], root);

test('every accountSync text a screen uses is in fr and en, and every text is used', () => {
  const used = new Set();
  for (const [file, source] of everything) {
    // `t('accountSync.x.y')` and the two conditional forms `t(cond ? 'accountSync.a' : 'accountSync.b')`.
    for (const [, key] of source.matchAll(/'(accountSync\.[A-Za-z.]+)'/g)) used.add(key);
    for (const [, key] of source.matchAll(/`(accountSync\.join)\.\$\{counter\.id\}`/g)) for (const id of ['recognised', 'added', 'toConfirm']) used.add(`${key}.${id}`);
    assert.ok(source.length, file);
  }
  const extra = readFileSync(new URL('components/AccountSheet.svelte', app), 'utf8');
  for (const [, key] of extra.matchAll(/'(accountSync\.[A-Za-z.]+)'/g)) used.add(key);
  for (const key of used) {
    assert.equal(typeof lookup(fr, key), 'string', `${key} missing in fr.json`);
    assert.equal(typeof lookup(en, key), 'string', `${key} missing in en.json`);
  }
  /** @param {any} node @param {string} prefix @param {string[]} out */
  const leaves = (node, prefix, out = []) => {
    for (const [k, v] of Object.entries(node)) typeof v === 'string' ? out.push(`${prefix}.${k}`) : leaves(v, `${prefix}.${k}`, out);
    return out;
  };
  for (const key of leaves(fr.accountSync, 'accountSync')) assert.ok(used.has(key), `${key} is in fr.json but no screen uses it`);
  assert.deepEqual(leaves(en.accountSync, 'accountSync'), leaves(fr.accountSync, 'accountSync'), 'fr and en have the same keys, in the same order');
});

test('the texts keep the task’s words', () => {
  assert.equal(fr.accountSync.pair.doneTitle, 'Appareil jumelé');
  assert.equal(fr.accountSync.join.title, 'Joindre cet appareil');
  assert.equal(fr.accountSync.startOver.confirm, 'Effacer et repartir');
  assert.equal(fr.accountSync.unlock.pairCamera, 'Lire le code affiché sur un appareil déjà jumelé');
  assert.equal(fr.accountSync.unlock.pairDesktop, 'Afficher un code à lire avec votre téléphone');
  assert.equal(fr.accountSync.locked.line, 'Verrouillé : jumelez cet appareil');
  assert.equal(fr.accountSync.pair.expires, 'Le code expire dans {time}');
  assert.equal(fr.accountSync.pair.scanComputer, 'Lire le code d’un ordinateur');
  assert.equal(fr.accountSync.key.done, 'Je l’ai notée');
});

test('the screens are driven by props: no engine, key or core import', () => {
  for (const [file, source] of screens) {
    assert.doesNotMatch(source, /from '\.\.\/lib\/(account-sync(?!-screens)|account-join|account-keys|secret-box|core-api|file-store)/, file);
    assert.doesNotMatch(source, /benthic-core/, file);
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{6}/, `${file}: a colour is a --bc-* variable`);
  }
  for (const [file, source] of libs) assert.doesNotMatch(source, /from '\.\/(account-sync\.|account-join|account-keys|secret-box)/, file);
});

test('every class of a screen starts with bc-', () => {
  for (const [file, source] of screens) {
    const template = source.split('<style>')[0];
    for (const [, classes] of template.matchAll(/class="([^"{}]+)"/g)) for (const name of classes.split(/\s+/).filter(Boolean)) assert.match(name, /^bc-/, `${file}: ${name}`);
  }
});

test('the locked state and the account-sheet row are off by default; the host turns them on', () => {
  const state = readFileSync(new URL('lib/locked-data.svelte.js', app), 'utf8');
  assert.match(state, /locked: false,\s*canPair: false/);
  for (const file of ['components/AccountSheet.svelte', 'components/DesktopAccountSheet.svelte']) assert.match(readFileSync(new URL(file, app), 'utf8'), /\{#if accountLock\.canPair\}/, file);
  for (const file of ['pages/ProfileDiver.svelte', 'pages/ProfileInfo.svelte', 'pages/ProfileCerts.svelte', 'components/ProfileNav.svelte'])
    assert.match(readFileSync(new URL(file, app), 'utf8'), /accountLock\.locked/, file);
});

test('the screens are reached through one host, mounted in App.svelte for Benthic+ builds only', () => {
  const host = readFileSync(new URL('components/AccountSyncHost.svelte', app), 'utf8');
  for (const [file] of screens) {
    const name = file.split('/').pop();
    if (name === 'LockedDataCard.svelte') continue;
    assert.ok(host.includes(`./${name}'`), `${name} is not shown by the host`);
  }
  const root = readFileSync(new URL('App.svelte', app), 'utf8');
  assert.match(root, /\{#if isRelease\}<AccountSyncHost \/>\{\/if\}/);
  // Dialogs own no route: the host never calls a router.
  assert.doesNotMatch(host + readFileSync(new URL('lib/account-sync-flows.svelte.js', app), 'utf8'), /\.navigate\(|routeTo|f7\.views/);
});
