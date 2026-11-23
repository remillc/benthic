// « Mon profil de plongeur »: the encryption round trip, the information, the phone number formats,
// the certification cards, the text parser of a scanned card, and the card-image module (perspective warp, corner
// detection, glare) that the desktop uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile, UNKNOWN_BLOOD, BLOOD_GROUPS, emptyInfo, levelSuggestions, infoProblems, certificationProblems } from '../../app/src/lib/profile.js';
import { createServerApi } from '../../app/src/lib/server-api.js';
import { formatNational, formatInternational, nationalDigits, isCompletePhone } from '../../app/src/lib/phone-format.js';
import { parseCardText, findDate, scanCard } from '../../app/src/lib/card-scan.js';
import { blank, warpPerspective, detectCard, removeGlare, orderCorners, homography, cardSize } from '../../app/src/lib/card-image.js';
import { createInventory, ReadOnlyError } from '../../app/src/lib/inventory.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function setup() {
  const backend = memoryBackend();
  const store = createFileStore(backend);
  let key = '';
  const keeper = { read: async () => key, write: async (k) => (key = k) };
  const box = createSecretBox(keeper);
  let n = 0;
  const profile = createProfile(store, box, { id: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` });
  return { backend, store, box, profile, keeper, key: () => key };
}

// ---- Encryption ----

test('the secret box: a round trip, a fresh nonce each time, the key made once and kept', async () => {
  const { box, key, keeper } = setup();
  const item = { id: 'abc', format: 1 };
  const a = await box.seal({ bloodGroup: 'O+', name: 'Marc' }, item);
  const b = await box.seal({ bloodGroup: 'O+', name: 'Marc' }, item);
  assert.equal(a.alg, 'A256GCM');
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.ct, b.ct);
  assert.deepEqual(await box.open(a, item), { bloodGroup: 'O+', name: 'Marc' });
  assert.equal(Buffer.from(key(), 'base64').length, 32);
  assert.ok(!Buffer.from(a.ct, 'base64').toString('utf8').includes('O+'));
  // A second box over the same keeper opens the first one's block: the key is read, not remade.
  const again = createSecretBox(keeper);
  assert.deepEqual(await again.open(a, item), { bloodGroup: 'O+', name: 'Marc' });
});

test('the secret box refuses a block moved to another item, a changed block and another key', async () => {
  const { box } = setup();
  const block = await box.seal({ x: 1 }, { id: 'one', format: 1 });
  await assert.rejects(box.open(block, { id: 'two', format: 1 }));
  await assert.rejects(box.open(block, { id: 'one', format: 2 }));
  const bytes = Buffer.from(block.ct, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(box.open({ ...block, ct: bytes.toString('base64') }, { id: 'one', format: 1 }));
  const other = setup().box;
  await assert.rejects(other.open(block, { id: 'one', format: 1 }));
  assert.equal(toBase64(new Uint8Array([1, 2, 3])), 'AQID');
});

test('raw bytes (a card photo) round trip', async () => {
  const { box } = setup();
  const bytes = new Uint8Array([0xff, 0xd8, 0, 1, 2, 3, 250]);
  const block = await box.sealBytes(bytes, { id: 'c', format: 1 });
  assert.deepEqual([...(await box.openBytes(block, { id: 'c', format: 1 }))], [...bytes]);
});

test('opening encrypted data without a key never creates or replaces one', async () => {
  const { box } = setup();
  const block = await box.seal({ x: 1 }, { id: 'one', format: 1 });
  let writes = 0;
  const missing = createSecretBox({ read: async () => '', write: async () => { writes++; } });
  await assert.rejects(missing.open(block, { id: 'one', format: 1 }), /MISSING_DATA_KEY/);
  const invalid = createSecretBox({ read: async () => 'AQID', write: async () => { writes++; } });
  await assert.rejects(invalid.seal({}, { id: 'one', format: 1 }), /INVALID_DATA_KEY/);
  assert.equal(writes, 0);
});

test('an unreadable profile or certification cannot be overwritten or deleted', async () => {
  const original = setup();
  const info = emptyInfo();
  info.fullName = 'Test diver';
  await original.profile.saveInfo(info);
  const cert = await original.profile.saveCertification({ agency: 'PADI', level: 'Rescue Diver' });
  const diverFile = await original.store.read('profile/diver.json');
  const certFile = await original.store.read(`certifications/${cert.id}.json`);
  const foreignBox = createSecretBox({ read: async () => '', write: async () => {} });
  const foreign = createProfile(original.store, foreignBox);
  await assert.rejects(foreign.saveInfo(info), /MISSING_DATA_KEY/);
  await assert.rejects(foreign.deleteBloodGroup(), /MISSING_DATA_KEY/);
  await assert.rejects(foreign.saveCertification({ id: cert.id, agency: 'PADI', level: 'Rescue Diver' }), /MISSING_DATA_KEY/);
  await assert.rejects(foreign.deleteCertification(cert.id), /MISSING_DATA_KEY/);
  assert.deepEqual(await original.store.read('profile/diver.json'), diverFile);
  assert.deepEqual(await original.store.read(`certifications/${cert.id}.json`), certFile);
});

test('corrupt sensitive files cannot be overwritten or deleted', async () => {
  const { backend, profile } = setup();
  await backend.apply([['profile/diver.json', '{invalid'], ['certifications/bad.json', '{invalid']], []);
  await assert.rejects(profile.saveInfo(emptyInfo()));
  await assert.rejects(profile.deleteBloodGroup());
  await assert.rejects(profile.saveCertification({ id: 'bad', agency: 'PADI', level: 'Rescue Diver' }));
  await assert.rejects(profile.deleteCertification('bad'));
  assert.equal(await backend.get('profile/diver.json'), '{invalid');
  assert.equal(await backend.get('certifications/bad.json'), '{invalid');
});

test('concurrent profile and inventory writes both remain pending', async () => {
  const { store, profile } = setup();
  const inventory = createInventory(store);
  const [, gear] = await Promise.all([
    profile.saveInfo({ ...emptyInfo(), fullName: 'Test diver' }),
    inventory.saveGear({ name: 'Test gear', type: 'other' }),
  ]);
  assert.deepEqual((await store.read('meta/pending.json')).paths, [`gear/${gear.id}.json`, 'profile/diver.json']);
});

test('birth dates are sealed, can be removed, and are not present in the stored file', async () => {
  const { profile, backend, store, box } = setup();
  const info = { ...emptyInfo(), dateOfBirth: '1980-01-02' };
  await profile.saveInfo(info);
  const file = await store.read('profile/diver.json');
  assert.equal('dateOfBirth' in file, false);
  assert.equal(await profile.hasClearBirthDate(), false);
  assert.equal((await box.open(file.enc, { id: 'profile', format: 1 })).dateOfBirth, info.dateOfBirth);
  assert.doesNotMatch(await backend.get('profile/diver.json'), /1980-01-02/);
  assert.equal((await profile.readInfo()).dateOfBirth, info.dateOfBirth);
  await profile.saveInfo({ ...info, dateOfBirth: '' });
  assert.equal((await profile.readInfo()).dateOfBirth, '');
});

test('reading an old profile seals its birth date and keeps its other fields', async () => {
  const { profile, store, backend, box } = setup();
  const enc = await box.seal({ fullName: 'Diver', future: 'keep' }, { id: 'profile', format: 1 });
  await store.write('profile/diver.json', { format: 1, dateOfBirth: '1980-01-02', future: 'keep', enc });
  assert.equal((await profile.readInfo()).dateOfBirth, '1980-01-02');
  const file = await store.read('profile/diver.json');
  assert.equal(file.future, 'keep');
  assert.equal('dateOfBirth' in file, false);
  assert.deepEqual(await box.open(file.enc, { id: 'profile', format: 1 }), { fullName: 'Diver', future: 'keep', dateOfBirth: '1980-01-02' });
  assert.doesNotMatch(await backend.get('profile/diver.json'), /1980-01-02/);
  assert.deepEqual((await store.read('meta/pending.json')).paths, ['profile/diver.json']);
});

test('migration retries if the profile changes during encryption', async () => {
  const { profile, backend, store } = setup();
  await store.write('profile/diver.json', { format: 1, dateOfBirth: '1980-01-02', future: 'first' });
  const compareAndWrite = backend.applyTrackedIfUnchanged.bind(backend);
  let first = true;
  backend.applyTrackedIfUnchanged = async (...args) => {
    if (first) {
      first = false;
      await store.trackedBatch({ writes: [['profile/diver.json', { format: 1, dateOfBirth: '1981-02-03', future: 'newer' }]] });
    }
    return compareAndWrite(...args);
  };
  assert.equal((await profile.readInfo()).dateOfBirth, '1981-02-03');
  assert.equal((await store.read('profile/diver.json')).future, 'newer');
});

test('migration with an unavailable key keeps the old profile unchanged', async () => {
  const original = setup();
  const enc = await original.box.seal({ fullName: 'Diver' }, { id: 'profile', format: 1 });
  const file = { format: 1, dateOfBirth: '1980-01-02', enc };
  await original.store.write('profile/diver.json', file);
  const foreignBox = createSecretBox({ read: async () => '', write: async () => { throw new Error('unexpected key write'); } });
  const foreign = createProfile(original.store, foreignBox);
  await assert.rejects(foreign.readInfo(), /MISSING_DATA_KEY/);
  assert.deepEqual(await original.store.read('profile/diver.json'), file);
});

test('migration does not write if the profile becomes read only during encryption', async () => {
  const { profile, backend, store } = setup();
  const file = { format: 1, dateOfBirth: '1980-01-02' };
  await store.write('profile/diver.json', file);
  const compareAndWrite = backend.applyTrackedIfUnchanged.bind(backend);
  backend.applyTrackedIfUnchanged = async (...args) => {
    await store.write('meta/state.json', { format: 1, readOnlyFrom: '2026-01-01T00:00:00Z' });
    return compareAndWrite(...args);
  };
  await assert.rejects(profile.readInfo(), ReadOnlyError);
  assert.deepEqual(await store.read('profile/diver.json'), file);
});

test('migration refuses conflicting dates and does not change read-only profiles', async () => {
  const { profile, store, box } = setup();
  const enc = await box.seal({ dateOfBirth: '1981-02-03' }, { id: 'profile', format: 1 });
  const file = { format: 1, dateOfBirth: '1980-01-02', enc };
  await store.write('profile/diver.json', file);
  assert.equal(await profile.hasClearBirthDate(), true);
  await assert.rejects(profile.readInfo(), /CONFLICTING_BIRTH_DATE/);
  assert.deepEqual(await store.read('profile/diver.json'), file);
  await store.write('meta/state.json', { format: 1, readOnlyFrom: '2026-01-01T00:00:00Z' });
  await assert.rejects(profile.migrateBirthDate(), ReadOnlyError);
  assert.deepEqual(await store.read('profile/diver.json'), file);
});

test('the sensitive data is not readable in the files of the store', async () => {
  const { profile, backend } = setup();
  const info = emptyInfo();
  info.bloodGroup = 'AB+';
  info.emergency = { name: 'Marc Tremblay', relation: 'conjoint', phone: { country: 'CA', number: '5145550142' } };
  await profile.saveInfo(info);
  await profile.saveCertification({ agency: 'PADI', level: 'Rescue Diver', number: '1504AB2231', photos: { front: new Uint8Array([1, 2, 3]) } });
  for (const path of await backend.list('')) {
    const text = (await backend.get(path)) ?? '';
    for (const secret of ['AB+', 'Marc', 'conjoint', '5145550142', 'Rescue Diver', '1504AB2231']) assert.ok(!text.includes(secret), `${secret} in ${path}`);
  }
});

// ---- Full name (task 2026-11-19-312) ----

test('the full name is kept sealed, cleaned, and emptying it removes it', async () => {
  const { profile, backend } = setup();
  assert.equal((await profile.readInfo()).fullName, '');
  const info = emptyInfo();
  info.fullName = '  Valérie   Tremblay ';
  await profile.saveInfo(info);
  assert.equal((await profile.readInfo()).fullName, 'Valérie Tremblay');
  for (const path of await backend.list('')) assert.ok(!((await backend.get(path)) ?? '').includes('Tremblay'), `name in ${path}`);
  await profile.saveInfo({ ...info, fullName: '   ' });
  assert.equal((await profile.readInfo()).fullName, '');
});

// ---- Blood group ----

test('the blood group can be saved, read and cleared without consent', async () => {
  const { profile, store } = setup();
  const info = emptyInfo();
  info.bloodGroup = 'O+';
  info.emergency.name = 'Marc';
  await profile.saveInfo(info);
  assert.equal((await profile.readInfo()).bloodGroup, 'O+');
  info.bloodGroup = '';
  await profile.saveInfo(info);
  assert.equal((await profile.readInfo()).bloodGroup, '');
  assert.equal((await profile.readInfo()).emergency.name, 'Marc');
  assert.ok((await store.read('meta/pending.json')).paths.includes('profile/diver.json'));
});

test('« Inconnu » can be saved as the blood group', async () => {
  const { profile } = setup();
  const info = emptyInfo();
  info.bloodGroup = UNKNOWN_BLOOD;
  assert.deepEqual(infoProblems(info), {});
  await profile.saveInfo(info);
  assert.equal((await profile.readInfo()).bloodGroup, UNKNOWN_BLOOD);
  assert.equal(BLOOD_GROUPS.length, 8);
});

test('legacy consent states do not hide or delete an encrypted blood group', async () => {
  const { profile, store, box } = setup();
  await store.write('profile/diver.json', { format: 1, future: 'keep', enc: await box.seal({ bloodGroup: 'O+', future: 'keep' }, { id: 'profile', format: 1 }) });
  for (const consent of [false, true]) {
    await store.write('meta/health-consent.json', { format: 1, consent, at: '', synced: false });
    const info = await profile.readInfo();
    assert.equal(info.bloodGroup, 'O+');
    info.emergency.name = 'Marc';
    await profile.saveInfo(info);
    assert.equal((await profile.readInfo()).bloodGroup, 'O+');
    const file = await store.read('profile/diver.json');
    assert.equal(file.future, 'keep');
    assert.equal((await box.open(file.enc, { id: 'profile', format: 1 })).future, 'keep');
  }
});

test('explicitly deleting the blood group keeps the rest', async () => {
  const { profile } = setup();
  const info = emptyInfo();
  info.dateOfBirth = '1979-03-14';
  info.bloodGroup = 'O+';
  info.emergency = { name: 'Marc', relation: 'conjoint', phone: { country: 'CA', number: '514 555-0142' } };
  await profile.saveInfo(info);
  await profile.deleteBloodGroup();
  const after = await profile.readInfo();
  assert.equal(after.bloodGroup, '');
  assert.equal(after.dateOfBirth, '1979-03-14');
  assert.equal(after.emergency.name, 'Marc');
  assert.equal(after.emergency.phone.number, '5145550142');
});

test('the account API: the calls carry the session and read the answer', async () => {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    return { status: 200, text: JSON.stringify({ consent: request.method === 'PUT' ? request.body.consent : false, consentedAt: '2026-11-02T10:00:00.000Z' }) };
  };
  const api = createServerApi({ baseUrl: 'https://server.example', transport });
  assert.deepEqual(await api.healthConsent('abc'), { consent: false, consentedAt: '' });
  assert.deepEqual(await api.setHealthConsent('abc', true), { consent: true, consentedAt: '2026-11-02T10:00:00.000Z' });
  assert.equal(calls[0].url, 'https://server.example/v1/account/health-consent');
  assert.equal(calls[0].headers.Authorization, 'Bearer abc');
  assert.equal(calls[1].method, 'PUT');
  assert.deepEqual(calls[1].body, { consent: true });
});

test('the read-only state of the inventory also refuses the profile', async () => {
  const { profile, store } = setup();
  await store.write('meta/state.json', { format: 1, readOnlyFrom: '2026-01-01T00:00:00Z' });
  await assert.rejects(profile.saveInfo(emptyInfo()), ReadOnlyError);
});

// ---- Phone ----

test('the phone number formats itself for CA, US and FR as it is typed', () => {
  assert.equal(formatNational('5', 'CA'), '5');
  assert.equal(formatNational('5145', 'CA'), '514 5');
  assert.equal(formatNational('5145550142', 'CA'), '514 555-0142');
  assert.equal(formatNational('(514) 555-0142', 'US'), '514 555-0142');
  assert.equal(formatNational('+1 514 555 0142', 'CA'), '514 555-0142');
  assert.equal(formatNational('15145550142', 'US'), '514 555-0142');
  assert.equal(formatNational('0612345678', 'FR'), '6 12 34 56 78');
  assert.equal(formatNational('612345678', 'FR'), '6 12 34 56 78');
  assert.equal(formatNational('+33 6 12 34 56 78', 'FR'), '6 12 34 56 78');
  assert.equal(formatNational('06 12', 'FR'), '6 12');
  assert.equal(formatNational('5145550142999', 'CA'), '514 555-0142');
  assert.equal(formatInternational({ country: 'CA', number: '5145550142' }), '+1 514 555-0142');
  assert.equal(formatInternational({ country: 'FR', number: '0612345678' }), '+33 6 12 34 56 78');
  assert.equal(formatInternational({ country: 'FR', number: '' }), '');
  assert.equal(nationalDigits('514-555-0142', 'US'), '5145550142');
  assert.ok(isCompletePhone('514 555-0142', 'CA'));
  assert.ok(!isCompletePhone('514 555', 'CA'));
});

test('a partly typed phone number is flagged, an empty one is not', () => {
  const info = emptyInfo();
  assert.deepEqual(infoProblems(info), {});
  info.emergency.phone.number = '514 555';
  assert.deepEqual(infoProblems(info), { phone: 'incomplete' });
  info.emergency.phone.number = '5145550142';
  assert.deepEqual(infoProblems(info), {});
  info.dateOfBirth = '2999-01-01';
  assert.deepEqual(infoProblems(info), { dateOfBirth: 'future' });
  info.dateOfBirth = '1979-02-30';
  assert.deepEqual(infoProblems(info), { dateOfBirth: 'date' });
});

// ---- Cards ----

test('a certification card: saved sealed with its photos, listed, changed, deleted', async () => {
  const { profile, backend } = setup();
  const front = new Uint8Array([0xff, 0xd8, 9, 9, 9]);
  const card = await profile.saveCertification({ agency: 'PADI', level: 'Advanced Open Water Diver', number: '1504AB2231', issuedOn: '2015-06-12', instructor: 'Julie Gagnon', photos: { front } });
  assert.equal(card.documents.length, 1);
  assert.equal(card.documents[0].side, 'front');
  assert.deepEqual([...(await profile.readPhoto(card.id, card.documents[0].hash))], [...front]);
  assert.equal((await profile.listCertifications()).length, 1);
  const changed = await profile.saveCertification({ id: card.id, agency: 'PADI', level: 'Rescue Diver', number: '1504AB2231', photos: { front: null, back: new Uint8Array([1]) } });
  assert.equal(changed.level, 'Rescue Diver');
  assert.equal(changed.issuedOn, '');
  assert.deepEqual(changed.documents.map((d) => d.side), ['back']);
  assert.equal((await backend.list('documents/')).length, 1);
  await profile.deleteCertification(card.id);
  assert.equal((await profile.listCertifications()).length, 0);
  assert.equal((await backend.list('documents/')).length, 0);
});

test('a card needs an agency and a level; the number is optional and the date is checked', () => {
  assert.deepEqual(certificationProblems({ agency: '', level: '', number: '', issuedOn: '' }), { agency: 'empty', level: 'empty' });
  assert.deepEqual(certificationProblems({ agency: 'SSI', level: 'x', number: '', issuedOn: '' }), {});
  assert.deepEqual(certificationProblems({ agency: 'SSI', level: 'x', number: '1', issuedOn: '2999-01-01' }), { issuedOn: 'future' });
  assert.deepEqual(certificationProblems({ agency: 'SSI', level: 'x', number: '1', issuedOn: '2019-05-20' }), {});
});

test('a certificate can keep the issuing instructor number without a diver number', async () => {
  const { profile } = setup();
  const card = await profile.saveCertification({ agency: 'PADI', level: 'Open Water', instructor: 'Marie', instructorNumber: '  A123  ', instructorCert: true });
  assert.equal(card.number, '');
  assert.equal(card.instructorNumber, 'A123');
  const reopened = await profile.getCertification(card.id);
  assert.equal(reopened.number, '');
  assert.equal(reopened.instructorNumber, 'A123');
  const changed = await profile.saveCertification({ id: card.id, agency: 'PADI', level: 'Open Water', number: '42', instructor: 'Marie', instructorNumber: 'A123', instructorCert: true });
  assert.equal(changed.number, '42');
  assert.equal(changed.instructorNumber, 'A123');
});

test('the level suggestions follow the agency and what is typed', () => {
  assert.ok(levelSuggestions('PADI', 'res').includes('Rescue Diver'));
  assert.ok(levelSuggestions('PADI', 'res').includes('Rescue Diver, Emergency First Response'));
  assert.ok(!levelSuggestions('PADI', 'res').includes('Divemaster'));
  assert.ok(levelSuggestions('SSI', '').includes('Stress & Rescue (Sauveteur)'));
  assert.deepEqual(levelSuggestions('other', ''), []);
  assert.ok(!levelSuggestions('PADI', 'Rescue Diver').includes('Rescue Diver'));
});

/** The four fields this test is about (the parser also proposes the agency name and the instructor). @param {any} r */
const four = ({ agency, level, number, issuedOn }) => ({ agency, level, number, issuedOn });

test('parseCardText proposes the agency, the level and the number from a scanned card', () => {
  assert.deepEqual(four(parseCardText('PADI\nAdvanced Open Water Diver\nValérie Tremblay\nDiver No. 1504AB2231\nDate 12 JUN 2015')), { agency: 'PADI', level: 'Advanced Open Water Diver', number: '1504AB2231', issuedOn: '2015-06-12' });
  assert.deepEqual(four(parseCardText('Scuba Schools International\nSSI\nStress & Rescue (Sauveteur)\nCert # 7721-0934')), { agency: 'SSI', level: 'Stress & Rescue (Sauveteur)', number: '7721-0934', issuedOn: '' });
  assert.deepEqual(four(parseCardText('CMAS\n2 star diver\nCard number: BE-2234-98\n')), { agency: 'CMAS', level: '2 star diver', number: 'BE-2234-98', issuedOn: '' });
  assert.deepEqual(four(parseCardText('NAUI\nAdvanced Scuba Diver\nN° 884102')), { agency: 'NAUI', level: 'Advanced Scuba Diver', number: '884102', issuedOn: '' });
  const tdi = parseCardText('Technical Diving International\nTDI\nAdvanced Nitrox Diver\nDiver Number: 20231188');
  assert.equal(tdi.agency, 'TDI');
  assert.equal(tdi.level, 'Advanced Nitrox Diver');
  assert.equal(tdi.number, '20231188');
  assert.deepEqual(four(parseCardText('PADI\nRescue Diver\n1608AC0412')), { agency: 'PADI', level: 'Rescue Diver', number: '1608AC0412', issuedOn: '' });
  assert.deepEqual(four(parseCardText('')), { agency: '', level: '', number: '', issuedOn: '' });
  assert.deepEqual(four(parseCardText('Hello world')), { agency: '', level: '', number: '', issuedOn: '' });
});

test('findDate reads the usual card formats, prefers a labelled date and skips future dates', () => {
  const today = '2026-11-18';
  assert.equal(findDate('Date 12 JUN 2015', today), '2015-06-12');
  assert.equal(findDate('Délivré le 3 février 2019', today), '2019-02-03');
  assert.equal(findDate('June 4, 2012', today), '2012-06-04');
  assert.equal(findDate('12/06/2015', today), '2015-06-12', 'day first');
  assert.equal(findDate('06/25/2015', today), '2015-06-25', 'month first when the second number cannot be a month');
  assert.equal(findDate('2015-06-12', today), '2015-06-12');
  assert.equal(findDate('Expires 12 JUN 2031\nIssued 04 MAR 2016', today), '2016-03-04', 'the labelled issue date wins');
  assert.equal(findDate('Valid until 12/06/2031', today), '', 'a future date is not proposed');
  assert.equal(findDate('31/02/2015', today), '', 'not a real date');
  assert.equal(findDate('Hello', today), '');
});

test('scanCard: the native scanner answers, a cancel changes nothing, no scanner falls back to the picker', async () => {
  const picked = { image: new Blob(['p']), text: '' };
  const picker = async () => picked;
  const b64 = Buffer.from('jpegbytes').toString('base64');
  const done = await scanCard('front', { scanner: async () => ({ action: 'done', image: b64, text: 'PADI\nRescue Diver' }), picker });
  assert.equal(done?.text, 'PADI\nRescue Diver');
  assert.equal(await done?.image.text(), 'jpegbytes');
  assert.equal(await scanCard('back', { scanner: async () => ({ action: 'cancelled' }), picker: async () => assert.fail('no picker after a cancel') }), null);
  assert.equal(await scanCard('front', { scanner: async () => ({ action: 'unavailable' }), picker }), picked);
  assert.equal(await scanCard('front', { scanner: async () => { throw new Error('UNAVAILABLE'); }, picker }), picked);
  assert.equal(await scanCard('front', { scanner: async () => ({ action: 'done', image: '', text: '' }), picker }), picked, 'an empty scan falls back');
});

test('« Nouveau brevet »: the scan fills agency, level, number and date with the mark; nothing found stays silent', () => {
  const page = read('pages/ProfileCertEdit.svelte');
  assert.ok(page.includes('agencyText = certAgencyText(found.agency, found.agencyName, agencyOptions)'));
  assert.ok(page.includes('readFrom.agency = agencyText'));
  assert.ok(page.includes('readFrom.issuedOn = issuedOn = found.issuedOn'));
  assert.ok(page.includes("readFrom[field] === value ? t('diverProfile.cert.readMark')"), 'the mark shows only while the field still holds the scanned value');
  assert.ok(page.includes('if (!scanned) return;'), 'a cancel changes nothing');
  assert.equal(page.split('showSnackbar(').length - 1, 4, 'only the save and photo failures (on the phone and in the desktop dialog) show a message: nothing read stays silent');
  for (const lang of ['fr', 'en']) {
    const j = JSON.parse(read(`i18n/${lang}.json`)).diverProfile.cert;
    for (const k of ['photoFront', 'photoBack', 'photoReplace', 'readMark', 'photoHint', 'sideFront', 'sideBack']) assert.ok(j[k], `${lang} ${k}`);
  }
  const fr = JSON.parse(read('i18n/fr.json')).diverProfile.cert;
  assert.equal(fr.photoFront, 'Scanner le recto');
  assert.equal(fr.readMark, 'Lu sur la carte, à vérifier');
  assert.equal(fr.photoHint, 'Scannez la carte : l’app y lit l’agence, le niveau et le numéro. Vérifiez-les.');
});

// ---- Card image (desktop module) ----

/** A synthetic photo: a light card with a dark band, tilted, on a dark table. */
function syntheticPhoto(w = 400, h = 300) {
  const img = blank(w, h);
  const quad = [{ x: 60, y: 50 }, { x: 330, y: 70 }, { x: 345, y: 240 }, { x: 40, y: 220 }];
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cross !== 0) {
        if (sign && Math.sign(cross) !== sign) return false;
        sign = Math.sign(cross);
      }
    }
    return true;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const card = inside(x, y);
      const c = card ? [225, 215, 190] : [40, 45, 50];
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  return { img, quad };
}

test('card detection finds the four corners of a tilted card', () => {
  const { img, quad } = syntheticPhoto();
  const found = detectCard(img);
  assert.equal(found.found, true);
  found.corners.forEach((c, i) => {
    assert.ok(Math.hypot(c.x - quad[i].x, c.y - quad[i].y) < 12, `corner ${i}: ${JSON.stringify(c)} vs ${JSON.stringify(quad[i])}`);
  });
});

test('card detection gives up on a photo with no card, and the corners are the photo inset', () => {
  const flat = blank(200, 120);
  flat.data.fill(120);
  const r = detectCard(flat);
  assert.equal(r.found, false);
  assert.ok(r.corners[0].x > 0 && r.corners[2].x < 199);
});

test('the perspective warp straightens the card: a marked corner lands in the output corner', () => {
  const { img, quad } = syntheticPhoto();
  // A red spot near the top left of the card.
  for (let y = 56; y < 66; y++) for (let x = 70; x < 80; x++) { const o = (y * img.width + x) * 4; img.data.set([255, 0, 0, 255], o); }
  const size = cardSize(quad, 400);
  assert.equal(size.width, 400);
  assert.equal(size.height, Math.round(400 / (85.6 / 54)));
  const out = warpPerspective(img, quad, size.width, size.height);
  const px = (x, y) => [...out.data.slice((y * out.width + x) * 4, (y * out.width + x) * 4 + 3)];
  // The card colour fills the corners (no table colour: the card was cropped to its edges).
  for (const [x, y] of [[3, 3], [out.width - 4, 3], [out.width - 4, out.height - 4], [3, out.height - 4]]) {
    const p = px(x, y);
    assert.ok(p[0] > 180, `corner ${x},${y} is ${p}`);
  }
  // The red spot is near the top left of the output.
  let redX = 0;
  let redY = 0;
  let n = 0;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) { const p = px(x, y); if (p[0] > 200 && p[1] < 60) { redX += x; redY += y; n++; } }
  assert.ok(n > 20);
  assert.ok(redX / n < out.width * 0.15 && redY / n < out.height * 0.2, `red at ${redX / n},${redY / n}`);
});

test('corners dragged by hand: a moved corner changes the crop', () => {
  const { img, quad } = syntheticPhoto();
  const moved = quad.map((p) => ({ ...p }));
  moved[2] = { x: 200, y: 150 };
  const a = warpPerspective(img, quad, 120, 76);
  const b = warpPerspective(img, moved, 120, 76);
  assert.notDeepEqual([...a.data], [...b.data]);
  // The order of four points is found whatever the order given.
  assert.deepEqual(orderCorners([quad[2], quad[0], quad[3], quad[1]]), quad);
  assert.equal(homography([quad[0], quad[0], quad[0], quad[0]], quad), null);
});

test('glare is filled with the colours around it', () => {
  const photo = blank(160, 100);
  for (let i = 0; i < 160 * 100; i++) photo.data.set([200, 190, 160, 255], i * 4);
  for (let y = 30; y < 50; y++) for (let x = 60; x < 90; x++) photo.data.set([255, 255, 253, 255], (y * 160 + x) * 4);
  const r = removeGlare(photo);
  assert.equal(r.changed, true);
  const o = (40 * 160 + 75) * 4;
  assert.ok(Math.abs(r.image.data[o] - 200) < 6 && Math.abs(r.image.data[o + 2] - 160) < 6, `centre is ${[...r.image.data.slice(o, o + 3)]}`);
  // The source is untouched, and a card with no glare, or that is white as a whole, is left alone.
  assert.equal(photo.data[o], 255);
  const clean = blank(40, 40);
  clean.data.fill(150);
  assert.equal(removeGlare(clean).changed, false);
  const white = blank(40, 40);
  white.data.fill(255);
  assert.equal(removeGlare(white).changed, false);
});

// ---- Screens ----

test('the texts of the new screens exist in French and English', () => {
  const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
  const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
  for (const l of ['fr', 'en']) {
    for (const key of ['diverProfile.info.title', 'diverProfile.info.edit', 'diverProfile.certs.title', 'diverProfile.cert.new', 'diverProfile.info.clearBlood', 'diverProfile.info.lockNoteNoDate', 'diverProfile.info.lockNoteLegacyBirthDate']) {
      assert.ok(get(langs[l], key), `${l}: ${key}`);
    }
  }
});

test('the information page distinguishes an unmigrated birth date from encrypted information', () => {
  const page = read('pages/ProfileInfo.svelte');
  assert.match(page, /diver\.legacyBirthDate \? 'diverProfile\.info\.lockNoteLegacyBirthDate' : 'diverProfile\.info\.lockNoteNoDate'/);
});

test('the information page is edited in place: no edit route, and Back stops the editing', () => {
  assert.doesNotMatch(read('App.svelte'), /profile\/info\/edit|ProfileInfoEdit/);
  const page = read('pages/ProfileInfo.svelte');
  assert.match(page, /bc-profile-info--editing/);
  assert.match(page, /bc-cancel/);
  assert.match(read('lib/back-button.js'), /\.page-current \.bc-profile-info--editing/);
  assert.match(read('pages/EmergencySheet.svelte'), /href="\/profile\/info\?edit=1"/);
});

test('the subscription screens continue directly to the ready step', () => {
  const steps = read('lib/first-launch-steps.js');
  assert.match(steps, /'benthicPlusWelcome:next': 'benthicPlusReady'/);
  const screen = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(screen, /benthicPlus\.welcome\.next/);
  assert.doesNotMatch(screen, /benthicPlusHealth/);
});

test('a key that cannot be read is never replaced once the device had one', async () => {
  let key = '';
  let made = false;
  const keeper = {
    read: async () => key,
    write: async (k) => (key = k),
    hadKey: async () => made,
    markKey: async () => { made = true; },
  };
  const first = createSecretBox(keeper);
  const block = await first.seal({ x: 1 }, { id: 'one', format: 1 });
  // A restored backup: the data is there, the key is not.
  const lost = { ...keeper, read: async () => '', write: async () => { throw new Error('unexpected key write'); } };
  const after = createSecretBox(lost);
  await assert.rejects(after.seal({ y: 2 }, { id: 'two', format: 1 }), /MISSING_DATA_KEY/);
  await assert.rejects(after.sealBytes(new Uint8Array([1]), { id: 'two', format: 1 }), /MISSING_DATA_KEY/);
  await assert.rejects(after.open(block, { id: 'one', format: 1 }), /MISSING_DATA_KEY/);
  // The key is still the first one, so the block opens again once it is back.
  assert.deepEqual(await createSecretBox(keeper).open(block, { id: 'one', format: 1 }), { x: 1 });
});
