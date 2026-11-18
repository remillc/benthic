// The one-off import of the alpha's logbook (decided on 18 November 2026): the row of « Importer un carnet » appears
// only with the alpha's local copy and only once, the copy is read from the device without the network, and nothing
// of the alpha (its files, its account) is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALPHA_IMPORT_KEY, alphaImportDone, alphaLogbookFile, findAlphaLogbook, markAlphaImportDone } from '../../app/src/lib/alpha-logbook.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

/** A device store in memory. */
function store() {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), items };
}

/**
 * A core with the alpha's account and copy. Only the three calls the import is allowed to make exist: any other call
 * (a sync, a probe, a sign-out, a deletion) throws, and so does a non-cached listing (the network).
 */
function core({ account = { available: true, mode: undefined }, dives = [{ id: 3 }, { id: 5 }, { id: 9 }], text = '<divelog><dives><dive number="1" date="2024-05-01"/></dives></divelog>' } = {}) {
  const calls = [];
  const allowed = {
    configureCloud: async () => account,
    listCloudDives: async (options) => {
      if (options?.cached !== true) throw new Error('NETWORK: only the device copy may be read');
      return { available: true, cached: true, dives };
    },
    exportDives: async (options) => ({ text: options.text ? text : '' }),
  };
  return {
    calls,
    api: new Proxy(allowed, {
      get(target, name) {
        if (typeof name === 'string' && !(name in target)) throw new Error(`The import must not call ${name}`);
        return async (...args) => {
          calls.push([name, ...args]);
          return target[name](...args);
        };
      },
    }),
  };
}

test('the alpha’s logbook is offered with its dive count, read from the device copy only', async () => {
  const c = core();
  const found = await findAlphaLogbook(c.api, store(), true);
  assert.deepEqual(found, { dives: 3, ids: [3, 5, 9] });
  assert.deepEqual(c.calls.map((call) => call[0]), ['configureCloud', 'listCloudDives']);
  assert.deepEqual(c.calls[1][1], { cached: true });
});

test('nothing is offered without the alpha’s local copy', async () => {
  // The alpha edition keeps its behaviour: the row is the beta's.
  assert.equal(await findAlphaLogbook(core().api, store(), false), null);
  // No account left on the device.
  assert.equal(await findAlphaLogbook(core({ account: { available: false } }).api, store(), true), null);
  // An account that the beta opens itself (a git repository, the OpenDives server): not the alpha's cloud logbook.
  assert.equal(await findAlphaLogbook(core({ account: { available: true, mode: 'git' } }).api, store(), true), null);
  // An account without a copy on the device, or an empty copy.
  assert.equal(await findAlphaLogbook(core({ dives: [] }).api, store(), true), null);
  // The core refusing to read: the row is not shown, nothing breaks.
  const broken = { configureCloud: async () => { throw new Error('CORE_ERROR'); } };
  assert.equal(await findAlphaLogbook(broken, store(), true), null);
});

test('the row appears only once: after the import it is remembered in the device store', async () => {
  const s = store();
  assert.equal(alphaImportDone(s), false);
  assert.ok(await findAlphaLogbook(core().api, s, true));
  markAlphaImportDone(s);
  assert.equal(s.items.get(ALPHA_IMPORT_KEY), '1');
  assert.match(ALPHA_IMPORT_KEY, /^od\./);
  assert.equal(alphaImportDone(s), true);
  const c = core();
  assert.equal(await findAlphaLogbook(c.api, s, true), null);
  assert.deepEqual(c.calls, [], 'once imported, the core is not even asked');
});

test('the copy is a Subsurface file made from the dives; the alpha’s files and account are not touched', async () => {
  const c = core();
  const found = await findAlphaLogbook(c.api, store(), true);
  const { file, text } = await alphaLogbookFile(c.api, found, 'Carnet précédent');
  assert.equal(file.name, 'Carnet précédent.ssrf');
  assert.equal(await file.text(), text);
  assert.match(text, /<dive /);
  const exported = c.calls.find((call) => call[0] === 'exportDives')[1];
  assert.deepEqual(exported, { ids: [3, 5, 9], format: 'ssrf', anonymize: false, name: 'previous-version.ssrf', text: true });
  // Only reads: the Proxy above throws on a sign-out, a sync, a deletion or a listing that is not cached.
  assert.deepEqual([...new Set(c.calls.map((call) => call[0]))].sort(), ['configureCloud', 'exportDives', 'listCloudDives']);
  await assert.rejects(alphaLogbookFile(core({ text: '' }).api, found, 'x'), /NO_DIVES/);
});

test('first launch: the row sits in « Importer un carnet », is shown only with the copy, and the import is marked done after the logbook exists', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const rows = steps.slice(steps.indexOf("{:else if step === 'import'}"), steps.indexOf("{:else if step === 'importDivelogs'"));
  assert.match(rows, /\{#if alphaFound\}\s*<ReleaseChoiceRow icon="logbook" title=\{t\('welcomeSteps\.alphaTitle'\)\} help=\{t\('welcomeSteps\.alphaHelp', \{ n: alphaFound\.dives \}\)\}/);
  // The same name step and the same import as a picked file.
  assert.match(steps, /flow\.source = \{ kind: 'file', file, name, summary: summariseImport\(alphaFound\.dives, text\), alpha: true \};\s*flow\.name = name;\s*go\('file'\);/);
  assert.match(steps, /findAlphaLogbook\(OpenDivesCore, deviceStore, isRelease\)/);
  const created = steps.slice(steps.indexOf('await createDeviceLogbook('), steps.indexOf('resetFlow();', steps.indexOf('await createDeviceLogbook(')));
  assert.match(created, /if \(flow\.source\?\.alpha\) markAlphaImportDone\(deviceStore\);/);
  // Nothing sends, signs out or deletes in the module that reads the alpha's copy.
  const module = read('lib/alpha-logbook.js');
  assert.doesNotMatch(module, /probeCloud|signOut|deleteAccount|cloudSignOut|serverSession|fetch\(/);
  for (const lang of ['fr', 'en']) {
    const welcome = JSON.parse(read(`i18n/${lang}.json`)).welcomeSteps;
    assert.ok(welcome.alphaTitle && welcome.alphaName && welcome.alphaHelp.one && welcome.alphaHelp.other, lang);
  }
});
