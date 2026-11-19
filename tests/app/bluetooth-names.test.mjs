import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedComputer, SHORT_PREFIXES } from '../../app/src/lib/bluetooth-names.js';

const S1 = { vendor: 'Oceans', product: 'S1' };

test('a name that only starts with S1 is not an Oceans S1', () => {
  assert.equal(confirmedComputer('S19 A69C LE', S1), null);
  assert.equal(confirmedComputer('s10', S1), null);
});

test('real Oceans S1 names stay', () => {
  for (const name of ['S1', 'S1 1234', 'S1-ABCD', 's1 a69c']) assert.deepEqual(confirmedComputer(name, S1), S1, name);
});

test('every short prefix: digit after it rejects, anything else stays', () => {
  for (const { prefix, vendor, product } of SHORT_PREFIXES) {
    const c = { vendor, product };
    assert.equal(confirmedComputer(`${prefix}7 X`, c), null, prefix);
    assert.deepEqual(confirmedComputer(prefix, c), c, prefix);
    assert.deepEqual(confirmedComputer(`${prefix} 123456`, c), c, prefix);
    assert.deepEqual(confirmedComputer(`${prefix}-AB12`, c), c, prefix);
  }
});

test('long prefixes and pattern names are left alone', () => {
  for (const [name, c] of [
    ['Perdix 1ABC', { vendor: 'Shearwater', product: 'Perdix' }],
    ['Teric 0001', { vendor: 'Shearwater', product: 'Teric' }],
    ['OSTC4-12345', { vendor: 'Heinrichs Weikamp', product: 'OSTC 4' }],
    ['Predator 1234', { vendor: 'Shearwater', product: 'Predator' }],
    ['FQ123456', { vendor: 'Aqualung', product: 'i770R' }],
    ['2_00af', { vendor: 'Cressi', product: 'Goa' }],
    ['Puck4 123', { vendor: 'Mares', product: 'Puck 4' }],
  ]) assert.deepEqual(confirmedComputer(name, c), c, name);
});

test('no match stays no match', () => {
  assert.equal(confirmedComputer('Galaxy Buds', null), null);
});
