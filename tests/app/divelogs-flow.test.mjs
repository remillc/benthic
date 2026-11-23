// The states of the « Envoyer vers divelogs.de » dialogs (task 2026-11-23-337): where an error leads, the steps of the
// progress card, the texts of the task in both languages, and the rule that nothing of the credentials is stored.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { outcomeOf, progressSteps } from '../../app/src/lib/divelogs-flow.js';

const root = fileURLToPath(new URL('../../app/src/', import.meta.url));
const langs = { fr: JSON.parse(readFileSync(`${root}i18n/fr.json`, 'utf8')), en: JSON.parse(readFileSync(`${root}i18n/en.json`, 'utf8')) };
/** A translator over a language file: « divelogsUpload.x » with {params} and the plural forms. */
const translator = (lang) => (key, params = {}) => {
  let v = key.split('.').reduce((o, k) => o?.[k], langs[lang]);
  if (v && typeof v === 'object') v = params.n === 1 ? v.one : v.other;
  return String(v).replace(/\{(\w+)\}/g, (_, k) => params[k]);
};
const fr = translator('fr');

test('refused credentials go back to the connection dialog; anything else stays on the progress dialog', () => {
  assert.deepEqual(outcomeOf('LOGIN_FAILED', false), { to: 'connect' });
  assert.deepEqual(outcomeOf('CANCELLED', true), { to: 'none' });
  assert.deepEqual(outcomeOf('NETWORK', false), { to: 'progress', failure: { phase: 'login', kind: 'network' } });
  assert.deepEqual(outcomeOf('NETWORK', true), { to: 'progress', failure: { phase: 'send', kind: 'network' } });
  assert.deepEqual(outcomeOf('SERVER', true), { to: 'progress', failure: { phase: 'send', kind: 'server' } });
  // A token refused during the sending is not a wrong password.
  assert.deepEqual(outcomeOf('LOGIN_FAILED', true), { to: 'progress', failure: { phase: 'send', kind: 'server' } });
});

test('the progress card: connecting, sending, and no third step', () => {
  const connecting = progressSteps({ failure: null, signedIn: false, account: 'christian', done: 0, total: 12 }, fr);
  assert.deepEqual(connecting.map((s) => [s.state, s.name]), [['current', 'Connexion à divelogs.de'], ['waiting', 'Envoi des plongées']]);
  const sending = progressSteps({ failure: null, signedIn: true, account: 'christian', done: 5, total: 12 }, fr);
  assert.deepEqual(sending.map((s) => s.state), ['done', 'current']);
  assert.equal(sending[0].detail, 'Compte « christian »');
  assert.deepEqual(sending[1].progress, { done: 5, total: 12, count: '5 sur 12' });
  assert.ok(!sending.some((s) => /Vérification/.test(s.name)));
});

test('a lost connection puts the step in error, in the login or in the sending', () => {
  const login = progressSteps({ failure: { phase: 'login', kind: 'network' }, signedIn: false, account: 'c', done: 0, total: 12 }, fr);
  assert.deepEqual(login.map((s) => s.state), ['failed', 'waiting']);
  assert.equal(login[0].name, 'divelogs.de ne répond pas');
  const sending = progressSteps({ failure: { phase: 'send', kind: 'network' }, signedIn: true, account: 'c', done: 25, total: 60 }, fr);
  assert.deepEqual(sending.map((s) => s.state), ['done', 'failed']);
  assert.equal(sending[1].name, 'Envoi interrompu');
  assert.equal(sending[1].detail, '25 sur 60 plongées envoyées. Vérifiez la connexion, puis réessayez.');
  const refused = progressSteps({ failure: { phase: 'send', kind: 'server' }, signedIn: true, account: 'c', done: 0, total: 3 }, fr);
  assert.equal(refused[1].name, 'divelogs.de a refusé l’envoi');
});

test('the texts of the task, in French and in English', () => {
  const d = langs.fr.divelogsUpload;
  assert.equal(d.title, 'Envoyer vers divelogs.de');
  assert.equal(fr('divelogsUpload.text', { name: 'Mon carnet', n: 3 }), 'Mon carnet · 3 plongées. Connectez-vous à votre compte divelogs.de.');
  assert.equal(d.user, 'Nom d’utilisateur');
  assert.equal(d.password, 'Mot de passe');
  assert.equal(d.note, 'Benthic ne garde pas ces identifiants.');
  assert.equal(d.denied, 'Nom d’utilisateur ou mot de passe incorrect.');
  assert.equal(d.progressTitle, 'Envoi vers divelogs.de');
  assert.equal(d.help, 'Gardez l’app ouverte jusqu’à la fin. Vos plongées restent dans votre carnet.');
  assert.equal(d.doneTitle, 'Plongées envoyées');
  assert.equal(fr('divelogsUpload.doneText', { name: 'Mon carnet', n: 3, user: 'christian' }), 'Les 3 plongées de Mon carnet sont maintenant dans le compte divelogs.de « christian ».');
  assert.equal(d.open, 'Ouvrir divelogs.de');
  assert.equal(langs.fr.export.divelogsFootnote, 'Vous vous connecterez ensuite à divelogs.de.');
  assert.equal(langs.fr.export.continue, 'Continuer');
  assert.equal(d.retry, 'Réessayer');
  // Every key exists in both languages.
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  assert.deepEqual(keys(langs.en.divelogsUpload).sort(), keys(langs.fr.divelogsUpload).sort());
});

test('the user name and the password are never written to a store', () => {
  for (const file of ['components/DivelogsUploadDialog.svelte', 'lib/divelogs-upload.js', 'lib/divelogs-flow.js', 'lib/divelogs-transport.js']) {
    const source = readFileSync(`${root}${file}`, 'utf8');
    assert.ok(!/deviceStore|localStorage|sessionStorage|Preferences|secret-box|credentials\.set|SecureStorage/.test(source), `${file} stores something`);
  }
  // The password is emptied as soon as divelogs.de accepted it, and when the dialog is left.
  const dialog = readFileSync(`${root}components/DivelogsUploadDialog.svelte`, 'utf8');
  assert.equal((dialog.match(/password = ''/g) ?? []).length >= 3, true);
});
