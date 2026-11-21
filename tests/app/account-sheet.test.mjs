// The account sheet for a free diver, the Benthic+ sheet with its maintenance badge, « Gérer le compte », the store's
// subscription page, how Back closes the Android sheet and the account deletion (task 2026-11-18-281;
// mock-ups docs/mockups-release/nav-compte-gratuit-android, nav-compte-profil-android, compte-android-connecte,
// bureau-compte-gerer, ...). The screens need Framework7 and a WebView: their routes and texts are read from the source;
// the rules are tested as pure functions; the real screens were looked at in a browser and in Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolveOdplusAccount, isSubscribed } from '../../app/src/lib/benthic-plus-state.js';
import { accountEmail, sheetVariant, profileRow, storeSubscriptionsUrl, subscriptionStore, spaceUse, SPACE_LIMIT_BYTES } from '../../app/src/lib/account-sheet.js';
import { forward, menuEntry, enterOffer, back, hasBack, leavesFirstLaunch, offerShowsSignIn } from '../../app/src/lib/first-launch-steps.js';
import { evaluate, overdueCount, todayIso } from '../../app/src/lib/maintenance.js';
import { createServerApi, overviewOf } from '../../app/src/lib/server-api.js';

const root = new URL('../../app/src/', import.meta.url);
// Line endings are the checkout's (CRLF on Windows): the patterns below are written with LF.
const read = (path) => readFileSync(new URL(path, root), 'utf8').split('\r\n').join('\n');
const sheet = read('components/AccountSheet.svelte');
const desktopSheet = read('components/DesktopAccountSheet.svelte');
const manage = read('components/AccountManage.svelte');
const avatar = read('components/AccountAvatar.svelte');
const offer = read('components/FirstLaunchBenthicPlus.svelte');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

// --- Which sheet ---

test('the account sheet uses the subscriber email instead of the server git username', () => {
  const serverLog = { email: 'od123', odplus: true };
  assert.equal(accountEmail({ signedIn: true, email: 'diver@example.test' }, serverLog), 'diver@example.test');
  assert.equal(accountEmail({ signedIn: false, email: '' }, serverLog), '', 'do not expose the username while the session loads');
  assert.equal(accountEmail({ signedIn: false, email: '' }, { email: 'diver@example.test', odplus: false }), 'diver@example.test');
  assert.equal(accountEmail({ signedIn: true, email: 'diver@example.test' }, { email: 'git-user', odplus: false }), 'diver@example.test');
  assert.match(sheet, /emailOfAccount\(odplusAccount, logbook\)/);
  assert.match(desktopSheet, /emailOfAccount\(odplusAccount, logbook\)/);
  assert.match(avatar, /accountEmail\(odplusAccount, logbook\)/);
});

test('the profile uses the account identity on narrow and wide layouts, including the separate profile window', () => {
  const profile = read('pages/ProfileDiver.svelte');
  const nav = read('components/ProfileNav.svelte');
  const frame = read('lib/profile-frame.js');
  const app = read('App.svelte');
  assert.match(profile, /diver\.info\.fullName \|\| accountEmail\(odplusAccount, logbook\)/);
  assert.match(frame, /name: accountEmail\(account, book\)/);
  assert.match(nav, /profileWindow \? readHero\(\) : heroOf\(logbook, odplusAccount\)/);
  assert.match(app, /rememberHero\(heroOf\(logbook, odplusAccount\)\)/);
});

test('the account overview refreshes a renamed email and subscription in one request', async () => {
  let requests = 0;
  const api = createServerApi({
    baseUrl: 'https://example.test',
    transport: async ({ method, url }) => {
      requests++;
      assert.equal(method, 'GET');
      assert.equal(url, 'https://example.test/v1/account');
      return { status: 200, text: JSON.stringify({ email: 'new@example.test', subscription: { subscribed: true } }) };
    },
  });
  const overview = await api.accountOverview('session');
  assert.equal(overview.email, 'new@example.test');
  assert.equal(overview.subscription.subscribed, true);
  assert.equal(requests, 1);
  assert.deepEqual(overviewOf({ subscription: { subscribed: 'true' } }).subscription, {});
  const state = read('lib/benthic-plus-state.svelte.js');
  assert.match(state, /accountOverview\(token\)/);
  assert.match(state, /overview\.email\?\.trim\(\) \|\| info\.email/);
});

test('the release edition without an Benthic+ account has the free sheet; with one, the subscriber sheet; the rest keeps its own', () => {
  assert.equal(sheetVariant({ release: true, subscriber: false, email: '' }), 'free');
  assert.equal(sheetVariant({ release: true, subscriber: true, email: 'a@b.c' }), 'subscriber');
  assert.equal(sheetVariant({ release: true, subscriber: false, email: 'a@b.c' }), 'account', 'a cloud account is neither');
  assert.equal(sheetVariant({ release: true, subscriber: false, email: 'vous', git: true, repository: 'github.com/vous/carnet' }), 'git', 'the git repository of the one-off licence');
  assert.equal(sheetVariant({ release: false, subscriber: false, email: 'vous', git: true, repository: 'github.com/vous/carnet' }), 'account', 'the alpha keeps its sheet');
  assert.equal(sheetVariant({ release: false, subscriber: false, email: '' }), 'account', 'the alpha keeps its sheet');
});

test('the Compte button stays for a free diver: named « Compte, réglages et à propos », a silhouette in the same disc', () => {
  assert.equal(langs.fr.nav.accountLabelFree, 'Compte, réglages et à propos');
  assert.match(avatar, /sheetVariant\(/);
  assert.match(avatar, /nav\.accountLabelFree/);
  // The disc already draws the account icon (the silhouette) when there is no e-mail.
  assert.match(avatar, /\{#if initial\}\{initial\}\{:else\}<Icon name="account"/);
});

// --- The free sheet's routes ---

test('free sheet: « S’abonner » opens the offer, « Se connecter » opens the sign-in screen, both Benthic+ rows open the offer', () => {
  const android = sheet.slice(sheet.indexOf('<div class="bc-account-sheet--content">'));
  const free = android.slice(android.indexOf('{#if free}'), android.indexOf('{:else}\n    <div class="bc-account-sheet--card bc-account-sheet--identity">'));
  assert.match(free, /bc-account-sheet--subscribe" onclick=\{\(\) => plus\('offer'\)\}/);
  assert.match(free, /bc-account-sheet--sign-in" onclick=\{\(\) => plus\('signIn'\)\}/);
  assert.equal([...free.matchAll(/bc-account-sheet--plus-row" onclick=\{\(e\) => \(e\.preventDefault\(\), plus\('offer'\)\)\}/g)].length, 2);
  assert.equal([...free.matchAll(/<BenthicPlusChip onSheet \/>/g)].length, 2, 'the chip is above each title');
  assert.ok(!/@/.test(free.replace(/<!--[\s\S]*?-->/g, '').replace(/\{[^}]*\}/g, '')), 'no e-mail, no sync line');
  assert.ok(!free.includes('SyncStatus') && !free.includes('SyncButton'));
  assert.match(sheet, /import \{ openOdPlus \} from '..\/lib\/open-offer.svelte.js'/);
});

test('the offer and the sign-in screen are the first launch entered from the menu, and leave it where they came from', () => {
  assert.deepEqual(menuEntry('offer'), ['start', 'odplusOffer']);
  assert.deepEqual(menuEntry('signIn'), ['start', 'odplusConnect']);
  assert.deepEqual(menuEntry('open'), ['start', 'open'], 'the other entries are unchanged');
  assert.equal(hasBack('odplusConnect', true), true);
  assert.equal(leavesFirstLaunch(menuEntry('signIn'), true), true, 'Retour on the sign-in screen leaves');
  assert.equal(leavesFirstLaunch(menuEntry('offer'), true), true);
  assert.equal(leavesFirstLaunch(['start', 'odplusOffer', 'odplusConnect'], true), false, 'from the offer, Retour returns to the offer');
  assert.equal(leavesFirstLaunch(['start', 'odplusConnect'], false), false, 'never outside the menu entry');
  assert.deepEqual(menuEntry('move'), ['start', 'createChoice'], 'sending the logbook of the device to the server');
  assert.equal(leavesFirstLaunch(['start', 'createChoice'], true), true);
  assert.deepEqual(back(['start', 'odplusOffer', 'odplusConnect']), ['start', 'odplusOffer']);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /if \(flow\.origin === 'menu'\) leave\(\);\n\s+else goBackTo\('start'\)/, '« Continuer sans compte » closes the first launch');
});

test('the offer’s « Déjà abonné ? Se connecter » opens « Se connecter ou créer un compte », and is hidden right after signing in', () => {
  assert.deepEqual(forward(['start', 'odplusOffer'], 'signIn'), ['start', 'odplusOffer', 'odplusConnect']);
  assert.equal(offerShowsSignIn(['start', 'odplusOffer']), true, 'the offer reached from « Découvrir Benthic+ »');
  assert.equal(offerShowsSignIn(['start', 'odplusConnect', 'server', 'serverCode', 'odplusOffer']), false);
  assert.equal(offerShowsSignIn(enterOffer(['start', 'odplusConnect', 'server', 'serverCode'])), false, 'after the sign-in of an account that has not subscribed');
  assert.match(offer, /\{#if offerShowsSignIn\(flow\.stack\)\}/);
  assert.match(offer, /bc-plus--link" onclick=\{\(\) => go\('signIn'\)\}/);
  assert.equal(langs.fr.odplus.offer.already, 'Déjà abonné ?');
  assert.equal(langs.fr.odplus.offer.signIn, 'Se connecter');
  // The offer's order: « Aucun compte n’est créé. » then the line.
  assert.ok(offer.indexOf("odplus.offer.noAccount") < offer.indexOf('offerShowsSignIn(flow.stack)'));
});

test('tablet and desktop: « Continuer sans compte » is centred across the 440 px of the three buttons', () => {
  const css = offer.slice(offer.indexOf('@media (min-width: 768px)'));
  assert.match(css, /\.bc-plus--buttons,\s*\.bc-plus--note \{\s*width: 100%;\s*max-width: 440px;/);
  assert.match(css, /\.bc-plus--text-link \{[^}]*width: 100%;[^}]*max-width: 440px;[^}]*text-align: center;/);
});

// --- The subscriber's sheet: chip, overdue badge, red line, cross on the right ---

test('the desktop subscriber account initial has no plus badge', () => {
  assert.match(desktopSheet, /<span class="bc-desktop-account--avatar" aria-hidden="true">\{initial\}<\/span>/);
  assert.doesNotMatch(desktopSheet, /bc-desktop-account--avatar-plus/);
  assert.match(desktopSheet, /bc-desktop-account--brand-name.*bc-desktop-account--dot/);
});

test('« Mon profil de plongeur »: the badge and the red line only for overdue pieces, with the count of the Entretien row', () => {
  assert.deepEqual(profileRow(0), { badge: 0, late: false });
  assert.deepEqual(profileRow(1), { badge: 1, late: true });
  assert.deepEqual(profileRow(3), { badge: 3, late: true });
  assert.deepEqual(profileRow(-2), { badge: 0, late: false });
  assert.deepEqual(profileRow(Number.NaN), { badge: 0, late: false });
  // The same count as the badge of the Entretien row (lib/maintenance.js overdueCount): a piece due soon is not counted.
  const today = '2026-11-18';
  const item = (id, extra) => ({ id, gearId: id, task: 'service', ...extra });
  const evals = [
    evaluate(item('a', { intervalMonths: 12, lastDoneOn: '2025-01-01' }), [], today), // overdue
    evaluate(item('b', { intervalMonths: 12, lastDoneOn: '2025-12-20' }), [], today), // due soon
    evaluate(item('c', { intervalMonths: 12, lastDoneOn: '2026-10-01' }), [], today), // fine
  ];
  assert.deepEqual(evals.map((e) => e.status), ['overdue', 'soon', 'ok']);
  assert.equal(profileRow(overdueCount(evals)).badge, 1);
  assert.equal(profileRow(overdueCount(evals.slice(1))).late, false, 'none overdue: neither the badge nor the red line');
  assert.match(todayIso(new Date(2026, 10, 18)), /^2026-11-18$/);
  // The sheets read the same function as the profile screen.
  assert.match(sheet, /overdueBadge\(\)/);
  assert.match(read('pages/ProfileDiver.svelte'), /overdueBadge\(\)/);
});

test('the profile row shows the badge and the red subtitle only when a piece is late; the line otherwise stays', () => {
  const row = sheet.slice(sheet.indexOf('bc-account-sheet--profile"'), sheet.indexOf('{/if}\n    {/if}\n\n    <!-- Desktop'));
  // A subscriber sees no Benthic+ chip next to a menu entry (task 290): the chips sell the offer in the free version.
  assert.doesNotMatch(row, /BenthicPlusChip/);
  assert.match(row, /\{#if late\.late\}\s*<span class="bc-account-sheet--row-line bc-account-sheet--late-line">\{t\('account\.sheet\.maintenanceLate'/);
  assert.match(row, /\{:else\}\s*<span class="bc-account-sheet--row-line">\{t\('gear\.profile\.cardLine'\)\}/);
  assert.match(row, /\{#if late\.late\}<span class="bc-account-sheet--late-badge"/);
  assert.equal(langs.fr.gear.profile.cardLine, 'Équipement, brevets, informations');
  assert.equal(langs.fr.account.sheet.maintenanceLate.one, 'Entretien : {n} pièce en retard');
  assert.equal(langs.fr.account.sheet.maintenanceLate.other, 'Entretien : {n} pièces en retard');
  // The red of the mock-up, white text on the badge.
  const theme = read('theme.css');
  assert.match(theme, /--bc-late: #A1372B;/);
  assert.match(sheet, /\.bc-account-sheet--late-badge \{[^}]*background: var\(--bc-late\);[^}]*color: #FFFFFF;/);
});

test('Android phone: the ✕ of the sheet is on the right at the logo’s height, none on the left', () => {
  const android = sheet.slice(sheet.indexOf('<div class="bc-account-sheet--content">'));
  const head = android.slice(android.indexOf('<div class="bc-account-sheet--head">'), android.indexOf('{#if free}'));
  assert.ok(head.indexOf('bc-account-sheet--brand') < head.indexOf('bc-account-sheet--close'), 'the cross comes after the logo');
  assert.equal([...head.matchAll(/bc-account-sheet--close/g)].length, 1);
  assert.match(head, /<span aria-hidden="true"><\/span>\s*<!--/);
});

test('« Gérer le compte » opens the new screen for an Benthic+ account: a page on the phone, a dialog elsewhere', () => {
  assert.match(sheet, /function manage\(\) \{\s*navigation\.accountOpen = false;\s*if \(subscriber\) openManageAccount\(\);\s*else openOver\('\/account'\);/);
  const nav = read('lib/navigation.svelte.js');
  assert.match(nav, /export function openManageAccount\(\) \{\s*if \(layout\.phone\) openOver\('\/account\/manage'\);\s*else navigation\.manageOpen = true;/);
  assert.match(read('App.svelte'), /path: '\/account\/manage'/);
  assert.match(read('App.svelte'), /<AccountManageDialog \/>/);
  assert.match(desktopSheet, /if \(subscriber\) openManageAccount\(\)/);
});

// --- « Gérer le compte » ---

test('the store link: Google Play’s subscription page for this app, the App Store’s for iOS, opened by the system', () => {
  assert.equal(storeSubscriptionsUrl('google', 'org.opendives.app'), 'https://play.google.com/store/account/subscriptions?package=org.opendives.app');
  assert.equal(storeSubscriptionsUrl('apple', 'org.opendives.app'), 'https://apps.apple.com/account/subscriptions');
  assert.equal(subscriptionStore({ store: 'apple' }, false), 'apple', 'the server says where it was bought');
  assert.equal(subscriptionStore({ store: 'google' }, true), 'google');
  assert.equal(subscriptionStore(null, true), 'apple', 'else the store of this device');
  assert.equal(subscriptionStore(undefined, false), 'google');
  const appId = JSON.parse(readFileSync(new URL('../../app/capacitor.config.json', import.meta.url), 'utf8')).appId;
  assert.match(manage, new RegExp(`const APP_ID = '${appId.replace(/\./g, '\\.')}'`), 'the package is the app’s id');
  assert.match(manage, /<a class="bc-account-manage--store" href=\{storeSubscriptionsUrl\(store, APP_ID\)\} target="_blank" rel="noopener noreferrer">/);
  assert.match(manage, /<Icon name="openInNew"/, 'the outlined button carries the external-link icon');
  // No billing tool of our own: nothing here changes a payment method or cancels.
  assert.ok(!/cancelSubscription|updatePayment|purchaseSubscription/i.test(manage));
  assert.equal(langs.fr.account.manage.manageGooglePlay, 'Gérer dans Google Play');
  assert.equal(langs.en.account.manage.manageGooglePlay, 'Manage in Google Play');
});

test('the photo space is 10 GB and shows its use; unknown use is a placeholder, never a number', () => {
  assert.equal(SPACE_LIMIT_BYTES, 10_000_000_000);
  assert.deepEqual(spaceUse(2_300_000_000), { known: true, used: 2_300_000_000, limit: 10_000_000_000, percent: 23 });
  assert.equal(spaceUse(12_000_000_000).percent, 100);
  assert.equal(spaceUse(null).known, false);
  assert.equal(spaceUse(-1).known, false);
  assert.match(manage, /role="progressbar" aria-valuenow=\{space\.percent\}/);
  assert.match(manage, /\{#if space\.known\}[\s\S]*role="progressbar"/);
  assert.equal(langs.fr.account.manage.spaceNote, 'Le carnet lui-même ne compte pas dans cet espace.');
});

test('the server’s account answer is read with care: only well-formed parts are kept', () => {
  assert.deepEqual(overviewOf({ email: 'a@b.c', signInMethod: 'google', subscription: { store: 'google', price: '14,99 $ US', renewsOn: '2027-11-18T00:00:00Z' }, storage: { usedBytes: 5, limitBytes: 10 } }), {
    email: 'a@b.c',
    signInMethod: 'google',
    subscription: { store: 'google', price: '14,99 $ US', renewsOn: '2027-11-18' },
    storage: { usedBytes: 5, limitBytes: 10 },
  });
  assert.deepEqual(overviewOf({ signInMethod: 'carrier-pigeon', subscription: { store: 'x', renewsOn: 'soon' }, storage: { usedBytes: 'many' } }), { subscription: {} });
  assert.deepEqual(overviewOf(null), {});
});

test('deleting the account asks first; the server is called only after the confirmation', async () => {
  const body = manage.slice(manage.indexOf('function askDelete()'), manage.indexOf('</script>'));
  assert.match(body, /^function askDelete\(\) \{\s*confirmAction\(\{/);
  assert.ok(body.indexOf('confirmAction(') < body.indexOf('deleteServerAccount()'), 'the call comes after the dialog');
  assert.match(body, /onConfirm: async \(\) => \{\s*try \{\s*await deleteServerAccount\(\);/);
  assert.equal([...manage.matchAll(/deleteServerAccount\(\)/g)].length, 1, 'one call, inside onConfirm');
  // The button itself only opens the dialog.
  assert.match(manage, /bc-account-manage--delete" onclick=\{askDelete\}/);
  // The dialog tells what is deleted and that the subscription stays until it is cancelled in the store.
  assert.match(langs.fr.account.manage.deleteText, /résiliez-le dans \{store\}/);
  assert.match(langs.en.account.manage.deleteText, /cancel it in \{store\}/);
  // A failure keeps the device as it is: the device copy is signed out only after the server deleted.
  assert.ok(body.indexOf('deleteServerAccount()') < body.indexOf('signOut({ deleteCopy: false })'));
  assert.match(body, /catch \(e\) \{\s*console\.error\('Deleting the account', e\);\s*showSnackbar\(t\('account\.manage\.deleteFailed'\)\);\s*return;/);

  // The call itself: DELETE /v1/account with the session, an empty answer being a success.
  const calls = [];
  const api = createServerApi({ baseUrl: 'https://server.example', transport: async (req) => (calls.push(req), { status: 204, text: '' }) });
  await api.deleteAccount('tok');
  assert.deepEqual([calls[0].method, calls[0].url, calls[0].headers.Authorization], ['DELETE', 'https://server.example/v1/account', 'Bearer tok']);
  const refused = createServerApi({ baseUrl: 'https://server.example', transport: async () => ({ status: 404, text: '' }) });
  await assert.rejects(() => refused.deleteAccount('tok'), { code: 'UNREACHABLE' }, 'a server without the route: the account is not deleted');
});

test('« Télécharger mes données » is a seam until the full export (to-do #57) exists: it says so', async () => {
  const { downloadMyData } = await import('../../app/src/lib/benthic-plus-account.js').catch(() => ({ downloadMyData: null }));
  // The module imports the native plugin; in node it may not load: the source then says the same thing.
  const src = read('lib/benthic-plus-account.js');
  assert.match(src, /export async function downloadMyData\(\) \{\s*return \{ status: 'unavailable' \};/);
  assert.match(manage, /answer\.status === 'unavailable'\) showSnackbar\(t\('account\.manage\.exportUnavailable'\)\)/);
  if (downloadMyData) assert.deepEqual(await downloadMyData(), { status: 'unavailable' });
});

test('signing out keeps the logbook on the device', () => {
  assert.match(manage, /signOut\(\{ deleteCopy: false \}\)/);
  assert.equal(langs.fr.account.manage.signOutText, 'Le carnet reste sur cet appareil');
});

// --- Back closes the sheet; nothing is written to the browser's history ---
// Task 2026-11-18-281 (point 5) had the Android sheet add « #compte » to the browser's history so that Back closed it.
// Since the navigation contract of 19 November 2026 (docs/architecture.md, section 13) the routers own the history and
// the one Back dispatcher closes the sheet, like every other sheet: what the task wanted (Back closes the sheet, no
// orphan entry) holds with no entry at all. tests/e2e/navigation.mjs checks it on the real page.

test('the account sheet writes nothing to the browser history: Back closes it through the dispatcher', () => {
  assert.ok(!existsSync(new URL('lib/account-history.js', root)), 'lib/account-history.js is gone');
  for (const text of [sheet, desktopSheet]) {
    for (const word of ['pushState', 'replaceState', 'history.back', 'popstate', 'account-history']) assert.ok(!text.includes(word), word);
  }
  // The dispatcher closes the topmost sheet, whichever it is.
  assert.ok(read('lib/back-button.js').includes("classList.contains('sheet-modal')) f7.sheet.close(el)"));
  // Closing by Back, the scrim or a swipe down all end in the same state.
  assert.ok(sheet.includes('onSheetClosed={() => (navigation.accountOpen = false)}'));
});

// --- Texts ---

/** @param {any} o @param {string} [p] */
function keys(o, p = '') {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v && 'other' in v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
}

test('every new text exists in French and in English, and the release notes name the change', () => {
  for (const group of ['free', 'manage', 'sheet']) {
    assert.deepEqual(keys(langs.en.account[group]).sort(), keys(langs.fr.account[group]).sort(), group);
  }
  for (const lang of ['fr', 'en']) {
    for (const key of ['nav.accountLabelFree', 'odplus.offer.already', 'odplus.offer.signIn']) {
      assert.ok(key.split('.').reduce((o, k) => o?.[k], langs[lang]), `${lang} ${key}`);
    }
  }
  assert.ok(langs.fr.about.releaseNotes.some((note) => /Gérer le compte/.test(note)));
  assert.ok(langs.en.about.releaseNotes.some((note) => /Manage the account/.test(note)));
  assert.equal(langs.fr.account.manage.perYear, '{price} par an');
  assert.equal(langs.fr.account.manage.renews, 'Renouvelé le {date} · acheté sur {store}');
  assert.equal(langs.fr.account.free.device, 'Carnet sur cet appareil');
});

// --- Task 2026-11-18-282: the « + » chip after the name, and the tablet's offer ---

test('the subscriber sheet shows the round « + » chip after the name, read « Benthic Plus »; the free sheet does not', () => {
  assert.match(sheet, /\{#if subscriber\}\s*<span class="bc-account-sheet--title"><span aria-hidden="true">\{t\('menu\.title'\)\}<span class="bc-account-sheet--plus-dot">\+<\/span><\/span><span class="bc-sr-only">\{t\('odplus\.chipName'\)\}<\/span>/);
  assert.match(sheet, /\.bc-account-sheet--plus-dot \{[^}]*width: 18px;[^}]*height: 18px;[^}]*margin-left: 3px;[^}]*var\(--bc-account-chip\)[^}]*var\(--bc-account-chip-ink\)[^}]*font-weight: 700/);
  assert.equal(langs.fr.odplus.chipName, 'Benthic Plus');
  assert.equal(langs.en.odplus.chipName, 'Benthic Plus');
});

test('the tablet offer: the blue panel carries the chip, title and lead; the phone hero stays on phones; Retour except right after a sign-in', () => {
  const release = read('pages/WelcomeStartRelease.svelte');
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(release, /offerPanel\b[\s\S]*<BenthicPlusChip label=\{t\('odplus\.offer\.pill'\)\} \/>[\s\S]*t\('odplus\.offer\.title'\)[\s\S]*t\('odplus\.offer\.lead'\)/);
  assert.match(offer, /\{#if layout\.phone \|\| desktopApp\}\{@render hero\('offer'\)\}\{\/if\}/);
  assert.match(steps, /tabletOfferBack = \$derived\(step === 'odplusOffer' && !layout\.phone && !desktopApp && offerShowsSignIn\(flow\.stack\)\)/);
  assert.equal(hasBack('odplusOffer', true), false, 'the phone offer keeps no Retour');
  assert.deepEqual(menuEntry('offer'), ['start', 'odplusOffer']);
  assert.equal(offerShowsSignIn(menuEntry('offer')), true);
  assert.equal(offerShowsSignIn(enterOffer(['start', 'odplusConnect', 'email', 'server'])), false);
});

// --- The subscriber's rows: « Sauvegarde et synchronisation » and « Mon profil de plongeur » open their own sections ---

test('the free sheet opens the offer for both Benthic+ rows; the subscriber sheets open the backup page and the profile', () => {
  // Free: the two rows open the offer (phone, iPhone, desktop).
  // The iPhone's free sheet has its own two rows (task 289), so six in all.
  assert.equal((sheet.match(/plus\('offer'\)/g) ?? []).length, 6);
  assert.match(sheet, /href="#offer-sync"[^\n]*plus\('offer'\)/);
  assert.match(sheet, /href="#offer-profile"[^\n]*plus\('offer'\)/);
  assert.match(desktopSheet, /plus-row" onclick=\{\(\) => plus\('offer'\)\}[\s\S]*plus-row" onclick=\{\(\) => plus\('offer'\)\}/);
  // Subscriber: the backup row opens the backup page (the three sheets), the profile row the profile.
  assert.equal((sheet.match(/go\(openBackup\)/g) ?? []).length, 2, 'Android and iPhone');
  assert.match(sheet, /\{#if subscriber\}\s*<div class="bc-account-sheet--divider bc-account-sheet--margin"><\/div>\s*<a href="#backup"/);
  assert.match(sheet, /go\(\(\) => openOver\('\/profile'\)\)/);
  assert.match(desktopSheet, /leaveTo\(openBackup\)/);
  assert.match(desktopSheet, /leaveTo\(openProfile\)/);
  assert.match(read('lib/navigation.svelte.js'), /export function openBackup\(\) \{\s*if \(layout\.desktop\) navigation\.backupOpen = true;\s*else openOver\('\/account\/backup'\);/);
  // The subscriber's entries carry no chip, whatever the platform; the history icon and the new texts are on all three sheets.
  for (const [name, source] of [['Android', sheet.slice(sheet.indexOf('<div class="bc-account-sheet--content">'))], ['iPhone', sheet.slice(0, sheet.indexOf('<div class="bc-account-sheet--content">'))], ['desktop', desktopSheet]]) {
    const at = source.indexOf("t('account.sheet.backup')");
    const profileAt = source.lastIndexOf("t('gear.profile.title')", at + 2000) >= 0 && source.indexOf("t('gear.profile.title')", at - 1500) >= 0 ? source.indexOf("t('gear.profile.title')", at - 1500) : at;
    const rows = source.slice(Math.min(at, profileAt) - 400, Math.max(at, profileAt) + 400);
    assert.match(rows, /name="history"/, name);
    assert.match(rows, /t\('account\.sheet\.backupText'\)/, name);
    assert.doesNotMatch(rows, /BenthicPlusChip/, `${name}: no chip on a subscriber's entries`);
  }
  for (const l of ['fr', 'en']) for (const k of ['backup', 'backupText']) assert.ok(langs[l].account.sheet[k], `${l} ${k}`);
  assert.equal(langs.fr.account.sheet.backup, 'Sauvegarde et restauration');
  assert.equal(langs.fr.account.sheet.backupText, 'Revenir à une version du carnet ou d’une plongée');
});

test('the backup and restore screens are routes of the account: the list, a version, a dive, the deleted dives and a read-only version', () => {
  const app = read('App.svelte');
  assert.match(app, /path: '\/account\/backup', \.\.\.lazy\(\(\) => import\('\.\/pages\/AccountBackup\.svelte'\)\)/);
  assert.match(app, /path: '\/account\/backup\/version\/:id'/);
  assert.match(app, /path: '\/account\/backup\/dive\/:key'/);
  assert.match(app, /path: '\/account\/backup\/dive\/',/);
  assert.match(app, /path: '\/account\/backup\/deleted\/'/);
  assert.match(app, /path: '\/account\/backup\/browse\/:id'/);
  assert.match(app, /\{#if layout\.desktop\}<BackupDialog \/>\{\/if\}/);
  // The old provisional page (sync status, server, history line) is gone.
  assert.ok(!langs.fr.account.backup && !langs.en.account.backup);
  assert.ok(!existsSync(new URL('../../app/src/lib/backup-info.js', import.meta.url)));
});


test('the subscriber sheet lists « Mon profil de plongeur » first, then « Sauvegarde et restauration », on every platform (task 291)', () => {
  const android = sheet.slice(sheet.indexOf('<div class="bc-account-sheet--content">'));
  const iphone = sheet.slice(0, sheet.indexOf('<div class="bc-account-sheet--content">'));
  for (const [name, source, profile, backup] of [
    ['Android phone and tablet', android, 'href="#profile"', 'href="#backup"'],
    ['iPhone', iphone, "openOver('/profile')", 'go(openBackup)'],
    ['desktop', desktopSheet, "leaveTo(openProfile)", 'leaveTo(openBackup)'],
  ]) {
    const p = source.indexOf(profile, source.indexOf('{#if subscriber}') >= 0 ? 0 : 0);
    const b = source.indexOf(backup);
    assert.ok(p >= 0 && b >= 0, name);
    assert.ok(p < b, `${name}: the profile comes before the backup`);
    // Nothing else sits between them but the row's own markup and a divider.
    assert.doesNotMatch(source.slice(p, b), /Settings|settings\.title|about\.title/, name);
  }
});

test('the account variant, across every state: free, signed in not subscribed, subscribed with a device or a server logbook, alpha', () => {
  const state = (signedIn, subscribed) => resolveOdplusAccount({ info: { signedIn, email: signedIn ? 'a@b.c' : '' }, cached: null, remote: signedIn ? subscribed : null });
  const variant = (account, over = {}) => sheetVariant({ release: true, subscriber: isSubscribed(account), email: '', ...over });
  assert.equal(variant(state(false, false)), 'free');
  assert.equal(variant(state(true, false)), 'free', 'signed in, not subscribed: the offer');
  assert.equal(variant(state(true, false), { email: 'a@b.c' }), 'account');
  // Where the logbook lives does not matter: a device logbook has no e-mail, a server one has the account address.
  assert.equal(variant(state(true, true), { email: '' }), 'subscriber', 'subscribed, logbook on the device');
  assert.equal(variant(state(true, true), { email: 'a@b.c' }), 'subscriber', 'subscribed, logbook on the server');
  assert.equal(sheetVariant({ release: false, subscriber: isSubscribed(state(true, true)), email: 'a@b.c' }), 'account', 'the alpha keeps its sheet');
});

test('the Benthic+ account: the session says who, the server says subscribed, else the remembered answer', () => {
  const info = { signedIn: true, email: 'a@b.c' };
  assert.deepEqual(resolveOdplusAccount({ info: { signedIn: false, email: '' }, cached: '1', remote: true }), { signedIn: false, email: '', subscribed: false });
  assert.equal(resolveOdplusAccount({ info, cached: '0', remote: true }).subscribed, true, 'the server wins');
  assert.equal(resolveOdplusAccount({ info, cached: '1', remote: false }).subscribed, false);
  assert.equal(resolveOdplusAccount({ info, cached: '0', remote: null }).subscribed, false, 'offline: the remembered answer');
  assert.equal(resolveOdplusAccount({ info, cached: null, remote: null }).subscribed, true, 'a kept session is a subscribed one');
});
