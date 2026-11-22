// SPDX-License-Identifier: GPL-2.0
// The release edition's first launch in the desktop app (task 2026-11-16-228): the interface's sign-in to a
// personal cloud (app/src/lib/desktop-first-launch.js) run against the real cloud service of the main process
// (desktop/cloud.cjs) and a fake OAuth server and Google Drive, as « Se connecter à {service} » does it: the page
// opens once, the answer is the account, a service already signed in answers at once, « Changer de compte »
// signs in again, and a refusal, a cancellation and a missing client key each end in the state the screen shows.
// Run: node --test tests/desktop/first-launch.test.mjs
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createCloudService } = require('../../desktop/cloud.cjs');
const { startFakeCloud, CLIENT, ACCOUNT } = require('./fake-cloud-server.cjs');
const { signInTo, signInFailure } = await import('../../app/src/lib/desktop-first-launch.js');

const CLIENTS = { googleDrive: { clientId: CLIENT.googleDrive.id, clientSecret: CLIENT.googleDrive.secret } };
const safeStorage = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from(`enc:${Buffer.from(t).toString('base64')}`), decryptString: (b) => Buffer.from(b.toString().slice(4), 'base64').toString() };

let fake;
let root;
let userData;
/** @type {string[]} the pages the « browser » was sent to */
let opened;

const agreeingBrowser = async (url) => {
  opened.push(url);
  const answer = await fetch(url, { redirect: 'manual' });
  await fetch(answer.headers.get('location'));
};

const service = (overrides = {}) =>
  createCloudService({ userData, safeStorage, openExternal: agreeingBrowser, clients: CLIENTS, endpoints: fake.endpoints, ports: { dropbox: 0 }, texts: () => ({}), ...overrides });

/** What window.benthicDesktop.logbooks is to the interface: the main process's answers to cloudStatus and cloudSignIn. */
const logbooksOf = (cloud) => ({
  cloudStatus: async () => cloud.status(),
  cloudSignIn: ({ provider, switchAccount }) => cloud.signIn(provider, { switchAccount }),
});

before(async () => {
  fake = await startFakeCloud();
  root = mkdtempSync(path.join(tmpdir(), 'bc-first-launch-'));
});
beforeEach(() => {
  userData = path.join(root, `u${Math.random().toString(16).slice(2)}`);
  mkdirSync(userData, { recursive: true });
  opened = [];
  fake.state.accessTokens.clear();
});
after(async () => {
  await fake.close();
  rmSync(root, { recursive: true, force: true });
});

test('« Se connecter à Google Drive »: the page opens once and the answer is the account', async () => {
  const cloud = service();
  const status = await signInTo(logbooksOf(cloud), 'googleDrive');
  assert.deepEqual(status, { provider: 'googleDrive', available: true, connected: true, account: ACCOUNT.googleDrive });
  assert.equal(opened.length, 1);
});

test('a service already signed in answers at once, with no page; « Changer de compte » opens it again', async () => {
  const cloud = service();
  await signInTo(logbooksOf(cloud), 'googleDrive');
  const again = await signInTo(logbooksOf(cloud), 'googleDrive');
  assert.equal(again.account, ACCOUNT.googleDrive);
  assert.equal(opened.length, 1, 'no second page');
  await signInTo(logbooksOf(cloud), 'googleDrive', true);
  assert.equal(opened.length, 2, 'another account asks again');
  assert.match(new URL(opened[1]).searchParams.get('prompt') ?? '', /select_account/);
});

test('refused at the provider: the screen shows « Connexion non établie »', async () => {
  const cloud = service({
    openExternal: async (url) => {
      const redirect = new URL(new URL(url).searchParams.get('redirect_uri'));
      redirect.searchParams.set('error', 'access_denied');
      redirect.searchParams.set('state', new URL(url).searchParams.get('state'));
      await fetch(redirect);
    },
  });
  await assert.rejects(signInTo(logbooksOf(cloud), 'googleDrive'), (e) => signInFailure(e) === 'refused');
});

test('cancelled (« Annuler », « Retour »): back to « Se connecter », no message', async () => {
  /** @type {any} */
  let cloud;
  cloud = service({ signInTimeoutMs: 60_000, openExternal: async () => void setTimeout(() => cloud.cancelSignIn('googleDrive'), 20) });
  await assert.rejects(signInTo(logbooksOf(cloud), 'googleDrive'), (e) => signInFailure(e) === 'cancelled');
});

test('a build without the keys of the service: the screen says the cloud is coming', async () => {
  const cloud = service({ clients: {} });
  await assert.rejects(signInTo(logbooksOf(cloud), 'googleDrive'), (e) => signInFailure(e) === 'unavailable');
  assert.equal(opened.length, 0);
});
