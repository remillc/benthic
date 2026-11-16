// The demo logbook of the release edition's first launch (task 2026-11-16-224, part 7): the state machine of
// app/src/lib/demo.js, and what keeps the demo from ever being synchronised or kept.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DEMO_KEY,
  askExit,
  createDemoState,
  demoAvailable,
  dismiss,
  guardAdd,
  leaveDemo,
  openDemo,
  storedDemo,
} from '../../app/src/lib/demo.js';

const text = (url) => readFileSync(url, 'utf8').split(String.fromCharCode(13)).join('');
const src = (path) => text(new URL(`../../app/src/${path}`, import.meta.url));

/** The calls of the app, recording what ran. */
function deps(overrides = {}) {
  const log = [];
  return {
    log,
    remember: (on) => log.push(`remember ${on}`),
    deviceLogExists: async () => false,
    start: async () => void log.push('start'),
    erase: async () => void log.push('erase'),
    showFirstStep: () => void log.push('first step'),
    ...overrides,
  };
}

test('the link opens the demo: the flag first, then the device logbook, which adds the sample', async () => {
  const state = createDemoState();
  const d = deps();
  assert.equal(await openDemo(state, d), true);
  assert.deepEqual(d.log, ['remember true', 'start']);
  assert.equal(state.on, true);
  assert.equal(state.dialog, null);
  assert.equal(state.busy, false);
  // Already open: nothing runs twice.
  assert.equal(await openDemo(state, d), false);
  assert.equal(d.log.length, 2);
});

test('the demo is never opened on top of a logbook of the diver\'s own', async () => {
  const state = createDemoState();
  const d = deps({ deviceLogExists: async () => true });
  assert.equal(await openDemo(state, d), false);
  assert.equal(state.on, false);
  assert.deepEqual(d.log, [], 'nothing runs: the device logbook is not started, and above all not erased');
  assert.equal(state.failed, true);
  assert.equal(await demoAvailable({ deviceLogExists: async () => true }), false, 'the link is not offered');
  assert.equal(await demoAvailable({ deviceLogExists: async () => false }), true);
  assert.equal(await demoAvailable({ deviceLogExists: async () => { throw new Error('x'); } }), false);
});

test('a start that fails leaves nothing: the flag goes, the sample is erased, the first step is back', async () => {
  const state = createDemoState();
  const d = deps({ start: async () => { throw new Error('LOAD'); } });
  assert.equal(await openDemo(state, d), false);
  assert.deepEqual(d.log, ['remember true', 'remember false', 'erase', 'first step']);
  assert.equal(state.on, false);
  assert.equal(state.failed, true);
});

test('the banner\'s button asks first; « Annuler » keeps the demo, « Commencer mon carnet » erases it', async () => {
  const state = createDemoState();
  const d = deps();
  askExit(state);
  assert.equal(state.dialog, null, 'no demo, no dialog');
  await openDemo(state, d);
  d.log.length = 0;
  askExit(state);
  assert.equal(state.dialog, 'exit');
  dismiss(state);
  assert.equal(state.dialog, null);
  assert.equal(state.on, true, 'the demo stays');
  assert.deepEqual(d.log, []);
  askExit(state);
  assert.equal(await leaveDemo(state, d), true);
  assert.deepEqual(d.log, ['erase', 'remember false', 'first step']);
  assert.equal(state.on, false);
  assert.equal(state.dialog, null);
  assert.equal(await leaveDemo(state, d), false, 'nothing to leave');
});

test('a demo that cannot be erased stays open, with its dialog', async () => {
  const state = createDemoState();
  await openDemo(state, deps());
  state.dialog = 'exit';
  const d = deps({ erase: async () => { throw new Error('DISK'); } });
  assert.equal(await leaveDemo(state, d), false);
  assert.equal(state.on, true);
  assert.equal(state.dialog, 'exit');
  assert.equal(state.busy, false);
  assert.ok(!d.log.includes('remember false') && !d.log.includes('first step'));
});

test('adding, downloading or importing in the demo opens « demo-ajout » and does nothing else', async () => {
  const state = createDemoState();
  let ran = 0;
  assert.equal(guardAdd(state, () => ran++), true, 'outside the demo the action runs');
  assert.equal(ran, 1);
  await openDemo(state, deps());
  for (const kind of ['download', 'import', 'manual', 'divelogs', 'scan']) {
    state.dialog = null;
    assert.equal(guardAdd(state, () => ran++), false, kind);
    assert.equal(state.dialog, 'add');
  }
  assert.equal(ran, 1, 'no action ran in the demo');
  // « Commencer mon carnet » of that dialog is the same as the banner\'s.
  assert.equal(await leaveDemo(state, deps()), true);
  assert.equal(guardAdd(state, () => ran++), true);
});

test('the demo survives a restart through the device store, and only as the exact text « true »', () => {
  const store = (value) => ({ getItem: (k) => (k === DEMO_KEY ? value : null) });
  assert.equal(DEMO_KEY, 'od.demo');
  assert.equal(storedDemo(store('true')), true);
  assert.equal(storedDemo(store(null)), false);
  assert.equal(storedDemo(store('false')), false);
  assert.equal(storedDemo({ getItem: () => { throw new Error('x'); } }), false);
});

test('nothing from the demo is synced or kept: no account, no device dives offered, account screens guarded', () => {
  const logbook = src('lib/logbook.svelte.js');
  // The device's dives are never counted or sent to an account while the demo is open.
  assert.match(logbook, /export async function deviceDiveCount\(\) \{\s*[^]*?if \(storedDemo\(deviceStore\)\) return 0;/);
  assert.match(logbook, /export async function importDeviceDives\(\) \{\s*if \(storedDemo\(deviceStore\)\) throw/);
  // The automatic sync only runs with an account (persistChanges), and the demo has none.
  assert.match(logbook, /if \(logbook\.email && logbook\.autoSync && !choiceHeld\) syncTimer/);
  // The demo opens the device's own logbook, with no account: startWithoutAccount.
  assert.match(src('lib/demo.svelte.js'), /start: startWithoutAccount/);
  // The routes that start an account open the exit dialog while the demo is on.
  const app = src('App.svelte');
  for (const route of ['/account/sign-in', '/account/create', '/account/import', '/account/git']) {
    assert.match(app, new RegExp(`path: '${route}'[^\\n]*beforeEnter: accountGuard`), route);
  }
  // « Commencer mon carnet » deletes the dives and the sites, saves, and shows the first launch again.
  assert.match(logbook, /export async function eraseDemoLogbook\(\)[^]*?deleteDive[^]*?siteAction[^]*?saveLocal/);
  assert.match(src('lib/demo.svelte.js'), /showFirstLaunchAgain/);
});

test('the logbook\'s « + » goes through the demo guard, and the first step has the link', () => {
  const logbook = src('pages/Logbook.svelte');
  assert.match(logbook, /function choose\(key\) \{\s*guardedAdd\(\(\) => \{/);
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.match(steps, /\{#if demoOffered\}/);
  assert.match(steps, /t\('demoLogbook\.link'\)/);
  const css = steps.slice(steps.indexOf('.od-first-launch--demo {'));
  assert.match(css, /cursor: pointer/);
  assert.match(css, /&:hover:not\(:disabled\)/);
  assert.match(css, /var\(--od-release-link\)/);
});

test('the banner and its dialogs read the texts of the mock-ups, with hand pointers and variables', () => {
  const fr = JSON.parse(src('i18n/fr.json')).demoLogbook;
  assert.equal(fr.link, 'Essayer avec un carnet d’exemple');
  assert.equal(`${fr.banner.lead} ${fr.banner.text}`, 'Carnet d’exemple. Ces plongées ne sont pas les vôtres.');
  assert.equal(fr.banner.start, 'Commencer mon carnet');
  assert.equal(fr.exit.title, 'Commencer mon carnet ?');
  assert.equal(fr.exit.text, 'Le carnet d’exemple sera effacé de cette tablette. Vous choisirez ensuite de créer, d’importer ou d’ouvrir votre carnet.');
  assert.equal(fr.add.title, 'Vous êtes dans le carnet d’exemple');
  assert.equal(fr.add.text, 'Pour ajouter vos plongées, commencez votre carnet. Le carnet d’exemple sera effacé.');
  const host = src('components/DemoHost.svelte');
  const css = host.slice(host.indexOf('<style>'));
  assert.match(css, /\.od-demo-banner--start \{[^]*?cursor: pointer/);
  assert.match(css, /&:hover \{/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'colours are variables');
  assert.match(host, /<DemoHost|class="od-demo-banner"/);
  assert.match(src('App.svelte'), /<DemoHost \/>/);
});
