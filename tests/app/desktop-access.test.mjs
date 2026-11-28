// The right to the desktop app (task 2026-11-27-414): who has access, the grace period at 0, 24, 25, 30 and 31 days, what a
// read-only logbook may do, what the sign-in keeps, and that the screens and the core are locked by it. The pure rules run;
// the screens need Electron and Framework7, so their sources are read for the gating.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GRACE_DAYS,
  KEYS,
  WARNING_FROM_DAY,
  WRITE_COMMANDS,
  accessState,
  allowed,
  checkResult,
  isReadOnly,
  purchaseUrl,
  readOnlyEntries,
  remembered,
  rightFromOverview,
  trustedNow,
} from '../../app/src/lib/desktop-access.js';
import { afterSignIn } from '../../app/src/lib/benthic-plus.js';
import { overviewOf } from '../../app/src/lib/server-api.js';
import { WRITE_METHODS, coreReadOnly, isBlocked, readOnlyError, setCoreReadOnly } from '../../plugins/benthic-core/read-only.js';

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 10, 27, 12, 0, 0);
/** The state `days` days after a successful check that said the right is there. */
const after = (days, extra = {}) => accessState({ signedIn: true, granted: true, checkedAt: T0, now: T0 + days * DAY, ...extra });

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

test('the rules: 30 days of grace, the banner from day 25', () => {
  assert.equal(GRACE_DAYS, 30);
  assert.equal(WARNING_FROM_DAY, 25);
});

test('who has access: nobody signed in, an account with neither product, a Benthic+ subscription that ended', () => {
  const never = accessState({ signedIn: false, granted: null, checkedAt: null, now: T0 });
  assert.deepEqual([never.status, never.reason], ['readOnly', 'never']);
  // Signed in but never checked (the server has not answered yet): nothing proves the right.
  assert.equal(accessState({ signedIn: true, granted: null, checkedAt: null, now: T0 }).reason, 'never');
  // Signed out later: the remembered answer does not count without an account.
  assert.equal(accessState({ signedIn: false, granted: true, checkedAt: T0, now: T0 }).reason, 'never');
  const ended = accessState({ signedIn: true, granted: false, endedOn: '2026-11-20', checkedAt: T0, now: T0 + DAY });
  assert.deepEqual([ended.status, ended.reason, ended.endedOn], ['readOnly', 'ended', '2026-11-20']);
  // Signed in, the server says no and no subscription ended: the account holds neither product.
  assert.equal(accessState({ signedIn: true, granted: false, checkedAt: T0, now: T0 }).reason, 'none');
  assert.ok(isReadOnly(ended));
  // The server's "no" stands whatever the time: the grace period only extends a "yes".
  assert.equal(accessState({ signedIn: true, granted: false, checkedAt: T0, now: T0 }).status, 'readOnly');
});

test('grace period at 0, 24, 25, 29, 30 and 31 days', () => {
  const s0 = after(0);
  assert.deepEqual([s0.status, s0.reason, s0.daysSinceCheck, s0.daysLeft], ['ok', null, 0, 30]);
  assert.equal(after(24).status, 'ok');
  assert.equal(after(24.99).status, 'ok');
  const s25 = after(25);
  assert.deepEqual([s25.status, s25.daysLeft], ['warning', 5]);
  assert.deepEqual([after(29).status, after(29).daysLeft], ['warning', 1]);
  // Exactly 30 days: the last moment of the right.
  const s30 = after(30);
  assert.deepEqual([s30.status, s30.daysLeft], ['warning', 0]);
  const s31 = after(31);
  assert.deepEqual([s31.status, s31.reason], ['readOnly', 'graceOver']);
  assert.equal(after(30 + 1 / 24 / 3600).status, 'readOnly', 'a second past 30 days');
  assert.equal(after(400).status, 'readOnly');
});

test('a successful check restarts the count', () => {
  const store = new Map();
  const state = { getItem: (k) => store.get(k) ?? null };
  for (const [k, v] of Object.entries(checkResult({ granted: true }, T0))) store.set(k, v);
  let m = remembered(state);
  assert.deepEqual([m.granted, m.checkedAt, m.endedOn], [true, T0, '']);
  assert.equal(accessState({ signedIn: true, ...m, now: T0 + 28 * DAY }).status, 'warning');
  for (const [k, v] of Object.entries(checkResult({ granted: true }, T0 + 28 * DAY))) store.set(k, v);
  m = remembered(state);
  assert.equal(accessState({ signedIn: true, ...m, now: T0 + 29 * DAY }).status, 'ok', 'a day after the new check');
  assert.equal(accessState({ signedIn: true, ...m, now: T0 + 59 * DAY }).status, 'readOnly', '31 days after the new check');
});

test('Benthic+ only, Benthic Desktop only, both, neither, Benthic+ ended with Benthic Desktop still bought', () => {
  /** What the server answers for each case, through the app's own reading of it. */
  const answer = (plus, desktop, endedOn) =>
    rightFromOverview(overviewOf({
      benthicPlus: { active: plus, ...(plus ? { endsOn: '2027-11-01' } : endedOn ? { endedOn } : {}) },
      benthicDesktop: { purchased: desktop, ...(desktop ? { purchasedOn: '2026-10-05' } : {}) },
      desktopAccess: { granted: plus || desktop, source: plus ? 'benthic_plus' : desktop ? 'benthic_desktop' : null },
    }));
  /** The state a day after the check that brought this answer, and 31 days after it with no further check. */
  const states = (right) => {
    const store = new Map(Object.entries(checkResult(right, T0)));
    const m = remembered({ getItem: (k) => store.get(k) ?? null });
    return [accessState({ signedIn: true, ...m, now: T0 + DAY }), accessState({ signedIn: true, ...m, now: T0 + 31 * DAY })];
  };
  let [now, later] = states(answer(true, false));
  assert.equal(now.status, 'ok', 'Benthic+ only opens the app');
  assert.equal(later.reason, 'graceOver', 'and the grace period still ends');
  [now] = states(answer(false, true));
  assert.equal(now.status, 'ok', 'Benthic Desktop only opens the app');
  [now] = states(answer(true, true));
  assert.equal(now.status, 'ok', 'both open it');
  [now] = states(answer(false, false));
  assert.deepEqual([now.status, now.reason], ['readOnly', 'none'], 'neither: read only, nothing ended');
  [now] = states(answer(false, true, '2026-11-20'));
  assert.equal(now.status, 'ok', 'Benthic+ ended with Benthic Desktop still bought: the app stays open');
  assert.equal(now.endedOn, '');
  [now] = states(answer(false, false, '2026-11-20'));
  assert.deepEqual([now.status, now.reason, now.endedOn], ['readOnly', 'ended', '2026-11-20'], 'Benthic+ ended alone: read only, naming the subscription');
  // A Benthic Desktop purchase has no end date: it never leads to the read-only reason "ended".
  assert.deepEqual(answer(false, true), { granted: true });
  assert.equal(rightFromOverview(overviewOf({})), null, 'an answer that does not say gives no right');
});

test('a check that says the right ended keeps the day it ended', () => {
  const result = checkResult({ granted: false, endedOn: '2026-11-20' }, T0);
  assert.equal(result[KEYS.granted], '0');
  assert.equal(result[KEYS.endedOn], '2026-11-20');
  const store = new Map(Object.entries(result));
  const m = remembered({ getItem: (k) => store.get(k) ?? null });
  assert.deepEqual([m.granted, m.endedOn], [false, '2026-11-20']);
  // A later "yes" clears it.
  assert.equal(checkResult({ granted: true, endedOn: '2026-11-20' }, T0)[KEYS.endedOn], '');
});

test('nothing remembered gives no right; garbage in the store is not trusted', () => {
  const empty = remembered({ getItem: () => null });
  assert.deepEqual(empty, { granted: null, endedOn: '', checkedAt: null, seenAt: null });
  const junk = remembered({ getItem: (k) => (k === KEYS.checkedAt ? 'soon' : k === KEYS.granted ? 'yes' : null) });
  assert.deepEqual([junk.granted, junk.checkedAt], [null, null]);
  // Granted with no check time: the grace is over, never an open door.
  assert.equal(accessState({ signedIn: true, granted: true, checkedAt: null, now: T0 }).reason, 'graceOver');
});

test('a clock set back does not give back days of grace', () => {
  assert.equal(trustedNow(T0, null), T0);
  assert.equal(trustedNow(T0, T0 + 40 * DAY), T0 + 40 * DAY, 'the latest time seen wins');
  assert.equal(trustedNow(T0 + 5 * DAY, T0), T0 + 5 * DAY);
  assert.equal(accessState({ signedIn: true, granted: true, checkedAt: T0, now: trustedNow(T0 + 1 * DAY, T0 + 40 * DAY) }).status, 'readOnly');
});

test('what a read-only logbook may do: view and export, nothing that writes', () => {
  const ro = allowed(true);
  assert.deepEqual([ro.view, ro.export], [true, true]);
  for (const key of ['add', 'edit', 'delete', 'import', 'sync']) assert.equal(ro[key], false, key);
  const rw = allowed(false);
  for (const key of ['view', 'export', 'add', 'edit', 'delete', 'import', 'sync']) assert.equal(rw[key], true, key);
});

test('the menus of a read-only logbook keep copy and export, drop what writes, and leave no stray divider', () => {
  const entries = [
    { key: 'merge' }, { key: 'addToTrip' }, { key: 'separator' }, { key: 'edit' }, { key: 'shiftTime' }, { key: 'separator' },
    { key: 'copy' }, { key: 'export' }, { key: 'share' }, { key: 'separator' }, { key: 'delete' },
  ];
  assert.deepEqual(readOnlyEntries(entries).map((e) => e.key), ['copy', 'export', 'share']);
  const more = [{ key: 'undo' }, { key: 'redo' }, { key: 'separator' }, { key: 'filter' }, { key: 'renumber' }, { key: 'computers' }, { key: 'separator' }, { key: 'about' }];
  assert.deepEqual(readOnlyEntries(more).map((e) => e.key), ['filter', 'computers', 'separator', 'about']);
  assert.deepEqual(readOnlyEntries([{ key: 'paste' }]), []);
  for (const key of ['new', 'import', 'download', 'manual', 'edit', 'delete', 'merge', 'paste', 'undo', 'redo']) assert.ok(WRITE_COMMANDS.has(key), key);
  for (const key of ['copy', 'export', 'share', 'find', 'filter', 'selectAll', 'columns', 'settings']) assert.ok(!WRITE_COMMANDS.has(key), key);
});

test('the core refuses what writes while read only, and only then', () => {
  assert.equal(coreReadOnly(), false);
  assert.equal(isBlocked('editDive'), false);
  setCoreReadOnly(true);
  try {
    for (const name of ['createDive', 'editDive', 'editDives', 'deleteDive', 'mergeDives', 'importDives', 'importCsv', 'savePlan', 'sync', 'saveLocal', 'bgitPush', 'bgitCommit', 'bgitWrite', 'siteAction', 'tripAction', 'undo', 'shiftTime', 'renumberDives']) {
      assert.equal(isBlocked(name), true, name);
    }
    // Reading, exporting, planning and the device's own settings stay.
    for (const name of ['listDives', 'getDive', 'exportDives', 'statsQuery', 'siteQuery', 'planDive', 'setPrefs', 'getPrefs', 'bgitPull', 'bgitRead', 'serverSessionInfo']) {
      assert.equal(isBlocked(name), false, name);
    }
    assert.equal(readOnlyError('editDive').code, 'READ_ONLY');
  } finally {
    setCoreReadOnly(false);
  }
  assert.equal(isBlocked('editDive'), false);
});

test('every method of the desktop plugin that writes the logbook is on the list', () => {
  const desktop = readFileSync(new URL('../../plugins/benthic-core/desktop.js', import.meta.url), 'utf8');
  // The core calls that do not write the logbook: everything else the plugin sends to the core must be on the list.
  const reads = new Set([
    'alphaCacheList', 'alphaCacheOpen', 'benthicIds', 'cancelConflictResolution', 'cloudConfigure', 'cloudCreateAccount', 'cloudDeleteAccount', 'cloudListCachedDives',
    'cloudListDives', 'cloudProbe', 'cloudSignOut', 'cloudVerifyPin', 'countDives', 'cylinderTypes', 'dcBluetoothModels', 'diveColumns', 'diveComputerAction', 'diveComputers',
    'divelogsCheck', 'divelogsDownload', 'downloadCancel', 'downloadPartial', 'exportDives', 'filterPresets', 'filterQuery', 'getDive', 'getPrefs', 'getTrip', 'gitCheck',
    'gitConfigure', 'history', 'importCount', 'listDives', 'listLoadedDives', 'listPlans', 'logExists', 'pendingChanges', 'planDive', 'plannerSetup', 'setCloudTestEmail',
    'setPrefs', 'siteQuery', 'statsQuery', 'syncConflicts', 'toolQuery', 'weightTypes',
  ]);
  const used = new Set([...desktop.matchAll(/this\.core\('([A-Za-z]+)'/g)].map((m) => m[1]));
  const writes = [...used].filter((name) => !reads.has(name));
  assert.ok(writes.length > 10);
  for (const name of writes) assert.ok(WRITE_METHODS.has(name), `${name} writes: it must be in plugins/benthic-core/read-only.js`);
});

test('the plugin applies the lock to every call, in one place', () => {
  const api = readFileSync(new URL('../../plugins/benthic-core/core-api.js', import.meta.url), 'utf8');
  assert.match(api, /if \(isBlocked\(name\)\) return Promise\.reject\(readOnlyError\(name\)\)/);
  assert.match(api, /export \{ setCoreReadOnly \} from '\.\/read-only\.js'/);
});

test('an account that holds the right without being a subscriber keeps its session on the desktop only', () => {
  const buyer = { subscribed: false, desktopAccess: true };
  assert.equal(afterSignIn(buyer, true), 'download');
  assert.equal(afterSignIn(buyer, false), 'offer', 'a phone still sends a non-subscriber to the offer');
  assert.equal(afterSignIn({ subscribed: false, desktopAccess: false }, true), 'offer');
  assert.equal(afterSignIn({ subscribed: true }, false), 'download');
  assert.equal(afterSignIn(undefined, true), 'offer');
});

test('the account answer carries the two rights apart, and the desktop access computed from them', () => {
  const o = overviewOf({
    subscription: { subscribed: false },
    benthicPlus: { active: false, endedOn: '2026-11-20T00:00:00Z' },
    benthicDesktop: { purchased: true, purchasedOn: '2026-10-05' },
    desktopAccess: { granted: true, source: 'benthic_desktop' },
  });
  assert.deepEqual(o.desktopAccess, { granted: true, source: 'benthic_desktop' });
  assert.deepEqual(o.benthicPlus, { active: false, endedOn: '2026-11-20' });
  assert.deepEqual(o.benthicDesktop, { purchased: true, purchasedOn: '2026-10-05' });
  assert.equal(o.subscription.subscribed, false);
  const plus = overviewOf({ benthicPlus: { active: true, endsOn: '2027-11-01' }, desktopAccess: { granted: true, source: 'benthic_plus' } });
  assert.deepEqual(plus.benthicPlus, { active: true, endsOn: '2027-11-01' });
  assert.equal(overviewOf({ desktopAccess: { granted: true, source: 'mobile_app' } }).desktopAccess.source, undefined, 'a phone or tablet purchase is not a source');
  assert.equal(overviewOf({ benthicDesktop: { purchased: 'yes' } }).benthicDesktop, undefined);
  assert.equal(overviewOf({ desktopAccess: { granted: 'yes' } }).desktopAccess, undefined);
  assert.equal(overviewOf({}).desktopAccess, undefined);
});

test('the purchase address comes from the configuration, https only', () => {
  assert.equal(purchaseUrl('https://pay.example.com/desktop'), 'https://pay.example.com/desktop');
  assert.equal(purchaseUrl('http://pay.example.com'), 'https://benthicdivelog.app/desktop');
  assert.equal(purchaseUrl(undefined), 'https://benthicdivelog.app/desktop');
});

test('the desktop screens are gated by the right, and phones and tablets are not', () => {
  const store = read('lib/desktop-access.svelte.js');
  assert.match(store, /export const accessEnforced = desktopApp && isRelease && !sideWindow/, 'desktop, release edition, main window only');
  assert.match(store, /document\.documentElement\.classList\.toggle\('bc-access-read-only'/);
  assert.match(store, /setCoreReadOnly\(state\.status === 'readOnly'\)/);
  // The logbook page: no + button, no editing menu entries, shortcuts and drops do nothing.
  const logbook = read('pages/DesktopLogbook.svelte');
  assert.match(logbook, /!navigation\.over && !readOnly\}<FabMenu/);
  assert.match(logbook, /readOnly \? readOnlyEntries\(entries\) : entries/);
  assert.match(logbook, /readOnly && WRITE_COMMANDS\.has\(command\)/);
  assert.match(logbook, /readOnly && WRITE_COMMANDS\.has\(key\)/);
  assert.match(logbook, /if \(readOnly\) return;\n\s+for \(const file of e\.dataTransfer\.files\)/);
  assert.match(logbook, /access\.exportRequests/);
  // Fields: plain text, an empty one shows a dash.
  const field = read('components/DesktopEditField.svelte');
  assert.match(field, /const ro = \$derived\(readonly \|\| locked\)/);
  assert.match(field, /\(locked \? '—' : ''\)/);
  // No automatic sync while read only.
  assert.match(read('lib/logbook.svelte.js'), /!logbook\.browsing && !desktopReadOnly\(\)/);
  // The banner is the desktop's only.
  assert.match(read('App.svelte'), /\{#if desktopApp && !sideWindow\}<DesktopAccessBanner \/>\{\/if\}/);
});

test('the banner offers what the mock-ups show', () => {
  const banner = read('components/DesktopAccessBanner.svelte');
  assert.match(banner, /desktopAccess\.warning\.retry/);
  for (const key of ['export', 'signIn', 'renew']) assert.match(banner, new RegExp(`desktopAccess\\.readOnly\\.${key}`));
  assert.match(banner, /role="status"/);
  const first = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(first, /desktopAccess\.required\.buy/);
  assert.match(first, /desktopAccess\.required\.readOnly/);
});

test('every text of the access screens is in French and in English', () => {
  const keys = ['required.title', 'required.lead', 'required.noAccount', 'required.buy', 'required.noAccountAfter', 'required.readOnly', 'required.browseEmpty', 'required.back',
    'warning.text', 'warning.action.one', 'warning.action.other', 'warning.retry', 'warning.stillOffline', 'readOnly.title', 'readOnly.ended', 'readOnly.never', 'readOnly.graceOver',
    'readOnly.none', 'readOnly.tail', 'readOnly.export', 'readOnly.signIn', 'readOnly.renew', 'readOnly.snackbar'];
  const at = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
  for (const lang of ['fr', 'en']) for (const key of keys) assert.equal(typeof at(langs[lang].desktopAccess, key), 'string', `${lang} ${key}`);
  assert.equal(langs.fr.desktopAccess.required.title, 'Benthic sur ordinateur demande Benthic+ ou Benthic Desktop');
  assert.equal(langs.fr.desktopAccess.required.buy, 'Acheter Benthic Desktop');
  assert.match(langs.fr.desktopAccess.readOnly.ended, /^Votre abonnement Benthic\+ a pris fin le \{date\}\.$/);
  assert.match(langs.fr.desktopAccess.warning.action.other, /Connectez-vous à Internet d’ici \{n\} jours pour garder l’accès/);
  assert.equal(langs.fr.desktopAccess.readOnly.export, 'Exporter le carnet');
});
