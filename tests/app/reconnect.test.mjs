import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReconnect } from '../../app/src/lib/reconnect.js';

const base = { email: 'a@b.c', sync: 'offline', loading: false, error: null, conflict: null };

test('offline with an account and nothing pending still reconnects', () => {
  assert.equal(shouldReconnect(base), true);
});
test('not offline, no account, loading, error or conflict: no reconnect', () => {
  assert.equal(shouldReconnect({ ...base, sync: 'cloud' }), false);
  assert.equal(shouldReconnect({ ...base, sync: 'syncing' }), false);
  assert.equal(shouldReconnect({ ...base, email: null }), false);
  assert.equal(shouldReconnect({ ...base, loading: true }), false);
  assert.equal(shouldReconnect({ ...base, error: 'load' }), false);
  assert.equal(shouldReconnect({ ...base, conflict: {} }), false);
});
