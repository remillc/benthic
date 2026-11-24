// Creating a logbook on the Benthic server and the Benthic+ screens (tasks 2026-11-17-265 and 266): the format
// writer, the upload and its resume after a cut connection, the choices, where an account goes after the code, the
// inert billing seams, the steps and their order, and the texts. The screens are read from their source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChoices } from '../../app/src/lib/server-create.js';
import { afterSignIn, summaryRows } from '../../app/src/lib/benthic-plus.js';
import { purchaseSubscription, signInWithApple, signInWithGoogle } from '../../app/src/lib/benthic-plus-billing.js';
import { back, enterCreate, enterOffer, forward, hasBack, replaceTop } from '../../app/src/lib/first-launch-steps.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

// --- The choices and the steps -----------------------------------------------------------------------------

test('the third choice appears only when a logbook exists on the device', () => {
  assert.deepEqual(createChoices(null), ['blank', 'import']);
  assert.deepEqual(createChoices(undefined), ['blank', 'import']);
  assert.deepEqual(createChoices({ name: 'Mon carnet', dives: 312 }), ['blank', 'import', 'device']);
  const source = read('components/FirstLaunchServerCreate.svelte');
  assert.match(source, /\{:else if c\.deviceLogbook\}/);
  assert.match(source, /serverCreate\.sendTitle/);
});

test('the creation steps follow the mock-ups and the upload has no « Retour »', () => {
  let stack = ['start', 'server', 'serverCode', 'serverDownload'];
  stack = enterCreate(stack);
  assert.deepEqual(stack, ['start', 'server', 'createChoice']);
  assert.deepEqual(back(stack), ['start', 'server']);
  assert.deepEqual(forward(stack, 'blank'), [...stack, 'createName']);
  assert.deepEqual(forward(stack, 'send'), [...stack, 'createSend']);
  assert.deepEqual(forward([...stack, 'createName'], 'offline').at(-1), 'createOffline');
  assert.deepEqual(replaceTop([...stack, 'createSend'], 'createInterrupted'), [...stack, 'createInterrupted']);
  for (const step of ['createSend', 'createInterrupted', 'createOffline', 'benthicPlusOffer', 'benthicPlusReady', 'benthicPlusWelcome']) assert.equal(hasBack(step), false, step);
  for (const step of ['createChoice', 'createName', 'benthicPlusConnect', 'server']) assert.equal(hasBack(step), true, step);
});

test('the two entries of the first step, and the way of the offer', () => {
  assert.deepEqual(forward(['start'], 'signIn'), ['start', 'benthicPlusConnect']);
  assert.deepEqual(forward(['start'], 'discover'), ['start', 'benthicPlusOffer']);
  assert.deepEqual(forward(['start', 'benthicPlusConnect'], 'email'), ['start', 'benthicPlusConnect', 'server']);
  assert.deepEqual(forward(['start', 'benthicPlusOffer'], 'welcome').at(-1), 'benthicPlusWelcome');
  assert.deepEqual(forward(['start', 'benthicPlusOffer', 'benthicPlusWelcome'], 'next').at(-1), 'benthicPlusReady');
  assert.deepEqual(enterOffer(['start', 'benthicPlusConnect', 'server', 'serverCode']), ['start', 'benthicPlusConnect', 'server', 'benthicPlusOffer']);
  assert.deepEqual(forward(['start', 'benthicPlusConnect', 'server', 'serverCode', 'serverDownload'], 'ready').at(-1), 'benthicPlusReady');
});

// --- Benthic+ --------------------------------------------------------------------------------------------

test('a subscribed account goes to its logbook, any other one to the offer', () => {
  assert.equal(afterSignIn({ subscribed: true }), 'download');
  assert.equal(afterSignIn({ subscribed: false }), 'offer');
  assert.equal(afterSignIn({}), 'offer');
  assert.equal(afterSignIn(undefined), 'offer');
});

test('an account without a subscription keeps nothing on the device', () => {
  const source = read('components/FirstLaunchServer.svelte');
  const offer = source.indexOf("afterSignIn(session.user) === 'offer'");
  const save = source.indexOf('serverSessionSave');
  assert.ok(offer > 0 && save > offer, 'the offer is chosen before the session is saved');
  assert.match(source.slice(offer, save), /goOffer\(\);\s*return;/);
});

test('Google and the purchase are inert, Apple without the plugin too: one function each, nothing is bought or created', async () => {
  assert.deepEqual(await signInWithGoogle(), { status: 'unavailable' });
  assert.deepEqual(await signInWithApple(), { status: 'unavailable' });
  assert.deepEqual(await purchaseSubscription(), { status: 'unavailable' });
  const billing = read('lib/benthic-plus-billing.js');
  assert.doesNotMatch(billing, /^import /m, 'no native dependency');
  const screen = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(screen, /signInWithGoogle\(\)/);
  assert.match(screen, /purchaseSubscription\(\)/);
  const pkg = JSON.parse(readFileSync(new URL('../../app/package.json', import.meta.url), 'utf8'));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /billing|purchase|google-auth|apple|iap/i.test(d)));
});

test('« Continuer sans compte » and « Continuer sans abonnement » create nothing', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const fn = steps.slice(steps.indexOf('function withoutAccount()'));
  // Outside the menu entry (the free account sheet) it goes back to the first step, as before.
  assert.match(fn.slice(0, 300), /goBackTo\('start'\)/);
  const screen = read('components/FirstLaunchBenthicPlus.svelte');
  // The connection screen, the offer and « Tout ce qui est inclus » each have one.
  assert.equal([...screen.matchAll(/onclick=\{onwithout\}/g)].length, 3);
});

test('the development switch to « Bienvenue dans Benthic+ » exists in development builds only', () => {
  const screen = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(screen, /if \(!import\.meta\.env\?\.DEV \|\| step !== 'benthicPlusOffer'\) return;/);
  assert.equal([...screen.matchAll(/__benthicPlus/g)].length, 3);
});

test('the summary card lists dives, sites, gear and certifications', () => {
  assert.deepEqual(summaryRows({ dives: 312, sites: 48, gear: 14, certifications: 3 }).map((r) => r.key), ['dives', 'sites', 'gear', 'certifications']);
  // The dives branch holds no gear or certification yet: their rows wait until something is stored.
  assert.deepEqual(summaryRows({ dives: 312, sites: 48, gear: 0, certifications: 0, known: true }).map((r) => r.key), ['dives', 'sites']);
  // The desktop window downloads when it opens the logbook: no card.
  assert.deepEqual(summaryRows({ dives: 0, sites: 0, gear: 0, certifications: 0, known: false }), []);
});

test('no development address in the screens of the release edition', () => {
  for (const file of ['components/FirstLaunchBenthicPlus.svelte', 'components/FirstLaunchServerCreate.svelte', 'lib/server-logbook.js', 'lib/benthic-plus-billing.js']) {
    assert.doesNotMatch(read(file), /127\.0\.0\.1|10\.0\.2\.2|localhost/, file);
  }
});

// --- The texts ---------------------------------------------------------------------------------------------

test('every text of the new screens is in fr and en, and the price is the one of the task', () => {
  for (const lang of ['fr', 'en']) {
    const c = langs[lang];
    for (const base of ['sendTitle', 'nameHelp', 'safe', 'created', 'offlineHelp', 'interruptedHelp']) for (const s of ['', 'Phone', 'Iphone', 'Desktop']) assert.ok(`${base}${s}` in c.serverCreate, `${lang}: ${base}${s}`);
    for (const s of ['', 'Phone', 'Iphone', 'Desktop']) assert.ok(`lead${s}` in c.benthicPlus.ready, `${lang}: ready lead${s}`);
    for (const key of ['sendHelp', 'sendingName']) assert.equal(typeof c.serverCreate[key], 'object', `${lang}: ${key} is a plural`);
    assert.ok(c.serverSteps.backHome);
    assert.ok(!('title' in c.serverSteps), 'no « Serveur Benthic » overline text');
  }
  assert.equal(langs.fr.benthicPlus.offer.price, '14,99 $ US');
  assert.equal(langs.fr.benthicPlus.offer.per, 'par an');
  assert.equal(langs.fr.benthicPlus.offer.priceDetail, 'soit 1,25 $ par mois');
  assert.equal(langs.fr.benthicPlus.offer.cancelAnytime, 'Résiliable en tout temps');
  assert.equal(langs.fr.benthicPlus.offer.subscribe, 'S’abonner');
  assert.equal(langs.fr.benthicPlus.offer.without, 'Continuer sans abonnement');
  assert.equal(langs.fr.benthicPlus.offer.noAccount, 'Aucun compte n’est créé.');
  assert.equal(langs.fr.benthicPlus.welcome.title, 'Bienvenue dans Benthic+ !');
  assert.equal(langs.fr.serverSteps.backHome, 'Revenir à l’accueil');
});

test('the server screens no longer draw the « Serveur Benthic » overline, and the offline icon is centred', () => {
  const source = read('components/FirstLaunchServer.svelte');
  assert.doesNotMatch(source, /overline/);
  assert.match(source, /bc-first-launch-server--tile \{[^}]*align-self: center/s);
});

test('« Continuer avec Apple »: a fresh nonce, its SHA-256 to Apple, the token and the raw nonce to the server', async () => {
  const { createHash } = await import('node:crypto');
  /** @type {any[]} */
  const asked = [];
  const done = await signInWithApple(async (o) => {
    asked.push(o);
    return { action: 'done', identityToken: 'id.tok.en', authorizationCode: 'code-1', email: '', givenName: 'Ana', familyName: 'Lima' };
  });
  assert.equal(done.status, 'signedIn');
  if (done.status !== 'signedIn') return;
  assert.match(done.nonce ?? '', /^[0-9a-f]{64}$/);
  assert.equal(asked[0].nonceHash, createHash('sha256').update(done.nonce ?? '').digest('hex'));
  assert.deepEqual({ ...done, nonce: '' }, { status: 'signedIn', idToken: 'id.tok.en', nonce: '', authorizationCode: 'code-1', name: 'Ana Lima' });
  const again = await signInWithApple(async () => ({ action: 'cancelled' }));
  assert.deepEqual(again, { status: 'cancelled' });
  assert.deepEqual(await signInWithApple(async () => ({ action: 'failed', message: 'x' })), { status: 'failed' });
  assert.deepEqual(await signInWithApple(async () => { throw new Error('no window'); }), { status: 'failed' });
  // Two requests never share a nonce.
  const nonces = new Set();
  for (let i = 0; i < 3; i++) {
    const r = await signInWithApple(async () => ({ action: 'done', identityToken: 't', authorizationCode: '', email: '', givenName: '', familyName: '' }));
    if (r.status === 'signedIn') nonces.add(r.nonce);
  }
  assert.equal(nonces.size, 3);
  // The screen: Apple only through the plugin on iOS, a subscriber's session kept, the offer otherwise.
  const screen = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(screen, /signInWithApple\(ios \? \(o\) => BenthicCore\.appleSignIn\(o\) : undefined\)/);
  const call = screen.indexOf('.signInApple(');
  const offer = screen.indexOf("afterSignIn(session.user) === 'offer'", call);
  const save = screen.indexOf('serverSessionSave', call);
  assert.ok(call > 0 && offer > call && save > offer, 'the offer is chosen before the session is saved');
  for (const lang of ['fr', 'en']) assert.ok(langs[lang].benthicPlus.providerFailed, `${lang}: providerFailed`);
});
