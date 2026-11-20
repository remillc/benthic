// The recent logbooks on the desktop window without a logbook, release edition (task 2026-11-16-241; mock-ups
// docs/mockups/bureau-premier-lancement-production-recents*.dc.html): which screen shows, the list's order and cap,
// the missing state, the dialog's two actions and the computer icon. The screens need Framework7 and Electron: their
// markup is read from the source, the logic runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECENT_SHOWN, startMode, recentRows, fileNameOf } from '../../app/src/lib/desktop-recents.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

const texts = {
  'desktopLogbooks.mainName': 'Carnet de cet ordinateur',
  'desktopLogbooks.source.device': 'Cet ordinateur',
  'desktopLogbooks.source.git': 'Dépôt git',
  'desktopLogbooks.source.file': 'Fichier',
  'desktopLogbooks.source.googleDrive': 'Google Drive',
  'desktopLogbooks.when.openNow': 'ouvert maintenant',
  'desktopLogbooks.when.closedNow': 'fermé à l’instant',
  'desktopLogbooks.when.closedMinutes': 'fermé il y a {n} min',
  'desktopLogbooks.when.closedHours': 'fermé il y a {n} h',
  'desktopLogbooks.when.openedOn': 'ouvert le {date}',
  'desktopLogbooks.recents.missingIn': 'Introuvable dans {place}',
};
const t = (key, params = {}) => (texts[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k]);
const date = () => '2 nov.';
const NOW = 1_800_000_000_000;
const file = (name, folder, openedAt) => ({ id: `f-${name}`, kind: 'file', name, location: `C:\\Users\\a\\${folder}\\${name}`, openedAt });

test('first launch while no logbook was ever opened, the recent logbooks after; nothing decided until the list is read', () => {
  assert.equal(startMode(null), null);
  assert.equal(startMode([]), 'first');
  assert.equal(startMode([file('a.ssrf', 'Documents', 1)]), 'recents');
});

test('the list is newest first and shows at most five: the oldest are dropped', () => {
  const recent = Array.from({ length: 8 }, (_, i) => file(`l${i}.ssrf`, 'Documents', NOW - i * 3_600_000)).reverse();
  const rows = recentRows(recent, {}, NOW, t, date);
  assert.equal(RECENT_SHOWN, 5);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.name), ['l0.ssrf', 'l1.ssrf', 'l2.ssrf', 'l3.ssrf', 'l4.ssrf']);
});

test('a row says where the logbook is kept and when it was last closed or opened', () => {
  const rows = recentRows(
    [
      { id: 'c-1', kind: 'cloud', name: 'plongees.ssrf', location: 'OpenDives/plongees.ssrf', provider: 'googleDrive', openedAt: NOW - 2 * 60_000 },
      { id: 'g-1', kind: 'git', name: 'Club 2024', location: 'https://github.com/club/carnet.git', branch: 'main', openedAt: NOW - 3 * 3_600_000 },
      file('essai.ssrf', 'Documents', NOW - 10 * 24 * 3_600_000),
      { id: 'main', kind: 'main', name: '', location: '', openedAt: NOW - 20 * 24 * 3_600_000 },
    ],
    {},
    NOW,
    t,
    date,
  );
  assert.deepEqual(rows.map((r) => [r.kind, r.name, r.detail]), [
    ['cloud', 'plongees.ssrf', 'Google Drive · fermé il y a 2 min'],
    ['git', 'Club 2024', 'Dépôt git · github.com/club/carnet · fermé il y a 3 h'],
    ['file', 'essai.ssrf', 'Documents · ouvert le 2 nov.'],
    ['device', 'Carnet de cet ordinateur', 'Cet ordinateur · ouvert le 2 nov.'],
  ]);
});

test('a missing file keeps its place and says « Introuvable dans {place} »; an id absent from the answer counts as found', () => {
  const recent = [file('a.ssrf', 'Documents', NOW - 1000), file('essai.ssrf', 'Documents', NOW - 2000), file('b.ssrf', 'Bureau', NOW - 3000)];
  const rows = recentRows(recent, { 'f-essai.ssrf': false, 'f-a.ssrf': true }, NOW, t, date);
  assert.deepEqual(rows.map((r) => r.missing), [false, true, false]);
  assert.deepEqual(rows.map((r) => r.name), ['a.ssrf', 'essai.ssrf', 'b.ssrf']);
  assert.equal(rows[1].detail, 'Introuvable dans Documents');
  assert.equal(rows[1].place, 'Documents');
  assert.equal(rows[1].fileName, 'essai.ssrf');
});

test('the file name of an entry is the last part of its path, on either kind of separator', () => {
  assert.equal(fileNameOf(file('essai.ssrf', 'Documents', 1)), 'essai.ssrf');
  assert.equal(fileNameOf({ id: 'f-x', kind: 'file', name: 'x', location: '/home/a/Documents/x.ssrf' }), 'x.ssrf');
});

test('the texts of the list and of the dialog are in French and in English', () => {
  for (const lang of ['fr', 'en']) {
    const r = langs[lang].desktopLogbooks.recents;
    for (const key of ['title', 'orElse', 'missingIn', 'missingTitle', 'missingText', 'remove', 'search', 'otherChoices']) assert.ok(r[key], `${lang} ${key}`);
    assert.match(r.missingIn, /\{place\}/);
    assert.match(r.missingText, /\{file\}.*\{place\}/);
  }
  assert.equal(langs.fr.desktopLogbooks.recents.title, 'Carnets récents');
  assert.equal(langs.fr.desktopLogbooks.recents.orElse, 'Ou bien');
  assert.equal(langs.fr.desktopLogbooks.recents.missingTitle, 'Carnet introuvable');
  assert.equal(langs.fr.desktopLogbooks.recents.remove, 'Retirer de la liste');
  assert.equal(langs.fr.desktopLogbooks.recents.search, 'Chercher le fichier…');
});

test('the window picks its screen from the list, and the profile is still on the recents screen', () => {
  const window = read('components/DesktopFirstLaunch.svelte');
  assert.match(window, /startMode\(logbooks\.recentLoaded \? logbooks\.recent : null\)/);
  assert.match(window, /refreshRecent\(\)\.then\(checkRecent\)/);
  assert.match(window, /<ReleaseProfile still=\{mode === 'recents'\} \/>/);
  assert.match(window, /\{#if mode\}<FirstLaunchSteps f7router=\{router\} recents=\{mode === 'recents'\} \/>\{\/if\}/);
  assert.match(read('components/ReleaseProfile.svelte'), /bc-release-profile--still/);
});

test('the recents screen: the list, « Ou bien », three compact neutral choices, the drop line, no demo link', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const block = steps.slice(steps.indexOf("{#if step === 'start' && recents}"), steps.indexOf("{:else if step === 'start'}"));
  assert.match(block, /bc-first-launch--or/);
  assert.equal((block.match(/<ReleaseChoiceRow compact /g) ?? []).length, 3);
  assert.ok(!/<ReleaseChoiceRow[^>]*\bmain\b/.test(block), 'no filled primary choice');
  assert.match(block, /dropLine/);
  assert.ok(!/demo/i.test(block), 'no demo link');
  assert.match(steps, /\{:else if step === 'start' && recents\}\s*<RecentLogbooks \/>/);
  const row = read('components/ReleaseChoiceRow.svelte');
  assert.match(row, /bc-release-row--compact[\s\S]*padding-block: 10px[\s\S]*width: 40px/);
});

test('a row opens its logbook; a missing one opens the dialog with « Retirer de la liste » and « Chercher le fichier… »', () => {
  const list = read('components/RecentLogbooks.svelte');
  assert.match(list, /if \(row\.missing\) asking = row\.id;\s*else void openRecent\(row\.id\)/);
  assert.match(list, /await forgetRecent\(asking\)/);
  assert.match(list, /await relocateRecent\(asking\)/);
  assert.ok(!/onclose=/.test(list), 'a basic dialog: no close button');
  assert.match(list, /cursor: pointer/);
  assert.match(list, /prefers-reduced-motion/);
  const state = read('lib/desktop-logbooks.svelte.js');
  assert.match(state, /bridge\(\)\.logbooks\.exists\(\)/);
  assert.match(state, /bridge\(\)\.logbooks\.forget\(\{ id \}\)/);
  assert.match(state, /bridge\(\)\.logbooks\.relocate\(\{ id \}\)/);
});

test('« Seulement sur cet ordinateur » has the computer-screen icon on the desktop, the tablet icon elsewhere', () => {
  assert.match(read('components/FirstLaunchSteps.svelte'), /const deviceIcon = \$derived\(kind === 'desktop' \? 'desktop' : layout\.phone \? 'device' : 'tablet'\)/);
  assert.match(read('components/Icon.svelte'), /desktop: 'M4 5h16v10H4zM2 19h20'/);
});
