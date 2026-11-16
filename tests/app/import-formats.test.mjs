// « Formats acceptés » of « Importer un carnet » (task 2026-11-16-223, release edition).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FORMAT_COLUMNS,
  IMPORT_FORMATS,
  IMPORT_FORMAT_COUNT,
  closeFormats,
  formatsOf,
  openFormats,
} from '../../app/src/lib/import-formats.js';

const text = (url) => readFileSync(url, 'utf8').split(String.fromCharCode(13)).join('');
const src = (path) => text(new URL(`../../app/src/${path}`, import.meta.url));
const report = text(new URL('../../docs/import-formats.md', import.meta.url));
const json = (lang) => JSON.parse(src(`i18n/${lang}.json`));

/** The lines of the report's table that work: name, extensions, result. */
function reportLines() {
  const lines = [];
  for (const row of report.split('\n')) {
    const cells = row.split('|').map((c) => c.trim());
    if (cells.length < 6 || !/^works/.test(cells[4])) continue;
    lines.push({ name: cells[1], extensions: [...cells[2].matchAll(/`(\.[^`]+)`/g)].map((m) => m[1].toLowerCase()), result: cells[4] });
  }
  return lines;
}

test('every entry is a « works » line of docs/import-formats.md, and every such line is there', () => {
  const works = reportLines();
  assert.ok(works.length > 10, 'the report table was parsed');
  assert.deepEqual(IMPORT_FORMATS.map((f) => f.report).sort(), works.map((l) => l.name).sort());
  for (const format of IMPORT_FORMATS) {
    const line = works.find((l) => l.name === format.report);
    assert.ok(line, format.report);
    assert.deepEqual(format.extensions, line.extensions, `${format.report}: extensions`);
  }
});

test('the count is the report\'s total, and the lines the dialog draws', () => {
  assert.equal(IMPORT_FORMAT_COUNT, IMPORT_FORMATS.length);
  assert.equal(IMPORT_FORMAT_COUNT, Number(/\*\*(\d+) formats work\*\*/.exec(report)[1]));
  assert.equal(FORMAT_COLUMNS.map((c) => formatsOf(c).length).reduce((a, b) => a + b, 0), IMPORT_FORMAT_COUNT);
  assert.deepEqual([...FORMAT_COLUMNS], ['open', 'devices', 'logbooks']);
  // No format that is not reachable (DL7, SmartTrak) is named; CSV is, through its column mapping (task 224).
  for (const f of IMPORT_FORMATS) assert.ok(!/dl7|smarttrak/i.test(f.name + f.extensions.join()), f.name);
  assert.deepEqual(IMPORT_FORMATS.find((f) => f.name === 'CSV')?.extensions, ['.csv', '.tsv']);
});

test('the help line reads the count from the list; the dialog shows no number (task 224)', () => {
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.match(steps, /welcomeSteps\.fileHelp', \{ n: IMPORT_FORMAT_COUNT \}/);
  // The dialog says no number of formats: the text is fixed and the component does not read the count.
  assert.doesNotMatch(src('components/ImportFormats.svelte'), /IMPORT_FORMAT_COUNT|\{ n:/);
  for (const lang of ['fr', 'en']) {
    const j = json(lang);
    assert.match(j.welcomeSteps.fileHelp, /^\{n\} formats/, lang);
    assert.doesNotMatch(j.importFormats.text, /\{n\}|\d/, lang);
    assert.doesNotMatch(JSON.stringify(j.importFormats) + j.welcomeSteps.fileHelp + j.welcomeSteps.fileUnreadableHelp, /\b30\b|CSV/, lang);
  }
});

test('the texts exist in French and English', () => {
  for (const lang of ['fr', 'en']) {
    const j = json(lang);
    for (const k of ['link', 'title', 'text']) assert.ok(j.importFormats[k], `${lang}: importFormats.${k}`);
    for (const c of FORMAT_COLUMNS) assert.ok(j.importFormats.column[c], `${lang}: column ${c}`);
    assert.ok(j.welcomeSteps.fileUnreadable && j.welcomeSteps.fileUnreadableHelp, lang);
  }
  const fr = json('fr').importFormats;
  assert.equal(fr.link, 'Voir les formats acceptés');
  assert.equal(fr.text, 'Importez vos plongées depuis n’importe lequel de ces formats.');
  assert.deepEqual(Object.values(fr.column), ['Formats ouverts', 'Montres et ordinateurs', 'Autres carnets']);
});

test('the link opens the dialog; « Fermer », the scrim and Back all end in the same close', () => {
  const state = { formatsOpen: false };
  openFormats(state);
  assert.equal(state.formatsOpen, true);
  closeFormats(state);
  assert.equal(state.formatsOpen, false);

  const c = src('components/ImportFormats.svelte');
  assert.match(c, /class="od-import-formats--link" onclick=\{\(\) => openFormats\(state\)\}/);
  // A basic dialog: Md3Dialog (scrim tap, Escape, system Back through od-cancel) with oncancel, a « Fermer » text button, no ✕.
  assert.match(c, /<Md3Dialog[^>]*oncancel=\{\(\) => closeFormats\(state\)\}/);
  assert.match(c, /onclick=\{\(\) => closeFormats\(state\)\}>\{t\('dialog\.close'\)\}/);
  assert.doesNotMatch(c, /name="close"|✕/);
  const dialog = src('components/Md3Dialog.svelte');
  assert.match(dialog, /od-md3-dialog--scrim" onclick=\{oncancel\}/);
  assert.match(dialog, /addEventListener\('od-cancel'/);
  assert.match(src('lib/back-button.js'), /classList\.contains\('od-md3-dialog'\)[^]*od-cancel/);
  assert.equal(json('fr').dialog.close, 'Fermer');
});

test('the link: 14 sp, --od-release-link (#1F5C99), underlined, hand pointer, hover', () => {
  const c = src('components/ImportFormats.svelte');
  const rule = /\.od-import-formats--link \{([^]*?)\n    \}\n/.exec(c)[1];
  assert.match(rule, /font-size: 14px/);
  assert.match(rule, /color: var\(--od-release-link\)/);
  assert.match(rule, /text-decoration: underline/);
  assert.match(rule, /cursor: pointer/);
  assert.match(rule, /:hover/);
  assert.match(src('theme.css'), /--od-release-link: #1F5C99;/);
});

test('the link is on the source screen, which also shows the error; the beta does not use it', () => {
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.match(steps, /<ImportFormats \/>/);
  assert.match(steps, /\{#if unreadable\}[^]*role="alert"[^]*welcomeSteps\.fileUnreadableHelp/);
  for (const beta of ['pages/WelcomeStart.svelte', 'pages/SignIn.svelte', 'pages/CreateAccount.svelte', 'components/WelcomeHelpLink.svelte']) {
    assert.doesNotMatch(src(beta), /ImportFormats|import-formats/, beta);
  }
});

test('task 226: the link sits right under « Un fichier », before divelogs.de, as a 48 dp target read as a link', () => {
  const steps = src('components/FirstLaunchSteps.svelte');
  const imp = steps.slice(steps.indexOf("{:else if step === 'import'}"), steps.indexOf("{:else if step === 'importDivelogs'"));
  const file = imp.indexOf("title={t('welcomeSteps.fileTitle')}");
  const link = imp.indexOf('<ImportFormats />');
  const divelogs = imp.indexOf("title={t('welcomeSteps.divelogsTitle')}");
  assert.ok(file > 0 && file < link && link < divelogs);
  const c = src('components/ImportFormats.svelte');
  assert.match(c, /role="link" class="od-import-formats--link"/);
  const rule = /\.od-import-formats--link \{([^]*?)\n    \}\n/.exec(c)[1];
  assert.match(rule, /min-height: 48px;/);
  assert.match(rule, /padding: 0 4px;/);
});
