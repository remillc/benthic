// The release edition's first launch on an iPhone (task 2026-11-16-261; mock-ups
// docs/mockups/ios-premier-lancement-production*.dc.html, 393 x 852): the same flow as the Android phone with the
// texts « cet iPhone », iCloud Drive first, iOS grouped rows and a native alert for an unreadable file. Android and
// the tablets keep their screens. The screens need Framework7 and a WebView: their CSS and markup are read from the
// source, as in first-launch-phone.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deviceKey, iphoneKey, iosPhone } from '../../app/src/lib/first-launch-phone.js';
import { CLOUD_SERVICES, ICLOUD_SERVICE, cloudServices } from '../../app/src/lib/release-welcome.js';
import { forward, back } from '../../app/src/lib/first-launch-steps.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const src = (path) => read(`app/src/${path}`);
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(src(`i18n/${l}.json`))]));

test('the iPhone variant is the iOS look on a phone only', () => {
  assert.equal(iosPhone(true, true), true);
  assert.equal(iosPhone(true, false), false, 'an iPad keeps its tablet screens');
  assert.equal(iosPhone(false, true), false, 'an Android phone keeps its screens');
  assert.equal(iosPhone(false, false), false);
});

test('texts that name the device: « cet iPhone » on an iPhone, the others unchanged', () => {
  const key = 'welcomeSteps.deviceTitle';
  assert.equal(deviceKey(key, true, true), `${key}Iphone`);
  assert.equal(deviceKey(key, true, false), `${key}Phone`, 'Android phone');
  assert.equal(deviceKey(key, true), `${key}Phone`);
  assert.equal(deviceKey(key, false, true), key, 'iPad');
  assert.equal(deviceKey(key, false), key);
  assert.equal(iphoneKey('welcomeSteps.cloudHelp', true), 'welcomeSteps.cloudHelpIphone');
  assert.equal(iphoneKey('welcomeSteps.cloudHelp', false), 'welcomeSteps.cloudHelp');
  const wanted = {
    fr: { deviceTitle: 'Seulement sur cet iPhone', gitTokenHelp: 'Le jeton reste sur cet iPhone.', webdavTail: 'Il reste sur cet iPhone.' },
    en: { deviceTitle: 'Only on this iPhone', gitTokenHelp: 'The token stays on this iPhone.', webdavTail: 'It stays on this iPhone.' },
  };
  for (const lang of ['fr', 'en']) {
    const s = langs[lang].welcomeSteps;
    for (const k of ['deviceTitle', 'deviceHelp', 'gitTokenHelp', 'webdavHelp']) {
      assert.match(s[`${k}Iphone`], /iPhone/, `${lang} ${k}Iphone`);
      assert.doesNotMatch(s[`${k}Iphone`], /tablette|tablet|téléphone|this phone/, `${lang} ${k}Iphone`);
    }
    assert.equal(s.deviceTitleIphone, wanted[lang].deviceTitle);
    assert.equal(s.gitTokenHelpIphone, wanted[lang].gitTokenHelp);
    assert.ok(s.webdavHelpIphone.endsWith(wanted[lang].webdavTail));
  }
});

test('« Dans mon nuage » lists iCloud Drive first on an iPhone', () => {
  assert.ok(langs.fr.welcomeSteps.cloudHelpIphone.startsWith('iCloud Drive, Google Drive, OneDrive, Dropbox ou WebDAV.'));
  assert.ok(langs.fr.welcomeSteps.openCloudHelpIphone.startsWith('iCloud Drive, Google Drive, OneDrive, Dropbox ou WebDAV.'));
  assert.ok(langs.en.welcomeSteps.cloudHelpIphone.startsWith('iCloud Drive, Google Drive, OneDrive, Dropbox or WebDAV.'));
  assert.doesNotMatch(langs.fr.welcomeSteps.cloudHelp, /iCloud/);
  assert.doesNotMatch(langs.fr.welcomeSteps.openCloudHelp, /iCloud/);
  const steps = src('components/FirstLaunchSteps.svelte');
  // « Dans mon nuage » of « Où le garder ? » (cloudHelpIphone) is no longer on the name step: the first step has « Se connecter »
  // (task 2026-11-17-263). The texts stay for the « Où le garder ? » step of the server screens.
  assert.match(steps, /iphoneKey\('welcomeSteps\.openCloudHelp', iphone\)/);
});

test('iCloud Drive is the first service on an iPhone, with its line, and nowhere else', () => {
  const list = cloudServices(true);
  assert.equal(list[0], ICLOUD_SERVICE);
  assert.deepEqual(list.slice(1).map((s) => s.key), CLOUD_SERVICES.map((s) => s.key));
  assert.deepEqual(cloudServices(false), CLOUD_SERVICES, 'Android phone, tablets and iPad: the list is unchanged');
  assert.ok(!cloudServices(false).some((s) => s.key === 'icloud'));
  assert.equal(langs.fr.welcomeSteps.icloud, 'iCloud Drive');
  assert.equal(langs.fr.welcomeSteps.icloudHelp, 'Le compte Apple de cet iPhone, sans connexion à faire.');
  assert.equal(langs.en.welcomeSteps.icloudHelp, 'The Apple account of this iPhone, no sign-in needed.');
  // The list shows a line under iCloud Drive only.
  assert.equal(CLOUD_SERVICES.some((s) => 'help' in s), false);
  assert.match(src('components/FirstLaunchSteps.svelte'), /cloudServices\(iphone\)/);
});

test('choosing iCloud Drive goes to the connected screen with no sign-in, and back', () => {
  assert.deepEqual(forward(['start', 'new', 'cloudService'], 'icloud'), ['start', 'new', 'cloudService', 'cloudConnected']);
  assert.deepEqual(forward(['start', 'open', 'openCloudService'], 'icloud'), ['start', 'open', 'openCloudService', 'openCloudConnected']);
  const there = forward(['start', 'new', 'cloudService'], 'icloud');
  assert.deepEqual(back(there), ['start', 'new', 'cloudService']);
  assert.ok(!there.includes('cloudConnect'), 'no sign-in step');
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.match(steps, /if \(key === 'icloud'\) flow\.account = t\('welcomeSteps\.icloudAccount'\)/);
  // No « Changer de compte » on the Apple account.
  assert.match(steps, /\{#if flow\.service !== 'icloud'\}\s+<button[^>]+>\{t\('welcomeSteps\.changeAccount'\)\}/);
});

test('the plugin: createIcloudLogbook in the contract, in Swift, and a stub on Android', () => {
  const api = read('plugins/opendives-core/core-api.js');
  assert.match(api, /createIcloudLogbook: \(options\) => native\.createIcloudLogbook\(options\)/);
  assert.match(api, /@property \{\(options: \{name: string\}\) => Promise<\{path: string, created: boolean\}>\} createIcloudLogbook/);
  const kotlin = read('plugins/opendives-core/android/src/main/java/org/opendives/core/OpenDivesCorePlugin.kt');
  assert.match(kotlin, /fun createIcloudLogbook\(call: PluginCall\) \{\s+call\.reject\("NOT_AVAILABLE", "NOT_AVAILABLE"\)/);
  const swift = read('plugins/opendives-core/ios/Plugin/OpenDivesCorePlugin.swift');
  assert.match(swift, /CAPPluginMethod\(name: "createIcloudLogbook", returnType: CAPPluginReturnPromise\)/);
  assert.match(swift, /@objc func createIcloudLogbook\(_ call: CAPPluginCall\)/);
  assert.match(swift, /url\(forUbiquityContainerIdentifier: nil\)/);
  assert.match(swift, /Failure\("NOT_AVAILABLE"\)/);
  // The app is allowed to use the container.
  assert.match(read('app/ios/App/App/App.entitlements'), /com\.apple\.developer\.icloud-container-identifiers/);
  assert.match(read('app/ios/App/App/App.entitlements'), /CloudDocuments/);
  assert.match(read('app/ios/App/App/Info.plist'), /NSUbiquitousContainers/);
  // The JavaScript calls it from the iCloud screen only, which only an iPhone reaches.
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.equal((steps.match(/createIcloudLogbook/g) ?? []).length, 1);
  assert.match(steps, /flow\.service === 'icloud' \? createInIcloud : cloud/);
  assert.match(steps, /errorCode\(e\) === 'NOT_AVAILABLE'/);
});

test('every first-launch form is a grouped inset list on an iPhone: rows, 12 pt corners, help in #6C6C70', () => {
  const field = src('components/ReleaseField.svelte');
  assert.match(field, /const iphone = \$derived\(iosPhone\(ios, layout\.phone\)\)/);
  assert.match(field, /class:od-release-field--ios=\{iphone\}/);
  const rows = field.slice(field.indexOf('.od-release-field--ios {'));
  assert.match(rows, /border-radius: 12px/);
  assert.match(rows, /min-height: 48px/);
  assert.match(rows, /color: var\(--od-release-ios-help\)/);
  assert.match(rows, /width: 148px/);
  const theme = src('theme.css');
  assert.match(theme, /--od-release-ios-help: #6C6C70;/);
  assert.match(theme, /--od-release-ios-help: #98989D;/, 'dark value');
  // Every form uses the field: WebDAV, git, divelogs.de, the logbook name.
  for (const f of ['components/FirstLaunchWebdav.svelte', 'components/FirstLaunchGit.svelte', 'components/FirstLaunchDivelogs.svelte', 'components/FirstLaunchSteps.svelte']) {
    assert.match(src(f), /<ReleaseField/, f);
  }
  // Git: the three fields are rows of one list on an iPhone, not a pair side by side.
  assert.match(src('components/FirstLaunchGit.svelte'), /\{#if iosPhone\(ios, layout\.phone\)\}[\s\S]+\{@render branchAndToken\(\)\}[\s\S]+\{:else\}[\s\S]+od-first-launch-git--pair/);
});

test('« Un fichier » opens the system picker: a plain file input, several files, no custom screen', () => {
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.match(steps, /<input type="file" multiple class="od-first-launch--file"/);
  assert.doesNotMatch(steps.match(/<input type="file"[^>]*>/)[0], /accept=/, 'no accept list: every file shows in Files, an unreadable one gets the alert');
  assert.match(steps, /onclick=\{\(\) => fileInput\?\.click\(\)\}/);
});

test('an unreadable file is a native alert on an iPhone, the inline card elsewhere; other errors stay inline', () => {
  const steps = src('components/FirstLaunchSteps.svelte');
  assert.match(steps, /if \(iphone\) unreadableAlert\(file\.name\);\s+else unreadable = file\.name;/);
  const alert = steps.slice(steps.indexOf('function unreadableAlert'), steps.indexOf('function readBase64'));
  assert.match(alert, /title: t\('welcomeSteps\.fileUnreadable'\)/);
  assert.match(alert, /text: t\('welcomeSteps\.fileUnreadableHelp', \{ name \}\)/);
  assert.match(alert, /\{ text: t\('welcomeSteps\.cancel'\) \}/);
  assert.match(alert, /\{ text: t\('welcomeSteps\.otherFile'\), bold: true, onClick: \(\) => fileInput\?\.click\(\) \}/);
  // Only the unreadable file takes the alert: the other errors keep their dialog, and the inline card stays for the others.
  assert.match(steps, /if \(step === 'import' && file && \(key === 'logbook\.importFailed' \|\| key === 'logbook\.importNoDives'\)\)/);
  assert.match(steps, /\{#if unreadable\}\s+<div class="od-first-launch--error" role="alert">/);
  assert.equal(langs.fr.welcomeSteps.otherFile, 'Autre fichier');
  assert.equal(langs.fr.welcomeSteps.cancel, 'Annuler');
  assert.equal(langs.fr.welcomeSteps.fileUnreadable, 'Ce fichier n’a pas pu être lu');
});

test('safe area: the bands grow by the top inset, the last link clears the home indicator', () => {
  const page = src('pages/WelcomeStartRelease.svelte');
  assert.match(page, /--od-welcome-band-top: max\(var\(--f7-safe-area-top, 0px\), 24px\)/);
  assert.match(page, /min-height: calc\(330px - 24px \+ var\(--od-welcome-band-top\)\)/);
  assert.match(page, /min-height: calc\(140px - 24px \+ var\(--od-welcome-band-top\)\)/);
  assert.match(page, /padding: calc\(var\(--od-welcome-band-top\) \+ 16px\) 20px 0/);
  assert.match(src('components/FirstLaunchSteps.svelte'), /margin: auto auto calc\(var\(--f7-safe-area-bottom\) \+ 28px\)/);
});
