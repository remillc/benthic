// The emergency sheet (task 2026-11-19-311): what it shows, what each switch removes, the call link, the blood type behind the consent.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_INCLUDE, certificateRank, highestCertificate, INCLUDE_KEY, ageOn, buildSheet, readInclude, sheetText, telHref, writeInclude } from '../../app/src/lib/emergency.js';

const info = {
  fullName: 'Valérie Tremblay',
  dateOfBirth: '1979-03-14',
  emergency: { name: 'Marc Tremblay', relation: 'conjoint', phone: { country: 'CA', number: '5145550142' } },
  bloodGroup: 'A+',
};
const doc = (o) => ({ id: 'd', kind: 'other', agency: '', agencyName: '', level: '', number: '', issuedOn: '', expiresOn: '', insurer: '', plan: '', policyNumber: '', emergencyPhone: '', documents: [], ...o });
const docs = [
  doc({ id: 'i1', kind: 'insurance', insurer: 'DAN', plan: 'Master', policyNumber: '3348', expiresOn: '2027-05-31', emergencyPhone: '+1 919 684-9111' }),
  doc({ id: 'i0', kind: 'insurance', insurer: 'Old', expiresOn: '2020-01-01' }),
  doc({ id: 'm1', kind: 'medical', expiresOn: '2027-01-15', documents: [{}, {}] }),
  doc({ id: 'c1', kind: 'certification', agency: 'PADI', level: 'Open Water', issuedOn: '2010-05-01' }),
  doc({ id: 'c2', kind: 'certification', agency: 'PADI', level: 'Rescue Diver', issuedOn: '2015-05-01', number: '99' }),
];
const all = Object.fromEntries(Object.keys(DEFAULT_INCLUDE).map((k) => [k, true]));
const today = '2026-11-19';
const words = { t: (k, p = {}) => `${k}${Object.keys(p).length ? JSON.stringify(p) : ''}`, date: (d) => d, otherAgency: 'other', unknownBlood: '?' };

test('the age counts whole years', () => {
  assert.equal(ageOn('1979-03-14', '2026-11-19'), 47);
  assert.equal(ageOn('1979-12-01', '2026-11-19'), 46);
  assert.equal(ageOn('2030-01-01', today), null);
  assert.equal(ageOn('', today), null);
});

test('the sheet shows what is on, the valid documents only', () => {
  const s = buildSheet({ info, docs, include: all, consent: true, today });
  assert.equal(s.name, 'Valérie Tremblay');
  assert.equal(s.birth?.age, 47);
  assert.equal(s.blood, 'A+');
  assert.equal(s.insurance?.id, 'i1');
  assert.equal(s.medical?.id, 'm1');
  assert.equal(s.certificate?.id, 'c2');
});

test('the blood type needs the consent; each switch removes its item; the name stays', () => {
  const off = Object.fromEntries(Object.keys(all).map((k) => [k, false]));
  const s = buildSheet({ info, docs, include: off, consent: true, today });
  assert.deepEqual([s.birth, s.blood, s.contact, s.insurance, s.medical, s.certificate], [null, null, null, null, null, null]);
  assert.equal(s.name, 'Valérie Tremblay');
  assert.equal(buildSheet({ info, docs, include: all, consent: false, today }).blood, null);
});

test('the blocks: the call button, the emergency line, the documents they open', () => {
  const text = sheetText(buildSheet({ info, docs, include: all, consent: true, today }), words);
  const [contact, insurance, medical, cert] = text.blocks;
  assert.equal(contact.call?.tel, 'tel:+15145550142');
  assert.match(contact.call?.label ?? '', /Marc/);
  assert.equal(insurance.hotline?.tel, 'tel:+19196849111');
  assert.equal(insurance.docId, 'i1');
  assert.equal(medical.docId, 'm1');
  assert.equal(cert.name, 'PADI Rescue Diver');
  assert.equal(telHref('+1 (919) 684-9111'), 'tel:+19196849111');
});

test('the switches are kept as JSON, the highest certificate off by default', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(readInclude(store).certificate, false);
  assert.equal(readInclude(store).blood, true);
  writeInclude(store, { ...DEFAULT_INCLUDE, blood: false, certificate: true });
  assert.ok(mem.has(INCLUDE_KEY));
  assert.deepEqual(readInclude(store), { ...DEFAULT_INCLUDE, blood: false, certificate: true });
  mem.set(INCLUDE_KEY, 'not json');
  assert.deepEqual(readInclude(store), DEFAULT_INCLUDE);
});

const cert = (id, agency, level, issuedOn, o = {}) => doc({ id, kind: 'certification', agency, level, issuedOn, instructorCert: false, ...o });

test('the rank follows the level across agencies', () => {
  const r = (agency, level) => certificateRank({ agency, level, instructorCert: false });
  assert.equal(r('PADI', 'Open Water Diver'), 1);
  assert.equal(r('SSI', 'Advanced Open Water Diver'), 2);
  assert.equal(r('SSI', 'Stress & Rescue (Sauveteur)'), 3);
  assert.equal(r('NAUI', 'Master Scuba Diver'), 3.5);
  assert.equal(r('PADI', 'Divemaster'), 4);
  assert.equal(r('CMAS', '1 star diver'), 1);
  assert.equal(r('CMAS', '2 star diver'), 2);
  assert.equal(r('CMAS', '3 star diver'), 4);
  assert.equal(r('CMAS', 'Instructor 1 star'), 5);
  assert.equal(r('FFESSM', 'Niveau 2'), 2);
  assert.equal(r('FFESSM', 'Niveau 4'), 4);
  assert.equal(r('FFESSM', 'MF1'), 5);
  assert.equal(r('BSAC', 'Sport Diver'), 2);
  assert.equal(r('BSAC', 'Advanced Diver'), 3);
  assert.equal(r('TDI', 'Trimix Diver'), 0.5);
  assert.equal(r('PADI', 'Tec 45'), 0.5);
  assert.equal(r('other', 'Licence xyz'), 0);
  assert.equal(r('PADI', ''), 0);
});

test('the highest certificate wins over the most recent card', () => {
  assert.equal(highestCertificate([cert('a', 'PADI', 'Open Water Diver', '2010-01-01'), cert('b', 'PADI', 'Rescue Diver', '2012-01-01'), cert('c', 'PADI', 'Enriched Air Diver (Nitrox)', '2020-01-01')])?.id, 'b');
  assert.equal(highestCertificate([cert('a', 'CMAS', '3 star diver', '2005-01-01'), cert('b', 'SSI', 'Advanced Open Water Diver', '2022-01-01'), cert('c', 'FFESSM', 'Niveau 3', '2018-01-01')])?.id, 'a');
  assert.equal(highestCertificate([cert('a', 'FFESSM', 'Niveau 2', '2001-01-01'), cert('b', 'NAUI', 'Advanced Scuba Diver', '2003-01-01')])?.id, 'b');
});

test('the instructor switch ranks first, whatever the level text', () => {
  const got = highestCertificate([cert('a', 'PADI', 'Divemaster', '2015-01-01'), cert('b', 'other', 'Autre', '2010-01-01', { instructorCert: true }), cert('c', 'PADI', 'Rescue Diver', '2020-01-01')]);
  assert.equal(got?.id, 'b');
});

test('an unknown level ranks lowest, even when recent; a technical card beats it', () => {
  assert.equal(highestCertificate([cert('a', 'other', 'Licence xyz', '2024-01-01'), cert('b', 'PADI', 'Open Water Diver', '2000-01-01')])?.id, 'b');
  assert.equal(highestCertificate([cert('a', 'other', 'Licence xyz', '2024-01-01'), cert('b', 'TDI', 'Extended Range', '2000-01-01')])?.id, 'b');
});

test('equal ranks: the most recent issue date; no certificate gives null', () => {
  assert.equal(highestCertificate([cert('a', 'PADI', 'Advanced Open Water Diver', '2010-01-01'), cert('b', 'SDI', 'Advanced Diver', '2016-01-01'), cert('c', 'FFESSM', 'Niveau 2', '2013-01-01')])?.id, 'b');
  assert.equal(highestCertificate([doc({ kind: 'insurance' })]), null);
});
