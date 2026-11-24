// The import of a `.benthic` file (task 2026-11-23-360): the inverse of the full export, all or nothing. A real export
// (lib/full-export.js) is read back on a fresh device and over an existing one; a corrupted or cut file is « incomplete » and
// leaves the store and the logbook as they were; a cancel before the write does too; a big file is read in pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { buildExport } from '../../app/src/lib/full-export.js';
import { BenthicImportError, importBenthic, inspectBenthic, isBenthicName, verifyBenthic } from '../../app/src/lib/benthic-import.js';
import { blobSource, stagedSource } from '../../app/src/lib/zip-read.js';
import { fakeStagedCore } from './fake-staged-core.mjs';

const FIXED = new Date('2026-11-18T10:30:00Z');
const jpeg = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255);
const tempDir = () => mkdtempSync(path.join(tmpdir(), 'bc-import-'));

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

/** A device: a store, a box with its own key, a profile. */
function device(seed = 'a') {
  const store = createFileStore(memoryBackend());
  let key = '';
  const box = createSecretBox({ read: async () => key, write: async (k) => void (key = k) });
  let n = 0;
  const profile = createProfile(store, box, { now: () => FIXED, id: () => `${seed}-${++n}` });
  return { store, box, profile };
}

const dives = (n) => `<divelog program="subsurface"><settings/><divesites>${'<site uuid="1" name="x"/>'}</divesites><dives>${Array.from({ length: n }, (_, i) => `<dive number="${i + 1}"/>`).join('')}</dives></divelog>`;

async function exportedDevice(extra = {}) {
  const d = device('src');
  const { store, profile } = d;
  await store.write('gear/g1.json', { format: 1, id: 'g1', name: 'Regulator', type: 'regulator', futureField: { keep: true }, updatedAt: '2026-10-01T00:00:00Z' });
  await store.write('gear/g2.json', { format: 1, id: 'g2', name: 'Mask', type: 'mask' });
  await store.write('kits/k1.json', { format: 1, id: 'k1', name: 'Cold water', gearIds: ['g1'] });
  await store.write('maintenance/m1.json', { format: 1, id: 'm1', gearId: 'g1', history: [] });
  await store.write('dive-equipment/e1.json', { format: 1, diveKey: { start: '2026-01-01 10:00:00' }, gear: { gearIds: ['g1'] } });
  await store.write('gear-photos/p1.json', { format: 1, id: 'p1', createdAt: 'x', dataUrl: `data:image/jpeg;base64,${toBase64(jpeg(300, 1))}` });
  await store.write('meta/dev-data-key.json', { format: 1, key: 'SECRET-KEY' });
  await profile.saveInfo({ fullName: 'Sam Diver', dateOfBirth: '1980-05-17', emergency: { name: 'Alex Martin', relation: 'Sister', phone: { country: 'CA', number: '5145551234' } }, bloodGroup: 'O+' });
  const front = jpeg(2000, 3);
  const cert = await profile.saveCertification({ agency: 'padi', level: 'Advanced', number: 'A123456', issuedOn: '2019-06-01', instructor: 'Sam', photos: { front, back: jpeg(1500, 9) } });
  const insurance = await profile.saveDocument({ kind: 'insurance', expiresOn: '2027-06-01', notifyDays: 30, insurer: 'DAN', policyNumber: 'P-1', title: 'Insurance', files: [{ side: 'page', page: 1, bytes: jpeg(800, 5), mime: 'image/jpeg' }] });
  const ssrf = new TextEncoder().encode(dives(3));
  const deps = {
    store,
    profile,
    appVersion: '0.3.0',
    now: () => FIXED,
    logbook: { diveCount: async () => 3, siteCount: async () => 1, read: async () => ssrf },
    settings: async () => ({ app: {}, logbook: {} }),
    openFile: null,
    ...extra,
  };
  return { ...d, deps, cert, insurance, front };
}

async function makeFile(dir, extra) {
  const src = await exportedDevice(extra);
  src.deps.openFile = folderSink(dir);
  const { file, manifest } = await buildExport({ logbookName: 'Mon carnet' }, src.deps);
  return { ...src, file, manifest, bytes: readFileSync(file.path) };
}

/** The import's platform: a fake core (3 dives counted as `<dive ` tags) and a recording of the logbook step. */
function target(dev, { failLogbook = false } = {}) {
  const staging = fakeStagedCore();
  const core = {
    ...staging.core,
    importCount: async ({ path: p }) => {
      const text = staging.text(p);
      if (!text.includes('<divelog')) throw new Error('IMPORT_FAILED');
      return { dives: (text.match(/<dive /g) ?? []).length };
    },
  };
  const calls = { logbook: [] };
  return {
    staging,
    calls,
    deps: {
      core,
      store: dev.store,
      box: dev.box,
      now: () => FIXED,
      applyLogbook: async (l) => {
        if (failLogbook) throw new Error('REPLACE_FAILED');
        calls.logbook.push(l && { ...l, text: staging.text(l.path) });
      },
    },
  };
}

const snapshot = async (store) => {
  const out = {};
  for (const p of await store.list('')) out[p] = await store.read(p);
  return out;
};

test('isBenthicName', () => {
  assert.ok(isBenthicName('Mon carnet.benthic'));
  assert.ok(isBenthicName('X.BENTHIC'));
  assert.ok(!isBenthicName('a.ssrf'));
  assert.ok(!isBenthicName('a.benthic.zip'));
});

test('round trip: export then import on a fresh device gives the same logbook, equipment, profile and certifications', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    const insp = await inspectBenthic(blobSource(new Blob([src.bytes])));
    assert.deepEqual(
      { dives: insp.counts.dives, sites: insp.counts.sites, gear: insp.counts.gear, kits: insp.counts.kits, maintenance: insp.counts.maintenance, certifications: insp.counts.certifications, documents: insp.counts.documents, profile: insp.counts.profile, media: insp.counts.media },
      { dives: 3, sites: 1, gear: 2, kits: 1, maintenance: 1, certifications: 1, documents: 1, profile: true, media: 0 },
    );
    assert.equal(insp.exportedAt, '2026-11-18T10:30:00.000Z');
    assert.equal(insp.sensitive, true);

    const fresh = device('dst');
    const t = target(fresh);
    const steps = [];
    const result = await importBenthic(insp, t.deps, { onProgress: (p) => steps.push(p.phase) });
    assert.deepEqual([...new Set(steps)], ['verify', 'logbook', 'data', 'media', 'write']);
    assert.equal(result.dives, 3);
    assert.equal(result.files, insp.files.length);

    // The logbook went through the existing path with the file's contents.
    assert.equal(t.calls.logbook.length, 1);
    assert.equal(t.calls.logbook[0].dives, 3);
    assert.equal(t.calls.logbook[0].text, dives(3));
    assert.equal(t.staging.files.size, 0, 'the staged logbook is deleted');

    // Equipment, kits, maintenance, what the dives used, photos: as stored (unknown fields kept).
    for (const p of ['gear/g1.json', 'gear/g2.json', 'kits/k1.json', 'maintenance/m1.json', 'dive-equipment/e1.json']) assert.deepEqual(await fresh.store.read(p), await src.store.read(p), p);
    assert.equal((await fresh.store.read('gear-photos/p1.json')).dataUrl, (await src.store.read('gear-photos/p1.json')).dataUrl);

    // Profile and certifications: sealed with THIS device's key, reading back the same.
    const diverFile = await fresh.store.read('profile/diver.json');
    assert.ok(diverFile.enc, 'sealed');
    assert.ok(!JSON.stringify(diverFile).includes('1980-05-17'));
    assert.deepEqual(await fresh.profile.readInfo(), await src.profile.readInfo());
    const [a, b] = [await fresh.profile.listCertifications(), await src.profile.listCertifications()];
    assert.deepEqual(a.map((c) => ({ ...c, documents: c.documents.map((d) => ({ ...d, hash: '' })) })), b.map((c) => ({ ...c, documents: c.documents.map((d) => ({ ...d, hash: '' })) })));
    for (const c of a) for (const d of c.documents) assert.ok((await fresh.profile.readPhoto(c.id, d.hash)).length === d.size);
    const front = a.find((c) => c.kind === 'certification').documents.find((d) => d.side === 'front');
    assert.deepEqual(Buffer.from(await fresh.profile.readPhoto(src.cert.id, front.hash)), Buffer.from(src.front));
    // The key is the device's own, never the exporting device's.
    assert.notEqual(await fresh.store.read('meta/dev-data-key.json'), await src.store.read('meta/dev-data-key.json'));

    // Ordinary local edits: every written file is recorded as not sent yet.
    const pending = (await fresh.store.read('meta/pending.json')).paths;
    for (const p of ['gear/g1.json', 'kits/k1.json', 'profile/diver.json', `certifications/${src.cert.id}.json`]) assert.ok(pending.includes(p), p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('over an existing device the groups the file brings are replaced, the others stay', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    const insp = await inspectBenthic(blobSource(new Blob([src.bytes])));
    const dst = device('dst');
    await dst.store.write('gear/old.json', { format: 1, id: 'old', name: 'Old gear', type: 'other' });
    await dst.store.write('kits/oldkit.json', { format: 1, id: 'oldkit', name: 'Old kit', gearIds: ['old'] });
    await dst.store.write('shared-sites/links.json', { format: 1, links: [] });
    await dst.profile.saveCertification({ agency: 'ssi', level: 'Open Water', number: 'OLD' });
    await importBenthic(insp, target(dst).deps);
    assert.equal(await dst.store.read('gear/old.json'), null);
    assert.equal(await dst.store.read('kits/oldkit.json'), null);
    assert.ok(await dst.store.read('gear/g1.json'));
    assert.ok(await dst.store.read('shared-sites/links.json'), 'not part of the file: untouched');
    assert.equal((await dst.profile.listCertifications()).length, 2, 'the file’s card and document replace the old card');
    assert.ok(!(await dst.profile.listCertifications()).some((c) => c.number === 'OLD'));
    // Removed files are recorded too, so that an account learns of them like any deletion.
    assert.ok((await dst.store.read('meta/pending.json')).paths.includes('gear/old.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a part missing from the file leaves that part of the device alone', async () => {
  const dir = tempDir();
  try {
    const src = await exportedDevice({ logbook: { diveCount: async () => 0 } });
    // A logbook-only file: no equipment, no profile.
    for (const p of await src.store.list('')) if (!p.startsWith('meta/')) await src.store.remove(p);
    await src.store.write('gear/x.json', { format: 1, id: 'x' });
    src.deps.openFile = folderSink(dir);
    src.deps.logbook = { diveCount: async () => 3, read: async () => new TextEncoder().encode(dives(3)) };
    const { file } = await buildExport({}, src.deps);
    const insp = await inspectBenthic(blobSource(new Blob([readFileSync(file.path)])));
    assert.equal(insp.counts.sites, null);
    const dst = device('dst');
    await dst.store.write('kits/mine.json', { format: 1, id: 'mine', name: 'Mine', gearIds: [] });
    await dst.profile.saveInfo({ fullName: 'Me', dateOfBirth: '', emergency: { name: '', relation: '', phone: { country: 'CA', number: '' } }, bloodGroup: '' });
    await importBenthic(insp, target(dst).deps);
    assert.ok(await dst.store.read('gear/x.json'));
    assert.equal(await dst.store.read('kits/mine.json'), null, 'the equipment group is replaced as a whole');
    assert.equal((await dst.profile.readInfo()).fullName, 'Me', 'the file had no profile');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Flips one byte of a stored/deflated entry's data in the archive, by its name. */
function corrupt(bytes, name, { truncate = false } = {}) {
  const buf = Buffer.from(bytes);
  const nameBytes = Buffer.from(name);
  // The local header of the entry: its data starts after the header and the name.
  let at = buf.indexOf(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(26)]).subarray(0, 4));
  for (at = 0; at < buf.length - 30; at++) {
    if (buf.readUInt32LE(at) === 0x04034b50 && buf.toString('utf8', at + 30, at + 30 + buf.readUInt16LE(at + 26)) === name) break;
  }
  assert.ok(at < buf.length - 30, `entry ${name}`);
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  buf[start + 5] ^= 0xff;
  return truncate ? buf.subarray(0, Math.floor(buf.length / 2)) : buf;
}

test('a corrupted file in the archive: « incomplete », and nothing changed (the store, the logbook, the cache)', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    const damaged = corrupt(src.bytes, 'benthic/gear/g1.json');
    const insp = await inspectBenthic(blobSource(new Blob([damaged])));
    const dst = device('dst');
    await dst.store.write('gear/mine.json', { format: 1, id: 'mine' });
    const before = await snapshot(dst.store);
    const t = target(dst);
    await assert.rejects(importBenthic(insp, t.deps), (e) => e instanceof BenthicImportError && e.code === 'INCOMPLETE' && e.bad.length === 1 && e.bad[0].path === 'benthic/gear/g1.json');
    assert.deepEqual(await snapshot(dst.store), before);
    assert.equal(t.calls.logbook.length, 0);
    assert.equal(t.staging.files.size, 0);
    // Three damaged files are counted as three.
    let d3 = corrupt(damaged, 'logbook/logbook.ssrf');
    d3 = corrupt(d3, 'benthic/kits/k1.json');
    await assert.rejects(verifyBenthic(await inspectBenthic(blobSource(new Blob([d3])))), (e) => e.code === 'INCOMPLETE' && e.bad.length === 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file cut short is incomplete; a file that is not an archive of Benthic is not readable', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    await assert.rejects(inspectBenthic(blobSource(new Blob([src.bytes.subarray(0, 2000)]))), (e) => e.code === 'INCOMPLETE' && e.bad === null);
    await assert.rejects(inspectBenthic(blobSource(new Blob(['not an archive at all, just text, padded to be long enough to look']))), (e) => e.code === 'NOT_BENTHIC');
    // A ZIP without the manifest (a plain archive).
    const plain = await buildExport({}, { ...(await exportedDevice()).deps, openFile: folderSink(dir) });
    const bytes = readFileSync(plain.file.path);
    const noManifest = Buffer.from(bytes);
    // Rename the manifest entry in the central directory and local header: it is no longer found.
    for (let i = 0; i < noManifest.length - 13; i++) if (noManifest.toString('latin1', i, i + 13) === 'manifest.json') noManifest.write('manifesu.json', i, 'latin1');
    await assert.rejects(inspectBenthic(blobSource(new Blob([noManifest]))), (e) => e.code === 'NOT_BENTHIC');
    // A newer format.
    const m = JSON.parse(JSON.stringify(src.manifest));
    assert.equal(m.format, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cancel midway leaves everything unchanged and deletes what was staged', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    const insp = await inspectBenthic(blobSource(new Blob([src.bytes])));
    for (const stop of ['verify', 'logbook', 'data', 'media']) {
      const dst = device('dst');
      await dst.store.write('gear/mine.json', { format: 1, id: 'mine' });
      const before = await snapshot(dst.store);
      const t = target(dst);
      const controller = new AbortController();
      await assert.rejects(
        importBenthic(insp, t.deps, {
          signal: controller.signal,
          onProgress: (p) => {
            if (p.phase === stop && (stop === 'verify' ? p.files >= 2 : p.done > 0 || p.total === 0)) controller.abort();
            if (stop === 'media' && p.phase === 'media') controller.abort();
          },
        }),
        (e) => e.code === 'CANCELLED',
        stop,
      );
      assert.deepEqual(await snapshot(dst.store), before, stop);
      assert.equal(t.calls.logbook.length, 0, stop);
      assert.equal(t.staging.files.size, 0, stop);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('when the logbook step fails after the store was written, the store is put back', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    const insp = await inspectBenthic(blobSource(new Blob([src.bytes])));
    const dst = device('dst');
    await dst.store.write('gear/mine.json', { format: 1, id: 'mine' });
    await dst.store.write('meta/pending.json', { format: 1, paths: ['gear/mine.json'] });
    const before = await snapshot(dst.store);
    const t = target(dst, { failLogbook: true });
    await assert.rejects(importBenthic(insp, t.deps), (e) => e.code === 'FAILED' && /REPLACE_FAILED/.test(String(e.cause)));
    assert.deepEqual(await snapshot(dst.store), before);
    assert.equal(t.staging.files.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a logbook the core cannot read is refused before anything is written', async () => {
  const dir = tempDir();
  try {
    const src = await exportedDevice();
    src.deps.logbook = { diveCount: async () => 1, read: async () => new TextEncoder().encode('garbage') };
    src.deps.openFile = folderSink(dir);
    const { file } = await buildExport({}, src.deps);
    const insp = await inspectBenthic(blobSource(new Blob([readFileSync(file.path)])));
    const dst = device('dst');
    const before = await snapshot(dst.store);
    await assert.rejects(importBenthic(insp, target(dst).deps), (e) => e.code === 'BAD_LOGBOOK');
    assert.deepEqual(await snapshot(dst.store), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('photos and videos: streamed to the media hook in pieces and kept at the end; undone with the rest on a failure; skipped without a hook', async () => {
  const dir = tempDir();
  try {
    const big = Uint8Array.from({ length: 3 * 1024 * 1024 + 17 }, (_, i) => (i * 31 + 7) & 255);
    const media = async () => [
      { name: 'a.jpg', size: 4000, onDevice: true, open: async function* () { yield jpeg(4000, 2); } },
      { name: 'b.mp4', size: big.length, onDevice: true, open: async function* () { for (let i = 0; i < big.length; i += 1000000) yield big.subarray(i, i + 1000000); } },
    ];
    const src = await makeFile(dir, { media });
    const bytes = readFileSync((await buildExport({ withMedia: true, logbookName: 'Avec' }, { ...src.deps, openFile: folderSink(dir) })).file.path);
    const insp = await inspectBenthic(blobSource(new Blob([bytes])));
    assert.equal(insp.counts.media, 2);
    assert.equal(insp.counts.mediaBytes, 4000 + big.length);

    const got = new Map();
    let finished = 0;
    let discarded = 0;
    const mediaDeps = {
      put: async (name, chunks, size) => {
        const parts = [];
        let largest = 0;
        for await (const c of chunks) (parts.push(Buffer.from(c)), (largest = Math.max(largest, c.length)));
        assert.ok(largest <= 2 * 1024 * 1024, 'no piece is a whole big file');
        got.set(name, Buffer.concat(parts));
        assert.equal(got.get(name).length, size);
      },
      finish: async () => void finished++,
      discard: async () => void discarded++,
    };
    const dst = device('dst');
    const result = await importBenthic(insp, { ...target(dst).deps, media: mediaDeps });
    assert.equal(result.skipped, 0);
    assert.equal(finished, 1);
    assert.deepEqual(got.get('b.mp4'), Buffer.from(big));
    assert.deepEqual(got.get('a.jpg'), Buffer.from(jpeg(4000, 2)));

    // A failure after the media were staged discards them.
    const dst2 = device('dst2');
    await assert.rejects(importBenthic(insp, { ...target(dst2, { failLogbook: true }).deps, media: mediaDeps }));
    assert.equal(discarded, 1);

    // Without a hook the files are checked and counted, not kept.
    const dst3 = device('dst3');
    assert.equal((await importBenthic(insp, target(dst3).deps)).skipped, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the archive is read from a file of the cache too, in pieces that fit the bridge (no whole file as a string)', async () => {
  const dir = tempDir();
  try {
    const src = await makeFile(dir);
    const staging = fakeStagedCore();
    const file = staging.put('Mon carnet.benthic', src.bytes);
    const insp = await inspectBenthic(stagedSource(staging.core, file.path, file.size));
    const dst = device('dst');
    const t = target(dst);
    // The fake core of the target is another one: the archive's own reads go to `staging`.
    await importBenthic(insp, t.deps);
    assert.equal(t.calls.logbook[0].text, dives(3));
    assert.ok(staging.stats.largestPiece <= 4 * 1024 * 1024 * 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the rows of « Ce que le fichier contient » come from the manifest, only the parts the file has', async () => {
  const { contentsRows, replaceContents, progressSteps, sizeText } = await import('../../app/src/lib/benthic-import-text.js');
  const fr = JSON.parse(readFileSync('app/src/i18n/fr.json', 'utf8'));
  const plural = new Intl.PluralRules('fr');
  const lookup = (key) => key.split('.').reduce((o, k) => o?.[k], fr);
  const t = (key, p = {}) => {
    let v = lookup(key);
    if (v && typeof v === 'object') v = v[plural.select(p.n)] ?? v.other;
    return String(v).replace(/\{(\w+)\}/g, (_, k) => p[k]);
  };
  const counts = { dives: 312, sites: 48, gear: 14, kits: 2, maintenance: 3, certifications: 3, documents: 0, profile: true, media: 4, mediaBytes: 1.2 * 1024 ** 3, files: 1248, bytes: 1 };
  assert.deepEqual(
    contentsRows(counts, t).map((r) => [r.title, r.value]),
    [
      ['Plongées et sites', '312 · 48'],
      ['Équipement, kits et entretien', '14 pièces · 2 kits'],
      ['Profil, brevets et documents', '3 brevets'],
      ['Photos et vidéos des plongées', '1.2 Go'],
    ],
  );
  assert.equal(replaceContents(counts, t), '312 plongées, l’équipement, le profil, les brevets et 1.2 Go de photos et vidéos');
  assert.equal(replaceContents({ ...counts, gear: 0, kits: 0, maintenance: 0, profile: false, certifications: 0, media: 0 }, t), '312 plongées');
  assert.deepEqual(contentsRows({ ...counts, dives: 0, gear: 0, kits: 0, maintenance: 0, certifications: 0, media: 0 }, t).map((r) => r.value), ['Profil']);
  assert.equal(sizeText(340 * 1024 * 1024, t), '340 Mo');
  // The steps of the list and where each stands.
  assert.deepEqual(progressSteps('logbook', { dives: true, media: true }).map((s) => `${s.key}:${s.state}`), ['verify:done', 'logbook:current', 'data:waiting', 'media:waiting']);
  assert.deepEqual(progressSteps('write', { dives: false, media: false }).map((s) => `${s.key}:${s.state}`), ['verify:done', 'data:done']);
});

test('the texts exist in French and English and the screens are wired (the interface the tests read)', () => {
  const fr = JSON.parse(readFileSync('app/src/i18n/fr.json', 'utf8'));
  const en = JSON.parse(readFileSync('app/src/i18n/en.json', 'utf8'));
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) && !('other' in v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  assert.deepEqual(keys(fr.benthicImport).sort(), keys(en.benthicImport).sort());
  assert.equal(fr.benthicImport.contentsTitle, 'Ce que le fichier contient');
  assert.equal(fr.benthicImport.incompleteTitle, 'Ce fichier .benthic est incomplet');
  assert.equal(fr.benthicImport.replace.title, 'Remplacer ce carnet ?');
  assert.equal(fr.benthicImport.progress.verifyDone.other, '{n} fichiers, tous intacts');
  assert.equal(fr.benthicImport.progress.help, 'Gardez l’app ouverte jusqu’à la fin. Si l’import s’arrête, rien n’est ajouté.');
  assert.equal(fr.benthicImport.progress.helpDesktop, 'Gardez Benthic ouvert jusqu’à la fin. Si l’import s’arrête, rien n’est ajouté.');
  assert.equal(fr.benthicImport.incompleteText.other, 'Dans « {file} », {n} fichiers ne correspondent pas à leur empreinte. Rien n’a été importé. Refaites l’export sur l’appareil d’origine.');
  assert.ok(fr.about.releaseNotes.some((n) => n.includes('.benthic')) && en.about.releaseNotes.some((n) => n.includes('.benthic')));
  const read = (p) => readFileSync(p, 'utf8');
  assert.match(read('app/src/components/FirstLaunchSteps.svelte'), /isBenthicName\(files\[0\]\.name\)/);
  assert.match(read('app/src/pages/Logbook.svelte'), /startBenthicReplace/);
  assert.match(read('app/src/pages/DesktopLogbook.svelte'), /startBenthicReplace/);
  assert.match(read('app/src/lib/first-launch-steps.js'), /'importNew:benthic': 'importBenthic'/);
  assert.match(read('app/src/App.svelte'), /<BenthicImportOverlay \/>/);
});
