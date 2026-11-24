// @ts-check
// « Chercher un lieu » (task 2026-11-24-395): the places OpenStreetMap's Nominatim finds for a text, to move the
// pin of a site there. Same policy and spacing as the reverse lookup (lib/place-lookup.js, lib/nominatim.js): one
// request per second for the app, through the plugin so that the User-Agent is the app's.

import { BenthicCore } from 'benthic-core';
import { takeSlot, NOMINATIM_SEARCH_URL } from './nominatim.js';

/** @typedef {{ name: string, latUdeg: number, lonUdeg: number }} FoundPlace */

/**
 * The address of a search.
 * @param {string} text @param {string} lang
 */
export function searchUrl(text, lang) {
  return `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(text.trim())}&accept-language=${lang}`;
}

/**
 * The places of Nominatim's answer (jsonv2), in micro-degrees; what is not a place with a position is dropped.
 * @param {string} body
 * @returns {FoundPlace[]}
 */
export function parsePlaces(body) {
  /** @type {any} */
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  /** @type {FoundPlace[]} */
  const places = [];
  for (const item of json) {
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof item?.display_name !== 'string') continue;
    places.push({ name: item.display_name, latUdeg: Math.round(lat * 1e6), lonUdeg: Math.round(lon * 1e6) });
  }
  return places;
}

/**
 * The places found for a text.
 * @param {string} text @param {string} lang
 * @param {{ get?: (url: string) => Promise<{ status: number, body: string }>, now?: () => number, sleep?: (ms: number) => Promise<void> }} [deps] for the tests
 * @returns {Promise<FoundPlace[]|null>} null when the server did not answer (offline)
 */
export async function searchPlaces(text, lang, deps = {}) {
  const { get = (url) => BenthicCore.placesSearch({ url }), now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = deps;
  if (!text.trim()) return [];
  await takeSlot(now, sleep);
  try {
    const answer = await get(searchUrl(text, lang));
    return answer.status === 200 ? parsePlaces(answer.body) : null;
  } catch {
    return null;
  }
}
