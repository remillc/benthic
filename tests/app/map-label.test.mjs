// The accessible name of the Sites map (task 2026-11-14-147).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapLabel, placeOnMap } from '../../app/src/lib/map-label.js';

/** A view of 2 degrees by 2 around (0, 0). */
const VIEW = /** @type {[number, number, number, number]} */ ([-1, -1, 1, 1]);

test('the middle third is the centre, the rest one of eight directions', () => {
  assert.equal(placeOnMap(0, 0, VIEW), 'centre');
  assert.equal(placeOnMap(0.3, -0.3, VIEW), 'centre');
  assert.equal(placeOnMap(0, 0.8, VIEW), 'north');
  assert.equal(placeOnMap(0, -0.8, VIEW), 'south');
  assert.equal(placeOnMap(0.8, 0, VIEW), 'east');
  assert.equal(placeOnMap(-0.8, 0, VIEW), 'west');
  assert.equal(placeOnMap(0.8, 0.8, VIEW), 'northEast');
  assert.equal(placeOnMap(-0.8, -0.8, VIEW), 'southWest');
  assert.equal(placeOnMap(0.1, 0.9, VIEW), 'north', 'mostly up is north');
});

test('a point out of view has no place', () => {
  assert.equal(placeOnMap(1.5, 0, VIEW), null);
  assert.equal(placeOnMap(0, -1.2, VIEW), null);
});

test('a view across the antimeridian', () => {
  const view = /** @type {[number, number, number, number]} */ ([179, -1, -179, 1]);
  assert.equal(placeOnMap(180, 0, view), 'centre');
  assert.equal(placeOnMap(-179.2, 0, view), 'east');
  assert.equal(placeOnMap(179.2, 0, view), 'west');
  assert.equal(placeOnMap(0, 0, view), null);
});

const where = { north: 'au nord', south: 'au sud', centre: 'au centre' };
const words = {
  map: 'Carte des sites',
  withSites: (/** @type {string} */ list) => `Carte des sites : ${list}`,
  item: (/** @type {string} */ name, /** @type {string} */ place, /** @type {number} */ n) => `${name} ${where[/** @type {'north'} */ (place)] ?? place}, ${n} ${n > 1 ? 'plongées' : 'plongée'}`,
  join: '. ',
};

test('the label: each site in view with its place and its dives', () => {
  const sites = [
    { name: 'Northern Arch', lonDeg: 0, latDeg: 0.8, dives: 1 },
    { name: 'Lake Coleridge', lonDeg: 0, latDeg: -0.8, dives: 1 },
    { name: 'Far away', lonDeg: 40, latDeg: 40, dives: 7 },
  ];
  assert.equal(mapLabel(sites, VIEW, words), 'Carte des sites : Northern Arch au nord, 1 plongée. Lake Coleridge au sud, 1 plongée');
});

test('no site in view, or no view yet: the name alone', () => {
  assert.equal(mapLabel([{ name: 'Far away', lonDeg: 40, latDeg: 40, dives: 7 }], VIEW, words), 'Carte des sites');
  assert.equal(mapLabel([{ name: 'A', lonDeg: 0, latDeg: 0, dives: 2 }], null, words), 'Carte des sites');
});
