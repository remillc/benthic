// Error reports, desktop side (desktop/crash-reports.cjs): one saved crash, read at the next launch, then cleared.
// Run: node --test tests/desktop/crash-reports.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCrashStore, FILE } = require('../../desktop/crash-reports.cjs');

const fixed = () => new Date('2026-11-19T10:00:00Z');

test('a crash is saved, read back, and cleared', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-crash-'));
  try {
    const store = createCrashStore({ dir, osVersion: 'win32 10.0.26300', device: 'Electron 33 x64', now: fixed });
    assert.equal(store.pending(), '');
    const error = new Error('boom');
    store.write('Main process', error);
    const saved = JSON.parse(store.pending());
    assert.equal(saved.occurredAt, '2026-11-19T10:00:00.000Z');
    assert.equal(saved.message, 'Main process: Error: boom');
    assert.equal(saved.osVersion, 'win32 10.0.26300');
    assert.equal(saved.device, 'Electron 33 x64');
    assert.match(saved.stack, /boom/);
    store.clear();
    assert.equal(store.pending(), '');
    assert.equal(fs.existsSync(path.join(dir, FILE)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only the last crash is kept, text and objects are accepted, and a failing disk raises nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-crash-'));
  try {
    const store = createCrashStore({ dir, now: fixed });
    store.write('Core helper', 'The core stopped (1)');
    store.write('Main process rejection', { code: 7 });
    assert.equal(JSON.parse(store.pending()).message, 'Main process rejection: {"code":7}');
    const broken = createCrashStore({ dir: path.join(dir, 'x'), fsImpl: { mkdirSync() { throw new Error('read-only'); } } });
    assert.doesNotThrow(() => broken.write('Main process', new Error('x')));
    assert.equal(broken.pending(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
