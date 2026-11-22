// SPDX-License-Identifier: GPL-2.0
// Process-pipe errors from a disconnected console or logger must not become desktop crashes.
// Run: node --test tests/desktop/process-errors.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { isBrokenPipe, guardProcessPipes, safeWrite } from '../../desktop/process-errors.cjs';

test('broken-pipe codes and messages are recognized', () => {
  assert.equal(isBrokenPipe(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })), true);
  assert.equal(isBrokenPipe(Object.assign(new Error('write failed'), { errno: -32 })), true);
  assert.equal(isBrokenPipe(new Error('disk full')), false);
});

test('broken stdout and stderr streams are guarded and writes do not throw', () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const fake = { stdout, stderr };
  guardProcessPipes(fake);
  stdout.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
  stderr.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
  assert.doesNotThrow(() => safeWrite({ write() { throw Object.assign(new Error('broken pipe'), { code: 'EPIPE' }); } }, 'text'));
  assert.throws(() => safeWrite({ write() { throw new Error('disk full'); } }, 'text'), /disk full/);
});
