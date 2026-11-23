// A second device that has data of its own, its own key and no working copy of the account branch (inbox to-do 164, Christian's
// first real-device run), paired by approval (to-do 183): the new device asks (`keys/requests/<id>.json`, with a 6-digit code),
// the paired device approves (`keys/pairing/<id>.json`), the new device holds the key, seals the local items with it, deletes the
// answer, and applies no join; the join comes after. Also: decline, expiry, the clean-up of old requests, the order of the screens
// while the key is missing, the locked reads that never throw, and that no data and no camera is touched before the key.
// Real git (tests/app/fake-bgit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { createAccessRequest } from '../../app/src/lib/account-keys.js';
import { approveRequest, cancelRequest, checkAnswer, clearAnswer, declineRequest, finishPairing, pairedDevices, pendingRequests, requestAccess, touchDeviceRecord } from '../../app/src/lib/account-pairing.js';
import { dueScreen } from '../../app/src/lib/account-sync-screens.js';
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
/** What the pairing steps need of a device: the keys-only doors of its engine. */
const doors = (d, more = {}) => ({ store: d.store, box: d.box, fetchKeys: () => d.sync.fetchKeys(), commitKeyFiles: (c) => d.sync.commitKeyFiles({ ...c, keysOnly: true }), ...more });
const phone = { deviceName: 'Téléphone Android', platform: 'android' };

test('approval on a device without a working copy: it clones, asks, is approved, holds the key and offers the join afterwards', async () => {
  const { remote, tablet, phone: p, account } = await setup();
  try {
    await assert.rejects(p.sync.readKeys(), /NO_WORKING_COPY/, 'the case of the real phone');
    const request = await requestAccess(phone, doors(p));
    assert.match(request.code, /^\d{6}$/);
    assert.ok(remote.files()[request.path], 'the request is on the server');
    assert.equal(await p.store.read('meta/sync.json'), null, 'asking joins nothing');
    assert.equal((await checkAnswer(request, doors(p))).state, 'waiting');

    // The tablet finds the request, with the very same code.
    const keys = await tablet.sync.fetchKeys();
    const [seen] = await pendingRequests(keys);
    assert.equal(seen.code, request.code, 'the diver compares these two');
    assert.equal(seen.deviceName, 'Téléphone Android');
    await approveRequest(seen.id, account, doors(tablet));
    assert.equal(remote.files()[request.path], undefined, 'the request is deleted');
    assert.ok(remote.files()[request.answerPath], 'the answer is on the server');
    assert.equal(JSON.stringify(remote.files()[request.answerPath]).includes(account.key), false, 'never the key in clear');

    const answer = await checkAnswer(request, doors(p));
    assert.equal(answer.state, 'answer');
    const held = await finishPairing(request, answer.json, doors(p));
    assert.equal(held.kid, account.kid);
    assert.equal(p.box.getAccountKid(), account.kid);
    assert.deepEqual(p.writes, [account.key], 'the account key became the device key');
    assert.equal((await p.store.read('profile/diver.json')).enc.kid, account.kid, 'the local profile is sealed with the account key');
    assert.equal((await p.profile.readInfo()).fullName, 'Phone Diver');
    assert.equal(remote.files()[request.answerPath], undefined, 'the answer is deleted on the server');
    assert.equal(await p.store.read('meta/sync.json'), null, 'no join and no sync was applied by the pairing');
    assert.equal(JSON.parse(remote.files()['profile/diver.json']).enc.kid, account.kid, 'the account data is untouched');
    assert.equal((await tablet.profile.readInfo()).fullName, 'Tablet Diver');

    // Only now is the join due: the key is held, the data is on both sides.
    const next = await p.sync.run();
    assert.equal(next.status, 'joinNeeded');
    assert.equal(next.keyMissing, false);
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('declining deletes the request and leaves a marker with the name of the refusing device; the new device is told who refused', async () => {
  const { remote, tablet, phone: p } = await setup();
  try {
    const request = await requestAccess(phone, doors(p));
    const [seen] = await pendingRequests(await tablet.sync.fetchKeys());
    await declineRequest(seen.id, 'Tablette Android', doors(tablet));
    assert.equal(remote.files()[request.path], undefined, 'the request is deleted');
    const marker = JSON.parse(remote.files()[request.answerPath]);
    assert.deepEqual([marker.mode, marker.by], ['declined', 'Tablette Android']);
    assert.equal(JSON.stringify(marker).includes('"ct"'), false, 'no secret in the marker');
    const answer = await checkAnswer(request, doors(p));
    assert.deepEqual([answer.state, answer.by], ['declined', 'Tablette Android']);
    await clearAnswer(request, doors(p));
    assert.equal(remote.files()[request.answerPath], undefined, 'the new device deletes the marker');
    assert.deepEqual(p.writes, [], 'no key was taken');
    // A request already gone is nothing to refuse.
    await declineRequest(seen.id, 'Tablette Android', doors(tablet));
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('the paired devices list: a paired device writes its record at most every 6 hours; the new device reads names and last seen', async () => {
  const { remote, tablet, phone: p } = await setup();
  try {
    let clock = Date.UTC(2026, 10, 23, 12);
    const touch = () => touchDeviceRecord({ store: tablet.store, name: 'Tablette Android', platform: 'android', now: () => clock, commitKeyFiles: doors(tablet).commitKeyFiles });
    assert.equal(await touch(), true);
    assert.equal(await touch(), false, 'not again within 6 hours');
    clock += 7 * 3600 * 1000;
    assert.equal(await touch(), true);
    const id = (await tablet.store.read('meta/device.json')).id;
    // The new device lists it before asking.
    const request = await requestAccess(phone, doors(p));
    assert.deepEqual(request.devices.map((d) => [d.id, d.name]), [[id, 'Tablette Android']]);
    const keys = await p.sync.fetchKeys();
    assert.deepEqual(pairedDevices(keys, { exceptId: id, now: () => clock }), [], 'a device does not list itself');
    assert.equal(pairedDevices(keys, { now: () => clock + 200 * 24 * 3600 * 1000 }).length, 0, 'not seen for six months: left out');
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('a request nobody answers ends as expired; an approval after the time is refused', async () => {
  const { remote, tablet, phone: p, account } = await setup();
  try {
    let clock = Date.now();
    const request = await requestAccess(phone, doors(p, { now: () => clock }));
    clock += 11 * 60 * 1000;
    assert.equal((await checkAnswer(request, doors(p, { now: () => clock }))).state, 'expired');
    assert.deepEqual(await pendingRequests(await tablet.sync.fetchKeys(), { now: () => clock }), [], 'an expired request is not offered');
    await assert.rejects(approveRequest(request.id, account, doors(tablet, { now: () => clock })), /PAIRING_EXPIRED/);
    assert.deepEqual(p.writes, []);
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('the clean-up deletes expired requests and answers, and keeps the valid ones', async () => {
  const { remote, tablet, account } = await setup();
  try {
    const stale = await createAccessRequest(phone, { now: () => now().getTime() - 3_600_000 });
    const fresh = await createAccessRequest(phone, { now: () => now().getTime() });
    await tablet.sync.commitKeyFiles({ writes: [stale.file, fresh.file], message: 'Benthic: test' });
    const left = Object.keys(remote.files()).filter((f) => f.startsWith('keys/requests/'));
    assert.deepEqual(left, [fresh.file.path]);
    assert.ok(account);
  } finally {
    dispose(tablet);
    remote.dispose();
  }
});

test('cancelling removes the request', async () => {
  const { remote, tablet, phone: p } = await setup();
  try {
    const request = await requestAccess(phone, doors(p));
    await cancelRequest(request, doors(p));
    assert.equal(remote.files()[request.path], undefined);
    assert.deepEqual(await pendingRequests(await tablet.sync.fetchKeys()), []);
  } finally {
    dispose(tablet, p);
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
  const { remote, tablet, phone: p } = await setup();
  try {
    const result = await p.sync.run();
    assert.equal(result.status, 'joinNeeded');
    assert.equal(result.keyMissing, true);
    const state = { status: 'idle', differentAccount: false, keyMissing: result.keyMissing, joinNeeded: true, pullOnly: false };
    assert.equal(dueScreen(state, { different: true, unlock: true, join: true, recovery: true }), 'unlock');
    assert.equal(p.writes.length, 0);
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('locked reads give the locked state and never throw: the profile, the certifications, the sealing before the sync', async () => {
  const { remote, tablet, phone: p } = await setup();
  try {
    await p.sync.run(); // joinNeeded: the account's key id is now known to the box
    assert.notEqual(p.box.getAccountKid(), await p.box.deviceKid());
    const info = await p.profile.readInfo();
    assert.equal(info.dateOfBirth, '1980-02-03', 'the date in clear stays readable as it is');
    assert.deepEqual(await p.profile.listCertifications(), []);
    await p.profile.migrateBirthDate(); // the call made before the sync: it skips
    assert.equal(Object.hasOwn(await p.store.read('profile/diver.json'), 'dateOfBirth'), true, 'nothing was sealed under a key this device does not hold');
    // A real write is still refused.
    await assert.rejects(p.profile.saveInfo({ ...emptyInfo(), fullName: 'x' }), /MISSING_DATA_KEY/);
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('after the pairing the confirmation comes first, then the join when the sync finds data on both sides', async () => {
  const { remote, tablet, phone: p, account } = await setup();
  try {
    const request = await requestAccess(phone, doors(p));
    const [seen] = await pendingRequests(await tablet.sync.fetchKeys());
    await approveRequest(seen.id, account, doors(tablet));
    await finishPairing(request, (await checkAnswer(request, doors(p))).json, doors(p));
    const run = await p.sync.run();
    assert.equal(run.status, 'joinNeeded');
    const state = { status: 'idle', differentAccount: false, keyMissing: false, joinNeeded: true, pullOnly: false };
    assert.equal(dueScreen(state, { different: true, unlock: false, join: true, recovery: true }), 'join');
    assert.equal(await p.store.read('meta/sync.json'), null, 'nothing was joined or pushed without the summary');
    assert.equal(remote.files()['profile/diver.json'] && JSON.parse(remote.files()['profile/diver.json']).enc.kid, account.kid);
  } finally {
    dispose(tablet, p);
    remote.dispose();
  }
});

test('the pairing code never reaches a camera or a QR', () => {
  for (const file of ['lib/account-pairing.js', 'lib/account-sync-flows.svelte.js', 'components/AccountSyncHost.svelte']) {
    assert.doesNotMatch(readFileSync(new URL(`../../app/src/${file}`, import.meta.url), 'utf8'), /qrScan|scanPairingCode|pair-scan|qrPath|PairShowCode/, file);
  }
});
