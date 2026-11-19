// Dive validation (task 2026-11-19-309, point 2): the fingerprint that detects « modifiée après la validation », the
// records in the OpenDives data store (round trip, follow a dive whose start was edited, the read-only flag), the QR text,
// the clock of a code (10 minutes, the server's grace), the answer of the server applied to a pending validation and the
// queue of a signer who is offline. Also: every text the screens use exists in French and English.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createInventory, ReadOnlyError } from '../../app/src/lib/inventory.js';
import {
  localStamp, CODE_SECONDS, GRACE_DAYS, ROLES, applyResult, cleanSigner, dequeue, diveHash, enqueue, fingerprint, hashText, itemsFor, parseQrText, pastGrace,
  pendingRecord, qrText, readQueue, rekey, secondsLeft, signatureRecord, signerProblems, summaryOf, validatedKeys,
} from '../../app/src/lib/validation.js';

const dive = (over = {}) => ({
  date: '2026-08-01T09:30:12', site: 'Blue Hole', maxDepthMm: 30000, meanDepthMm: 18000, durationSeconds: 2400, divemode: 'OC',
  buddies: ['Bo'], guides: [], suit: 'Wet 5 mm', tags: ['reef'], notes: 'Calm', rating: 4, waterTempMk: 300000,
  cylinders: [{ o2Permille: 210, hePermille: 0, sizeMl: 12000, description: 'AL80', startMbar: 200000 }], ...over,
});
const now = new Date('2026-08-01T12:00:00Z');
const PNG = 'data:image/png;base64,AAAA';

test('the hash is stable and changes with what the validation vouches for', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  assert.match(hashText('x'), /^[0-9a-f]{14}$/);
  const base = diveHash(dive());
  assert.equal(diveHash(dive()), base);
  for (const change of [{ site: 'Elsewhere' }, { maxDepthMm: 31000 }, { durationSeconds: 2460 }, { notes: 'Calm, cold' }, { buddies: ['Bo', 'Al'] }, { date: '2026-08-01T09:31:12' }, { suit: 'Dry' }]) {
    assert.notEqual(diveHash(dive(change)), base, JSON.stringify(change));
  }
  // What the screens add around the dive (profile samples, the dive's number, the id of this load) does not count.
  assert.equal(diveHash(dive({ id: 77, number: 12, samples: { timeSeconds: [1, 2] }, pictures: 3 })), base);
  // Subsurface's start time is to the second: the hash holds it to the second.
  assert.ok(fingerprint(dive()).includes('2026-08-01T09:30:12'));
});

test('a validation by signature is kept with the hash of each dive, and « modified » follows the dive', () => {
  const a = dive();
  const b = dive({ date: '2026-08-02T10:00:00', site: 'Reef' });
  const rec = signatureRecord({ id: 'v1', signer: { name: '  Marc   Gagnon ', role: 'instructor', instructorNumber: ' PADI 412 778 ' }, signature: PNG, dives: [a, b], now });
  assert.deepEqual(rec.signer, { name: 'Marc Gagnon', role: 'instructor', instructorNumber: 'PADI 412 778' });
  assert.equal(rec.status, 'confirmed');
  assert.equal(rec.method, 'signature');
  assert.deepEqual(rec.dives.map((d) => d.start), ['2026-08-01T09:30:12', '2026-08-02T10:00:00']);
  assert.equal(rec.at, localStamp(now));
  assert.match(rec.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'wall-clock text, as the dates of the app');

  const [first] = itemsFor([rec], a);
  assert.equal(first.name, 'Marc Gagnon');
  assert.equal(first.modified, false);
  assert.equal(itemsFor([rec], b)[0].modified, false);
  // Edited since: the validation stays and says so.
  assert.equal(itemsFor([rec], dive({ notes: 'Edited later' }))[0].modified, true);
  // Another dive has none.
  assert.deepEqual(itemsFor([rec], dive({ date: '2026-09-09T09:00:00' })), []);
  assert.deepEqual([...validatedKeys([rec])].sort(), ['2026-08-01T09:30:12', '2026-08-02T10:00:00']);
});

test('the signer must have a name and one of the three roles', () => {
  assert.deepEqual(signerProblems({ name: '', role: 'buddy' }), { name: 'empty' });
  assert.deepEqual(signerProblems({ name: ' ', role: 'x' }), { name: 'empty', role: 'empty' });
  assert.deepEqual(signerProblems({ name: 'Bo', role: 'diveguide' }), {});
  assert.deepEqual([...ROLES], ['buddy', 'instructor', 'diveguide']);
  assert.equal(cleanSigner({ name: 'x'.repeat(200), role: 'buddy' }).name.length, 80);
});

test('the records round-trip through the data store, outside the Subsurface logbook', async () => {
  const store = createFileStore(memoryBackend());
  const inv = createInventory(store, { now: () => now });
  const rec = signatureRecord({ id: 'v1', signer: { name: 'Bo', role: 'buddy' }, signature: PNG, dives: [dive()], now });
  await inv.commitFiles([[`dive-validations/${rec.id}.json`, rec]]);
  assert.deepEqual(await store.list('dive-validations/'), ['dive-validations/v1.json']);
  const back = await store.readAll('dive-validations/');
  assert.deepEqual(back, [rec]);
  assert.ok((await inv.pendingPaths()).includes('dive-validations/v1.json'), 'sent with the next sync');
  // Unknown fields of a record are kept as they are.
  await store.write('dive-validations/v2.json', { ...rec, id: 'v2', futureField: { a: 1 } });
  assert.deepEqual((await store.read('dive-validations/v2.json')).futureField, { a: 1 });
  // The signature is the PNG as it was drawn.
  assert.equal(back[0].signature, PNG);
});

test('editing the start of a dive moves its validations with it', async () => {
  const store = createFileStore(memoryBackend());
  const inv = createInventory(store, { now: () => now });
  const rec = signatureRecord({ id: 'v1', signer: { name: 'Bo', role: 'buddy' }, signature: PNG, dives: [dive(), dive({ date: '2026-08-02T10:00:00' })], now });
  await inv.commitFiles([[`dive-validations/${rec.id}.json`, rec]]);
  await inv.rekeyDive('2026-08-01T09:30:12', '2026-08-01T09:45:00');
  const [moved] = await store.readAll('dive-validations/');
  assert.deepEqual(moved.dives.map((d) => d.start), ['2026-08-01T09:45:00', '2026-08-02T10:00:00']);
  assert.deepEqual(rekey([rec], 'nope', 'x'), []);
  assert.deepEqual(rekey([rec], 'a', 'a'), []);
});

test('a lapsed subscription makes the store read only: no validation is added or removed', async () => {
  const store = createFileStore(memoryBackend());
  const inv = createInventory(store, { now: () => now });
  await inv.setReadOnly(true);
  const rec = signatureRecord({ id: 'v1', signer: { name: 'Bo', role: 'buddy' }, signature: PNG, dives: [dive()], now });
  await assert.rejects(() => inv.commitFiles([[`dive-validations/${rec.id}.json`, rec]]), ReadOnlyError);
});

test('the QR text carries the code and the summary, and only a real code is read back', () => {
  const token = 'a'.repeat(32);
  const summary = summaryOf([dive(), dive({ date: '2026-08-02T10:00:00', site: 'Reef' })], ' Ana ');
  assert.equal(summary.diverName, 'Ana');
  assert.equal(summary.dives.length, 2);
  const text = qrText(token, summary);
  const read = parseQrText(text);
  assert.equal(read?.token, token);
  assert.equal(read?.summary.dives[1].site, 'Reef');
  assert.equal(read?.summary.dives[0].date, '2026-08-01T09:30:12');
  for (const bad of ['', 'not json', '{"odValidation":1}', qrText('short', summary), qrText(token, { diverName: '', dives: [] }), '<divelog/>']) assert.equal(parseQrText(bad), null, bad);
  assert.equal(summaryOf(Array.from({ length: 30 }, () => dive())).dives.length, 20);
});

test('a code lives 10 minutes; the server still accepts an offline signer for 7 days', () => {
  assert.equal(CODE_SECONDS, 600);
  const expires = new Date(now.getTime() + CODE_SECONDS * 1000).toISOString();
  assert.equal(secondsLeft(expires, now), 600);
  assert.equal(secondsLeft(expires, new Date(now.getTime() + 599500)), 1);
  assert.equal(secondsLeft(expires, new Date(now.getTime() + 600000)), 0);
  assert.equal(secondsLeft(expires, new Date(now.getTime() + 3600000)), 0);
  assert.equal(pastGrace(expires, new Date(now.getTime() + 3600000)), false);
  assert.equal(pastGrace(expires, new Date(now.getTime() + 600000 + (GRACE_DAYS * 86400 - 1) * 1000)), false);
  assert.equal(pastGrace(expires, new Date(now.getTime() + 600000 + (GRACE_DAYS * 86400 + 1) * 1000)), true);
});

test('a pending validation shows « en attente », then takes the signer the server returns, or goes', () => {
  const expiresAt = new Date(now.getTime() + 600000).toISOString();
  const pending = pendingRecord({ id: 'p1', token: 'b'.repeat(32), expiresAt, dives: [dive()], now });
  assert.equal(pending.status, 'pending');
  assert.equal(itemsFor([pending], dive())[0].pending, true);
  assert.equal(itemsFor([pending], dive())[0].modified, false, 'a pending one is not « modified »');
  assert.equal(validatedKeys([pending]).size, 0, 'no mark in the list until it is confirmed');

  assert.equal(applyResult(pending, { status: 'waiting' }, now), pending);
  assert.equal(applyResult(pending, { status: 'expired' }, now), null);
  const done = applyResult(pending, { status: 'confirmed', signer: { name: 'Julie Roy', role: 'buddy', instructorNumber: '' }, confirmedAt: '2026-08-01T12:03:00Z' }, now);
  assert.equal(done?.status, 'confirmed');
  assert.equal(done?.signer.name, 'Julie Roy');
  assert.equal(done?.at, localStamp(new Date('2026-08-01T12:03:00Z')));
  assert.equal(done?.token, undefined);
  assert.equal(done?.expiresAt, undefined);
  assert.equal(itemsFor([done], dive())[0].pending, false);
  assert.equal(validatedKeys([done]).size, 1);
});

test('the confirmations a signer made offline wait in a queue, one per code', () => {
  const a = { token: 'a'.repeat(32), signer: { name: 'Bo', role: 'buddy', instructorNumber: '' }, scannedAt: '2026-08-01T12:00:00Z' };
  const b = { ...a, token: 'b'.repeat(32) };
  let q = enqueue([], a);
  q = enqueue(q, b);
  q = enqueue(q, { ...a, scannedAt: '2026-08-01T12:01:00Z' });
  assert.equal(q.length, 2);
  assert.equal(q.find((x) => x.token === a.token)?.scannedAt, '2026-08-01T12:01:00Z');
  assert.deepEqual(dequeue(q, a.token).map((x) => x.token), [b.token]);
  assert.deepEqual(readQueue(JSON.stringify(q)), q);
  assert.deepEqual(readQueue('not json'), []);
  assert.deepEqual(readQueue(null), []);
  assert.deepEqual(readQueue(JSON.stringify([{ token: 1 }, a])), [a]);
});

test('every text of the validation screens exists in French and in English', () => {
  const read = (lang) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8'));
  const fr = read('fr');
  const en = read('en');
  /** @param {any} o @param {string} prefix */
  const keys = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  assert.deepEqual(keys(fr.validation).sort(), keys(en.validation).sort());
  const files = ['pages/Validate.svelte', 'components/ValidationConfirm.svelte', 'pages/DiveDetail.svelte', 'pages/Logbook.svelte', 'components/DiveRow.svelte', 'lib/share.js', 'lib/qr-receive.svelte.js'];
  const have = new Set(keys(fr.validation));
  for (const f of files) {
    const src = readFileSync(new URL(`../../app/src/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/['`]validation\.([A-Za-z.]+?)['`]/g)) assert.ok(have.has(m[1]), `${f}: validation.${m[1]}`);
  }
  // Dynamic keys: roles, methods, errors.
  for (const r of ROLES) assert.ok(have.has(`roles.${r}`));
  for (const m of ['signature', 'qr']) assert.ok(have.has(`method.${m}`));
  for (const e of ['offline', 'tooMany', 'plus', 'failed']) assert.ok(have.has(`qrError.${e}`));
  for (const e of ['expired', 'used', 'own', 'plus', 'unknown', 'tooMany', 'failed']) assert.ok(have.has(`confirmError.${e}`));
  // The release notes carry this task's line (later tasks append theirs after it).
  assert.ok(fr.about.releaseNotes.some((n) => /Faire valider/.test(n)));
  assert.ok(en.about.releaseNotes.some((n) => /Get the dive validated/.test(n)));
});

test('the privacy policy says what is kept about a signer, in both languages', () => {
  for (const [lang, needle] of [['fr', /nom, son rôle, son numéro de moniteur .*signature sont gardés dans votre carnet/], ['en', /name, role, instructor number .*signature are kept in your logbook/]]) {
    assert.match(readFileSync(new URL(`../../app/public/privacy/${lang}.html`, import.meta.url), 'utf8'), needle);
  }
});
