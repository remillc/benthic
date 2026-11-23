// Short ids (to-do #149): the generator, the mapping from the old UUIDs and its test vectors, the resolver, the planner, and the
// migration of a local store seeded with UUID ids (every kind of reference, sealed cards, edits not sent yet, running twice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { ID_ALPHABET, ID_LENGTH, deriveId, isShortId, isUuid, newShortId, resolveId, resolveUrl, setIdAliases, sha256, shortFromUuid, sealIdOf } from '../../app/src/lib/short-id.js';
import { ALIASES_PATH, BACKUP_PATH, MARKER_PATH, ensureShortIds, isOldIdPath, planShortIds } from '../../app/src/lib/short-id-migration.js';
import { withShortIds } from '../../app/src/lib/router-guard.js';

// ---- The generator ----

test('a new id is 10 characters of lowercase Crockford base32, from the random source', () => {
  assert.equal(ID_ALPHABET, '0123456789abcdefghjkmnpqrstvwxyz');
  assert.equal(ID_ALPHABET.length, 32);
  for (const bad of 'ilou') assert.ok(!ID_ALPHABET.includes(bad));
  let calls = 0;
  const fixed = { getRandomValues: (/** @type {Uint8Array} */ a) => { calls++; a.set([0, 1, 2, 3, 4, 5, 31, 32, 33, 255]); return a; } };
  assert.equal(newShortId(fixed), '012345z01z', 'the low 5 bits of each byte');
  assert.equal(calls, 1, 'one call of the source, 10 bytes');
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const id = newShortId();
    assert.equal(id.length, ID_LENGTH);
    assert.match(id, /^[0-9a-hjkmnp-tv-z]{10}$/);
    assert.ok(isShortId(id));
    seen.add(id);
  }
  assert.equal(seen.size, 2000, 'no repeat in 2000 draws (50 bits)');
  assert.throws(() => newShortId({}), /NO_RANDOM_SOURCE/);
});

test('every one of the 32 symbols appears with about the same frequency (no modulo bias)', () => {
  const counts = new Map();
  for (let i = 0; i < 6400; i++) for (const c of newShortId()) counts.set(c, (counts.get(c) ?? 0) + 1);
  assert.equal(counts.size, 32);
  for (const n of counts.values()) assert.ok(n > 1500 && n < 2500, `a symbol is drawn ${n} times out of 64000`);
});

test('the id source is the crypto one, not Math.random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('Math.random must not be used'); };
  try {
    assert.ok(isShortId(newShortId()));
  } finally {
    Math.random = original;
  }
});

// ---- The mapping ----

test('SHA-256 is the standard one', () => {
  for (const text of ['', 'abc', 'benthic-id-v1|x', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'é'.repeat(100)]) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(Buffer.from(sha256(bytes)).toString('hex'), createHash('sha256').update(bytes).digest('hex'), text.slice(0, 8));
  }
});

test('shortFromUuid: deterministic, the first 50 bits of SHA-256(benthic-id-v1|uuid), with fixed vectors', () => {
  // The vectors were computed with Python's hashlib too: the first 7 bytes as an integer, shifted right by 6, five bits a character.
  assert.equal(shortFromUuid('123e4567-e89b-42d3-a456-426614174000'), 'zqzxj1nyds');
  assert.equal(shortFromUuid('00000000-0000-4000-8000-000000000000'), 'vxed0vf3ve');
  assert.equal(shortFromUuid('123E4567-E89B-42D3-A456-426614174000'), 'zqzxj1nyds', 'the case of the UUID does not matter');
  assert.equal(shortFromUuid('123e4567-e89b-42d3-a456-426614174000'), shortFromUuid('123e4567-e89b-42d3-a456-426614174000'));
  const digest = createHash('sha256').update('benthic-id-v1|123e4567-e89b-42d3-a456-426614174000').digest();
  let bits = 0n;
  for (const b of digest.subarray(0, 7)) bits = (bits << 8n) | BigInt(b);
  bits >>= 6n;
  const expected = Array.from({ length: 10 }, (_, i) => ID_ALPHABET[Number((bits >> BigInt((9 - i) * 5)) & 31n)]).join('');
  assert.equal(shortFromUuid('123e4567-e89b-42d3-a456-426614174000'), expected);
  assert.notEqual(shortFromUuid('123e4567-e89b-42d3-a456-426614174000', 1), shortFromUuid('123e4567-e89b-42d3-a456-426614174000'), 'a collision attempt gives another id');
  assert.ok(isShortId(deriveId('AbCdEfGhIjKlMnOpQrStUv'.slice(0, 22))));
});

test('the mapping spreads: 20000 random UUIDs give 20000 different ids', () => {
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(shortFromUuid(webcrypto.randomUUID()));
  assert.equal(seen.size, 20000);
});

test('the resolver maps an old UUID anywhere an id is read, and nothing else', () => {
  setIdAliases({});
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(resolveId(uuid), 'zqzxj1nyds');
  assert.equal(resolveId('zqzxj1nyds'), 'zqzxj1nyds');
  assert.equal(resolveId('1504AB2231'), '1504AB2231');
  assert.equal(resolveId(''), '');
  assert.equal(resolveUrl(`/profile/gear/${uuid}/maintenance/note?item=${uuid}`), '/profile/gear/zqzxj1nyds/maintenance/note?item=zqzxj1nyds');
  assert.equal(resolveUrl('/dive/42'), '/dive/42');
  assert.equal(resolveUrl('/profile/gear/zqzxj1nyds'), '/profile/gear/zqzxj1nyds');
  // The router guard rewrites every form of a navigate call.
  assert.deepEqual(withShortIds([`/profile/kits/${uuid}`, { animate: false }]), ['/profile/kits/zqzxj1nyds', { animate: false }]);
  assert.deepEqual(withShortIds([{ url: `/profile/certs/${uuid}/edit`, props: 1 }]), [{ url: '/profile/certs/zqzxj1nyds/edit', props: 1 }]);
  assert.deepEqual(withShortIds([{ path: `/profile/gear/${uuid}` }]), [{ path: '/profile/gear/zqzxj1nyds' }]);
  assert.deepEqual(withShortIds([{ name: 'x' }]), [{ name: 'x' }]);
  // A recorded collision answer wins.
  setIdAliases({ [uuid]: '0000000001' });
  assert.equal(resolveId(uuid), '0000000001');
  setIdAliases({});
});

// ---- The planner ----

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = (n) => shortFromUuid(U(n));

/** A small tree with every reference kind. */
function tree() {
  return new Map(Object.entries({
    [`gear/${U(1)}.json`]: { format: 1, id: U(1), name: 'Suit', type: 'suit', photoId: U(9), updatedAt: '2026-11-01T00:00:00Z', unknown: { keep: true } },
    [`gear/${U(2)}.json`]: { format: 1, id: U(2), name: 'Mask', type: 'mask', updatedAt: '2026-11-01T00:00:00Z' },
    [`kits/${U(3)}.json`]: { format: 1, id: U(3), name: 'Cold', gearIds: [U(1), U(2), 'gone'], updatedAt: '2026-11-01T00:00:00Z' },
    [`maintenance/${U(4)}.json`]: { format: 1, id: U(4), gearId: U(1), task: 'service', history: [{ id: U(5), doneOn: '2026-01-01', invoicePhotoId: U(10) }], updatedAt: '2026-11-01T00:00:00Z' },
    [`dive-equipment/${U(6)}.json`]: { format: 1, id: U(6), diveKey: { start: '2026-01-01T10:00:00' }, suitGearId: U(1), undersuitGearId: '', gearIds: [U(2)], kitId: U(3), adhoc: [{ id: U(7), name: 'Buoy' }], updatedAt: '2026-11-01T00:00:00Z' },
    [`gear-photos/${U(9)}.json`]: { format: 1, id: U(9), dataUrl: 'data:image/jpeg;base64,AA==' },
    [`gear-photos/${U(10)}.json`]: { format: 1, id: U(10), dataUrl: 'data:image/jpeg;base64,BB==' },
    [`certifications/${U(8)}.json`]: { format: 1, id: U(8), enc: { v: 1, alg: 'A256GCM', kid: 'k', nonce: 'n', ct: 'c' }, updatedAt: '2026-11-01T00:00:00Z' },
    [`dive-validations/${U(11)}.json`]: { format: 1, id: U(11), method: 'qr', dives: [{ start: '2026-01-01T10:00:00', hash: 'h' }], updatedAt: '2026-11-01T00:00:00Z' },
  }));
}

test('the planner renames every file, rewrites every reference, and touches nothing else', () => {
  const plan = planShortIds({ files: tree() });
  const w = (kind, n) => plan.writes.get(`${kind}/${S(n)}.json`);
  assert.equal(plan.removes.length, 9, 'every old name goes');
  assert.ok(plan.removes.every(isOldIdPath));
  assert.deepEqual(w('gear', 1), { format: 1, id: S(1), name: 'Suit', type: 'suit', photoId: S(9), updatedAt: '2026-11-01T00:00:00Z', unknown: { keep: true } });
  assert.deepEqual(w('kits', 3).gearIds, [S(1), S(2), 'gone'], 'an id that is not a UUID stays');
  assert.equal(w('maintenance', 4).gearId, S(1));
  assert.deepEqual(w('maintenance', 4).history, [{ id: S(5), doneOn: '2026-01-01', invoicePhotoId: S(10) }]);
  const eq = w('dive-equipment', 6);
  assert.deepEqual([eq.suitGearId, eq.undersuitGearId, eq.gearIds, eq.kitId, eq.adhoc], [S(1), '', [S(2)], S(3), [{ id: S(7), name: 'Buoy' }]]);
  assert.deepEqual(eq.diveKey, { start: '2026-01-01T10:00:00' }, 'the dive key is the logbook\'s, not an id');
  assert.equal(w('gear-photos', 9).dataUrl, 'data:image/jpeg;base64,AA==');
  assert.equal(w('dive-validations', 11).id, S(11));
  const cert = w('certifications', 8);
  assert.equal(cert.id, S(8));
  assert.equal(cert.sealId, U(8), 'a sealed card is not opened: its old id is kept for its authenticated data');
  assert.deepEqual(cert.enc, { v: 1, alg: 'A256GCM', kid: 'k', nonce: 'n', ct: 'c' });
  assert.equal(sealIdOf(cert), U(8));
  assert.equal(w('gear', 1).updatedAt, '2026-11-01T00:00:00Z', 'no date moves, so two devices write the same bytes');
  assert.deepEqual(plan.collisions, []);
});

test('the plan is idempotent and independent of the order of the files', () => {
  const first = planShortIds({ files: tree() });
  const again = planShortIds({ files: new Map(first.writes) });
  assert.equal(again.writes.size, 0);
  assert.equal(again.removes.length, 0);
  const reversed = new Map([...tree()].reverse());
  const b = planShortIds({ files: reversed });
  assert.deepEqual([...b.writes].sort(([x], [y]) => (x < y ? -1 : 1)), [...first.writes].sort(([x], [y]) => (x < y ? -1 : 1)));
  assert.deepEqual(b.map, first.map);
});

test('a collision (two old ids with one new id) is detected and settled the same way everywhere', () => {
  // A real SHA-256 collision on 50 bits cannot be built, so the mapping is replaced by one that gives the same answer twice.
  const derive = (/** @type {string} */ uuid, /** @type {number} */ attempt) => (attempt === 0 ? 'aaaaaaaaaa' : shortFromUuid(uuid, attempt));
  const files = new Map([
    [`gear/${U(1)}.json`, { format: 1, id: U(1), name: 'One', type: 'mask' }],
    [`gear/${U(2)}.json`, { format: 1, id: U(2), name: 'Two', type: 'fins' }],
  ]);
  const plan = planShortIds({ files, derive });
  assert.equal(plan.map[U(1)], 'aaaaaaaaaa', 'the smaller old id gets the first answer');
  assert.equal(plan.map[U(2)], shortFromUuid(U(2), 1), 'the other gets the next attempt of the same mapping: the same on every device');
  assert.deepEqual(plan.collisions, [U(2)]);
  assert.deepEqual(plan.aliases, { [U(2)]: shortFromUuid(U(2), 1) });
  assert.equal(plan.writes.get('gear/aaaaaaaaaa.json').name, 'One');
  assert.equal(plan.writes.get(`gear/${shortFromUuid(U(2), 1)}.json`).name, 'Two');
  const reversed = planShortIds({ files: new Map([...files].reverse()), derive });
  assert.deepEqual(reversed.map, plan.map, 'the order of the files does not matter');
  // The recorded answer is used again, and the resolver gives it.
  const next = planShortIds({ files: new Map([[`gear/${U(2)}.json`, { format: 1, id: U(2), name: 'Two' }]]), aliases: plan.aliases, derive });
  assert.ok(next.writes.has(`gear/${shortFromUuid(U(2), 1)}.json`));
  setIdAliases(plan.aliases);
  assert.equal(resolveId(U(2)), shortFromUuid(U(2), 1));
  setIdAliases({});
});

test('an old file arriving later where the new one exists is merged: the later updatedAt wins, a reminder\'s history is joined', () => {
  const files = new Map([
    [`gear/${S(1)}.json`, { format: 1, id: S(1), name: 'New name', updatedAt: '2026-11-20T00:00:00Z' }],
    [`gear/${U(1)}.json`, { format: 1, id: U(1), name: 'Old name', updatedAt: '2026-11-10T00:00:00Z' }],
  ]);
  const plan = planShortIds({ files });
  assert.equal(plan.removes.length, 1);
  assert.equal(plan.writes.size, 0, 'the winner is the file that was already there: nothing to write');
  const newer = new Map([
    [`gear/${S(1)}.json`, { format: 1, id: S(1), name: 'New name', updatedAt: '2026-11-01T00:00:00Z' }],
    [`gear/${U(1)}.json`, { format: 1, id: U(1), name: 'Old name', updatedAt: '2026-11-10T00:00:00Z' }],
  ]);
  assert.equal(planShortIds({ files: newer }).writes.get(`gear/${S(1)}.json`).name, 'Old name');
});

// ---- The local store ----

function setup() {
  const backend = memoryBackend();
  const store = createFileStore(backend);
  let key = toBase64(new Uint8Array(32).fill(5));
  const box = createSecretBox({ read: async () => key, write: async (k) => (key = k) });
  const uuid = () => webcrypto.randomUUID();
  // An old build: the inventory and the profile make UUIDs.
  const inventory = createInventory(store, { id: uuid });
  const profile = createProfile(store, box, { id: uuid });
  return { backend, store, box, inventory, profile };
}

test('a store seeded with UUID ids is rewritten in one step: files, ids, references, sealed card and its photos, pending edits', async () => {
  const { store, box, inventory, profile, backend } = setup();
  const suit = await inventory.saveGear({ name: 'Suit', type: 'suit', brand: 'Brand' });
  const mask = await inventory.saveGear({ name: 'Mask', type: 'mask' });
  const photoId = await inventory.savePhoto('data:image/jpeg;base64,AA==');
  await inventory.saveGear({ id: suit.id, name: 'Suit', type: 'suit', photoId });
  const kit = await inventory.saveKit({ name: 'Cold', gearIds: [suit.id, mask.id] });
  const note = await inventory.noteMaintenance({ gearId: suit.id, task: 'service' }, { kind: 'service', doneOn: '2026-05-01', invoicePhotoId: await inventory.savePhoto('data:image/jpeg;base64,BB==') });
  await inventory.saveDiveEquipment('2026-01-01T10:00:00', { suitGearId: suit.id, undersuitGearId: '', gearIds: [mask.id], adhoc: [{ id: webcrypto.randomUUID(), name: 'Buoy' }], kitId: kit.id });
  const card = await profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '1', photos: { front: new Uint8Array([0xff, 0xd8, 1, 2, 3]) } });
  await store.write('meta/pending.json', { format: 1, paths: [`gear/${suit.id}.json`, `kits/${kit.id}.json`, `certifications/${card.id}.json`] });
  assert.ok(isUuid(suit.id) && isUuid(card.id));
  const before = Object.fromEntries(await Promise.all((await backend.list('')).map(async (p) => [p, await backend.get(p)])));

  const result = await ensureShortIds(store, { now: () => new Date('2026-11-24T00:00:00Z') });
  assert.equal(result.migrated, 8);
  const all = await backend.list('');
  assert.deepEqual(all.filter(isOldIdPath), [], 'no file keeps an old name');
  const ns = (id) => shortFromUuid(id);
  assert.ok((await store.read(`gear/${ns(suit.id)}.json`)));
  const newSuit = await store.read(`gear/${ns(suit.id)}.json`);
  assert.deepEqual([newSuit.id, newSuit.photoId, newSuit.brand], [ns(suit.id), ns(photoId), 'Brand']);
  assert.deepEqual((await store.read(`kits/${ns(kit.id)}.json`)).gearIds, [ns(suit.id), ns(mask.id)]);
  const m = await store.read(`maintenance/${ns(note.id)}.json`);
  assert.deepEqual([m.gearId, m.history[0].id, m.history[0].invoicePhotoId], [ns(suit.id), ns(note.history[0].id), ns(note.history[0].invoicePhotoId)]);
  const [rec] = await inventory.listDiveEquipment();
  assert.deepEqual([rec.suitGearId, rec.gearIds, rec.kitId, isShortId(rec.adhoc[0].id)], [ns(suit.id), [ns(mask.id)], ns(kit.id), true]);
  assert.equal((await store.read(`gear-photos/${ns(photoId)}.json`)).id, ns(photoId));
  assert.equal(await inventory.readPhoto(ns(photoId)), 'data:image/jpeg;base64,AA==');

  // The sealed card: never opened by the migration, still opens, and so do its photos.
  const newCard = await store.read(`certifications/${ns(card.id)}.json`);
  assert.deepEqual([newCard.id, newCard.sealId], [ns(card.id), card.id]);
  const opened = await profile.getCertification(ns(card.id));
  assert.equal(opened.level, 'Open Water');
  assert.deepEqual([...(await profile.readPhoto(ns(card.id), opened.documents[0].hash))], [0xff, 0xd8, 1, 2, 3]);
  assert.deepEqual([...(await profile.readPhoto(card.id, opened.documents[0].hash))], [0xff, 0xd8, 1, 2, 3], 'the old id still works');
  assert.equal((await profile.getCertification(card.id)).level, 'Open Water', 'the old id still finds the card');
  // A changed card keeps opening, and a new photo is sealed under the same id.
  const changed = await profile.saveCertification({ id: ns(card.id), agency: 'PADI', level: 'Rescue', number: '1', photos: { back: new Uint8Array([1, 2]) } });
  assert.equal(changed.documents.length, 2);
  assert.deepEqual([...(await profile.readPhoto(changed.id, changed.documents.find((d) => d.side === 'back').hash))], [1, 2]);
  assert.equal((await store.read(`certifications/${ns(card.id)}.json`)).sealId, card.id);
  // The sealed file is the same ciphertext: the migration did not touch the block.
  assert.deepEqual(newCard.enc, JSON.parse(before[`certifications/${card.id}.json`]).enc);
  assert.equal(JSON.stringify(await store.read(`documents/${opened.documents[0].hash}.json`)), JSON.stringify(JSON.parse(before[`documents/${opened.documents[0].hash}.json`])), 'documents are not touched');

  // The marker, the backup and the pending list.
  const marker = await store.read(MARKER_PATH);
  assert.equal(marker.format, 1);
  assert.equal(marker.migratedAt, '2026-11-24T00:00:00Z');
  assert.equal(marker.map[suit.id], ns(suit.id));
  const backup = await store.read(BACKUP_PATH);
  assert.equal(backup.files[`gear/${suit.id}.json`], before[`gear/${suit.id}.json`], 'the old text is kept');
  assert.equal(backup.files[`certifications/${card.id}.json`], before[`certifications/${card.id}.json`]);
  const pending = (await store.read('meta/pending.json')).paths;
  for (const p of [`gear/${ns(suit.id)}.json`, `kits/${ns(kit.id)}.json`, `certifications/${ns(card.id)}.json`, `gear/${suit.id}.json`, `gear-photos/${ns(photoId)}.json`]) assert.ok(pending.includes(p), p);
  void box;
});

test('the migration is idempotent and does nothing once done', async () => {
  const { store, inventory, backend } = setup();
  await inventory.saveGear({ name: 'Fins', type: 'fins' });
  assert.equal((await ensureShortIds(store)).migrated, 1);
  const files = await backend.list('');
  const texts = await Promise.all(files.map((p) => backend.get(p)));
  assert.equal((await ensureShortIds(store)).migrated, 0);
  assert.equal((await ensureShortIds(store)).migrated, 0);
  assert.deepEqual(await backend.list(''), files);
  assert.deepEqual(await Promise.all(files.map((p) => backend.get(p))), texts, 'not a byte changes');
  // Files that come back with an old id (a restored backup) are rewritten at the next look.
  const old = webcrypto.randomUUID();
  await store.write(`gear/${old}.json`, { format: 1, id: old, name: 'Back', type: 'mask', retired: false });
  assert.equal((await ensureShortIds(store)).migrated, 1);
  assert.ok(await store.read(`gear/${shortFromUuid(old)}.json`));
});

test('the migration does not need the data key: a device without it migrates', async () => {
  const { store, inventory, profile } = setup();
  const card = await profile.saveCertification({ agency: 'SSI', level: 'Open Water' });
  void inventory;
  const keyless = createSecretBox({ read: async () => '', write: async () => { throw new Error('no key is made'); } });
  keyless.setAccountKid('0000000000000000');
  await ensureShortIds(store);
  const file = await store.read(`certifications/${shortFromUuid(card.id)}.json`);
  assert.equal(file.sealId, card.id);
  await assert.rejects(createProfile(store, keyless).openCertification(file, true), /MISSING_DATA_KEY/, 'it stays locked, as before, until the key is here');
});

test('two runs at once do the work once', async () => {
  const { store, inventory } = setup();
  await inventory.saveGear({ name: 'Lamp', type: 'light' });
  const [a, b] = await Promise.all([ensureShortIds(store), ensureShortIds(store)]);
  assert.equal(a, b);
  assert.equal((await store.list('gear/')).length, 1);
});

test('collision answers recorded in meta/id-map.json are used by the migration and by the resolver', async () => {
  const { store } = setup();
  const answer = '0123456789';
  await store.write(ALIASES_PATH, { format: 1, map: { [U(1)]: answer } });
  await store.write(`gear/${U(1)}.json`, { format: 1, id: U(1), name: 'Old', type: 'fins' });
  await ensureShortIds(store);
  assert.equal(resolveId(U(1)), answer);
  assert.equal((await store.read(`gear/${answer}.json`)).name, 'Old');
  setIdAliases({});
});
