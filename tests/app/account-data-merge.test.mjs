import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAccountFile, mergeEncryptedAccountFile } from '../../app/src/lib/account-data-merge.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';

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

function boxFor(byte) {
  const key = toBase64(new Uint8Array(32).fill(byte));
  return createSecretBox({ read: async () => key, write: async () => { throw new Error('unexpected key write'); } });
}

test('merges the encrypted profile fields without encrypting its ordinary fields', async () => {
  const box = boxFor(1);
  const item = { id: 'profile', format: 1 };
  const make = async (data, updatedAt, homeAirport) => ({ format: 1, updatedAt, homeAirport, enc: await box.seal(data, item) });
  const base = await make({ fullName: 'Name A', bloodGroup: 'A+', dateOfBirth: '1980-01-01', future: 'keep' }, '2026-01-01T00:00:00Z', 'AAA');
  const ours = await make({ fullName: 'Name B', bloodGroup: 'A+', dateOfBirth: '1980-01-01', future: 'keep' }, '2026-01-02T00:00:00Z', 'BBB');
  const theirs = await make({ fullName: 'Name A', bloodGroup: 'O+', dateOfBirth: '1980-01-01', future: 'keep' }, '2026-01-03T00:00:00Z', 'AAA');
  const result = await mergeEncryptedAccountFile(base, ours, theirs, box, item);
  assert.equal(result.value.homeAirport, 'BBB');
  assert.deepEqual(await box.open(result.value.enc, item), { fullName: 'Name B', bloodGroup: 'O+', dateOfBirth: '1980-01-01', future: 'keep' });
  assert.notEqual(result.value.enc.nonce, ours.enc.nonce);
  assert.notEqual(result.value.enc.nonce, theirs.enc.nonce);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.sealedConflicts, null);
});

test('keeps sensitive certification conflicts encrypted, including both competing values', async () => {
  const box = boxFor(2);
  const item = { id: 'cert-1', format: 1 };
  const make = async (payload, updatedAt) => ({ format: 1, id: item.id, updatedAt, enc: await box.seal(payload, item) });
  const base = await make({ number: 'original', documents: ['old'] }, '2026-01-01T00:00:00Z');
  const ours = await make({ number: 'private-one', documents: ['old'] }, '2026-01-02T00:00:00Z');
  const theirs = await make({ number: 'private-two', documents: ['new'] }, '2026-01-03T00:00:00Z');
  const result = await mergeEncryptedAccountFile(base, ours, theirs, box, item);
  assert.deepEqual(await box.open(result.value.enc, item), { number: 'private-two', documents: ['new'] });
  assert.ok(result.sealedConflicts);
  assert.doesNotMatch(JSON.stringify(result), /private-one|private-two/);
  assert.deepEqual(await box.open(result.sealedConflicts, { id: 'cert-1:conflicts', format: 1 }), [{
    key: 'number', base: { present: true, value: 'original' }, ours: { present: true, value: 'private-one' }, theirs: { present: true, value: 'private-two' },
  }]);
  await assert.rejects(box.open(result.sealedConflicts, item));
});

test('does not merge encrypted content with a different key or file identity', async () => {
  const box = boxFor(3);
  const other = boxFor(4);
  const item = { id: 'cert-1', format: 1 };
  const base = { format: 1, id: item.id, updatedAt: '2026-01-01T00:00:00Z', enc: await box.seal({ level: 'A' }, item) };
  const ours = { ...base, updatedAt: '2026-01-02T00:00:00Z', enc: await box.seal({ level: 'B' }, item) };
  const theirs = { ...base, updatedAt: '2026-01-03T00:00:00Z', enc: await other.seal({ level: 'C' }, item) };
  await assert.rejects(mergeEncryptedAccountFile(base, ours, theirs, box, item));
  await assert.rejects(mergeEncryptedAccountFile(base, ours, { ...theirs, id: 'another' }, box, item), /INVALID_ACCOUNT_FILE/);
  await assert.rejects(mergeEncryptedAccountFile(base, ours, { ...theirs, format: 2 }, box, item), /INVALID_ACCOUNT_FILE/);
  await assert.rejects(mergeEncryptedAccountFile(null, null, theirs, box, item));
});

test('seals a legacy birth date before returning a selected profile for synchronization', async () => {
  const box = boxFor(7);
  const item = { id: 'profile', format: 1 };
  const file = { format: 1, dateOfBirth: '1980-01-02' };
  const result = await mergeEncryptedAccountFile(null, null, file, box, item);
  assert.doesNotMatch(JSON.stringify(result), /1980-01-02/);
  assert.deepEqual(await box.open(result.value.enc, item), { dateOfBirth: '1980-01-02' });
});

test('merges a legacy ancestor without leaking its birth date or losing concurrent changes', async () => {
  const box = boxFor(8);
  const item = { id: 'profile', format: 1 };
  const base = { format: 1, dateOfBirth: '1980-01-02', updatedAt: '2026-01-01T00:00:00Z' };
  const ours = { format: 1, updatedAt: '2026-01-02T00:00:00Z', enc: await box.seal({ dateOfBirth: '1980-01-02', fullName: 'Name' }, item) };
  const theirs = { format: 1, dateOfBirth: '1980-01-03', updatedAt: '2026-01-03T00:00:00Z' };
  const result = await mergeEncryptedAccountFile(base, ours, theirs, box, item);
  assert.doesNotMatch(JSON.stringify(result), /1980-01-0[23]/);
  assert.deepEqual(await box.open(result.value.enc, item), { dateOfBirth: '1980-01-03', fullName: 'Name' });
  assert.deepEqual(result.conflicts, []);
});

test('rejects an invalid or contradictory legacy date instead of overwriting either value', async () => {
  const box = boxFor(9);
  const item = { id: 'profile', format: 1 };
  await assert.rejects(mergeEncryptedAccountFile(null, null, { format: 1, dateOfBirth: 12 }, box, item), /INVALID_BIRTH_DATE/);
  const file = { format: 1, dateOfBirth: '1980-01-02', enc: await box.seal({ dateOfBirth: '1980-01-03' }, item) };
  await assert.rejects(mergeEncryptedAccountFile(null, null, file, box, item), /CONFLICTING_BIRTH_DATE/);
});

test('resolves deletion of an encrypted block without exposing its conflict in clear text', async () => {
  const box = boxFor(5);
  const item = { id: 'profile', format: 1 };
  const base = { format: 1, updatedAt: '2026-01-01T00:00:00Z', enc: await box.seal({ fullName: 'old' }, item) };
  const ours = { format: 1, updatedAt: '2026-01-02T00:00:00Z' };
  const theirs = { format: 1, updatedAt: '2026-01-03T00:00:00Z', enc: await box.seal({ fullName: 'private' }, item) };
  const result = await mergeEncryptedAccountFile(base, ours, theirs, box, item);
  assert.equal((await box.open(result.value.enc, item)).fullName, 'private');
  assert.doesNotMatch(JSON.stringify(result), /private/);
  const conflicts = await box.open(result.sealedConflicts, { id: 'profile:conflicts', format: 1 });
  assert.equal(conflicts[0].ours.present, false);
  assert.equal(conflicts[0].theirs.value.fullName, 'private');
});
