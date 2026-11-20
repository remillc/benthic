// The agency menu and the level suggestions (19 Nov 2026): the data holds together, the ids saved before stay, and a card of
// one of the new agencies or levels is read into them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CERT_AGENCIES, certAgencyOptions, certAgencySelection, certAgencyText } from '../../app/src/lib/cert-agencies.js';
import { CERT_LEVELS } from '../../app/src/lib/cert-levels.js';
import { AGENCIES, LEVEL_SUGGESTIONS, levelSuggestions } from '../../app/src/lib/profile.js';
import { parseCardText } from '../../app/src/lib/card-parse.js';

/** The ids that existed before the list grew: data already saved uses them. */
const SAVED_IDS = ['PADI', 'SSI', 'NAUI', 'CMAS', 'FFESSM', 'BSAC', 'SDI', 'TDI', 'IANTD', 'GUE', 'PDIC', 'ACUC', 'other'];

test('agencies: unique ids, the saved ones kept in their order, « other » last', () => {
  const ids = CERT_AGENCIES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 12), SAVED_IDS.slice(0, 12));
  assert.equal(ids.at(-1), 'other');
  for (const id of SAVED_IDS) assert.ok(ids.includes(id), id);
  assert.ok(ids.length >= 40);
  const rest = ids.slice(12, -1);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, 'en')));
  assert.equal(AGENCIES, CERT_AGENCIES);
  for (const a of CERT_AGENCIES.filter((x) => x.id !== 'other')) {
    assert.ok(a.name && a.country, a.id);
    assert.ok(['active', 'historical'].includes(a.status), a.id);
  }
});

test('levels: every key is an agency, no duplicate in a list, the earlier suggestions kept', () => {
  const ids = new Set(CERT_AGENCIES.map((a) => a.id));
  for (const [agency, list] of Object.entries(CERT_LEVELS)) {
    assert.ok(ids.has(agency), `unknown agency ${agency}`);
    assert.equal(new Set(list).size, list.length, `duplicate in ${agency}`);
  }
  assert.equal(LEVEL_SUGGESTIONS, CERT_LEVELS);
  const before = {
    PADI: ['Open Water Diver', 'Advanced Open Water Diver', 'Rescue Diver', 'Rescue Diver, Emergency First Response', 'Enriched Air Diver (Nitrox)', 'Deep Diver', 'Divemaster', 'Master Scuba Diver', 'Tec 40', 'Tec 45', 'Tec 50'],
    SSI: ['Open Water Diver', 'Advanced Adventurer', 'Advanced Open Water Diver', 'Stress & Rescue (Sauveteur)', 'Enriched Air Nitrox', 'Deep Diving', 'Divemaster', 'Master Diver'],
    NAUI: ['Scuba Diver', 'Advanced Scuba Diver', 'Rescue Scuba Diver', 'Master Scuba Diver', 'Enriched Air Nitrox', 'Divemaster'],
    CMAS: ['1 star diver', '2 star diver', '3 star diver', 'Instructor 1 star'],
    FFESSM: ['Niveau 1', 'Niveau 2', 'Niveau 3', 'Niveau 4', 'Plongeur Nitrox', 'Plongeur Nitrox confirmé', 'Initiateur', 'MF1', 'MF2'],
    BSAC: ['Ocean Diver', 'Sport Diver', 'Dive Leader', 'Advanced Diver', 'First Class Diver'],
    SDI: ['Open Water Scuba Diver', 'Advanced Diver', 'Rescue Diver', 'Solo Diver', 'Nitrox Diver'],
    TDI: ['Nitrox Diver', 'Advanced Nitrox Diver', 'Decompression Procedures', 'Extended Range', 'Trimix Diver'],
    IANTD: ['Open Circuit Nitrox', 'Advanced Nitrox', 'Technical Decompression', 'Normoxic Trimix'],
    GUE: ['Fundamentals', 'Recreational Diver 1', 'Recreational Diver 2', 'Tech 1', 'Tech 2'],
    PDIC: ['Open Water Diver', 'Advanced Diver', 'Rescue Diver'],
    ACUC: ['Open Water Diver', 'Advanced Diver', 'Rescue Diver'],
  };
  for (const [agency, list] of Object.entries(before)) for (const l of list) assert.ok(CERT_LEVELS[agency].includes(l), `${agency}: ${l}`);
});

test('levels: the main agencies have their whole ladder', () => {
  assert.ok(CERT_LEVELS.PADI.length >= 20);
  for (const l of ['Scuba Diver', 'Open Water Diver', 'Advanced Open Water Diver', 'Rescue Diver', 'Master Scuba Diver', 'Divemaster', 'Master Instructor', 'Course Director']) assert.ok(CERT_LEVELS.PADI.includes(l), l);
  for (const l of ['Dive Guide', 'Divemaster', 'Master Diver', 'Divemaster Instructor']) assert.ok(CERT_LEVELS.SSI.includes(l), l);
  for (const l of ['4 star diver', 'Instructor 2 star', 'Instructor 3 star']) assert.ok(CERT_LEVELS.CMAS.includes(l), l);
  for (const l of ['PA20', 'PE40', 'E3', 'Guide de palanquée']) assert.ok(CERT_LEVELS.FFESSM.includes(l), l);
  assert.deepEqual(levelSuggestions('CMAS', 'instructor'), ['Instructor 1 star', 'Instructor 2 star', 'Instructor 3 star']);
});

test('agency options sort the displayed labels in both languages', () => {
  for (const locale of ['fr', 'en']) {
    const options = certAgencyOptions(locale);
    assert.ok(!options.some((o) => o.value === 'other'));
    assert.deepEqual(options.map((o) => o.value).sort(), CERT_AGENCIES.filter((a) => a.id !== 'other' && CERT_LEVELS[a.id]?.length).map((a) => a.id).sort());
    for (let i = 1; i < options.length; i++) {
      assert.ok(options[i - 1].label.localeCompare(options[i].label, locale, { sensitivity: 'base' }) <= 0);
    }
  }
});

test('levels: suggestions follow the selected agency and allow an unlisted level', () => {
  assert.ok(levelSuggestions('FQAS', '').includes('Plongeur classe A'));
  assert.ok(levelSuggestions('CDAA', '').includes('Advanced Cave Diver'));
  assert.ok(!levelSuggestions('FQAS', '').includes('Advanced Cave Diver'));
  assert.deepEqual(levelSuggestions('other', ''), []);
  assert.ok(!certAgencyOptions('en').some((o) => o.value === 'SUSV'));
  assert.ok(CERT_AGENCIES.some((a) => a.id === 'SUSV'));
});

test('agency text preserves saved identifiers and stores new names as other', () => {
  const options = certAgencyOptions('en');
  const empty = { agency: '', text: '' };
  const padi = options.find((o) => o.value === 'PADI');
  assert.ok(padi);
  assert.deepEqual(certAgencySelection(padi.label, options, empty), { agency: 'PADI', agencyName: '' });
  assert.deepEqual(certAgencySelection('padi', options, empty), { agency: 'PADI', agencyName: '' });
  assert.deepEqual(certAgencySelection('  My agency  ', options, empty), { agency: 'other', agencyName: 'My agency' });
  assert.deepEqual(certAgencySelection('   ', options, empty), { agency: '', agencyName: '' });
  assert.equal(certAgencyText('other', 'My agency', options), 'My agency');
  assert.deepEqual(certAgencySelection('My agency', options, { agency: 'other', text: 'My agency' }), { agency: 'other', agencyName: 'My agency' });
  assert.deepEqual(certAgencySelection('PADI', options, { agency: 'other', text: 'PADI' }), { agency: 'other', agencyName: 'PADI' });
  assert.deepEqual(certAgencySelection('Legacy ID', options, { agency: 'Legacy ID', text: 'Legacy ID' }), { agency: 'Legacy ID', agencyName: '' });
  assert.deepEqual(certAgencySelection('SUSV', options, empty), { agency: 'SUSV', agencyName: '' });
});

test('cards: the new agencies and levels are read', () => {
  const read = (text) => parseCardText(text, '2026-11-19');
  assert.equal(read('Sub-Aqua Association\nSAA Card No 556677').agency, 'SAA');
  assert.equal(read('VDST Verband Deutscher Sporttaucher\nNr 123456').agency, 'VDST');
  const r = read('RAID\nRebreather Association of International Divers\nOpen Water 20\nNo 100200300');
  assert.equal(r.agency, 'RAID');
  assert.equal(r.level, 'Open Water 20');
  const c = read('CMAS\nFour Star Diver\nNo 998877');
  assert.deepEqual([c.agency, c.level], ['CMAS', '4 star diver']);
  const c4 = read('CMAS ****\nNo 998877');
  assert.deepEqual([c4.agency, c4.level], ['CMAS', '4 star diver']);
  const s = read('SSI\nDive Guide\nNo 112233');
  assert.deepEqual([s.agency, s.level], ['SSI', 'Dive Guide']);
  const p = read('PADI\nMaster Scuba Diver Trainer\nNo 445566');
  assert.deepEqual([p.agency, p.level], ['PADI', 'Master Scuba Diver Trainer']);
  const f = read('FFESSM\nPA20 PE40\nNo 123456');
  assert.equal(f.agency, 'FFESSM');
  const gp = read('FFESSM\nGuide de palanquée\nNo 123456');
  assert.equal(gp.level, 'Guide de palanquée');
});

test('photo slots: the progress indicator shows while the picture is read, and saving waits for it', async () => {
  const { readFileSync } = await import('node:fs');
  const page = (name) => readFileSync(new URL(`../../app/src/pages/${name}`, import.meta.url), 'utf8');
  const card = page('ProfileCertEdit.svelte');
  assert.match(card, /import PhotoBusy/);
  assert.equal((card.match(/\{#if busy\[side\]\}<PhotoBusy \/>\{\/if\}/g) ?? []).length, 2); // the empty slot and the filled one
  assert.match(card, /!busy\.front && !busy\.back/); // no save while a picture is pending
  assert.match(card, /URL\.createObjectURL\(scanned\.image\)/); // the picture shows at once
  const doc = page('ProfileDocumentEdit.svelte');
  assert.equal((doc.match(/<PhotoBusy \/>/g) ?? []).length, 2); // the card and a page of a certificate
  assert.match(doc, /!saving && !busy/);
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    assert.match(json.diverProfile.cert.photoReading, /…$/);
  }
  const busy = readFileSync(new URL('../../app/src/components/PhotoBusy.svelte', import.meta.url), 'utf8');
  assert.match(busy, /role="status"|label=\{label\}/);
  assert.match(busy, /prefers-reduced-motion/);
});
