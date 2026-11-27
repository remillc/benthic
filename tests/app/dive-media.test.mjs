// Dive photos and videos (task 2026-11-23-359): the references and their merge, the download policy, and the transfers with a
// fake plugin and a fake server (lib/dive-media.js, lib/media-sync.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createMediaSync } from '../../app/src/lib/media-sync.js';
import { countsOf, durationText, emptyFile, itemsOf, kindOf, mediaPathOf, mergeMediaFile, objectsOf, wantsOriginal, withItems } from '../../app/src/lib/dive-media.js';

const h = (c) => c.repeat(64);
const item = (hash, extra = {}) => ({ hash, mime: 'image/jpeg', size: 10, takenAt: '2026-05-01T10:00:00.000Z', caption: '', thumb: '', ...extra });

test('the reference path is made of the dive start, safe for a file name', () => {
  assert.equal(mediaPathOf('2026-05-01T10:30:00'), 'media/2026-05-01T10-30-00.json');
});

test('items merge by hash: a union, the same item once', () => {
  const base = withItems(null, 'd', [item(h('a'))], '2026-05-01T00:00:00Z');
  const ours = withItems(base, 'd', [item(h('b'))], '2026-05-02T00:00:00Z');
  const theirs = withItems(base, 'd', [item(h('c')), item(h('a'))], '2026-05-03T00:00:00Z');
  const merged = mergeMediaFile(base, ours, theirs);
  assert.deepEqual(itemsOf(merged).map((i) => i.hash).sort(), [h('a'), h('b'), h('c')]);
  assert.equal(merged.updatedAt, '2026-05-03T00:00:00Z');
});

test('a caption changed on one side wins over the unchanged side', () => {
  const base = withItems(null, 'd', [item(h('a'))], 't');
  const ours = { ...base, items: [item(h('a'), { caption: 'reef' })] };
  assert.equal(itemsOf(mergeMediaFile(base, ours, base))[0].caption, 'reef');
  assert.equal(itemsOf(mergeMediaFile(base, base, ours))[0].caption, 'reef');
});

test('a file missing on one side does not delete the other', () => {
  const f = withItems(null, 'd', [item(h('a'))], 't');
  assert.deepEqual(mergeMediaFile(f, null, f), f);
  assert.deepEqual(mergeMediaFile(f, f, null), f);
});

test('adding an item already there leaves it as it was; malformed items stay out of the screens', () => {
  const f = withItems(null, 'd', [item(h('a'), { caption: 'x' })], 't');
  assert.equal(itemsOf(withItems(f, 'd', [item(h('a'))], 't2')).length, 1);
  assert.equal(itemsOf(withItems(f, 'd', [item(h('a'))], 't2'))[0].caption, 'x');
  assert.deepEqual(itemsOf({ items: [{ hash: 'nope', mime: 'image/png' }, null, item(h('b'))] }).map((i) => i.hash), [h('b')]);
});

test('the objects of a file are each original and its thumbnail', () => {
  assert.deepEqual(objectsOf(withItems(null, 'd', [item(h('a'), { thumb: h('e') }), item(h('b'))], 't')), [h('a'), h('e'), h('b')]);
});

test('counts and lengths', () => {
  const items = [item(h('a')), item(h('b'), { mime: 'video/mp4' })];
  assert.deepEqual(countsOf(items), { photos: 1, videos: 1 });
  assert.equal(kindOf('video/quicktime'), 'video');
  assert.equal(durationText(42000), '0:42');
  assert.equal(durationText(3723000), '1:02:03');
  assert.equal(emptyFile('d').items.length, 0);
});

test('the download policy: all, the last 12 months, on demand, per kind', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const recent = item(h('a'), { takenAt: '2026-06-01T00:00:00Z' });
  const old = item(h('b'), { takenAt: '2025-01-01T00:00:00Z' });
  const video = item(h('c'), { mime: 'video/mp4', takenAt: '2026-06-01T00:00:00Z' });
  const defaults = { photos: 'recent', videos: 'onDemand' };
  assert.equal(wantsOriginal(defaults, recent, now), true);
  assert.equal(wantsOriginal(defaults, old, now), false);
  assert.equal(wantsOriginal(defaults, video, now), false);
  assert.equal(wantsOriginal({ photos: 'all', videos: 'all' }, old, now), true);
  assert.equal(wantsOriginal({ photos: 'onDemand', videos: 'recent' }, video, now), true);
  assert.equal(wantsOriginal(defaults, item(h('d'), { takenAt: '' }), now), true);
});

/** A device: a plugin that keeps objects in a map and a server that holds some. */
function device(server, { wifi = true, policy = { photos: 'recent', videos: 'onDemand' } } = {}) {
  const local = new Map();
  const log = [];
  const core = {
    mediaStat: async ({ hash }) => ({ exists: local.has(hash), size: local.get(hash) ?? 0, path: local.has(hash) ? `/m/${hash}` : '' }),
    mediaUpload: async ({ hash }) => {
      log.push(`up ${hash[0]}`);
      if (server.down) throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' });
      server.objects.set(hash, local.get(hash));
      return { status: 200 };
    },
    mediaDownload: async ({ hash }) => {
      log.push(`down ${hash[0]}`);
      if (server.down) throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' });
      local.set(hash, server.objects.get(hash));
      return { size: server.objects.get(hash) };
    },
  };
  const api = {
    uploadUrl: async (hash, size) => {
      if (server.down) throw Object.assign(new Error('UNREACHABLE'), { code: 'UNREACHABLE' });
      if (server.objects.has(hash)) return { exists: true };
      const used = [...server.objects.values()].reduce((n, s) => n + s, 0);
      if (used + size > server.quota) throw Object.assign(new Error('QUOTA_EXCEEDED'), { code: 'QUOTA_EXCEEDED' });
      return { exists: false, url: `http://x/${hash}`, headers: {} };
    },
    downloadUrl: async (hash) => {
      if (server.down) throw Object.assign(new Error('UNREACHABLE'), { code: 'UNREACHABLE' });
      if (!server.objects.has(hash)) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
      return { url: `http://x/${hash}`, size: server.objects.get(hash) };
    },
  };
  const store = createFileStore(memoryBackend());
  const sync = createMediaSync({ core, api, store, policy: () => policy, wifi: () => wifi, now: () => new Date('2026-11-23T12:00:00Z') });
  return { local, log, store, sync };
}

const server = (extra = {}) => ({ objects: new Map(), quota: 1e9, down: false, ...extra });

test('uploads leave when the network returns, and nothing is sent twice', async () => {
  const s = server({ down: true });
  const a = device(s);
  a.local.set(h('a'), 100);
  a.local.set(h('e'), 5);
  await a.store.write('media/d.json', withItems(null, 'd', [item(h('a'), { thumb: h('e') })], 't'));
  const offline = await a.sync.run();
  assert.equal(offline.uploaded, 0);
  assert.equal(offline.offline, true);
  assert.equal(await a.sync.pendingUploads(), 2);
  s.down = false;
  const online = await a.sync.run();
  assert.equal(online.uploaded, 2);
  assert.deepEqual([...s.objects.keys()].sort(), [h('a'), h('e')]);
  const again = await a.sync.run();
  assert.equal(again.uploaded, 0);
  assert.equal(await a.sync.pendingUploads(), 0);
});

test('an object the server already holds is not sent again (the same photo from two devices)', async () => {
  const s = server();
  s.objects.set(h('a'), 100);
  const a = device(s);
  a.local.set(h('a'), 100);
  await a.store.write('media/d.json', withItems(null, 'd', [item(h('a'))], 't'));
  const r = await a.sync.run();
  assert.equal(r.uploaded, 0);
  assert.equal(a.log.length, 0);
});

test('the quota stops the uploads and is reported; the file stays on the device', async () => {
  const s = server({ quota: 150 });
  const a = device(s);
  a.local.set(h('a'), 100);
  a.local.set(h('b'), 100);
  await a.store.write('media/d.json', withItems(null, 'd', [item(h('a')), item(h('b'), { takenAt: '2026-05-02T00:00:00Z' })], 't'));
  const r = await a.sync.run();
  assert.equal(r.uploaded, 1);
  assert.equal(r.quotaFull, true);
  assert.equal(r.waiting, 1);
  assert.equal(a.local.has(h('b')), true);
  assert.equal((await a.sync.readState()).quotaFull, true);
});

test('another device gets thumbnails always, originals on Wi-Fi by its choice, and the rest on demand', async () => {
  const s = server();
  s.objects.set(h('a'), 100); // a recent photo
  s.objects.set(h('e'), 5);
  s.objects.set(h('f'), 900); // a video
  s.objects.set(h('1'), 5);
  const refs = withItems(null, 'd', [item(h('a'), { thumb: h('e'), takenAt: '2026-06-01T00:00:00Z' }), item(h('f'), { mime: 'video/mp4', thumb: h('1'), takenAt: '2026-06-01T00:00:00Z' })], 't');

  const onWifi = device(s);
  await onWifi.store.write('media/d.json', refs);
  const r = await onWifi.sync.run();
  assert.equal(r.downloaded, 3); // two thumbnails and the recent photo
  assert.equal(onWifi.local.has(h('a')), true);
  assert.equal(onWifi.local.has(h('f')), false);

  const cellular = device(s, { wifi: false });
  await cellular.store.write('media/d.json', refs);
  await cellular.sync.run();
  assert.deepEqual([...cellular.local.keys()].sort(), [h('e'), h('1')].sort(), 'only thumbnails off Wi-Fi');

  const path = await cellular.sync.ensureLocal(h('f'));
  assert.equal(path, `/m/${h('f')}`, 'the video opens on demand');
  s.down = true;
  await assert.rejects(device(s).sync.ensureLocal(h('a')), /OFFLINE/);
  s.down = false;
  await assert.rejects(device(s).sync.ensureLocal(h('2')), /NOT_ON_SERVER/);
});

test('a server that is down never throws and leaves the work for the next run', async () => {
  const s = server({ down: true });
  const a = device(s);
  a.local.set(h('a'), 1);
  await a.store.write('media/d.json', withItems(null, 'd', [item(h('a'), { thumb: h('e') })], 't'));
  const r = await a.sync.run();
  assert.equal(r.offline, true);
  assert.equal(r.uploaded + r.downloaded, 0);
});

test('the Photos et vidéos section is with the notes only: the Notes tab on a tablet or the desktop, the end of the Notes group on a phone (task 2026-11-27-413)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../app/src/pages/DiveDetail.svelte', import.meta.url), 'utf8');
  assert.match(page, /\{#snippet media\(\)\}\s*\{#if dive && diveMediaEnabled\(\) && !preview\}\s*<DiveMediaSection/);
  assert.match(page, /<DesktopDiveFields \{\.\.\.fieldProps\} tab=\{key\} hint=\{false\} \/>\s*\{#if key === 'notes'\}\{@render media\(\)\}\{\/if\}/);
  assert.match(page, /\{#if !layout\.phone && tab === 'notes'\}\{@render media\(\)\}\{\/if\}/);
  assert.equal(page.match(/<DiveMediaSection/g)?.length, 1, 'one place draws it');
});
