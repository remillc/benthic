import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { numbersText, changeText, revertText, changesLine, versionLine, differenceBlocks, confirmText, diveVersionLine, isoOfEpoch, versionWhen } from '../../app/src/lib/backup-text.js';

const fr = JSON.parse(readFileSync(new URL('../../app/src/i18n/fr.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../../app/src/i18n/en.json', import.meta.url), 'utf8'));
const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
const nbsp = (s) => s.replace(/[  ]/g, ' ');

test('dive numbers read as in the mock-ups: « N° 310, 311 et 312 »', () => {
  const dives = (...numbers) => numbers.map((number) => ({ number, key: '2026-01-01 10:00:00' }));
  assert.equal(nbsp(numbersText(dives(310, 311, 312))), 'N° 310, 311 et 312');
  assert.equal(nbsp(numbersText(dives(298))), 'N° 298');
});

test('what a sync changed in a dive reads as in the mock-ups', () => {
  assert.equal(changeText({ key: 'buddy', from: '', to: 'Michael' }), 'Compagnon ajouté : Michael');
  assert.equal(changeText({ key: 'site', from: 'Site à préciser', to: 'Northern Arch' }), 'Site : Northern Arch, auparavant « Site à préciser »');
  assert.equal(changeText({ key: 'notes', from: 'a', to: 'b' }), 'Notes modifiées');
  assert.equal(changeText({ key: 'profile', from: '', to: '' }), 'Profil modifié');
  assert.equal(changesLine([{ key: 'buddy', from: '', to: 'M' }, { key: 'rating', from: '', to: '4' }]), 'Compagnon ajouté : M · Note : 4');
  assert.equal(diveVersionLine({ state: 'new', computer: 'Shearwater Perdix 2', changes: [] }), 'Téléchargée du Shearwater Perdix 2');
  assert.equal(diveVersionLine({ state: 'new', computer: '', changes: [] }), 'Plongée ajoutée');
  assert.equal(diveVersionLine({ state: 'deleted', computer: '', changes: [] }), 'Plongée supprimée');
});

test('restoring puts the old value back: « N° 298 : le site était « Site à préciser » »', () => {
  assert.equal(revertText({ key: 'site', from: 'Northern Arch', to: 'Site à préciser' }), 'le site était « Site à préciser »');
  assert.equal(revertText({ key: 'site', from: 'Northern Arch', to: '' }), 'le site n’était pas renseigné');
  assert.equal(revertText({ key: 'buddy', from: 'Michael', to: '' }), 'il n’y avait pas de compagnon');
});

test('a version row says its count and what changed since', () => {
  const v = (since) => ({ counts: { dives: 312, sites: 4, pieces: null }, since });
  assert.equal(nbsp(versionLine(v(null))), '312 plongées');
  assert.equal(nbsp(versionLine(v({ added: 0, removed: 0, modified: 1, sites: 0 }))), '312 plongées · 1 plongée modifiée depuis');
  assert.equal(nbsp(versionLine(v({ added: 3, removed: 0, modified: 0, sites: 0 }))), '312 plongées · 3 plongées ajoutées depuis');
  assert.equal(nbsp(versionLine(v({ added: 0, removed: 0, modified: 0, sites: 0 }))), '312 plongées · Identique au carnet actuel');
});

test('the differences and the confirmation say what will be removed, brought back or reverted', () => {
  const detail = {
    counts: { dives: 309, sites: 47, pieces: 14 },
    added: [310, 311, 312].map((number) => ({ number, key: 'k' })),
    removed: [],
    modified: [{ key: 'x', number: 298, changes: [{ key: 'site', from: 'Northern Arch', to: 'Site à préciser' }] }],
    modifiedTotal: 1,
    sites: { added: 0, removed: 0, modified: 0 },
  };
  const blocks = differenceBlocks(detail).map((b) => [b.kind, nbsp(b.title), nbsp(b.detail)]);
  assert.deepEqual(blocks, [
    ['added', '3 plongées ajoutées depuis', 'N° 310, 311 et 312. Elles seront retirées.'],
    ['modified', '1 plongée modifiée depuis', 'N° 298 : le site était « Site à préciser »'],
  ]);
  // The sentence of the mock-up.
  assert.equal(
    nbsp(confirmText(detail)),
    'Les plongées N° 310, 311 et 312 seront retirées, et la plongée N° 298 reprendra « Site à préciser ». Le carnet actuel reste disponible dans les versions.',
  );
  assert.equal(nbsp(confirmText({ ...detail, added: [], modified: [], modifiedTotal: 0 })), 'Les plongées ne changent pas. Le carnet actuel reste disponible dans les versions.');
  const back = confirmText({ ...detail, added: [], modified: [], modifiedTotal: 0, removed: [{ number: 5, key: 'k' }] });
  assert.match(nbsp(back), /^La plongée N° 5 sera rétablie\./);
});

test('a moment is told as today, yesterday or a date', () => {
  const t0 = Date.UTC(2026, 10, 19, 10, 28) / 1000;
  const local = isoOfEpoch(t0);
  assert.equal(local.length, 19);
  assert.match(nbsp(versionWhen(t0, local)), /^Aujourd’hui, /);
  assert.match(nbsp(versionWhen(t0 - 86400, local)), /^Hier, /);
  assert.match(nbsp(versionWhen(t0 - 4 * 86400, local)), /nov. 2026/);
});

/** Every key of an object, with the plural forms as one text. */
function keys(o, prefix = '') {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) && !('other' in v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

test('French and English have the same texts for the backup screens, and the 90 days of the media are said', () => {
  assert.deepEqual(keys(fr.backup).sort(), keys(en.backup).sort());
  assert.match(fr.backup.media, /90 jours/);
  assert.match(en.backup.media, /90 days/);
  assert.match(fr.backup.deleted.note, /90 jours/);
  assert.match(en.backup.deleted.note, /90 days/);
  // The deletion of the account says it erases the history, the deleted dives included.
  assert.match(fr.account.manage.deleteText, /tout l’historique du carnet \(les plongées supprimées comprises\)/);
  assert.match(en.account.manage.deleteText, /whole history of the logbook \(deleted dives included\)/);
});

test('the screens, the dialog and the dive menu are wired', () => {
  for (const f of ['BackupMain', 'BackupVersion', 'BackupDive', 'BackupDeleted', 'BackupBrowse', 'BackupPanes', 'BackupDialog']) assert.ok(existsSync(new URL(`../../app/src/components/${f}.svelte`, import.meta.url)), f);
  assert.match(read('pages/DiveDetail.svelte'), /logbook\.odplus && dive[\s\S]*icon="history"[\s\S]*openDiveVersions\(dive\.date\)/);
  assert.match(read('lib/backup-nav.js'), /layout\.desktop[\s\S]*navigation\.backupOpen = true/);
  // Browsing holds the core: nothing is saved or synced meanwhile.
  const logbook = read('lib/logbook.svelte.js');
  assert.match(logbook, /logbook\.autoSync && syncAllowedOnThisNetwork\(\) && !logbook\.browsing/);
  assert.match(logbook, /if \(logbook\.browsing\) return \/\*\* @type \{SyncOutcome\} \*\/ \('failed'\)/);
  // Every css class of the screens is prefixed od- and names its component.
  for (const f of ['BackupMain', 'BackupVersion', 'BackupDive', 'BackupDeleted', 'BackupBrowse', 'BackupPanes']) {
    const classes = [...read(`components/${f}.svelte`).matchAll(/class(?:name)?="([^"{]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('bc-backup'));
    assert.ok(classes.length, f);
  }
});
