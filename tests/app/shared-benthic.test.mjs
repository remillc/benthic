// A .benthic file (the full export) opened from another app: it follows the flow of « Un fichier » (first launch's import,
// or « Remplacer ce carnet ? »), and is never refused as « not a file Benthic can import » (app/src/lib/shared-file.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSharedFile } from '../../app/src/lib/deep-link.js';
import { openSharedFile } from '../../app/src/lib/shared-file.js';
import { fakeStagedCore } from './fake-staged-core.mjs';

const BYTES = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]);
const INSPECTION = { counts: { dives: 3, sites: 1 }, files: [] };

function fake({ welcome = false, name = 'mon-carnet.benthic', openBenthic } = {}) {
  const log = { first: [], replaced: [], refused: [], problems: [], sources: [], confirms: [] };
  const staging = fakeStagedCore();
  const deps = {
    stage: async () => staging.put(name, BYTES),
    core: staging.core,
    check: checkSharedFile,
    welcome: () => welcome,
    openBenthic:
      openBenthic ??
      (async (source) => {
        log.sources.push({ size: source.size, head: Array.from(await source.read(0, 4)) });
        return INSPECTION;
      }),
    benthicProblem: (file, e) => log.problems.push({ file, e }),
    toFirstLaunchBenthic: (staged, inspection) => log.first.push({ staged, inspection }),
    replaceBenthic: async (file, inspection) => log.replaced.push({ file, inspection }),
    remembered: () => ({}),
    keep: () => {},
    listSites: async () => [],
    siteChange: async () => ({}),
    importData: async () => 0,
    toFirstLaunch: () => assert.fail('a .benthic file does not take the logbook file path'),
    confirm: (o) => log.confirms.push(o),
    refuse: (key, values) => log.refused.push({ key, values }),
    notify: () => {},
    imported: () => {},
    importFailed: () => {},
  };
  return { deps, log, staging };
}

test('first launch: the .benthic file goes to the first-launch import, its staged copy is kept', async () => {
  const { deps, log, staging } = fake({ welcome: true });
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'first-launch');
  assert.equal(log.refused.length, 0);
  assert.equal(log.first.length, 1);
  assert.equal(log.first[0].inspection, INSPECTION);
  assert.equal(log.first[0].staged.name, 'mon-carnet.benthic');
  assert.equal(staging.stats.discarded, 0, 'the import reads the archive from the staged copy');
  assert.deepEqual(log.sources[0], { size: BYTES.length, head: [0x50, 0x4b, 3, 4] });
});

test('a logbook is open: « Remplacer ce carnet ? », then the staged copy is deleted', async () => {
  const { deps, log, staging } = fake();
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'benthic-replace');
  assert.equal(log.refused.length, 0);
  assert.equal(log.confirms.length, 0, 'not the merge confirmation of a logbook file');
  assert.equal(log.replaced.length, 1);
  assert.equal(log.replaced[0].file.name, 'mon-carnet.benthic');
  assert.equal(log.replaced[0].inspection, INSPECTION);
  assert.equal(staging.stats.discarded, 1);
});

test('upper-case extension, and a file that cannot be read: the problem dialog, nothing started, copy deleted', async () => {
  const bad = new Error('INCOMPLETE');
  const { deps, log, staging } = fake({ name: 'CARNET.BENTHIC', openBenthic: async () => Promise.reject(bad) });
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'refused');
  assert.deepEqual(log.problems, [{ file: 'CARNET.BENTHIC', e: bad }]);
  assert.equal(log.replaced.length + log.first.length + log.refused.length, 0);
  assert.equal(staging.stats.discarded, 1);
});

test('another file is not taken for a .benthic file', async () => {
  const { deps, log } = fake({ name: 'photo.png' });
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'refused');
  assert.equal(log.refused[0].key, 'link.fileNotLogbook');
  assert.equal(log.sources.length, 0);
});
