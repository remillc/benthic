// What the text read on a card or a document proposes (card extraction, 19 Nov 2026). Every text below is invented: no real card data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCardText, parseInsuranceText, parseMedicalText, parseOtherText, joinTexts, scanCard } from '../../app/src/lib/card-scan.js';
import { photoUrl } from '../../app/src/lib/card-canvas.js';

const TODAY = '2026-11-19';
/** @param {string} text */
const card = (text) => parseCardText(text, TODAY);
/** @param {string} text @param {Record<string, string>} want */
function has(text, want) {
  const got = card(text);
  for (const [k, v] of Object.entries(want)) assert.equal(/** @type {any} */ (got)[k], v, `${k} in ${JSON.stringify(text)}`);
}

test('certification cards: PADI, in capitals, with an instructor and a date in month-name form', () => {
  has('PADI\nOPEN WATER DIVER\nDIVER NO. 1803O11234\nCERTIFIED 12 MAR 2019\nINSTRUCTOR: JEAN-LUC MARTIN\nINSTRUCTOR NO: 456789', {
    agency: 'PADI', level: 'Open Water Diver', number: '1803011234', issuedOn: '2019-03-12', instructor: 'Jean-Luc Martin', instructorNumber: '456789',
  });
  has('PADI\nAdvanced Open Water Diver\nPADI No 2012AB5555\nDate: 2021-08-03', { agency: 'PADI', level: 'Advanced Open Water Diver', number: '2012AB5555', issuedOn: '2021-08-03' });
  has('Professional Association of Diving Instructors\nEnriched Air Diver\nCert. # 1904 22 8811\n05/2022', { agency: 'PADI', level: 'Enriched Air Diver (Nitrox)', number: '1904 22 8811', issuedOn: '2022-05-01' });
  has('PADI\nRescue Diver\nEmergency First Response\nDiver No\n1605AC0412', { agency: 'PADI', level: 'Rescue Diver, Emergency First Response', number: '1605AC0412' });
  has('PADI DEEP DIVER\nNo. 1707XY1000', { agency: 'PADI', level: 'Deep Diver' });
  has('P A D I\nDivemaster\nN° 3345 6677', { agency: '', level: 'Divemaster' }); // spaced letters: nothing is claimed about the agency
});

test('certification cards: SSI, NAUI, CMAS, FFESSM in French', () => {
  has('SSI\nScuba Schools International\nStress & Rescue\nCert # 7721-0934\nIssued 4 June 2016', { agency: 'SSI', level: 'Stress & Rescue (Sauveteur)', number: '7721-0934', issuedOn: '2016-06-04' });
  has('SSI\nAdvanced Adventurer\nDiver ID: 4400123', { agency: 'SSI', level: 'Advanced Adventurer', number: '4400123' });
  has('NAUI\nRESCUE SCUBA DIVER\nNAUI N° 884102\nDate 09-10-2014', { agency: 'NAUI', level: 'Rescue Scuba Diver', number: '884102', issuedOn: '2014-10-09' });
  has('CMAS\n2 STAR DIVER\nCard number: BE-2234-98', { agency: 'CMAS', level: '2 star diver', number: 'BE-2234-98' });
  has('CMAS ***\nThree star diver\nCertificate No 20-1234-5678', { agency: 'CMAS', level: '3 star diver' });
  has('CMAS **\nPlongeur\nN° F-1-123456', { agency: 'CMAS', level: '2 star diver' });
  has('FFESSM\nFédération Française d\'Études et de Sports Sous-Marins\nPlongeur Niveau 2\nLicence n° A-12-345678\nDélivré le 14 juillet 2018', {
    agency: 'FFESSM', level: 'Niveau 2', number: 'A-12-345678', issuedOn: '2018-07-14',
  });
  has('FFESSM CMAS\nBrevet de Plongeur Niveau 3\nN° de brevet : 18-0456-AB\nObtenu le 03/11/2017\nMoniteur : Marie Dubois', { agency: 'FFESSM', level: 'Niveau 3', issuedOn: '2017-11-03', instructor: 'Marie Dubois' });
  has('FFESSM\nNiveau IV\nLicence N 12 34 56 78', { level: 'Niveau 4' });
  has('FFESSM\nPlongeur Nitrox Confirmé\nBrevet N° 551122', { agency: 'FFESSM', level: 'Plongeur Nitrox confirmé', number: '551122' });
  has('FFESSM - CODEP 35\nInitiateur\nn° 998877', { agency: 'FFESSM', level: 'Initiateur' });
  has('F.F.E.S.S.M.\nMF1', { level: 'MF1' });
  has('FFESSM\nMoniteur Fédéral 2ème degré\nN° 77665544', { level: 'MF2' });
});

test('certification cards: BSAC, SDI, TDI, IANTD, GUE, PDIC, ACUC and the agencies that are not in the list', () => {
  has('BSAC\nBritish Sub-Aqua Club\nSport Diver\nMembership No 123456\n21 Jan 2010', { agency: 'BSAC', level: 'Sport Diver', number: '123456', issuedOn: '2010-01-21' });
  has('SDI\nScuba Diving International\nOpen Water Scuba Diver\nSDI TDI ERDI\nDiver No. 99887766', { agency: 'SDI', level: 'Open Water Scuba Diver', number: '99887766' });
  has('TDI SDI ERDI\nTDI\nTechnical Diving International\nAdvanced Nitrox Diver\nNumber 20231188', { agency: 'TDI', level: 'Advanced Nitrox Diver', number: '20231188' });
  has('SDI TDI ERDI\nTDI\nTrimix Diver\nCert. no 5566-1122', { agency: 'TDI', level: 'Trimix Diver' });
  has('IANTD\nNormoxic Trimix\nIANTD No 33221', { agency: 'IANTD', level: 'Normoxic Trimix' });
  has('GUE\nGlobal Underwater Explorers\nTech 1\nID 8899-77', { agency: 'GUE', level: 'Tech 1' });
  has('GUE\nRecreational Diver 2\nMember no. 120044', { agency: 'GUE', level: 'Recreational Diver 2' });
  has('ACUC\nAdvanced Diver\nNo 441122', { agency: 'ACUC', level: 'Advanced Diver' });
  has('PDIC\nRescue Diver\nNo 9988001', { agency: 'PDIC', level: 'Rescue Diver' });
  has('RAID\nRescue Advanced Diver\nOpen Water 20\nN° 100200300', { agency: 'RAID', agencyName: '' });
  has('PSS Worldwide\nProfessional Scuba Schools\nOpen Water\nNo 777000', { agency: 'PSS', agencyName: '' });
  has('ANMP\nAssociation Nationale des Moniteurs de Plongée\nN° 4455', { agency: 'ANMP', agencyName: '' });
});

test('certification cards: noise, broken lines, uppercase and nothing sure', () => {
  has('  PADI  \n\nAdvanced   Open Water  Diver\n\nDiver No.\n\n1608AC0412', { agency: 'PADI', level: 'Advanced Open Water Diver', number: '1608AC0412' });
  has('padi\nrescue diver\ndiver no 1608ac0412\ndate 1O/O6/2O15', { agency: 'PADI', level: 'Rescue Diver', number: '1608AC0412', issuedOn: '2015-06-10' });
  has('PADI\nOpen Water Diver\nDate of birth 04/05/1988\nDate 12/06/2015', { issuedOn: '2015-06-12' });
  has('PADI\nOpen Water Diver\nExpires 12/06/2031', { issuedOn: '' });
  has('PADI\nOpen Water Scuba Instructor\nJean Dupont\nNo 123456', { instructor: '' });
  assert.deepEqual(card(''), { agency: '', agencyName: '', level: '', number: '', issuedOn: '', instructor: '', instructorNumber: '' });
  assert.deepEqual(card('Hello world'), { agency: '', agencyName: '', level: '', number: '', issuedOn: '', instructor: '', instructorNumber: '' });
  // Nothing is claimed about the level when the agency is unknown and two levels fit equally.
  assert.equal(card('Nitrox').level, '');
});

test('the two sides of a card are read together', () => {
  const front = 'PADI\nAdvanced Open Water Diver\nDiver No. 1608AC0412';
  const back = 'Date 12 JUN 2015\nInstructor: Marie Dubois';
  assert.equal(card(front).issuedOn, '');
  const both = card(joinTexts(front, back));
  assert.equal(both.issuedOn, '2015-06-12');
  assert.equal(both.instructor, 'Marie Dubois');
  assert.equal(both.level, 'Advanced Open Water Diver');
  assert.equal(joinTexts('a', '', 'b'), 'a\nb');
});

test('dates in the usual forms', () => {
  assert.equal(card('PADI\nDate: 12 mars 2019').issuedOn, '2019-03-12');
  assert.equal(card('PADI\nDate 12MAR2019').issuedOn, '2019-03-12');
  assert.equal(card('PADI\nIssued March 12, 2019').issuedOn, '2019-03-12');
  assert.equal(card('PADI\nDate 03/2019').issuedOn, '2019-03-01');
  assert.equal(card('PADI\nDate 12.03.19').issuedOn, '2019-03-12');
  assert.equal(card('PADI\nDate 2019.03.12').issuedOn, '2019-03-12');
  assert.equal(card('PADI\nDate 31/02/2019').issuedOn, '');
});

test('insurance cards: DAN, Aquamed, Divemaster Insurance, AXA', () => {
  assert.deepEqual(parseInsuranceText('DAN Europe\nPlan: Master\nMember ID: 1234 5678 90\nEmergency +39 06 4211 5685\nValid from 01/03/2026\nExpires 28/02/2027'), {
    insurer: 'DAN Europe', plan: 'Master', policyNumber: '1234 5678 90', emergencyPhone: '+39 06 4211 5685', startsOn: '2026-03-01', expiresOn: '2027-02-28',
  });
  assert.deepEqual(parseInsuranceText('DAN\nDivers Alert Network\nPreferred Plus Membership\nMember No. 88 410 233\n24h Emergency: +1 919 684-9111\nValid through 2027-03-14'), {
    insurer: 'DAN', plan: 'Preferred Plus', policyNumber: '88 410 233', emergencyPhone: '+1 919 684-9111', startsOn: '', expiresOn: '2027-03-14',
  });
  assert.deepEqual(parseInsuranceText('AQUAMED\nAssurance plongée\nFormule : Premium\nContrat n° AQ-2026-004455\nUrgences 00 33 (0)1 23 45 67 89\nDu 15/03/2026 au 14/03/2027'), {
    insurer: 'Aquamed', plan: 'Premium', policyNumber: 'AQ-2026-004455', emergencyPhone: '+33 1 23 45 67 89', startsOn: '2026-03-15', expiresOn: '2027-03-14',
  });
  const noisy = parseInsuranceText('DIVEMASTER INSURANCE\nPOLICY NO. 7O4412\nEMERGENCY +44 (0)20 7946 0000\nPERIOD 1O/O1/2O26 - 1O/O1/2O27');
  assert.equal(noisy.insurer, 'Divemaster Insurance');
  assert.equal(noisy.policyNumber, '704412');
  assert.equal(noisy.emergencyPhone, '+44 20 7946 0000');
  assert.equal(noisy.startsOn, '2026-01-10');
  assert.equal(noisy.expiresOn, '2027-01-10');
  const axa = parseInsuranceText('AXA\nAssistance plongée\nN° adhérent : 99-123456\nValable jusqu\'au 12/2027');
  assert.equal(axa.insurer, 'AXA');
  assert.equal(axa.policyNumber, '99-123456');
  assert.equal(axa.expiresOn, '2027-12-31', 'a month and a year is valid to the end of the month');
  assert.equal(parseInsuranceText('DAN Canada\nBorn 04/05/1988\nExpires 14/03/2027').startsOn, '', 'a birth date is not a start');
  assert.equal(parseInsuranceText('hello').insurer, '');
});

test('medical certificates: doctor, date, expiry, validity written in words', () => {
  assert.deepEqual(parseMedicalText('Cabinet médical\nDocteur Hélène LAFLEUR\nCertificat médical d\'absence de contre-indication à la pratique de la plongée\nFait le 09/12/2025\nValable jusqu\'au 09/12/2026', TODAY), {
    doctor: 'Dr Hélène Lafleur', issuedOn: '2025-12-09', expiresOn: '2026-12-09', fit: true,
  });
  assert.deepEqual(parseMedicalText('Je soussigné, Dr. Jean-Pierre Martin, certifie que le patient est apte à la plongée.\nFait à Lyon, le 3 février 2026\nCe certificat est valable un an.', TODAY), {
    doctor: 'Dr Jean-Pierre Martin', issuedOn: '2026-02-03', expiresOn: '2027-02-03', fit: true,
  });
  const en = parseMedicalText('Dr Alan Brooks\nFit to dive certificate\nDate of examination: 5 May 2026\nValid for 12 months\nDate of birth: 1 Jan 1980', TODAY);
  assert.equal(en.doctor, 'Dr Alan Brooks');
  assert.equal(en.issuedOn, '2026-05-05');
  assert.equal(en.expiresOn, '2027-05-05');
  assert.deepEqual(parseMedicalText('Docteur Paul Durand\nPatient inapte à la plongée\n01/02/2026', TODAY), { doctor: '', issuedOn: '', expiresOn: '', fit: false });
  assert.deepEqual(parseMedicalText('', TODAY), { doctor: '', issuedOn: '', expiresOn: '', fit: false });
});

test('other documents: a heading and a labelled expiry, nothing from a bare date', () => {
  assert.deepEqual(parseOtherText('PERMIS BATEAU CÔTIER\nN° 12AB3456\nValable jusqu\'au 01/06/2030'), { title: 'Permis bateau côtier', number: '12AB3456', expiresOn: '2030-06-01' });
  assert.deepEqual(parseOtherText('Certificate of altitude diving\nDate 12/06/2020'), { title: 'Certificate of altitude diving', number: '', expiresOn: '' });
  assert.deepEqual(parseOtherText('12345'), { title: '', number: '', expiresOn: '' });
});

test('a scan of one side: the picture comes back as an image the screen can show', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const scanned = await scanCard('front', { scanner: async () => ({ action: 'done', image: jpeg, text: 'PADI' }), picker: async () => null });
  assert.ok(scanned);
  assert.equal(scanned.image.type, 'image/jpeg');
  assert.equal(scanned.image.size, 7);
  assert.match(photoUrl(new Uint8Array(await scanned.image.arrayBuffer())), /^blob:/);
});

test('the Android scanner hands the picture to the plugin through a file, not through the result Intent (Binder limit of about 1 MB)', () => {
  const dir = new URL('../../plugins/opendives-core/android/src/main/java/org/opendives/core/', import.meta.url);
  const activity = readFileSync(new URL('DocumentScanActivity.kt', dir), 'utf8');
  const plugin = readFileSync(new URL('OpenDivesCorePlugin.kt', dir), 'utf8');
  assert.match(activity, /put\("path"/);
  assert.doesNotMatch(activity, /put\("image"/);
  assert.match(plugin, /optString\("path"/);
  assert.match(plugin, /put\("image"/);
});
