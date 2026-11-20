// The iPhone's own wiring (task 2026-11-19-289): the order of the sign-in buttons, the App Store link, the maps link of
// the iPhone, the action sheet that confirms a deletion, and the seams of the purchase and of the restore that stay inert
// until Christian approves StoreKit and Sign in with Apple.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { providerOrder } from '../../app/src/lib/benthic-plus.js';
import { mapsLinks } from '../../app/src/lib/maps-link.js';
import { APP_STORE_SUBSCRIPTIONS, storeSubscriptionsUrl, subscriptionStore } from '../../app/src/lib/account-sheet.js';
import { purchaseSubscription, restorePurchases, signInWithApple } from '../../app/src/lib/benthic-plus-billing.js';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('« Continuer avec Apple » comes first on iOS, Google first elsewhere, the e-mail last', () => {
  assert.deepEqual(providerOrder(true), ['apple', 'google', 'email']);
  assert.deepEqual(providerOrder(false), ['google', 'apple', 'email']);
});

test('« Gérer dans l’App Store » opens the system subscription page on an iPhone', () => {
  assert.equal(APP_STORE_SUBSCRIPTIONS, 'https://apps.apple.com/account/subscriptions');
  assert.equal(storeSubscriptionsUrl('apple', 'org.opendives.app'), 'https://apps.apple.com/account/subscriptions');
  assert.equal(subscriptionStore(null, true), 'apple');
});

test('« Ouvrir dans Plans » uses the maps: scheme with Apple Maps on the web as the fallback', () => {
  const { primary, fallback } = mapsLinks(-35448500, 174731700, 'Northern Arch', true);
  assert.equal(primary, 'maps://?ll=-35.4485,174.7317&q=Northern%20Arch');
  assert.equal(fallback, 'https://maps.apple.com/?ll=-35.4485,174.7317&q=Northern%20Arch');
  assert.match(mapsLinks(1000000, 2000000, 'A', false).primary, /^geo:1,2\?q=/);
  assert.match(mapsLinks(1000000, 2000000, '', true).primary, /q=1%2C2$/);
});

test('the action sheet: the explanation, the action in red, « Annuler » apart', async () => {
  const { actionSheetButtons } = await import('../../app/src/lib/action-sheet.js');
  const buttons = actionSheetButtons({ text: 'Cette bouteille sera retirée.', action: 'Supprimer « ALU 3L »', onConfirm: () => {} });
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0][0].label, true);
  assert.equal(buttons[0][1].color, 'red');
  assert.equal(buttons[0][1].text, 'Supprimer « ALU 3L »');
  assert.equal(buttons[1][0].bold, true);
  const page = src('pages/CylinderType.svelte');
  assert.match(page, /if \(ios\) \{[^}]*confirmActionSheet/s);
  assert.match(page, /bc-cylinder-type--delete-ios/);
});

test('StoreKit and Sign in with Apple stay inert: the same « not available » answers', async () => {
  assert.deepEqual(await purchaseSubscription(), { status: 'unavailable' });
  assert.deepEqual(await restorePurchases(), { status: 'unavailable' });
  assert.deepEqual(await signInWithApple(), { status: 'unavailable' });
});

test('the offer shows « Restaurer les achats » and the renewal terms on iOS; the texts exist in both languages', () => {
  const offer = src('components/FirstLaunchBenthicPlus.svelte');
  assert.match(offer, /\{#if ios\}[\s\S]*odplus\.offer\.restore[\s\S]*odplus\.offer\.terms/);
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(src(`i18n/${lang}.json`));
    for (const key of ['restore', 'terms']) assert.ok(json.odplus.offer[key], `${lang}: ${key}`);
    assert.ok(json.account.free.deviceIos, `${lang}: deviceIos`);
    assert.ok(json.sites.openInPlans, `${lang}: openInPlans`);
    assert.ok(json.settings.cylinders.deleteTypeSheet, `${lang}: deleteTypeSheet`);
  }
});

test('the account sheet on iPhone: « Carnet sur cet iPhone » for the free version, the OpenDives+ chip for a subscriber', () => {
  const sheet = src('components/AccountSheet.svelte');
  assert.match(sheet, /account\.free\.deviceIos/);
  assert.match(sheet, /bc-account-sheet--ios-link/);
});
