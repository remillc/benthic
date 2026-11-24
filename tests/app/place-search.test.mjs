// « Chercher un lieu » (task 2026-11-24-395): the places Nominatim finds for a text.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlaces, searchPlaces, searchUrl } from '../../app/src/lib/place-search.js';
import { resetSlot } from '../../app/src/lib/nominatim.js';

test('the search address carries the text, the language and a small limit', () => {
  const url = searchUrl(' Tutukaka Harbour ', 'fr');
  assert.match(url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(url, /q=Tutukaka%20Harbour&/);
  assert.match(url, /accept-language=fr$/);
  assert.match(url, /limit=5/);
});

test('the places are read in micro-degrees; what has no position is dropped', () => {
  const body = JSON.stringify([
    { display_name: 'Tutukaka, Northland, Nouvelle-Zélande', lat: '-35.6106', lon: '174.5342' },
    { display_name: 'No position' },
    { lat: '1', lon: '2' },
  ]);
  assert.deepEqual(parsePlaces(body), [{ name: 'Tutukaka, Northland, Nouvelle-Zélande', latUdeg: -35610600, lonUdeg: 174534200 }]);
  assert.deepEqual(parsePlaces('not json'), []);
  assert.deepEqual(parsePlaces('{}'), []);
});

test('a search goes through the plugin, one request per second; an unanswered one is null, not empty', async () => {
  resetSlot();
  /** @type {string[]} */
  const urls = [];
  const get = async (/** @type {string} */ url) => {
    urls.push(url);
    return { status: 200, body: JSON.stringify([{ display_name: 'A', lat: '1', lon: '2' }]) };
  };
  const now = () => 1000;
  const sleep = async () => {};
  assert.deepEqual(await searchPlaces('a', 'en', { get, now, sleep }), [{ name: 'A', latUdeg: 1000000, lonUdeg: 2000000 }]);
  assert.equal(urls.length, 1);
  assert.deepEqual(await searchPlaces('  ', 'en', { get, now, sleep }), [], 'an empty text asks nothing');
  assert.equal(urls.length, 1);
  assert.equal(await searchPlaces('a', 'en', { get: async () => ({ status: 503, body: '' }), now, sleep }), null);
  assert.equal(
    await searchPlaces('a', 'en', {
      get: async () => {
        throw new Error('offline');
      },
      now,
      sleep,
    }),
    null,
  );
});
