// « Brevets et documents » (task 2026-11-19-309, point 3): the expiry badges, the sections of the list, the validation, the
// notification plan, the insurance card's text, and the files of a document in the sealed local store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryState, badgeKey, groupDocuments, documentNotificationPlan, drawnCard, cardTone, snoozeDay } from '../../app/src/lib/documents.js';
import { documentProblems, instructorNumber, createProfile } from '../../app/src/lib/profile.js';
import { parseInsuranceText, findDates } from '../../app/src/lib/card-scan.js';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox } from '../../app/src/lib/secret-box.js';

const TODAY = '2026-11-19';

/** @param {Partial<import('../../app/src/lib/profile.js').Certification>} o */
const doc = (o) => ({
  id: 'd1', kind: 'other', agency: '', agencyName: '', level: '', number: '', issuedOn: '', instructor: '', instructorCert: false, title: '', expiresOn: '',
  notifyDays: 30, insurer: '', plan: '', policyNumber: '', emergencyPhone: '', startsOn: '', doctor: '', notes: '', documents: [], updatedAt: '', ...o,
});

test('the expiry state and its badge: the mock-up\'s « Expire dans 20 jours » and « Dans 4 mois »', () => {
  assert.deepEqual(expiryState('', TODAY), { state: 'none', days: 0 });
  const medical = expiryState('2026-12-09', TODAY);
  assert.deepEqual(medical, { state: 'soon', days: 20 });
  assert.deepEqual(badgeKey(medical), { key: 'inDays', n: 20 });
  const insurance = expiryState('2027-03-14', TODAY);
  assert.equal(insurance.state, 'valid');
  assert.deepEqual(badgeKey(insurance), { key: 'inMonths', n: 4 });
  assert.deepEqual(badgeKey(expiryState('2026-11-19', TODAY)), { key: 'today', n: 0 });
  assert.deepEqual(badgeKey(expiryState('2026-11-20', TODAY)), { key: 'tomorrow', n: 1 });
  assert.deepEqual(badgeKey(expiryState('2026-11-16', TODAY)), { key: 'expiredDays', n: 3 });
  assert.deepEqual(badgeKey(expiryState('2029-11-19', TODAY)), { key: 'inYears', n: 3 });
  assert.equal(badgeKey({ state: 'none', days: 0 }), null);
});

test('the list: Brevets, Assurance et santé, Autres documents, and the expired ones apart; a card never expires', () => {
  const docs = [
    doc({ id: 'c', kind: 'certification', agency: 'PADI', level: 'Rescue', number: '1' }),
    doc({ id: 'i', kind: 'insurance', insurer: 'DAN', expiresOn: '2027-03-14' }),
    doc({ id: 'm', kind: 'medical', expiresOn: '2026-12-09' }),
    doc({ id: 'o', kind: 'other', title: 'Club' }),
    doc({ id: 'old', kind: 'insurance', insurer: 'AXA', expiresOn: '2026-01-01' }),
  ];
  const g = groupDocuments(docs, TODAY);
  assert.deepEqual(g.certs.map((d) => d.id), ['c']);
  assert.deepEqual(g.health.map((d) => d.id), ['m', 'i'], 'the soonest expiry first');
  assert.deepEqual(g.others.map((d) => d.id), ['o']);
  assert.deepEqual(g.expired.map((d) => d.id), ['old']);
});

test('a card without a photo is drawn from the details entered', () => {
  const words = { agencyOther: 'Autre', medical: 'Médical' };
  assert.deepEqual(drawnCard(doc({ kind: 'certification', agency: 'PADI', level: 'Rescue Diver' }), words), { heading: 'PADI', lines: ['Rescue Diver'] });
  assert.deepEqual(drawnCard(doc({ kind: 'insurance', insurer: 'DAN Canada', plan: 'Sport', policyNumber: '88 410 233' }), words), { heading: 'DAN CANADA', lines: ['Sport', '88 410 233'] });
  assert.equal(cardTone(doc({ kind: 'insurance' })), 'red');
  assert.equal(cardTone(doc({ kind: 'certification', agency: 'SSI' })), 'green');
});

test('validation: an insurance needs its insurer and its expiry, a medical certificate its expiry, another document its title', () => {
  assert.deepEqual(documentProblems('insurance', { insurer: '', expiresOn: '' }, TODAY), { insurer: 'empty', expiresOn: 'empty' });
  assert.deepEqual(documentProblems('insurance', { insurer: 'DAN', expiresOn: '2027-03-14', startsOn: '2026-03-15', emergencyPhone: '+1 919 684-9111' }, TODAY), {});
  assert.deepEqual(documentProblems('insurance', { insurer: 'DAN', expiresOn: '2027-03-14', emergencyPhone: '12' }, TODAY), { emergencyPhone: 'phone' });
  assert.deepEqual(documentProblems('insurance', { insurer: 'DAN', expiresOn: '2025-01-01', startsOn: '2026-03-15' }, TODAY), { expiresOn: 'order' });
  assert.deepEqual(documentProblems('insurance', { insurer: 'DAN', expiresOn: '2027-02-30' }, TODAY), { expiresOn: 'date' });
  assert.deepEqual(documentProblems('medical', { expiresOn: '2026-12-09', issuedOn: '2025-12-09' }, TODAY), {});
  assert.deepEqual(documentProblems('medical', { expiresOn: '2026-12-09', issuedOn: '2027-01-01' }, TODAY), { issuedOn: 'future' });
  assert.deepEqual(documentProblems('other', { title: ' ' }, TODAY), { title: 'empty' });
  assert.deepEqual(documentProblems('other', { title: 'Club' }, TODAY), {}, 'the expiry of another document is optional');
  assert.deepEqual(documentProblems('certification', { agency: 'PADI', level: 'OW', number: '1' }, TODAY), {});
  // An expired date is accepted: the document is then listed as expired.
  assert.deepEqual(documentProblems('insurance', { insurer: 'DAN', expiresOn: '2020-01-01' }, TODAY), {});
});

test('notifications: the lead time before the expiry, the day, and the snooze 2 weeks ahead; none when off or for a card', () => {
  const docs = [
    doc({ id: 'm', kind: 'medical', expiresOn: '2026-12-09', notifyDays: 30 }),
    doc({ id: 'i', kind: 'insurance', insurer: 'DAN', expiresOn: '2027-03-14', notifyDays: 60 }),
    doc({ id: 'c', kind: 'certification', agency: 'PADI', level: 'OW', number: '1' }),
    doc({ id: 'o', kind: 'other', title: 'Club' }),
  ];
  const plan = documentNotificationPlan(docs, TODAY, { enabled: true });
  assert.deepEqual(plan.map((p) => [p.id, p.on]), [
    // the medical certificate's lead day (9 November) is past: only the day remains
    ['m:day', '2026-12-09'],
    ['i:lead', '2027-01-13'],
    ['i:day', '2027-03-14'],
  ]);
  assert.deepEqual(documentNotificationPlan(docs, TODAY, { enabled: false }), []);
  const snoozeOn = snoozeDay(TODAY);
  assert.equal(snoozeOn, '2026-12-03');
  const snoozed = documentNotificationPlan(docs, TODAY, { enabled: true, snoozed: { m: snoozeOn } });
  assert.deepEqual(snoozed.filter((p) => p.docId === 'm').map((p) => [p.kind, p.on]), [['snooze', '2026-12-03'], ['day', '2026-12-09']]);
  // A snooze after the expiry day is of no use.
  assert.equal(documentNotificationPlan(docs, TODAY, { enabled: true, snoozed: { m: '2026-12-20' } }).some((p) => p.kind === 'snooze'), false);
});

test('an insurance card\'s text proposes the insurer, the policy, the phone and the dates', () => {
  const text = 'DAN Canada\nValérie Tremblay\nMembre · Sport\nMember no. 88 410 233\nEmergency +1 919 684-9111\nValid from 15/03/2026\nExpires 14/03/2027';
  const found = parseInsuranceText(text);
  assert.equal(found.insurer, 'DAN Canada');
  assert.equal(found.policyNumber, '88 410 233');
  assert.equal(found.emergencyPhone, '+1 919 684-9111');
  assert.equal(found.startsOn, '2026-03-15');
  assert.equal(found.expiresOn, '2027-03-14');
  assert.deepEqual(parseInsuranceText(''), { insurer: '', plan: '', policyNumber: '', emergencyPhone: '', startsOn: '', expiresOn: '' });
  assert.deepEqual(findDates('du 01/02/2026 au 28/02/2027').map((d) => d.date), ['2026-02-01', '2027-02-28']);
});

test('the instructor\'s number: the first card marked « Brevet de moniteur »', () => {
  const certs = [
    doc({ id: 'a', kind: 'certification', agency: 'PADI', level: 'OW', number: '1' }),
    doc({ id: 'b', kind: 'certification', agency: 'PADI', level: 'Open Water Scuba Instructor', number: '412 778', instructorCert: true }),
  ];
  assert.deepEqual(instructorNumber(certs), { number: '412 778', agency: 'PADI', level: 'Open Water Scuba Instructor' });
  assert.equal(instructorNumber([certs[0]]), null);
});

test('documents in the sealed store: an insurance with a PDF, a medical certificate with pages, files kept or removed', async () => {
  const store = createFileStore(memoryBackend());
  const key = { v: '' };
  const box = createSecretBox({ read: async () => key.v, write: async (k) => (key.v = k) });
  const profile = createProfile(store, box, { now: () => new Date('2026-11-19T12:00:00Z') });
  const insurance = await profile.saveDocument({ kind: 'insurance', insurer: 'DAN Canada', plan: 'Sport', policyNumber: '88 410 233', emergencyPhone: '+1 919 684-9111', startsOn: '2026-03-15', expiresOn: '2027-03-14', notifyDays: 60, notes: 'Plongée technique', files: [{ side: 'front', bytes: new Uint8Array([37, 80, 68, 70]), mime: 'application/pdf' }] });
  assert.equal(insurance.kind, 'insurance');
  assert.equal(insurance.insurer, 'DAN Canada');
  assert.equal(insurance.notifyDays, 60);
  assert.equal(insurance.documents[0].mime, 'application/pdf');
  const medical = await profile.saveDocument({ kind: 'medical', doctor: 'Dr Hélène Lafleur', issuedOn: '2025-12-09', expiresOn: '2026-12-09', notifyDays: 30, files: [{ side: 'page', page: 1, bytes: new Uint8Array([1]) }, { side: 'page', page: 2, bytes: new Uint8Array([2]) }] });
  assert.deepEqual(medical.documents.map((d) => [d.side, d.page]), [['page', 1], ['page', 2]]);
  const bytes = await profile.readPhoto(medical.id, medical.documents[1].hash);
  assert.deepEqual([...(bytes ?? [])], [2]);
  // Page 1 is removed, page 2 stays and becomes page 1.
  const kept = await profile.saveDocument({ id: medical.id, kind: 'medical', doctor: 'Dr Hélène Lafleur', issuedOn: '2025-12-09', expiresOn: '2026-12-09', notifyDays: 30, files: [{ side: 'page', page: 1, hash: medical.documents[1].hash }] });
  assert.equal(kept.documents.length, 1);
  assert.equal(await profile.readPhoto(medical.id, medical.documents[0].hash), null, 'the removed page is gone from the store');
  assert.deepEqual([...((await profile.readPhoto(medical.id, medical.documents[1].hash)) ?? [])], [2]);
  // A card saved the old way keeps its other fields and is read as a card.
  const card = await profile.saveCertification({ agency: 'PADI', level: 'OW', number: '1', instructorCert: true });
  assert.equal((await profile.listCertifications()).find((c) => c.id === card.id)?.instructorCert, true);
  assert.equal((await profile.listCertifications()).length, 3);
  await assert.rejects(() => profile.saveDocument({ kind: 'insurance', insurer: '', expiresOn: '' }), /INVALID_CERTIFICATION/);
});
