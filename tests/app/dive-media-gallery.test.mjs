// The gallery of a dive's photos and videos (task 2026-11-23-367): removal by tombstone, merged between two devices over real
// git (the same stand-ins as account-sync.test.mjs), the depth at a picture's offset, and the counts as the screens say them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { depthAtOffset, itemsOf, mediaPathOf, mergeMediaFile, offsetInDive, takenLocalIso, withItems, withoutItems } from '../../app/src/lib/dive-media.js';
import { countsText, cloudLine } from '../../app/src/lib/dive-media-text.js';
import { shareName } from '../../app/src/lib/media-share.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

const h = (c) => c.repeat(64);
const item = (hash, extra = {}) => ({ hash, mime: 'image/jpeg', size: 1000, takenAt: '2026-05-01T10:00:00', caption: '', thumb: '', ...extra });
let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
const now = () => new Date((tick += 1000));

function device(remote, name) {
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const key = toBase64(new Uint8Array(32).fill(7));
  const box = createSecretBox({
    read: async () => key,
    write: async () => {
      throw new Error('no key write');
    },
    hadKey: async () => false,
  });
  const sync = createAccountSync({ core, store, box, now });
  return { core, store, sync };
}
const stamp = () => now().toISOString();
const DIVE = '2026-05-01T09:30:00';
const shown = async (d) => itemsOf(await d.store.read(mediaPathOf(DIVE))).map((i) => i.hash);
const plain = (text) => text.replace(/\s/g, ' ');
const hashes = (file) => itemsOf(file).map((i) => i.hash);

test('removing an item keeps a tombstone and takes it off every screen', () => {
  const file = withItems(null, DIVE, [item(h('a')), item(h('b'))], '2026-05-02T00:00:00.000Z');
  const next = withoutItems(file, DIVE, [h('a')], '2026-05-03T00:00:00.000Z');
  assert.deepEqual(hashes(next), [h('b')]);
  assert.deepEqual(next.removed, [{ hash: h('a'), removedAt: '2026-05-03T00:00:00.000Z' }]);
  assert.equal(next.items.length, 1);
});

test('the merge keeps the tombstone: a removal on one device beats an older copy on the other', () => {
  const base = withItems(null, DIVE, [item(h('a')), item(h('b'))], '2026-05-02T00:00:00.000Z');
  const ours = withoutItems(base, DIVE, [h('a')], '2026-05-03T00:00:00.000Z');
  for (const merged of [mergeMediaFile(base, ours, base), mergeMediaFile(base, base, ours)]) {
    assert.deepEqual(hashes(merged), [h('b')]);
    assert.deepEqual(merged.removed, [{ hash: h('a'), removedAt: '2026-05-03T00:00:00.000Z' }]);
  }
});

test('adding the same file again after its removal brings it back, with a newer addedAt', () => {
  const base = withItems(null, DIVE, [item(h('a'))], '2026-05-02T00:00:00.000Z');
  const gone = withoutItems(base, DIVE, [h('a')], '2026-05-03T00:00:00.000Z');
  const back = withItems(gone, DIVE, [item(h('a'))], '2026-05-04T00:00:00.000Z');
  assert.deepEqual(hashes(back), [h('a')]);
  assert.equal(itemsOf(back)[0].addedAt, '2026-05-04T00:00:00.000Z');
  // The device that never saw it come back still holds the tombstone: the merge shows it.
  assert.deepEqual(hashes(mergeMediaFile(base, gone, back)), [h('a')]);
  assert.deepEqual(hashes(mergeMediaFile(base, back, gone)), [h('a')]);
  // A clock that runs behind the removal still revives it.
  const skewed = withItems(gone, DIVE, [item(h('a'))], '2026-05-01T00:00:00.000Z');
  assert.deepEqual(hashes(skewed), [h('a')]);
});

test('items of the dive are in the order of the time taken, even when a time carries a zone', () => {
  const file = withItems(
    null,
    DIVE,
    [item(h('c'), { takenAt: '2026-05-01T12:00:00+02:00' }), item(h('a'), { takenAt: '2026-05-01T10:30:00Z' }), item(h('b'), { takenAt: '2026-05-01T10:15:00Z' })],
    't',
  );
  assert.deepEqual(hashes(file), [h('c'), h('b'), h('a')]);
});

test('two devices over real git: a removal on A reaches B, and adding it again on B comes back to A', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const path = mediaPathOf(DIVE);
    await a.store.trackedBatch({ writes: [[path, withItems(null, DIVE, [item(h('a')), item(h('b'))], stamp())]] });
    assert.equal((await a.sync.run()).status, 'synced');
    assert.equal((await b.sync.run()).status, 'synced');
    assert.deepEqual((await shown(b)).sort(), [h('a'), h('b')]);

    // A removes a photo; B, which has not synced, adds another meanwhile.
    await a.store.trackedBatch({ writes: [[path, withoutItems(await a.store.read(path), DIVE, [h('a')], stamp())]] });
    await b.store.trackedBatch({ writes: [[path, withItems(await b.store.read(path), DIVE, [item(h('c'), { takenAt: '2026-05-01T10:05:00' })], stamp())]] });
    await a.sync.run();
    assert.equal((await b.sync.run()).status, 'synced');
    await a.sync.run();
    assert.deepEqual((await shown(b)).sort(), [h('b'), h('c')], 'B no longer shows the removed photo and keeps its own');
    assert.deepEqual((await shown(a)).sort(), [h('b'), h('c')]);
    assert.deepEqual((await a.store.read(path)).removed.map((r) => r.hash), [h('a')], 'the tombstone is in the synced file');

    // B adds the same file again: it comes back on A.
    await b.store.trackedBatch({ writes: [[path, withItems(await b.store.read(path), DIVE, [item(h('a'))], stamp())]] });
    await b.sync.run();
    await a.sync.run();
    assert.deepEqual((await shown(a)).sort(), [h('a'), h('b'), h('c')]);
  } finally {
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

test('the depth at a picture: interpolated between samples, nothing outside the dive', () => {
  const samples = { timeSeconds: [0, 60, 120, 180], depthMm: [0, 10000, 18000, 4000] };
  assert.equal(depthAtOffset(samples, 60), 10000);
  assert.equal(depthAtOffset(samples, 90), 14000);
  assert.equal(depthAtOffset(samples, 0), 0);
  assert.equal(depthAtOffset(samples, 180), 4000);
  assert.equal(depthAtOffset(samples, -1), null);
  assert.equal(depthAtOffset(samples, 181), null);
  assert.equal(depthAtOffset(null, 10), null);
  assert.equal(depthAtOffset({ timeSeconds: [], depthMm: [] }, 10), null);
  assert.equal(depthAtOffset(samples, NaN), null);
});

test('the offset in the dive is the time taken minus the start', () => {
  assert.equal(offsetInDive('2014-04-02T10:11:30', '2014-04-02T10:00:00'), 690);
  assert.equal(offsetInDive('2014-04-02T09:59:00', '2014-04-02T10:00:00'), -60);
  assert.equal(offsetInDive('nope', '2014-04-02T10:00:00'), null);
  assert.equal(takenLocalIso('2014-04-02T10:11:00'), '2014-04-02T10:11:00');
  assert.equal(takenLocalIso('garbage'), '');
});

test('the counts: 2 photos, 2 vidéos, 1 photo et 1 vidéo', () => {
  const photo = item(h('a'));
  const video = item(h('b'), { mime: 'video/mp4' });
  assert.equal(plain(countsText([photo, { ...photo, hash: h('c') }])), '2 photos');
  assert.equal(plain(countsText([video, { ...video, hash: h('d') }])), '2 vidéos');
  assert.equal(plain(countsText([photo, video])), '1 photo et 1 vidéo');
  assert.equal(plain(countsText([photo])), '1 photo');
  assert.match(plain(cloudLine([photo, video])), /^1 photo et 1 vidéo, sur tous vos appareils · \d+ Mo$/);
});

test('a shared file keeps its own name, else gets one from its hash, and never repeats', () => {
  const taken = new Set();
  assert.equal(shareName({ hash: h('a'), mime: 'image/jpeg', name: 'IMG_0001.JPG' }, taken), 'IMG_0001.JPG');
  assert.equal(shareName({ hash: h('b'), mime: 'image/jpeg', name: 'IMG_0001.JPG' }, taken), 'bbbbbbbb-IMG_0001.JPG');
  assert.equal(shareName({ hash: h('c'), mime: 'video/quicktime' }, taken), 'benthic-cccccccc.mov');
});
