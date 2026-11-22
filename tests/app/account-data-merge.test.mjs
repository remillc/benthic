import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAccountFile } from '../../app/src/lib/account-data-merge.js';

test('merges independent fields and preserves unknown data', () => {
  const base = { name: 'A', tags: ['old'], future: { retained: true }, updatedAt: '2026-01-01T00:00:00Z' };
  const ours = { ...base, name: 'B', updatedAt: '2026-01-02T00:00:00Z' };
  const theirs = { ...base, tags: ['new'], updatedAt: '2026-01-03T00:00:00Z' };
  assert.deepEqual(mergeAccountFile(base, ours, theirs), {
    value: { ...base, name: 'B', tags: ['new'], updatedAt: theirs.updatedAt },
    conflicts: [],
  });
});

test('records concurrent array and deletion conflicts and uses the later version provisionally', () => {
  const base = { tags: ['old'], note: 'old', updatedAt: '2026-01-01T00:00:00Z' };
  const ours = { tags: ['ours'], updatedAt: '2026-01-02T00:00:00Z' };
  const theirs = { tags: ['theirs'], note: 'new', updatedAt: '2026-01-03T00:00:00Z' };
  const result = mergeAccountFile(base, ours, theirs);
  assert.deepEqual(result.value, theirs);
  assert.deepEqual(result.conflicts.map((c) => c.key).sort(), ['note', 'tags']);
  assert.deepEqual(result.conflicts.find((c) => c.key === 'note').ours, { present: false });
});

test('keeps an edit against a concurrent file deletion and permits an unopposed deletion', () => {
  const base = { name: 'A' };
  const edited = { name: 'B' };
  assert.deepEqual(mergeAccountFile(base, null, edited), { value: edited, conflicts: [] });
  assert.deepEqual(mergeAccountFile(base, null, base), { value: null, conflicts: [] });
});

test('rejects ambiguous conflict ordering rather than silently discarding a version', () => {
  assert.throws(() => mergeAccountFile({ name: 'A' }, { name: 'B' }, { name: 'C' }), /ACCOUNT_DATA_CONFLICT_TIME/);
});

test('resolves equal timestamps consistently regardless of device order', () => {
  const base = { name: 'A', updatedAt: '2026-01-01T00:00:00Z' };
  const ours = { name: 'B', updatedAt: '2026-01-02T00:00:00Z' };
  const theirs = { name: 'C', updatedAt: '2026-01-02T00:00:00Z' };
  assert.deepEqual(mergeAccountFile(base, ours, theirs).value, mergeAccountFile(base, theirs, ours).value);
  assert.equal(mergeAccountFile(base, ours, theirs).conflicts.length, 1);
});

test('preserves unknown JSON keys that have special meaning to JavaScript objects', () => {
  const base = JSON.parse('{"__proto__":{"future":1},"name":"A"}');
  const ours = JSON.parse('{"__proto__":{"future":1},"name":"B"}');
  const theirs = JSON.parse('{"__proto__":{"future":2},"name":"A"}');
  const result = mergeAccountFile(base, ours, theirs);
  assert.deepEqual(result.value, JSON.parse('{"__proto__":{"future":2},"name":"B"}'));
});
