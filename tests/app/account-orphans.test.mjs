// Items sealed under a key that is lost for good (Christian's tablet, 23 November 2026): the tablet holds the account key, but its
// certifications and the profile's `enc` block were sealed with the key of an older app install (`org.opendives.app`, the
// Android Keystore wiped). Pairing cannot help. The engine reports them as `orphaned`; « Effacer » removes the certifications,
// strips the unreadable `enc` from the profile (the clear fields stay and the clear date of birth is sealed again with the
// account key), and the clean-up removes the documents no certification references, here and on the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { dueScreen } from '../../app/src/lib/account-sync-screens.js';
import { deviceKind } from '../../app/src/lib/device-name.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 23, 9, 0, 0);
const now = () => new Date((tick += 1000));
const key = (byte) => toBase64(new Uint8Array(32).fill(byte));

/**
 * The tablet before and after the loss: the same store and git copy, a keeper whose key changes from the old install's key (3)
 * to the one the new install made (7), which then is the account's key.
 */
function tablet(remote) {
  const core = new FakeBgit({ remote, name: 'tablet' });
  const store = createFileStore(memoryBackend());
  let held = key(3);
  const keeper = { read: async () => held, write: async (k) => (held = k), hadKey: async () => true };
  const build = () => {
    const box = createSecretBox(keeper);
    const profile = createProfile(store, box, { now });
    return { box, profile, sync: createAccountSync({ core, store, box, now, sealClear: () => profile.migrateBirthDate() }) };
  };
  return { core, store, build, wipe: () => (held = key(7)) };
}

/** The old install seals a profile and a certification with a card photo; then its key is lost; the tablet pairs/starts with key 7. */
async function lost() {
  const remote = new FakeRemote();
  const t = tablet(remote);
  const before = t.build();
  await before.profile.saveInfo({ ...emptyInfo(), fullName: 'Tablet Diver', bloodGroup: 'A+' });
  const cert = await before.profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '1', photos: { front: new Uint8Array([1, 2, 3]) } });
  const documents = (await t.store.list('documents/')).slice();
  assert.equal(documents.length, 1);
  // The legacy clear date of birth the profile showed on the tablet.
  await t.store.write('profile/diver.json', { ...(await t.store.read('profile/diver.json')), dateOfBirth: '1975-04-09' });
  t.wipe();
  return { remote, t, cert, documents, after: t.build() };
}

test('the tablet: the lost-key items are reported as orphaned, never sent, and nothing else is lost', async () => {
  const { remote, t, cert, documents, after } = await lost();
  try {
    const run = await after.sync.run();
    assert.equal(run.status, 'synced');
    assert.equal(run.keyMissing, false, 'the tablet holds the account key');
    assert.deepEqual([...run.orphaned].sort(), ['certifications/' + cert.id + '.json', 'profile/diver.json'].sort());
    assert.equal(remote.files()['profile/diver.json'], undefined, 'the unreadable profile is not sent');
    assert.equal(remote.files()['certifications/' + cert.id + '.json'], undefined);
    assert.ok(remote.files()[documents[0]], 'the card photo document was pushed (it is not a sealed-folder file)');
    assert.deepEqual(await after.profile.listCertifications(), [], 'the list shows empty, as on the tablet');
    // The document stays while a certification that may reference it exists: no guessing when a card cannot be opened.
    assert.ok(await t.store.read(documents[0]));
    // The dialog is due once the run is synced; later it is not asked again in the same run of the app.
    const state = { status: 'synced', differentAccount: false, keyMissing: false, joinNeeded: false, pullOnly: false, orphaned: run.orphaned };
    assert.equal(dueScreen(state, { different: true, unlock: true, join: true, recovery: true, orphans: true }), 'orphans');
    assert.equal(dueScreen(state, { different: true, unlock: true, join: true, recovery: true, orphans: false }), 'recovery');
    assert.equal(dueScreen({ ...state, pullOnly: true }, { different: true, unlock: true, join: true, recovery: false, orphans: true }), '');
  } finally {
    t.core.dispose();
    remote.dispose();
  }
});

test('« Effacer »: certifications removed, profile enc stripped with the clear fields kept, the date of birth sealed again, the orphan documents gone from the device and the server', async () => {
  const { remote, t, cert, documents, after } = await lost();
  try {
    await after.sync.run();
    assert.equal(await after.sync.eraseOrphans(), 2);
    assert.equal(await t.store.read('certifications/' + cert.id + '.json'), null);
    const stripped = await t.store.read('profile/diver.json');
    assert.equal(stripped.enc, undefined, 'the unreadable block is gone');
    assert.equal(stripped.dateOfBirth, '1975-04-09', 'every clear field is kept');

    const run = await after.sync.run();
    assert.equal(run.status, 'synced');
    assert.deepEqual(run.orphaned, []);
    const profile = JSON.parse(remote.files()['profile/diver.json']);
    assert.equal(profile.enc.kid, after.box.getAccountKid(), 'the profile is sent, sealed with the account key');
    assert.equal(Object.hasOwn(profile, 'dateOfBirth'), false, 'the clear date went into the sealed block');
    assert.equal((await after.profile.readInfo()).dateOfBirth, '1975-04-09');
    assert.equal(remote.files()['certifications/' + cert.id + '.json'], undefined);
    assert.equal(remote.files()[documents[0]], undefined, 'the orphan document is deleted on the server');
    assert.equal(await t.store.read(documents[0]), null, 'and on the device');
    // A diver can write again.
    await after.profile.saveInfo({ ...emptyInfo(), fullName: 'Tablet Diver' });
    assert.equal((await after.sync.run()).status, 'synced');
  } finally {
    t.core.dispose();
    remote.dispose();
  }
});

test('documents that a readable certification references are kept; with a certification that cannot be opened nothing is dropped', async () => {
  const remote = new FakeRemote();
  const t = tablet(remote);
  try {
    const dev = t.build();
    const cert = await dev.profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '1', photos: { front: new Uint8Array([4, 5, 6]) } });
    const stray = { format: 1, enc: { v: 1, kid: 'x', nonce: 'AAAA', ct: 'AAAA' } };
    await t.store.trackedBatch({ writes: [['documents/' + 'ab'.repeat(32) + '.json', stray]] });
    // The account key is this device's key (3 here): everything opens.
    // A document waiting to be sent is never dropped: the first run sends it, the next one finds nobody references it.
    await dev.sync.run();
    const run = await dev.sync.run();
    assert.equal(run.status, 'synced');
    assert.deepEqual(run.orphaned, []);
    await dev.sync.run();
    assert.equal(remote.files()['documents/' + 'ab'.repeat(32) + '.json'], undefined, 'the unreferenced document is removed');
    const mine = (await dev.profile.listCertifications()).find((c) => c.id === cert.id);
    assert.equal(mine?.documents.length, 1);
    assert.ok(remote.files()[`documents/${mine.documents[0].hash}.json`], 'the referenced one stays');
  } finally {
    t.core.dispose();
    remote.dispose();
  }
});

test('a device that does not hold the account key reports no orphan (pairing can still help) and drops nothing', async () => {
  const remote = new FakeRemote();
  const a = tablet(remote);
  try {
    const first = a.build();
    await first.profile.saveInfo({ ...emptyInfo(), fullName: 'Diver' });
    await first.profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '1', photos: { front: new Uint8Array([7, 7]) } });
    assert.equal((await first.sync.run()).status, 'synced');
    // Another device: its own key, the account's key missing.
    const other = new FakeBgit({ remote, name: 'other' });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox({ read: async () => key(9), write: async () => {}, hadKey: async () => true });
    const sync = createAccountSync({ core: other, store, box, now });
    const run = await sync.run();
    assert.equal(run.keyMissing, true);
    assert.deepEqual(run.orphaned ?? [], []);
    assert.equal((await store.list('documents/')).length, 1, 'the document received stays');
    other.dispose();
  } finally {
    a.core.dispose();
    remote.dispose();
  }
});

test('the default name of a device', () => {
  assert.equal(deviceKind({ ua: 'Mozilla/5.0 (Linux; Android 14; K) Chrome/120', shortSide: 411 }), 'androidPhone');
  assert.equal(deviceKind({ ua: 'Mozilla/5.0 (Linux; Android 14; K) Chrome/120', shortSide: 800 }), 'androidTablet');
  assert.equal(deviceKind({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), 'iphone');
  assert.equal(deviceKind({ ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }), 'ipad');
  assert.equal(deviceKind({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touchPoints: 5 }), 'ipad');
  assert.equal(deviceKind({ desktopPlatform: 'win32' }), 'windows');
  assert.equal(deviceKind({ desktopPlatform: 'darwin' }), 'mac');
  assert.equal(deviceKind({ desktopPlatform: 'linux' }), 'linux');
  assert.equal(deviceKind({}), 'unknown');
});
