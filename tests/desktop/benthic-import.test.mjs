// SPDX-License-Identifier: GPL-2.0
// The `.benthic` import with the real core (benthic-host over stdio), task 2026-11-23-360: a real full export of a logbook
// that the core holds (the sample dives), then the import of that file on a second, fresh host. The logbook that comes out
// is the one that went in (same dives, same dates, same sites), the equipment, profile and certifications are back, a file
// with one damaged entry is « incomplete » and the second host is left without a logbook. Skipped without the host:
//
//   BENTHIC_HOST=<host binary>  [BENTHIC_HOST_ARGS='["-d","Ubuntu","-e","/home/me/benthic-host"]']
//   [BENTHIC_SAMPLE=<a .ssrf, as the host sees it>]
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox } from '../../app/src/lib/secret-box.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { buildExport } from '../../app/src/lib/full-export.js';
import { readChunks } from '../../app/src/lib/staged-file.js';
import { BenthicImportError, importBenthic, inspectBenthic } from '../../app/src/lib/benthic-import.js';
import { blobSource } from '../../app/src/lib/zip-read.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hostCommand = process.env.BENTHIC_HOST || '';
const hostArgs = process.env.BENTHIC_HOST_ARGS ? JSON.parse(process.env.BENTHIC_HOST_ARGS) : [];
const sample = process.env.BENTHIC_SAMPLE || path.join(root, 'third_party/subsurface/dives/SampleDivesV2.ssrf');
const skip = !hostCommand ? 'BENTHIC_HOST is not set' : !hostArgs.length && !existsSync(hostCommand) ? `no host binary at ${hostCommand}` : !process.env.BENTHIC_SAMPLE && !existsSync(sample) ? `no sample log at ${sample}` : false;
const FIXED = new Date('2026-11-18T10:30:00Z');

function startHost() {
  const child = spawn(hostCommand, hostArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on('line', (line) => {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.event) return;
    const waiting = pending.get(m.id);
    if (!waiting) return;
    pending.delete(m.id);
    if ('error' in m) waiting.reject(new Error(m.error));
    else waiting.resolve(m.result);
  });
  const exited = new Promise((resolve) => child.on('close', resolve));
  return {
    call(method, args) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject: (e) => reject(new Error(`${method}: ${e.message}`)) });
        child.stdin.write(`${JSON.stringify({ id, method, args })}\n`);
      });
    },
    close() {
      child.stdin.end();
      return exited;
    },
  };
}

/** The plugin's staged-file calls over the real host and a folder of the test. */
function hostCore(host, dir) {
  let n = 0;
  return {
    async stageImport({ name, data, path: at, append }) {
      const bytes = Buffer.from(data, 'base64');
      if (append) {
        appendFileSync(at, bytes);
        return { path: at };
      }
      const file = path.join(dir, `import-${++n}-${String(name).replace(/[^A-Za-z0-9._-]/g, '_')}`);
      writeFileSync(file, bytes);
      return { path: file };
    },
    async readFileChunk({ path: at, offset, length }) {
      const all = readFileSync(at);
      return { data: all.subarray(offset, offset + Math.min(length, 4 * 1024 * 1024)).toString('base64'), size: all.length };
    },
    async discardImport({ path: at }) {
      rmSync(at, { force: true });
    },
    importCount: async ({ path: at }) => JSON.parse(await host.call('importCount', { path: at })),
    assembleFile: async () => {
      throw new Error('unused');
    },
  };
}

const device = () => {
  const store = createFileStore(memoryBackend());
  let key = '';
  const box = createSecretBox({ read: async () => key, write: async (k) => void (key = k) });
  const profile = createProfile(store, box, { now: () => FIXED });
  return { store, box, profile };
};

describe('the .benthic import against the real core', { skip }, () => {
  const dir = skip ? '' : mkdtempSync(path.join(tmpdir(), 'bc-benthic-'));
  let source;
  let target;
  let sourceDevice;
  let exported;
  const logbookOf = async (host) => JSON.parse(await host.call('listLoadedDives', {}));

  before(async () => {
    source = startHost();
    target = startHost();
    await source.call('init', { home: path.join(dir, 'source') });
    await target.call('init', { home: path.join(dir, 'target') });
    await source.call('importFile', { source: sample, repo: `${path.join(dir, 'source').replace(/\\/g, '/')}/carnet[main]` });
    sourceDevice = device();
    await sourceDevice.store.write('gear/g1.json', { format: 1, id: 'g1', name: 'Regulator', type: 'regulator' });
    await sourceDevice.store.write('kits/k1.json', { format: 1, id: 'k1', name: 'Cold', gearIds: ['g1'] });
    await sourceDevice.profile.saveInfo({ fullName: 'Sam Diver', dateOfBirth: '1980-05-17', emergency: { name: 'Alex', relation: 'Sister', phone: { country: 'CA', number: '5145551234' } }, bloodGroup: 'O+' });
    await sourceDevice.profile.saveCertification({ agency: 'padi', level: 'Advanced', number: 'A1', issuedOn: '2019-06-01', photos: { front: Uint8Array.from({ length: 900 }, (_, i) => i & 255) } });
  });

  after(async () => {
    await Promise.all([source?.close(), target?.close()]);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('a real export of the core’s logbook, read back by the import engine (manifest, counts)', async () => {
    const core = hostCore(source, dir);
    const dives = await logbookOf(source);
    assert.ok(dives.length > 0);
    const deps = {
      store: sourceDevice.store,
      profile: sourceDevice.profile,
      appVersion: '0.3.0',
      now: () => FIXED,
      settings: async () => ({ app: {}, logbook: null }),
      logbook: {
        diveCount: async () => dives.length,
        siteCount: async () => JSON.parse(await source.call('siteQuery', { kind: 'list', uuid: 0, lat: 0, lon: 0, a: 0, b: 0, text: '' })).length,
        open: async () => {
          const file = path.join(dir, 'export-logbook.ssrf');
          await source.call('exportDives', { ids: dives.map((d) => d.id), format: 'ssrf', anonymize: false, path: file });
          const size = statSync(file).size;
          return { size, chunks: () => readChunks(core, file, size), dispose: async () => rmSync(file, { force: true }) };
        },
      },
      openFile: async (name) => {
        const file = path.join(dir, name);
        writeFileSync(file, '');
        return { write: async (b) => appendFileSync(file, b), close: async () => ({ name, path: file, size: statSync(file).size }), abort: async () => rmSync(file, { force: true }) };
      },
    };
    const { file } = await buildExport({ logbookName: 'Mon carnet' }, deps);
    exported = readFileSync(file.path);
    const inspection = await inspectBenthic(blobSource(new Blob([exported])));
    assert.equal(inspection.counts.dives, dives.length);
    assert.ok(inspection.counts.sites > 0);
    assert.equal(inspection.counts.gear, 1);
    assert.equal(inspection.counts.certifications, 1);
  });

  test('imported on a fresh host: the same dives and sites, the equipment, the profile and the card', async () => {
    const before = await logbookOf(source);
    const inspection = await inspectBenthic(blobSource(new Blob([exported])));
    const fresh = device();
    let first = true;
    const result = await importBenthic(inspection, {
      core: hostCore(target, dir),
      store: fresh.store,
      box: fresh.box,
      now: () => FIXED,
      applyLogbook: async (staged) => {
        assert.ok(staged);
        assert.equal(first, true);
        first = false;
        await target.call('importFile', { source: staged.path, repo: `${path.join(dir, 'target').replace(/\\/g, '/')}/carnet[main]` });
      },
    });
    assert.equal(result.dives, before.length);
    const after = await logbookOf(target);
    assert.equal(after.length, before.length);
    const key = (d) => `${d.date}|${d.maxDepth ?? d.maxdepth ?? ''}|${d.duration ?? ''}`;
    assert.deepEqual(after.map(key).sort(), before.map(key).sort());
    const sites = async (h) => JSON.parse(await h.call('siteQuery', { kind: 'list', uuid: 0, lat: 0, lon: 0, a: 0, b: 0, text: '' })).length;
    assert.equal(await sites(target), await sites(source));
    assert.deepEqual(await fresh.store.read('gear/g1.json'), await sourceDevice.store.read('gear/g1.json'));
    assert.deepEqual(await fresh.profile.readInfo(), await sourceDevice.profile.readInfo());
    assert.equal((await fresh.profile.listCertifications())[0].number, 'A1');
  });

  test('a damaged entry makes the file incomplete: nothing reaches the second host’s logbook or the store', async () => {
    const buf = Buffer.from(exported);
    let at = 0;
    for (; at < buf.length - 30; at++) {
      if (buf.readUInt32LE(at) === 0x04034b50 && buf.toString('utf8', at + 30, at + 30 + buf.readUInt16LE(at + 26)) === 'benthic/gear/g1.json') break;
    }
    buf[at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28) + 4] ^= 0xff;
    const inspection = await inspectBenthic(blobSource(new Blob([buf])));
    const other = startHost();
    try {
      await other.call('init', { home: path.join(dir, 'other') });
      const fresh = device();
      await assert.rejects(
        importBenthic(inspection, { core: hostCore(other, dir), store: fresh.store, box: fresh.box, now: () => FIXED, applyLogbook: async () => assert.fail('the logbook must not be written') }),
        (e) => e instanceof BenthicImportError && e.code === 'INCOMPLETE' && e.bad.length === 1,
      );
      assert.deepEqual(await fresh.store.list(''), []);
      assert.equal(await other.call('logExists', { repo: `${path.join(dir, 'other').replace(/\\/g, '/')}/carnet[main]` }), false);
    } finally {
      await other.close();
    }
  });
});
