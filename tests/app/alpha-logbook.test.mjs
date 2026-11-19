// The one-off import of the alpha's logbook (decided on 18 November 2026): the row of « Importer un carnet » appears
// only with the alpha's local copy and only once, the copy is read from the device without the network, and nothing
// of the alpha (its files, its account) is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALPHA_IMPORT_KEY, alphaImportDone, alphaLogbookFile, findAlphaLogbooks, markAlphaImportDone } from '../../app/src/lib/alpha-logbook.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

/** A device store in memory. */
function store() {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), items };
}

/**
 * A core with the alpha's local cache. Only the three calls the import is allowed to make exist: any other call (an
 * account, a sync, a probe, a sign-out, a deletion, a listing of the cloud) throws.
 */
function core({ folders = [{ id: 'f3a9', branch: 'diver@example.org', bytes: 57_000_000, modified: 1_700_000_000, dives: 3 }], dives = [{ id: 3 }, { id: 5 }, { id: 9 }], text = '<divelog><dives><dive number="1" date="2024-05-01"/></dives></divelog>' } = {}) {
  const calls = [];
  const allowed = {
    alphaCacheList: async () => folders,
    alphaCacheOpen: async (options) => {
      if (!folders.some((f) => f.id === options.id)) throw new Error('No logbook in this cache');
      return dives;
    },
    // The core writes the file in the app's cache: only its path and size come back (never the text).
    exportDives: async (options) => (options.stage ? { uri: '', path: '/cache/import-1-previous.ssrf', size: text.length } : { text: 'NEVER' }),
    discardImport: async () => {},
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

test('the alpha’s logbook is offered with its dive count, from the local cache alone: no account, no credential, no network', async () => {
  const c = core();
  const found = await findAlphaLogbooks(c.api, store(), true);
  assert.deepEqual(found, [{ id: 'f3a9', branch: 'diver@example.org', bytes: 57_000_000, modified: 1_700_000_000, dives: 3 }]);
  assert.deepEqual(c.calls.map((call) => call[0]), ['alphaCacheList']);
});

test('several cache folders are all listed, the most recent first; an empty one is left out', async () => {
  const folders = [
    { id: 'old', branch: 'a@example.org', bytes: 10, modified: 100, dives: 12 },
    { id: 'empty', branch: 'b@example.org', bytes: 10, modified: 300, dives: 0 },
    { id: 'new', branch: 'c@example.org', bytes: 10, modified: 200, dives: 40 },
  ];
  const found = await findAlphaLogbooks(core({ folders }).api, store(), true);
  assert.deepEqual(found.map((f) => [f.id, f.dives]), [['new', 40], ['old', 12]]);
});

test('nothing is offered without the alpha’s local cache', async () => {
  // The alpha edition keeps its behaviour: the row is the beta's.
  assert.equal((await findAlphaLogbooks(core().api, store(), false)).length, 0);
  // No cache folder, or only an empty one.
  assert.deepEqual(await findAlphaLogbooks(core({ folders: [] }).api, store(), true), []);
  assert.deepEqual(await findAlphaLogbooks(core({ folders: [{ id: 'x', branch: 'b', bytes: 1, modified: 1, dives: 0 }] }).api, store(), true), []);
  // The core refusing to read: the row is not shown, nothing breaks.
  const broken = { alphaCacheList: async () => { throw new Error('CORE_ERROR'); } };
  assert.deepEqual(await findAlphaLogbooks(broken, store(), true), []);
});

test('the row appears only once: after the import it is remembered in the device store', async () => {
  const s = store();
  assert.equal(alphaImportDone(s), false);
  assert.equal((await findAlphaLogbooks(core().api, s, true)).length, 1);
  markAlphaImportDone(s);
  assert.equal(s.items.get(ALPHA_IMPORT_KEY), '1');
  assert.match(ALPHA_IMPORT_KEY, /^od\./);
  assert.equal(alphaImportDone(s), true);
  const c = core();
  assert.deepEqual(await findAlphaLogbooks(c.api, s, true), []);
  assert.deepEqual(c.calls, [], 'once imported, the core is not even asked');
});

test('the copy is a Subsurface file written by the core into the cache, core to core: no text comes back; the alpha’s files and account are not touched', async () => {
  const c = core();
  const [found] = await findAlphaLogbooks(c.api, store(), true);
  const staged = await alphaLogbookFile(c.api, found, 'Carnet précédent');
  assert.deepEqual(staged, { path: '/cache/import-1-previous.ssrf', name: 'Carnet précédent.ssrf', size: staged.size });
  assert.ok(staged.size > 0);
  const exported = c.calls.find((call) => call[0] === 'exportDives')[1];
  assert.deepEqual(exported, { ids: [3, 5, 9], format: 'ssrf', anonymize: false, name: 'Carnet précédent.ssrf', stage: true });
  assert.equal('text' in exported, false, 'the contents never travel to the web layer');
  // Only reads: the Proxy above throws on a sign-out, a sync, a deletion or a listing that is not cached.
  assert.deepEqual([...new Set(c.calls.map((call) => call[0]))].sort(), ['alphaCacheList', 'alphaCacheOpen', 'exportDives']);
  assert.equal(c.calls.some((call) => call[0] === 'readSharedFile'), false);
  assert.deepEqual(c.calls.find((call) => call[0] === 'alphaCacheOpen')[1], { id: 'f3a9' });
  await assert.rejects(alphaLogbookFile(core({ text: '' }).api, found, 'x'), /NO_DIVES/);
});

test('first launch: the row sits in « Importer un carnet », is shown only with the copy, and the import is marked done after the logbook exists', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const rows = steps.slice(steps.indexOf("{:else if step === 'import'}"), steps.indexOf("{:else if step === 'importDivelogs'"));
  assert.match(rows, /\{#each alphaFound as found \(found\.id\)\}\s*<ReleaseChoiceRow icon="logbook" title=\{t\('welcomeSteps\.alphaTitle'\)\}/);
  assert.match(rows, /welcomeSteps\.alphaHelpDated/);
  // The same name step and the same import as a picked file.
  assert.match(steps, /flow\.source = \{ kind: 'staged', path: staged\.path, fileName: staged\.name, name, summary: summariseScan\(found\.dives, scan\), alpha: true \};\s*flow\.name = name;\s*go\('file'\);/);
  assert.match(steps, /findAlphaLogbooks\(OpenDivesCore, deviceStore, isRelease\)/);
  const created = steps.slice(steps.indexOf('await createDeviceLogbook('), steps.indexOf('resetFlow();', steps.indexOf('await createDeviceLogbook(')));
  assert.match(created, /if \(flow\.source\?\.alpha\) markAlphaImportDone\(deviceStore\);/);
  // Nothing sends, signs out or deletes in the module that reads the alpha's copy.
  const module = read('lib/alpha-logbook.js');
  assert.doesNotMatch(module, /configureCloud|listCloudDives|probeCloud|signOut|deleteAccount|cloudSignOut|serverSession|fetch\(/);
  for (const lang of ['fr', 'en']) {
    const welcome = JSON.parse(read(`i18n/${lang}.json`)).welcomeSteps;
    assert.ok(welcome.alphaTitle && welcome.alphaName && welcome.alphaHelp.one && welcome.alphaHelp.other && welcome.alphaHelpDated.one && welcome.alphaHelpDated.other, lang);
  }
});

test('the plugin exposes the cache read-only on every platform, and its folder name cannot leave the cache', () => {
  const root = new URL('../../', import.meta.url);
  const text = (p) => readFileSync(new URL(p, root), 'utf8');
  assert.match(text('plugins/opendives-core/core-api.js'), /alphaCacheList[\s\S]*alphaCacheOpen/);
  assert.match(text('plugins/opendives-core/android/src/main/java/org/opendives/core/OpenDivesCorePlugin.kt'), /fun alphaCache\(/);
  assert.match(text('plugins/opendives-core/ios/Plugin/OpenDivesCorePlugin.swift'), /name: "alphaCache"[\s\S]*@objc func alphaCache\(/);
  assert.match(text('plugins/opendives-core/desktop.js'), /async alphaCache\(/);
  assert.match(text('desktop/bridge.cjs'), /'alphaCacheList', 'alphaCacheOpen'/);
  assert.match(text('desktop/host/host.cpp'), /add\("alphaCacheList"[\s\S]*add\("alphaCacheOpen"/);
  const facade = text('core/libopendives/opendives.cpp');
  assert.match(facade, /alpha_cache_valid_id/);
});
