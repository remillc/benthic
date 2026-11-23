// A second device that has data of its own, its own key and no working copy of the account branch (inbox to-do 164, Christian's
// first real-device run): pairing with the camera reads the pairing file after cloning the working copy, holds the key, seals
// the local items with it, deletes the file, and applies no join; the join comes after. Also: the order of the screens while
// the key is missing, the locked reads that never throw, and a scanner closed without a code. Real git (tests/app/fake-bgit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BenthicCore } from 'benthic-core';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { createPairing } from '../../app/src/lib/account-keys.js';
import { pairWithCode } from '../../app/src/lib/account-pairing.js';
import { dueScreen } from '../../app/src/lib/account-sync-screens.js';
import { scanPairingCode } from '../../app/src/lib/pair-scan.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
const now = () => new Date((tick += 1000));

/** A device with its own key; `writes` records what reaches its secure storage. */
function device(remote, name, byte) {
  const key = toBase64(new Uint8Array(32).fill(byte));
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const writes = [];
  let held = key;
  const box = createSecretBox({ read: async () => held, write: async (k) => (writes.push(k), (held = k)), hadKey: async () => true });
  return { core, store, box, writes, profile: createProfile(store, box, { now }), sync: createAccountSync({ core, store, box, now }) };
}

/** The tablet holds the account key; the phone has data of its own and has never cloned the account branch. */
async function setup() {
  const remote = new FakeRemote();
  const tablet = device(remote, 'tablet', 7);
  const phone = device(remote, 'phone', 9);
  await tablet.profile.saveInfo({ ...emptyInfo(), fullName: 'Tablet Diver' });
  assert.equal((await tablet.sync.run()).status, 'synced');
  const account = { key: toBase64(new Uint8Array(32).fill(7)), kid: await tablet.box.deviceKid() };
  // The phone's own data: a profile with a birth date still in clear (the case that threw on the real phone).
  await phone.profile.saveInfo({ ...emptyInfo(), fullName: 'Phone Diver' });
  await phone.store.write('profile/diver.json', { ...(await phone.store.read('profile/diver.json')), dateOfBirth: '1980-02-03' });
  return { remote, tablet, phone, account };
}

const dispose = (...ds) => ds.forEach((d) => d.core.dispose());
const phoneDeps = (phone, more = {}) => ({ store: phone.store, box: phone.box, fetchKeys: () => phone.sync.fetchKeys(), commitKeyFiles: (c) => phone.sync.commitKeyFiles(c), sleep: async () => {}, ...more });

test('pairing with the camera on a device without a working copy clones it, holds the key and offers the join afterwards', async () => {
  const { remote, tablet, phone, account } = await setup();
  try {
    await assert.rejects(phone.sync.readKeys(), /NO_WORKING_COPY/, 'the case of the real phone');
    const pairing = await createPairing(account);
    await tablet.sync.commitKeyFiles({ writes: [pairing.file], message: 'Benthic: pairing' });
    assert.ok(remote.files()[pairing.file.path]);

    const held = await pairWithCode(pairing.payload, phoneDeps(phone));
    assert.equal(held.kid, account.kid);
    assert.equal(phone.box.getAccountKid(), account.kid);
    assert.deepEqual(phone.writes, [account.key], 'the account key became the device key');
    assert.equal((await phone.store.read('profile/diver.json')).enc.kid, account.kid, 'the local profile is sealed with the account key');
    assert.equal((await phone.profile.readInfo()).fullName, 'Phone Diver');
    assert.equal(remote.files()[pairing.file.path], undefined, 'the pairing file is deleted on the server');
    assert.equal(await phone.store.read('meta/sync.json'), null, 'no join and no sync was applied by the pairing');
    assert.equal(JSON.parse(remote.files()['profile/diver.json']).enc.kid, account.kid, 'the account data is untouched');
    assert.equal((await tablet.profile.readInfo()).fullName, 'Tablet Diver');

    // Only now is the join due: the key is held, the data is on both sides.
    const next = await phone.sync.run();
    assert.equal(next.status, 'joinNeeded');
    assert.equal(next.keyMissing, false);
  } finally {
    dispose(tablet, phone);
    remote.dispose();
  }
});

test('a pairing file that never comes ends as an expired pairing, not as a missing working copy', async () => {
  const { remote, tablet, phone, account } = await setup();
  try {
    const stray = await createPairing(account);
    await assert.rejects(pairWithCode(stray.payload, phoneDeps(phone, { attempts: 2 })), /PAIRING_EXPIRED/);
    assert.equal(phone.writes.length, 0, 'no key was taken');
  } finally {
    dispose(tablet, phone);
    remote.dispose();
  }
});

test('the key comes before the join: while it is missing the unlock is due, never the join; later holds for the run', () => {
  const state = { status: 'idle', differentAccount: false, keyMissing: true, joinNeeded: true, pullOnly: false };
  const fresh = { different: true, unlock: true, join: true, recovery: true };
  assert.equal(dueScreen(state, fresh), 'unlock');
  assert.equal(dueScreen(state, { ...fresh, unlock: false }), '', 'closed with later: the join is not offered instead');
  assert.equal(dueScreen({ ...state, status: 'error' }, fresh), '');
  assert.equal(dueScreen({ ...state, keyMissing: false }, fresh), 'join', 'the key is held: the join');
  assert.equal(dueScreen({ ...state, keyMissing: false }, { ...fresh, join: false }), '');
  assert.equal(dueScreen({ ...state, differentAccount: true }, fresh), 'different');
  assert.equal(dueScreen({ ...state, keyMissing: false, joinNeeded: false, status: 'synced' }, fresh), 'recovery');
});

test('a restart on the second device: the run reports the key missing with the join, and the first screen is the unlock', async () => {
  const { remote, tablet, phone } = await setup();
  try {
    const result = await phone.sync.run();
    assert.equal(result.status, 'joinNeeded');
    assert.equal(result.keyMissing, true);
    const state = { status: 'idle', differentAccount: false, keyMissing: result.keyMissing, joinNeeded: true, pullOnly: false };
    assert.equal(dueScreen(state, { different: true, unlock: true, join: true, recovery: true }), 'unlock');
    assert.equal(phone.writes.length, 0);
  } finally {
    dispose(tablet, phone);
    remote.dispose();
  }
});

test('locked reads give the locked state and never throw: the profile, the certifications, the sealing before the sync', async () => {
  const { remote, tablet, phone } = await setup();
  try {
    await phone.sync.run(); // joinNeeded: the account's key id is now known to the box
    assert.notEqual(phone.box.getAccountKid(), await phone.box.deviceKid());
    const info = await phone.profile.readInfo();
    assert.equal(info.dateOfBirth, '1980-02-03', 'the date in clear stays readable as it is');
    assert.deepEqual(await phone.profile.listCertifications(), []);
    await phone.profile.migrateBirthDate(); // the call made before the sync: it skips
    assert.equal(Object.hasOwn(await phone.store.read('profile/diver.json'), 'dateOfBirth'), true, 'nothing was sealed under a key this device does not hold');
    // A real write is still refused.
    await assert.rejects(phone.profile.saveInfo({ ...emptyInfo(), fullName: 'x' }), /MISSING_DATA_KEY/);
  } finally {
    dispose(tablet, phone);
    remote.dispose();
  }
});

test('a scanner closed without a code says nothing; a camera failure still does', async () => {
  try {
    BenthicCore.qrScan = async () => ({ action: 'cancelled' });
    assert.equal(await scanPairingCode('new-device'), null);
    BenthicCore.qrScan = async () => {
      throw Object.assign(new Error('Activity result cancelled'), { code: 'CANCELLED' });
    };
    assert.equal(await scanPairingCode('new-device'), null, 'the app restarted under the scanner');
    BenthicCore.qrScan = async () => {
      throw new Error('camera busy');
    };
    await assert.rejects(scanPairingCode('new-device'), /camera busy/);
    BenthicCore.qrScan = async () => ({ action: 'done', codes: ['BC1:k:x:y'] });
    assert.equal(await scanPairingCode('new-device'), 'BC1:k:x:y');
  } finally {
    delete BenthicCore.qrScan;
  }
});

test('a pairing file that cannot be deleted does not turn a held key into a failure', async () => {
  const { remote, tablet, phone, account } = await setup();
  try {
    const pairing = await createPairing(account);
    await tablet.sync.commitKeyFiles({ writes: [pairing.file], message: 'Benthic: pairing' });
    const held = await pairWithCode(pairing.payload, phoneDeps(phone, { commitKeyFiles: async () => { throw new Error('UNREACHABLE'); } }));
    assert.equal(held.kid, account.kid);
    assert.equal(phone.box.getAccountKid(), account.kid);
    assert.deepEqual(phone.writes, [account.key], 'the key is the device key');
    assert.ok(remote.files()[pairing.file.path], 'the file stays and expires by itself');
  } finally {
    dispose(tablet, phone);
    remote.dispose();
  }
});

test('after the pairing the confirmation comes first, then the join when the sync finds data on both sides', async () => {
  const { remote, tablet, phone, account } = await setup();
  try {
    const pairing = await createPairing(account);
    await tablet.sync.commitKeyFiles({ writes: [pairing.file], message: 'Benthic: pairing' });
    await pairWithCode(pairing.payload, phoneDeps(phone));
    const run = await phone.sync.run();
    assert.equal(run.status, 'joinNeeded');
    const state = { status: 'idle', differentAccount: false, keyMissing: false, joinNeeded: true, pullOnly: false };
    assert.equal(dueScreen(state, { different: true, unlock: false, join: true, recovery: true }), 'join');
    assert.equal(await phone.store.read('meta/sync.json'), null, 'nothing was joined or pushed without the summary');
    assert.equal(remote.files()['profile/diver.json'] && JSON.parse(remote.files()['profile/diver.json']).enc.kid, account.kid);
  } finally {
    dispose(tablet, phone);
    remote.dispose();
  }
});
