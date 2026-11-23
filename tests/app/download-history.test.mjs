// What the download screen remembers about a computer (app/src/lib/download-history.js, task 2026-11-23-357).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readHistory, recordDownload, recordOf } from '../../app/src/lib/download-history.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('nothing is known before the first download', () => {
  const store = memory();
  assert.deepEqual(readHistory(store), {});
  assert.equal(recordOf('LE:AA:BB:CC:DD:EE:01', store), null);
});

test('a download is kept by MAC address, whatever the transport prefix', () => {
  const store = memory();
  recordDownload('LE:aa:bb:cc:dd:ee:01', ['2026-11-20T10:00:00', '2026-11-21T09:00:00'], new Date('2026-11-22T08:00:00Z'), store);
  const record = recordOf('AA:BB:CC:DD:EE:01', store);
  assert.equal(record?.at, '2026-11-22T08:00:00.000Z');
  assert.equal(record?.lastDive, '2026-11-21T09:00:00');
});

test('a download that brings no dive keeps the last dive known', () => {
  const store = memory();
  recordDownload('AA:BB:CC:DD:EE:01', ['2026-11-21T09:00:00'], new Date('2026-11-22T08:00:00Z'), store);
  recordDownload('AA:BB:CC:DD:EE:01', [], new Date('2026-11-23T08:00:00Z'), store);
  assert.equal(recordOf('AA:BB:CC:DD:EE:01', store)?.lastDive, '2026-11-21T09:00:00');
  assert.equal(recordOf('AA:BB:CC:DD:EE:01', store)?.at, '2026-11-23T08:00:00.000Z');
});

test('a damaged value reads as empty', () => {
  assert.deepEqual(readHistory({ getItem: () => '[1,2' }), {});
  assert.deepEqual(readHistory({ getItem: () => '[1]' }), {});
});
