// « Mon profil de plongeur » (tasks 2026-11-18-271 and 272): the encryption round trip, the health-data consent (off by
// default, the blood group refused without it, withdrawing deletes it), the information, the phone number formats,
// the certification cards, the text parser of a scanned card, and the card-image module (perspective warp, corner
// detection, glare) that the desktop uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile, ConsentRequiredError, UNKNOWN_BLOOD, BLOOD_GROUPS, emptyInfo, levelSuggestions, infoProblems, certificationProblems } from '../../app/src/lib/profile.js';
import { createHealthConsent } from '../../app/src/lib/health-consent.js';
import { createServerApi } from '../../app/src/lib/server-api.js';
import { formatNational, formatInternational, nationalDigits, isCompletePhone } from '../../app/src/lib/phone-format.js';
import { parseCardText } from '../../app/src/lib/card-scan.js';
import { blank, warpPerspective, detectCard, removeGlare, orderCorners, homography, cardSize } from '../../app/src/lib/card-image.js';
import { ReadOnlyError } from '../../app/src/lib/inventory.js';

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

/** A fake account that records what it is told. */
function fakeAccount({ token = 'tok', offline = false } = {}) {
  const state = { consent: false, at: '' };
  return {
    state,
    sessionToken: async () => token,
    get: async () => {
      if (offline) throw new Error('offline');
      return { consent: state.consent, consentedAt: state.at };
    },
    set: async (_t, on) => {
      if (offline) throw new Error('offline');
      state.consent = on;
      state.at = on ? '2026-11-02T10:00:00.000Z' : '';
      return { consent: on, consentedAt: state.at };
    },
  };
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

test('the sensitive data is not readable in the files of the store', async () => {
  const { profile, backend } = setup();
  await profile.setConsent(true);
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

// ---- Consent ----

test('the consent is off by default', async () => {
  const { profile } = setup();
  assert.deepEqual(await profile.readConsent(), { consent: false, at: '', synced: true });
  const consent = createHealthConsent(profile, fakeAccount());
  assert.equal((await consent.read()).consent, false);
});

test('the blood group cannot be saved without the consent, and « Autoriser » turns it on', async () => {
  const { profile } = setup();
  const account = fakeAccount();
  const consent = createHealthConsent(profile, account);
  const info = emptyInfo();
  info.bloodGroup = 'O+';
  await assert.rejects(profile.saveInfo(info), ConsentRequiredError);
  info.bloodGroup = '';
  info.emergency.name = 'Marc';
  await profile.saveInfo(info); // the rest is savable without the consent
  const given = await consent.give();
  assert.equal(given.consent, true);
  assert.equal(given.synced, true);
  assert.equal(given.at, '2026-11-02T10:00:00.000Z');
  assert.equal(account.state.consent, true);
  info.bloodGroup = 'O+';
  await profile.saveInfo(info);
  assert.equal((await profile.readInfo()).bloodGroup, 'O+');
});

test('« Inconnu » can be saved as the blood group', async () => {
  const { profile } = setup();
  await profile.setConsent(true);
  const info = emptyInfo();
  info.bloodGroup = UNKNOWN_BLOOD;
  assert.deepEqual(infoProblems(info), {});
  await profile.saveInfo(info);
  assert.equal((await profile.readInfo()).bloodGroup, UNKNOWN_BLOOD);
  assert.equal(BLOOD_GROUPS.length, 8);
});

test('withdrawing the consent deletes the blood group and keeps the rest', async () => {
  const { profile, store } = setup();
  const account = fakeAccount();
  const consent = createHealthConsent(profile, account);
  await consent.give();
  const info = emptyInfo();
  info.dateOfBirth = '1979-03-14';
  info.bloodGroup = 'O+';
  info.emergency = { name: 'Marc', relation: 'conjoint', phone: { country: 'CA', number: '514 555-0142' } };
  await profile.saveInfo(info);
  const withdrawn = await consent.withdraw();
  assert.equal(withdrawn.consent, false);
  assert.equal(account.state.consent, false);
  const after = await profile.readInfo();
  assert.equal(after.bloodGroup, '');
  assert.equal(after.dateOfBirth, '1979-03-14');
  assert.equal(after.emergency.name, 'Marc');
  assert.equal(after.emergency.phone.number, '5145550142');
  // Even with the consent given again, the deleted value does not come back.
  await consent.give();
  assert.equal((await profile.readInfo()).bloodGroup, '');
  assert.ok((await store.read('meta/pending.json')).paths.includes('profile/diver.json'));
});

test('the consent is kept on the device when the account cannot be reached, then sent', async () => {
  const { profile } = setup();
  const offline = fakeAccount({ offline: true });
  const consent = createHealthConsent(profile, offline);
  const given = await consent.give();
  assert.equal(given.consent, true);
  assert.equal(given.synced, false);
  assert.ok(given.at);
  // Back online: the refresh sends the local state.
  const online = fakeAccount();
  const later = createHealthConsent(profile, online);
  const refreshed = await later.refresh();
  assert.equal(online.state.consent, true);
  assert.equal(refreshed.synced, true);
  assert.equal(refreshed.consent, true);
});

test('the consent without a session stays on the device', async () => {
  const { profile } = setup();
  const consent = createHealthConsent(profile, fakeAccount({ token: '' }));
  const given = await consent.give();
  assert.equal(given.consent, true);
  assert.equal(given.synced, false);
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

test('a card needs an agency, a level and a number; the date is checked', () => {
  assert.deepEqual(certificationProblems({ agency: '', level: '', number: '', issuedOn: '' }), { agency: 'empty', level: 'empty', number: 'empty' });
  assert.deepEqual(certificationProblems({ agency: 'SSI', level: 'x', number: '1', issuedOn: '2999-01-01' }), { issuedOn: 'future' });
  assert.deepEqual(certificationProblems({ agency: 'SSI', level: 'x', number: '1', issuedOn: '2019-05-20' }), {});
});

test('the level suggestions follow the agency and what is typed', () => {
  assert.ok(levelSuggestions('PADI', 'res').includes('Rescue Diver'));
  assert.ok(levelSuggestions('PADI', 'res').includes('Rescue Diver, Emergency First Response'));
  assert.ok(!levelSuggestions('PADI', 'res').includes('Divemaster'));
  assert.ok(levelSuggestions('SSI', '').includes('Stress & Rescue (Sauveteur)'));
  assert.deepEqual(levelSuggestions('other', ''), []);
  assert.ok(!levelSuggestions('PADI', 'Rescue Diver').includes('Rescue Diver'));
});

test('parseCardText proposes the agency, the level and the number from a scanned card', () => {
  assert.deepEqual(parseCardText('PADI\nAdvanced Open Water Diver\nValérie Tremblay\nDiver No. 1504AB2231\nDate 12 JUN 2015'), { agency: 'PADI', level: 'Advanced Open Water Diver', number: '1504AB2231' });
  assert.deepEqual(parseCardText('Scuba Schools International\nSSI\nStress & Rescue (Sauveteur)\nCert # 7721-0934'), { agency: 'SSI', level: 'Stress & Rescue (Sauveteur)', number: '7721-0934' });
  assert.deepEqual(parseCardText('CMAS\n2 star diver\nCard number: BE-2234-98\n'), { agency: 'CMAS', level: '2 star diver', number: 'BE-2234-98' });
  assert.deepEqual(parseCardText('NAUI\nAdvanced Scuba Diver\nN° 884102'), { agency: 'NAUI', level: 'Advanced Scuba Diver', number: '884102' });
  const tdi = parseCardText('Technical Diving International\nTDI\nAdvanced Nitrox Diver\nDiver Number: 20231188');
  assert.equal(tdi.agency, 'TDI');
  assert.equal(tdi.level, 'Advanced Nitrox Diver');
  assert.equal(tdi.number, '20231188');
  assert.deepEqual(parseCardText('PADI\nRescue Diver\n1608AC0412'), { agency: 'PADI', level: 'Rescue Diver', number: '1608AC0412' });
  assert.deepEqual(parseCardText(''), { agency: '', level: '', number: '' });
  assert.deepEqual(parseCardText('Hello world'), { agency: '', level: '', number: '' });
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
    for (const key of ['diverProfile.info.title', 'diverProfile.info.edit', 'diverProfile.certs.title', 'diverProfile.cert.new', 'odplus.health.title', 'odplus.health.switch', 'odplus.health.continue', 'diverProfile.info.deniedNote', 'diverProfile.info.allow', 'settings.privacy.withdraw']) {
      assert.ok(get(langs[l], key), `${l}: ${key}`);
    }
  }
});

test('the subscription screens: « Continuer » then « Vos données de santé » then « Votre carnet est prêt »', () => {
  const steps = read('lib/first-launch-steps.js');
  assert.match(steps, /'odplusWelcome:next': 'odplusHealth'/);
  assert.match(steps, /'odplusHealth:next': 'odplusReady'/);
  const screen = read('components/FirstLaunchOdPlus.svelte');
  assert.match(screen, /odplus\.welcome\.next/);
  assert.match(screen, /odplus\.health\.continue/);
});
