// The files chosen together in « + › Importer un fichier » (app/src/lib/import-files.js): every
// file is sent with its own name, a .zip of .fit files gives its .fit files, one file is unchanged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { importPayload } from '../../app/src/lib/import-files.js';

const dives = new URL('../../third_party/subsurface/dives/', import.meta.url);
/** @param {string} name */
const sample = (name) => new File([readFileSync(new URL(name, dives))], name);

test('a Suunto .json and its .fit are sent together, each under its own name', async () => {
  const json = sample('suunto_ocean_nitrox.json');
  const fit = sample('suunto_ocean_nitrox.fit');
  const out = await importPayload([json, fit]);
  assert.deepEqual(out.map((f) => f.name), ['suunto_ocean_nitrox.json', 'suunto_ocean_nitrox.fit']);
  assert.equal(Buffer.from(out[0].data, 'base64').toString(), readFileSync(new URL('suunto_ocean_nitrox.json', dives)).toString());
  assert.deepEqual(Buffer.from(out[1].data, 'base64'), readFileSync(new URL('suunto_ocean_nitrox.fit', dives)));
});

test('one file stays one entry; unrelated files keep their order', async () => {
  assert.equal((await importPayload([sample('suunto_ocean_air.json')])).length, 1);
  const out = await importPayload([sample('suunto_ocean_air.json'), sample('suunto_eon_core_nitrox.json'), sample('test1.xml')]);
  assert.deepEqual(out.map((f) => f.name), ['suunto_ocean_air.json', 'suunto_eon_core_nitrox.json', 'test1.xml']);
});

test('an empty choice sends nothing', async () => {
  assert.deepEqual(await importPayload([]), []);
});
