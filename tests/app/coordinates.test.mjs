import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCoordinates } from '../../app/src/lib/coordinates.js';

test('decimal coordinates accept optional degree symbols and decimal commas', () => {
  const expected = { latUdeg: 23940400, lonUdeg: -74571800 };
  for (const text of [
    '23.9404° ; -74.5718°',
    '23.9404°, -74.5718°',
    '23.9404° -74.5718°',
    '23,9404° ; -74,5718°',
    '23.9404, -74.5718',
  ]) assert.deepEqual(parseCoordinates(text), expected, text);
});

test('coordinates with hemispheres and invalid positions retain their existing handling', () => {
  assert.deepEqual(parseCoordinates('23° 56.424′ N 74° 34.308′ W'), { latUdeg: 23940400, lonUdeg: -74571800 });
  assert.deepEqual(parseCoordinates('23.9404° N, 74.5718° W'), { latUdeg: 23940400, lonUdeg: -74571800 });
  assert.equal(parseCoordinates('91°; -74°'), null);
  assert.equal(parseCoordinates('23°; -181°'), null);
  assert.equal(parseCoordinates('23°; invalid'), null);
});

test('a sign may accompany a matching hemisphere but not contradict it', () => {
  assert.deepEqual(parseCoordinates('23.9650° N, -74.5550° W'), { latUdeg: 23965000, lonUdeg: -74555000 });
  assert.deepEqual(parseCoordinates('-23° S, +74° E'), { latUdeg: -23000000, lonUdeg: 74000000 });
  assert.equal(parseCoordinates('-23° N, 74° W'), null);
  assert.equal(parseCoordinates('23° N, +74° W'), null);
});
