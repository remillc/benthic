import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import {
  newAccountKey, createAccessRequest, readAccessRequest, approveAccessRequest, acceptApproval, verificationCode, fromBase64Url,
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

const device = { deviceName: 'Tablette Android', platform: 'android' };

test('pairing by approval: request, approve, accept with two independent devices; the codes are equal', async () => {
  const acc = await newAccountKey();
  const t = 1_000_000;
  const req = await createAccessRequest(device, { now: () => t });
  assert.match(req.code, /^\d{6}$/);
  assert.equal(req.file.path, `keys/requests/${req.id}.json`);
  assert.equal(req.answerPath, `keys/pairing/${req.id}.json`);
  assert.equal(req.file.json.expiresAt, t + PAIRING_TTL_MS);
  assert.equal(req.file.json.deviceName, 'Tablette Android');
  // The paired device only has the file as the server hands it over.
  const seen = await readAccessRequest(JSON.parse(JSON.stringify(req.file.json)), { now: () => t + 1000 });
  assert.equal(seen.code, req.code, 'same 6 digits on both sides');
  assert.equal(seen.deviceName, 'Tablette Android');
  assert.equal(seen.expired, false);
  const ans = await approveAccessRequest(req.file.json, acc, { now: () => t + 2000 });
  assert.equal(ans.file.path, req.answerPath);
  assert.deepEqual(ans.deletes, [req.file.path]);
  assert.equal(ans.file.json.mode, 'e');
  const got = await acceptApproval({ id: req.id, privateKey: req.privateKey }, JSON.parse(JSON.stringify(ans.file.json)), { now: () => t + 3000 });
  assert.deepEqual(got, acc);
  // The file never holds the account key in clear.
  assert.ok(!JSON.stringify(ans.file.json).includes(acc.key));
});

test('the code authenticates the new device: a swapped public key, name or id gives a different code', async () => {
  const t = 5_000;
  const a = await createAccessRequest(device, { now: () => t });
  const b = await createAccessRequest(device, { now: () => t });
  const swapped = { ...a.file.json, pub: b.file.json.pub };
  assert.notEqual((await readAccessRequest(swapped, { now: () => t })).code, a.code);
  const renamed = { ...a.file.json, deviceName: 'Ordinateur Windows' };
  assert.notEqual((await readAccessRequest(renamed, { now: () => t })).code, a.code);
  const other = await verificationCode(b.id, device.deviceName, fromBase64Url(a.file.json.pub));
  assert.notEqual(other, a.code);
  // Stable and zero padded.
  assert.equal(await verificationCode(a.id, device.deviceName, fromBase64Url(a.file.json.pub)), a.code);
});

test('a key swapped by the server cannot read the answer meant for the real device', async () => {
  const acc = await newAccountKey();
  const real = await createAccessRequest(device);
  const attacker = await createAccessRequest(device);
  // The server hands the paired device the attacker's key under the real id.
  const forged = { ...real.file.json, pub: attacker.file.json.pub };
  const ans = await approveAccessRequest(forged, acc);
  await rejects(acceptApproval({ id: real.id, privateKey: real.privateKey }, ans.file.json), 'PAIRING_WRONG_KEY');
  assert.deepEqual(await acceptApproval({ id: real.id, privateKey: attacker.privateKey }, ans.file.json), acc, 'only the key in the file can read it');
});

test('requests and answers: expiry, wrong key, other id, tampered expiry, bad files', async () => {
  const acc = await newAccountKey();
  const t = 9_000;
  const req = await createAccessRequest(device, { now: () => t });
  assert.equal((await readAccessRequest(req.file.json, { now: () => t + PAIRING_TTL_MS + 1 })).expired, true);
  await rejects(approveAccessRequest(req.file.json, acc, { now: () => t + PAIRING_TTL_MS + 1 }), 'PAIRING_EXPIRED');
  await rejects(readAccessRequest({ ...req.file.json, expiresAt: t + 10 * PAIRING_TTL_MS }), 'PAIRING_REQUEST_INVALID');
  await rejects(readAccessRequest({ ...req.file.json, pub: 'AAAA' }), 'PAIRING_REQUEST_INVALID');
  await rejects(readAccessRequest({ format: 1 }), 'PAIRING_REQUEST_INVALID');
  await rejects(readAccessRequest(null), 'PAIRING_REQUEST_INVALID');
  const ans = await approveAccessRequest(req.file.json, acc, { now: () => t });
  const other = await createAccessRequest(device);
  await rejects(acceptApproval({ id: req.id, privateKey: other.privateKey }, ans.file.json, { now: () => t }), 'PAIRING_WRONG_KEY');
  await rejects(acceptApproval({ id: req.id, privateKey: req.privateKey }, ans.file.json, { now: () => t + PAIRING_TTL_MS + 1 }), 'PAIRING_EXPIRED');
  await rejects(acceptApproval({ id: other.id, privateKey: req.privateKey }, ans.file.json, { now: () => t }), 'PAIRING_ID_MISMATCH');
  await rejects(acceptApproval({ id: req.id, privateKey: req.privateKey }, { ...ans.file.json, expiresAt: ans.file.json.expiresAt + 1e6 }, { now: () => t }), 'PAIRING_WRONG_KEY');
  await rejects(acceptApproval({ id: req.id, privateKey: req.privateKey }, { format: 1 }), 'PAIRING_FILE_INVALID');
  assert.equal(isPairingExpired(ans.file.json, { now: () => t + PAIRING_TTL_MS + 1 }), true);
  assert.equal(isPairingExpired(req.file.json, { now: () => t }), false);
});

test('the key module no longer has a QR or camera pairing', async () => {
  const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../app/src/lib/account-keys.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /benthic-pair:|PAYLOAD_PREFIX|createPairing\b|parsePairingPayload|qrScan/);
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
