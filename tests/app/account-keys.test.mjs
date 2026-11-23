import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import {
  newAccountKey, createPairing, createPairingRequest, answerPairingRequest, acceptPairing, parsePairingPayload,
  createRecoveryKey, recoverAccountKey, parseRecoveryKey, resealFiles, startOver, accountKeyFile, parseAccountKeyFile,
  isPairingExpired, PAIRING_TTL_MS,
} from '../../app/src/lib/account-keys.js';

const rejects = (p, code) => assert.rejects(p, (e) => e.message === code);
const keeperOf = (b64 = '') => {
  const k = { key: b64, made: false };
  return { k, read: async () => k.key, write: async (v) => { k.key = v; }, hadKey: async () => k.made, markKey: async () => { k.made = true; } };
};
const randKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
const sha = async (b64) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', Buffer.from(b64, 'base64')))].map((x) => x.toString(16).padStart(2, '0')).join('');

test('pairing with a camera: wrap and unwrap', async () => {
  const acc = await newAccountKey();
  const t = 1_000_000;
  const p = await createPairing(acc, { now: () => t });
  assert.match(p.payload, /^benthic-pair:1:k:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
  assert.equal(p.file.path, `keys/pairing/${p.id}.json`);
  assert.equal(p.file.json.expiresAt, t + PAIRING_TTL_MS);
  const got = await acceptPairing({ payload: p.payload }, JSON.parse(JSON.stringify(p.file.json)), { now: () => t + 1000 });
  assert.deepEqual(got, acc);
});

test('pairing with a camera: expiry, wrong K, other id, tampered expiry', async () => {
  const acc = await newAccountKey();
  const t = 5_000;
  const p = await createPairing(acc, { now: () => t });
  await rejects(acceptPairing({ payload: p.payload }, p.file.json, { now: () => t + PAIRING_TTL_MS + 1 }), 'PAIRING_EXPIRED');
  assert.equal(isPairingExpired(p.file.json, { now: () => t + PAIRING_TTL_MS + 1 }), true);
  assert.equal(isPairingExpired(p.file.json, { now: () => t }), false);
  const q = await createPairing(acc, { now: () => t });
  await rejects(acceptPairing({ payload: q.payload }, p.file.json, { now: () => t }), 'PAIRING_ID_MISMATCH');
  const wrong = p.payload.replace(/:[A-Za-z0-9_-]{43}$/, ':' + 'A'.repeat(43));
  await rejects(acceptPairing({ payload: wrong }, p.file.json, { now: () => t }), 'PAIRING_WRONG_KEY');
  await rejects(acceptPairing({ payload: p.payload }, { ...p.file.json, expiresAt: p.file.json.expiresAt + 1e6 }, { now: () => t }), 'PAIRING_WRONG_KEY');
  await rejects(acceptPairing({ payload: 'hello' }, p.file.json), 'PAIRING_PAYLOAD_INVALID');
  await rejects(acceptPairing({ payload: p.payload }, { format: 1 }), 'PAIRING_FILE_INVALID');
});

test('pairing without a camera: ECDH with two independent key pairs', async () => {
  const acc = await newAccountKey();
  const t = 9_000;
  const req = await createPairingRequest();
  assert.match(req.payload, /^benthic-pair:1:e:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{87}$/);
  assert.equal(parsePairingPayload(req.payload).mode, 'e');
  const ans = await answerPairingRequest(req.payload, acc, { now: () => t });
  assert.equal(ans.file.path, req.path);
  const got = await acceptPairing({ id: req.id, privateKey: req.privateKey }, ans.file.json, { now: () => t + 5 });
  assert.deepEqual(got, acc);
  const other = await createPairingRequest();
  await rejects(acceptPairing({ id: req.id, privateKey: other.privateKey }, ans.file.json, { now: () => t }), 'PAIRING_WRONG_KEY');
  await rejects(acceptPairing({ id: req.id, privateKey: req.privateKey }, ans.file.json, { now: () => t + PAIRING_TTL_MS + 1 }), 'PAIRING_EXPIRED');
  await rejects(answerPairingRequest((await createPairing(acc)).payload, acc), 'PAIRING_PAYLOAD_INVALID');
});

test('recovery key: format, round trip, normalisation, wrong key', async () => {
  const acc = await newAccountKey();
  const { recoveryKey, file } = await createRecoveryKey(acc);
  assert.match(recoveryKey, /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
  assert.equal(file.path, 'keys/recovery.json');
  assert.deepEqual(await recoverAccountKey(recoveryKey, file.json), acc);
  const messy = ' ' + recoveryKey.toLowerCase().replace(/-/g, '  ').replace(/0/g, 'o').replace(/1/g, 'l') + '\n';
  assert.deepEqual(await recoverAccountKey(messy, file.json), acc);
  assert.deepEqual(parseRecoveryKey(recoveryKey), parseRecoveryKey(recoveryKey.replace(/-/g, '')));
  const other = (await createRecoveryKey(acc)).recoveryKey;
  await rejects(recoverAccountKey(other, file.json), 'RECOVERY_KEY_WRONG');
  await rejects(recoverAccountKey('ABCD', file.json), 'RECOVERY_KEY_INVALID');
  await rejects(recoverAccountKey('U'.repeat(26), file.json), 'RECOVERY_KEY_INVALID');
  await rejects(recoverAccountKey(recoveryKey, { format: 1 }), 'RECOVERY_FILE_INVALID');
});

test('keyring: open by kid, seal with the account key', async () => {
  const deviceKey = randKey();
  const box = createSecretBox(keeperOf(deviceKey));
  const item = { id: 'profile', format: 1 };
  const old = await box.seal({ a: 1 }, item);
  const acc = await newAccountKey();
  await box.adoptAccountKey(acc.key);
  assert.equal(box.getAccountKid(), acc.kid);
  const fresh = await box.seal({ b: 2 }, item);
  assert.equal(fresh.kid, acc.kid);
  assert.notEqual(old.kid, acc.kid);
  assert.deepEqual(await box.open(old, item), { a: 1 });
  assert.deepEqual(await box.open(fresh, item), { b: 2 });
  assert.equal((await box.reseal(old, item)).kid, acc.kid);
  assert.equal(await box.reseal(fresh, item), fresh);
  const lone = createSecretBox(keeperOf(deviceKey));
  await rejects(lone.open(fresh, item), 'MISSING_DATA_KEY');
  assert.deepEqual(await lone.open(old, item), { a: 1 });
});

test('keyring: no key is made when keys/account.json exists and the key is missing', async () => {
  const kp = keeperOf('');
  const box = createSecretBox(kp);
  box.setAccountKid(parseAccountKeyFile(accountKeyFile('0123456789abcdef').json));
  await rejects(box.seal({ x: 1 }, { id: 'a', format: 1 }), 'MISSING_DATA_KEY');
  await rejects(box.sealBytes(new Uint8Array(3), { id: 'a', format: 1 }), 'MISSING_DATA_KEY');
  assert.equal(kp.k.key, '');
  const b2 = createSecretBox(keeperOf(randKey()));
  b2.setAccountKid('0123456789abcdef');
  await rejects(b2.seal({ x: 1 }, { id: 'a', format: 1 }), 'MISSING_DATA_KEY');
  const b3 = createSecretBox(keeperOf(''));
  assert.ok((await b3.seal(1, { id: 'a', format: 1 })).kid);
  assert.throws(() => parseAccountKeyFile({ kid: 'x' }), /ACCOUNT_KEY_FILE_INVALID/);
});

test('re-seal the files of a joining device from its old key to the account key', async () => {
  const box = createSecretBox(keeperOf(randKey()));
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const cert = { id: 'c1', format: 1 };
  const photo = await box.sealBytes(bytes, cert);
  const hash = await sha(photo.ct);
  const files = [
    { path: 'profile/diver.json', json: { format: 1, keep: 'me', enc: await box.seal({ fullName: 'A' }, { id: 'profile', format: 1 }) } },
    { path: 'certifications/c1.json', json: { format: 1, id: 'c1', enc: await box.seal({ number: '7', documents: [{ hash, mime: 'image/jpeg', side: 'front' }] }, cert) } },
    { path: `documents/${hash}.json`, json: { format: 1, enc: photo } },
    { path: 'divers/x.json', json: { other: 1 } },
  ];
  const acc = await newAccountKey();
  await box.adoptAccountKey(acc.key);
  const r = await resealFiles(files, box);
  assert.deepEqual(r.locked, []);
  assert.equal(r.writes.length, 3);
  assert.deepEqual(r.deletes, [`documents/${hash}.json`]);
  const by = Object.fromEntries(r.writes.map((w) => [w.path.split('/')[0], w]));
  assert.equal(by.profile.json.keep, 'me');
  assert.equal(by.profile.json.enc.kid, acc.kid);
  const fresh = createSecretBox(keeperOf(''));
  await fresh.adoptAccountKey(acc.key);
  assert.deepEqual(await fresh.open(by.profile.json.enc, { id: 'profile', format: 1 }), { fullName: 'A' });
  const payload = await fresh.open(by.certifications.json.enc, cert);
  assert.equal(payload.number, '7');
  const newHash = payload.documents[0].hash;
  assert.notEqual(newHash, hash);
  assert.equal(by.documents.path, `documents/${newHash}.json`);
  assert.equal(await sha(by.documents.json.enc.ct), newHash);
  assert.deepEqual(await fresh.openBytes(by.documents.json.enc, cert), bytes);
  const again = await resealFiles(r.writes.concat(files.slice(3)), box);
  assert.equal(again.writes.length, 0);
  const stranger = createSecretBox(keeperOf(randKey()));
  const lockedFile = { path: 'profile/diver.json', json: { enc: await stranger.seal({}, { id: 'profile', format: 1 }) } };
  assert.deepEqual((await resealFiles([lockedFile], box)).locked, ['profile/diver.json']);
});

test('start over: new key, sealed paths to delete', async () => {
  const r = await startOver(['profile/diver.json', 'certifications/a.json', 'documents/ab.json', 'keys/recovery.json', 'keys/pairing/x.json', 'keys/account.json', 'divers/y.json']);
  assert.deepEqual(r.deletes.sort(), ['certifications/a.json', 'documents/ab.json', 'keys/pairing/x.json', 'keys/recovery.json']);
  assert.deepEqual(r.stripEnc, ['profile/diver.json']);
  assert.equal(r.account.path, 'keys/account.json');
  assert.equal(r.account.json.kid, r.key.kid);
});
