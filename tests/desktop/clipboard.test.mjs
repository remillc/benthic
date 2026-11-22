// SPDX-License-Identifier: GPL-2.0
// The clipboard calls of the bridge (task 2026-11-15-178, part 3), with a fake Electron: the plain
// text and the dives' XML under the private type application/x-benthic-dives.
// Run: node --test tests/desktop/clipboard.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { setupBridge } = require('../../desktop/bridge.cjs');
const fakeHost = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-host.cjs');

let root;
let bridge;
const handlers = new Map();

/** The system clipboard: Electron's writes each replace what was there. */
const store = { text: '' };
const clipboard = {
  writeText: (text) => {
    store.text = text;
  },
  readText: () => store.text,
};

const invoke = async (channel, ...args) => {
  const answer = await handlers.get(channel)({}, ...args);
  if (!answer.ok) throw new Error(answer.error);
  return answer.value;
};

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bc-clip-'));
  mkdirSync(path.join(root, 'resources'));
  bridge = setupBridge({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn), on: (channel, fn) => handlers.set(`on:${channel}`, fn) },
    app: { getPath: (name) => (name === 'userData' ? path.join(root, 'userData') : path.join(root, 'tmp')), getVersion: () => '9.9.9', isPackaged: false, on: () => {}, quit: () => {} },
    safeStorage: { isEncryptionAvailable: () => false },
    electron: () => ({ clipboard, BrowserWindow: { getAllWindows: () => [] } }),
    hostPath: process.execPath,
    hostArgs: [fakeHost],
    resourcesDir: path.join(root, 'resources'),
    broadcast: () => {},
  });
});

after(async () => {
  await bridge.stop();
  rmSync(root, { recursive: true, force: true });
});

test('write puts the text on the clipboard, read gives the text and the dives back', async () => {
  const xml = '<divelog program="subsurface"><dives><dive number="1"/></dives></divelog>';
  await invoke('bc:clipboard', 'write', { text: 'Nr\tDate\n1\t2012', dives: xml });
  assert.equal(store.text, 'Nr\tDate\n1\t2012');
  assert.deepEqual(await invoke('bc:clipboard', 'read'), { text: 'Nr\tDate\n1\t2012', dives: xml });
});

test('another application copying something else drops the dives', async () => {
  await invoke('bc:clipboard', 'write', { text: 'first', dives: '<divelog/>' });
  store.text = 'copied elsewhere';
  assert.deepEqual(await invoke('bc:clipboard', 'read'), { text: 'copied elsewhere', dives: '' });
  // The same text copied again elsewhere would match: the dives come back, as the same rows.
});

test('a copy replaces the previous one', async () => {
  await invoke('bc:clipboard', 'write', { text: 'first', dives: '<divelog/>' });
  await invoke('bc:clipboard', 'write', { text: 'second', dives: '' });
  assert.deepEqual(await invoke('bc:clipboard', 'read'), { text: 'second', dives: '' });
});

test('an unknown action or a huge copy is refused', async () => {
  await assert.rejects(invoke('bc:clipboard', 'wipe'), /BAD_ARGUMENT/);
  await assert.rejects(invoke('bc:clipboard', 'write', { text: 'x'.repeat(51 * 1024 * 1024) }), /BAD_ARGUMENT/);
});
