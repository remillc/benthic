// The full export engine (task 2026-11-18-57): the archive's contents and manifest, the sensitive items in clear,
// cancel and failure clean up, a big media file streams without being held in memory, ZIP64, the platform sinks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { buildExport, capacitorSink, containsSensitive, desktopSink, exportFileName, planExport, EXPORT_FORMAT } from '../../app/src/lib/full-export.js';
import { crc32Update, createSha256, createZipWriter } from '../../app/src/lib/zip-stream.js';
import { readChunks } from '../../app/src/lib/staged-file.js';
import { fakeStagedCore } from './fake-staged-core.mjs';

const FIXED = new Date('2026-11-18T10:30:00Z');
const jpeg = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255);

/** A reader of the archive: central directory (ZIP64 aware), stored or deflated entries. */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'end of central directory');
  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    assert.equal(buf.readUInt32LE(loc), 0x07064b50);
    const z = Number(buf.readBigUInt64LE(loc + 8));
    assert.equal(buf.readUInt32LE(z), 0x06064b50);
    count = Number(buf.readBigUInt64LE(z + 32));
    cdSize = Number(buf.readBigUInt64LE(z + 40));
    cdOffset = Number(buf.readBigUInt64LE(z + 48));
  }
  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    let csize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    let offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x < xend) {
      const id = buf.readUInt16LE(x);
      const len = buf.readUInt16LE(x + 2);
      if (id === 1) {
        let q = x + 4;
        if (size === 0xffffffff) {
          size = Number(buf.readBigUInt64LE(q));
          q += 8;
        }
        if (csize === 0xffffffff) {
          csize = Number(buf.readBigUInt64LE(q));
          q += 8;
        }
        if (offset === 0xffffffff) {
          offset = Number(buf.readBigUInt64LE(q));
          q += 8;
        }
      }
      x += 4 + len;
    }
    const lnlen = buf.readUInt16LE(offset + 26);
    const lxlen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(data.length, size, `size of ${name}`);
    entries.set(name, { data: Buffer.from(data), crc, method });
    p += 46 + nlen + xlen + clen;
  }
  assert.equal(p, cdOffset + cdSize);
  return entries;
}

/** The sink of the tests: a file in a temp folder. */
function folderSink(dir) {
  return async (name) => {
    const file = path.join(dir, name);
    writeFileSync(file, '');
    return {
      async write(b) {
        appendFileSync(file, b);
      },
      async close() {
        return { name, path: file, size: statSync(file).size };
      },
      async abort() {
        rmSync(file, { force: true });
      },
    };
  };
}

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'od-export-'));

/** A device with equipment, a profile with legacy consent, two certifications with photos. */
async function fixture({ media } = {}) {
  const store = createFileStore(memoryBackend());
  let key = '';
  const box = createSecretBox({
    read: async () => key,
    write: async (k) => {
      key = k;
    },
  });
  let n = 0;
  const profile = createProfile(store, box, { now: () => FIXED, id: () => `id-${++n}` });
  await store.write('gear/g1.json', { format: 1, id: 'g1', name: 'Regulator', type: 'regulator', futureField: { keep: true } });
  await store.write('kits/k1.json', { format: 1, id: 'k1', name: 'Cold water', gearIds: ['g1'] });
  await store.write('maintenance/m1.json', { format: 1, id: 'm1', gearId: 'g1', history: [] });
  await store.write('dive-equipment/e1.json', { format: 1, diveKey: { start: '2026-01-01 10:00:00' }, gear: { gearIds: ['g1'] } });
  await store.write('media/p1.json', { format: 1, id: 'p1', dataUrl: `data:image/jpeg;base64,${toBase64(jpeg(300, 1))}` });
  await store.write('meta/dev-data-key.json', { format: 1, key: 'SECRET-KEY' });
  await store.write('meta/pending.json', { format: 1, paths: [] });
  await store.write('meta/health-consent.json', { format: 1, consent: true, at: '2026-11-01T00:00:00Z', synced: true });
  await profile.saveInfo({ dateOfBirth: '1980-05-17', emergency: { name: 'Alex Martin', relation: 'Sister', phone: { country: 'CA', number: '5145551234' } }, bloodGroup: 'O+' });
  const front = jpeg(2000, 3);
  const back = jpeg(1500, 9);
  const cert = await profile.saveCertification({ agency: 'padi', level: 'Advanced', number: 'A123456', issuedOn: '2019-06-01', instructor: 'Sam', instructorNumber: 'I234', photos: { front, back } });
  const cert2 = await profile.saveCertification({ agency: 'ssi', level: 'Open Water', number: 'S987' });
  const ssrf = new TextEncoder().encode('<divelog program="subsurface"><dives><dive number="1"/></dives></divelog>');
  const deps = {
    store,
    profile,
    appVersion: '0.3.0',
    now: () => FIXED,
    logbook: { diveCount: async () => 1, read: async () => ssrf },
    settings: async () => ({ app: { 'od.theme': 'dark' }, logbook: { unitSystem: 'metric' } }),
    media,
    openFile: null,
  };
  return { deps, cert, cert2, front, back, ssrf, store };
}

test('a logbook the core wrote to a file is streamed into the archive in pieces, then the file is deleted (it never crosses the bridge as a string)', async () => {
  const dir = tempDir();
  try {
    const { deps, ssrf } = await fixture();
    deps.openFile = folderSink(dir);
    const staging = fakeStagedCore();
    const staged = staging.put('logbook.ssrf', Buffer.from(ssrf));
    let disposed = 0;
    deps.logbook = {
      diveCount: async () => 1,
      open: async () => ({ size: staged.size, chunks: () => readChunks(staging.core, staged.path, staged.size, 16), dispose: async () => (disposed++, staging.core.discardImport({ path: staged.path })) }),
    };
    const { file } = await buildExport({}, deps);
    assert.deepEqual(readZip(readFileSync(file.path)).get('logbook/logbook.ssrf').data, Buffer.from(ssrf));
    assert.equal(disposed, 1);
    assert.equal(staging.files.size, 0);
    // The file is deleted when the export fails, too.
    const again = fakeStagedCore();
    const second = again.put('logbook.ssrf', Buffer.from(ssrf));
    deps.openFile = async () => {
      throw new Error('no room');
    };
    deps.logbook.open = async () => ({ size: second.size, chunks: () => readChunks(again.core, second.path, second.size), dispose: async () => again.core.discardImport({ path: second.path }) });
    await assert.rejects(buildExport({}, deps), /no room/);
    assert.equal(again.files.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crc32 and the incremental sha256 give the standard values, whatever the chunking', () => {
  assert.equal(crc32Update(0, new TextEncoder().encode('123456789')), 0xcbf43926);
  const data = jpeg(10_000, 5);
  for (const step of [1, 7, 63, 64, 65, 1000]) {
    const sha = createSha256();
    for (let i = 0; i < data.length; i += step) sha.update(data.subarray(i, i + step));
    assert.equal(sha.digest(), createHash('sha256').update(data).digest('hex'), `step ${step}`);
  }
  assert.equal(createSha256().digest(), createHash('sha256').update('').digest('hex'));
});

test('the archive holds the logbook, the OpenDives data, a README and a manifest that matches', async () => {
  const dir = tempDir();
  try {
    const { deps, front, back, ssrf, cert, cert2 } = await fixture();
    deps.openFile = folderSink(dir);
    const progress = [];
    const { file, manifest } = await buildExport({ onProgress: (p) => progress.push(p) }, deps);
    assert.equal(file.name, 'opendives-data-2026-11-18.zip');
    assert.equal(file.size, statSync(file.path).size);
    const zip = readZip(readFileSync(file.path));

    assert.deepEqual(
      [...zip.keys()].sort(),
      [
        'README.txt',
        'logbook/logbook.ssrf',
        'manifest.json',
        `opendives/certifications/${cert.id}.json`,
        `opendives/certifications/${cert2.id}.json`,
        `opendives/certifications/photos/${cert.id}-back.jpg`,
        `opendives/certifications/photos/${cert.id}-front.jpg`,
        'opendives/gear/g1.json',
        'opendives/dive-equipment/e1.json',
        'opendives/kits/k1.json',
        'opendives/maintenance/m1.json',
        'opendives/media/p1.jpg',
        'opendives/profile/diver.json',
        'opendives/settings.json',
      ].sort(),
    );
    assert.deepEqual(zip.get('logbook/logbook.ssrf').data, Buffer.from(ssrf));
    assert.deepEqual(zip.get(`opendives/certifications/photos/${cert.id}-front.jpg`).data, Buffer.from(front));
    assert.deepEqual(zip.get(`opendives/certifications/photos/${cert.id}-back.jpg`).data, Buffer.from(back));
    assert.deepEqual(zip.get('opendives/media/p1.jpg').data, Buffer.from(jpeg(300, 1)));
    // Stored as they are, unknown fields kept.
    assert.equal(JSON.parse(zip.get('opendives/gear/g1.json').data).futureField.keep, true);
    assert.deepEqual(JSON.parse(zip.get('opendives/settings.json').data), { format: 1, app: { 'od.theme': 'dark' }, logbook: { unitSystem: 'metric' } });

    // The device's key and bookkeeping never leave.
    for (const [name, e] of zip) {
      assert.ok(!e.data.includes('SECRET-KEY'), name);
      assert.ok(!name.startsWith('opendives/meta/'), name);
    }

    // The manifest lists every other file with the real size and SHA-256.
    const m = JSON.parse(zip.get('manifest.json').data);
    assert.deepEqual(m, JSON.parse(JSON.stringify(manifest)));
    assert.equal(m.format, EXPORT_FORMAT);
    assert.equal(m.appVersion, '0.3.0');
    assert.equal(m.exportedAt, '2026-11-18T10:30:00.000Z');
    assert.equal(m.withMedia, false);
    assert.equal(m.containsSensitive, true);
    assert.equal(m.dives, 1);
    assert.equal(m.files.length, zip.size - 1);
    for (const f of m.files) {
      const e = zip.get(f.path);
      assert.ok(e, f.path);
      assert.equal(f.size, e.data.length);
      assert.equal(f.sha256, createHash('sha256').update(e.data).digest('hex'), f.path);
    }
    // Progress goes up to the total, in bytes.
    const last = progress.at(-1);
    assert.equal(last.phase, 'finish');
    assert.ok(progress.every((p, i) => i === 0 || p.doneBytes >= progress[i - 1].doneBytes));
    assert.equal(last.doneBytes, last.totalBytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the sealed items come out decrypted, and read back the same as in the app', async () => {
  const dir = tempDir();
  try {
    const { deps, cert } = await fixture();
    // On the device they are sealed.
    assert.ok((await deps.store.read('profile/diver.json')).enc);
    assert.ok((await deps.store.read(`certifications/${cert.id}.json`)).enc);
    deps.openFile = folderSink(dir);
    const { file } = await buildExport({}, deps);
    const zip = readZip(readFileSync(file.path));
    const diver = JSON.parse(zip.get('opendives/profile/diver.json').data);
    const info = await deps.profile.readInfo();
    assert.equal(diver.bloodGroup, 'O+');
    assert.equal(diver.dateOfBirth, '1980-05-17');
    assert.deepEqual(diver.emergencyContact, info.emergency);
    assert.equal(diver.emergencyContact.name, 'Alex Martin');
    assert.deepEqual(diver.healthConsent, { consent: true, at: '2026-11-01T00:00:00Z' });
    const card = JSON.parse(zip.get(`opendives/certifications/${cert.id}.json`).data);
    assert.equal(card.number, 'A123456');
    assert.equal(card.agency, 'padi');
    assert.equal(card.instructor, 'Sam');
    assert.equal(card.instructorNumber, 'I234');
    assert.deepEqual(card.documents.map((d) => d.file).sort(), [`certifications/photos/${cert.id}-back.jpg`, `certifications/photos/${cert.id}-front.jpg`]);
    for (const [name, e] of zip) if (name.endsWith('.json')) assert.ok(!/"enc"/.test(e.data.toString()), `no sealed block left in ${name}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the blood group is exported even when legacy consent is off', async () => {
  const dir = tempDir();
  try {
    const { deps } = await fixture();
    await deps.store.write('meta/health-consent.json', { format: 1, consent: false, at: '', synced: true });
    deps.openFile = folderSink(dir);
    const { file } = await buildExport({}, deps);
    const diver = JSON.parse(readZip(readFileSync(file.path)).get('opendives/profile/diver.json').data);
    assert.equal(diver.bloodGroup, 'O+');
    assert.deepEqual(diver.healthConsent, { consent: false, at: '' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('containsSensitive names what is written in clear', async () => {
  const empty = createFileStore(memoryBackend());
  let key = '';
  const bare = createProfile(
    empty,
    createSecretBox({
      read: async () => key,
      write: async (k) => {
        key = k;
      },
    }),
  );
  assert.deepEqual(await containsSensitive({ profile: bare }), { any: false, kinds: [] });
  const { deps } = await fixture();
  assert.deepEqual((await containsSensitive(deps)).kinds, ['dateOfBirth', 'emergencyContact', 'bloodGroup', 'certifications', 'certificationPhotos']);
  await deps.profile.deleteBloodGroup();
  assert.ok(!(await containsSensitive(deps)).kinds.includes('bloodGroup'));
});

test('planExport counts the contents and sizes with and without the media, and what is still to download', async () => {
  const media = async () => [
    { name: 'a.jpg', size: 4_000_000, onDevice: true, open: async function* () {} },
    { name: 'b.mp4', size: 90_000_000, onDevice: true, open: async function* () {} },
    { name: 'c.mp4', size: 30_000_000, onDevice: false },
  ];
  const { deps } = await fixture({ media });
  const plan = await planExport({ withMedia: false }, deps);
  assert.equal(plan.dives, 1);
  assert.equal(plan.areas.gear.files, 1);
  assert.equal(plan.areas.kits.files, 1);
  assert.equal(plan.areas.maintenance.files, 1);
  assert.equal(plan.areas.diveEquipment.files, 1);
  assert.equal(plan.areas.certifications.files, 2);
  assert.equal(plan.areas.certificationPhotos.files, 2);
  assert.equal(plan.areas.certificationPhotos.bytes, 3500);
  assert.equal(plan.areas.media.bytes, 300);
  assert.equal(plan.sensitive.any, true);
  assert.deepEqual(plan.media, { count: 3, onDevice: { count: 2, bytes: 94_000_000 }, toDownload: { count: 1, bytes: 30_000_000 } });
  assert.equal(plan.bytes.withMedia - plan.bytes.withoutMedia, 124_000_000);
  assert.equal(plan.estimatedBytes, plan.bytes.withoutMedia);
  assert.equal((await planExport({ withMedia: true }, deps)).estimatedBytes, plan.bytes.withMedia);
});

test('with the media, the originals are streamed in dive-media/; not on the device and no download: skipped and said so', async () => {
  const dir = tempDir();
  try {
    const photo = jpeg(5000, 4);
    const media = async () => [
      {
        name: 'IMG_1.jpg',
        size: photo.length,
        onDevice: true,
        open: async function* () {
          yield photo.subarray(0, 100);
          yield photo.subarray(100);
        },
      },
      {
        name: '../evil:name.mp4',
        size: 3,
        onDevice: true,
        open: async function* () {
          yield Uint8Array.of(1, 2, 3);
        },
      },
      { name: 'server.mp4', size: 10, onDevice: false },
      {
        name: 'fetched.mp4',
        size: 2,
        onDevice: false,
        download: async function* () {
          yield Uint8Array.of(9, 9);
        },
      },
    ];
    const { deps } = await fixture({ media });
    deps.openFile = folderSink(dir);
    const without = await buildExport({ withMedia: false }, deps);
    assert.ok(![...readZip(readFileSync(without.file.path)).keys()].some((k) => k.startsWith('dive-media/')));
    const { file, manifest, skipped } = await buildExport({ withMedia: true }, deps);
    const zip = readZip(readFileSync(file.path));
    assert.deepEqual(zip.get('dive-media/IMG_1.jpg').data, Buffer.from(photo));
    assert.equal(zip.get('dive-media/IMG_1.jpg').method, 0, 'media are stored, not deflated');
    assert.deepEqual([...zip.keys()].filter((k) => k.startsWith('dive-media/')).sort(), ['dive-media/IMG_1.jpg', 'dive-media/__evil_name.mp4', 'dive-media/fetched.mp4']);
    assert.deepEqual(skipped, [{ path: 'dive-media/server.mp4', reason: 'not-downloaded' }]);
    assert.deepEqual(manifest.skipped, skipped);
    assert.equal(manifest.withMedia, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cancelling deletes the partial file and throws an AbortError', async () => {
  const dir = tempDir();
  try {
    const controller = new AbortController();
    const media = async () => [
      {
        name: 'big.mp4',
        size: 50 * 1024 * 1024,
        onDevice: true,
        open: async function* () {
          for (let i = 0; i < 50; i++) {
            if (i === 10) controller.abort();
            yield new Uint8Array(1024 * 1024);
          }
        },
      },
    ];
    const { deps } = await fixture({ media });
    deps.openFile = folderSink(dir);
    await assert.rejects(buildExport({ withMedia: true, signal: controller.signal }, deps), (e) => e.name === 'AbortError');
    assert.deepEqual(readdirSync(dir), []);
    // Cancelled before it starts: nothing is even created.
    await assert.rejects(buildExport({ signal: AbortSignal.abort() }, deps), (e) => e.name === 'AbortError');
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failure while writing (a media that cannot be read, a wrong size) deletes the partial file and rethrows', async () => {
  const dir = tempDir();
  try {
    const media = async () => [
      {
        name: 'x.mp4',
        size: 10,
        onDevice: true,
        open: async function* () {
          yield new Uint8Array(4);
          throw new Error('READ_FAILED');
        },
      },
    ];
    const { deps } = await fixture({ media });
    deps.openFile = folderSink(dir);
    await assert.rejects(buildExport({ withMedia: true }, deps), /READ_FAILED/);
    assert.deepEqual(readdirSync(dir), []);
    const wrong = async () => [
      {
        name: 'y.mp4',
        size: 10,
        onDevice: true,
        open: async function* () {
          yield new Uint8Array(4);
        },
      },
    ];
    await assert.rejects(buildExport({ withMedia: true }, { ...deps, media: wrong }), /ZIP_SIZE_MISMATCH/);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a large media file streams: memory stays flat and the bytes are right', async () => {
  const total = 160 * 1024 * 1024;
  const chunk = new Uint8Array(1024 * 1024).fill(0x5a);
  const media = async () => [
    {
      name: 'dive.mp4',
      size: total,
      onDevice: true,
      open: async function* () {
        for (let sent = 0; sent < total; sent += chunk.length) yield chunk;
      },
    },
  ];
  const { deps } = await fixture({ media });
  let written = 0;
  let maxChunk = 0;
  deps.openFile = async (name) => ({
    async write(b) {
      written += b.length;
      maxChunk = Math.max(maxChunk, b.length);
      await new Promise((r) => setImmediate(r));
    },
    async close() {
      return { name, path: name, size: written };
    },
    async abort() {},
  });
  globalThis.gc?.();
  const base = process.memoryUsage().rss;
  let peak = 0;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss - base);
  }, 20);
  const { manifest } = await buildExport({ withMedia: true }, deps);
  clearInterval(timer);
  assert.ok(written > total && written < total + 200_000, `written ${written}`);
  assert.ok(maxChunk <= 2 * 1024 * 1024 + 1024, `largest write ${maxChunk}`);
  const entry = manifest.files.find((f) => f.path === 'dive-media/dive.mp4');
  assert.equal(entry.size, total);
  const sha = createHash('sha256');
  for (let sent = 0; sent < total; sent += chunk.length) sha.update(chunk);
  assert.equal(entry.sha256, sha.digest('hex'));
  assert.ok(peak < 100 * 1024 * 1024, `memory grew by ${(peak / 1048576).toFixed(0)} MB for a ${total / 1048576} MB file`);
});

test('ZIP64 records are written and read back for big entries and offsets (threshold lowered)', async () => {
  const parts = [];
  const zip = createZipWriter(
    async (b) => {
      parts.push(Buffer.from(b));
    },
    { zip64At: 1000, now: FIXED },
  );
  const big = jpeg(3000, 2);
  const r1 = await zip.add('small.txt', new TextEncoder().encode('hi'), { size: 2 });
  const r2 = await zip.add('big.bin', big, { size: big.length });
  const r3 = await zip.add('after.txt', new TextEncoder().encode('after the offset passed the threshold'), { deflate: true });
  await zip.finish();
  const entries = readZip(Buffer.concat(parts));
  assert.equal(entries.get('small.txt').data.toString(), 'hi');
  assert.deepEqual(entries.get('big.bin').data, Buffer.from(big));
  assert.equal(entries.get('after.txt').data.toString(), 'after the offset passed the threshold');
  assert.equal(entries.get('big.bin').crc, r2.crc32);
  assert.equal(r1.sha256, createHash('sha256').update('hi').digest('hex'));
  assert.ok(r3.compressedSize > 0);
  // An entry that turns out to be big without its size announced cannot be written.
  const failing = createZipWriter(async () => {}, { zip64At: 10 });
  await assert.rejects(failing.add('x', new Uint8Array(100)), /ZIP_NEEDS_SIZE/);
});

test('the phone sink appends to a cache file through @capacitor/filesystem and deletes it on abort', async () => {
  const dir = tempDir();
  try {
    const calls = [];
    const Filesystem = {
      async writeFile({ path: p, data, recursive }) {
        calls.push('write');
        assert.equal(recursive, true);
        writeFileSync(path.join(dir, path.basename(p)), Buffer.from(data, 'base64'));
      },
      async appendFile({ path: p, data }) {
        calls.push('append');
        appendFileSync(path.join(dir, path.basename(p)), Buffer.from(data, 'base64'));
      },
      async deleteFile({ path: p }) {
        calls.push('delete');
        rmSync(path.join(dir, path.basename(p)), { force: true });
      },
      async getUri({ path: p }) {
        return { uri: `file:///cache/${p}` };
      },
    };
    const open = capacitorSink({ Filesystem, Directory: { Cache: 'CACHE' } });
    const { deps } = await fixture();
    deps.openFile = open;
    const { file } = await buildExport({}, deps);
    assert.equal(file.uri, 'file:///cache/exports/opendives-data-2026-11-18.zip');
    assert.equal(file.path, 'exports/opendives-data-2026-11-18.zip');
    assert.ok(readZip(readFileSync(path.join(dir, 'opendives-data-2026-11-18.zip'))).has('manifest.json'));
    assert.ok(calls.includes('write'));
    const sink = await open('other.zip');
    await sink.write(Uint8Array.of(1, 2));
    await sink.write(Uint8Array.of(3));
    assert.deepEqual([...readFileSync(path.join(dir, 'other.zip'))], [1, 2, 3]);
    await sink.abort();
    assert.ok(!existsSync(path.join(dir, 'other.zip')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the desktop sink stages the file in the share area, appends, and removes it on abort', async () => {
  const dir = tempDir();
  try {
    const bridge = {
      fs: {
        async writeFile({ area, name, base64 }) {
          assert.equal(area, 'share');
          const p = path.join(dir, name);
          writeFileSync(p, Buffer.from(base64, 'base64'));
          return { path: p };
        },
        async appendFile({ path: p, base64 }) {
          appendFileSync(p, Buffer.from(base64, 'base64'));
          return true;
        },
        async remove({ path: p }) {
          rmSync(p, { force: true });
          return true;
        },
      },
    };
    const open = desktopSink(bridge);
    const { deps } = await fixture();
    deps.openFile = open;
    const { file } = await buildExport({}, deps);
    assert.ok(readZip(readFileSync(file.path)).has('manifest.json'));
    const sink = await open('x.zip');
    await sink.write(Uint8Array.of(1));
    await sink.write(Uint8Array.of(2));
    const closed = await sink.close();
    assert.deepEqual([...readFileSync(closed.path)], [1, 2]);
    await sink.abort();
    assert.ok(!existsSync(closed.path));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the archive name carries the local date', () => {
  assert.equal(exportFileName(new Date(2026, 0, 5)), 'opendives-data-2026-01-05.zip');
});
