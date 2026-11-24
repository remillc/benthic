// @ts-check
// The dives beside the one shown, ready before a swipe (spec, "Dive detail",
// swipe to the next or previous dive): their detail read from the core and
// their site's map picture decoded, so that the next screen comes in whole
// instead of filling in during the slide.
import { BenthicCore } from 'benthic-core';
import { currentStamp, sameStamp } from './core-cache.js';
import { currentDiveId } from './dive-ids.js';

/** @typedef {import('benthic-core').DiveDetail} DiveDetail */

/** A few details: the one shown and its neighbours, with some margin. */
const KEPT = 6;
/** @type {Map<number, { dive: DiveDetail, stamp: unknown[] }>} id → detail and the logbook version it was read at, the most recent last */
const details = new Map();
/** @type {Map<number, Promise<DiveDetail>>} */
const reading = new Map();

/**
 * @param {number} id @param {DiveDetail} dive
 * @param {unknown[]} [stamp] the logbook version the detail was asked at (now, by default)
 */
export function keepDive(id, dive, stamp = currentStamp()) {
  details.delete(id);
  details.set(id, { dive, stamp });
  while (details.size > KEPT) details.delete(details.keys().next().value);
}

/**
 * The detail of a dive read a moment ago, at once; else null. The screen still
 * reads it again, in case it changed meanwhile.
 * @param {number} id
 */
export function readyDive(id) {
  return details.get(id)?.dive ?? null;
}

/**
 * The detail of a dive, read once: the one kept while the logbook did not change since (no call),
 * the one being read (shared), else read from the core. Replaces a getDive on each screen mount.
 * @param {number} id
 * @returns {Promise<DiveDetail>}
 */
export function loadDive(id) {
  const kept = details.get(id);
  if (kept && sameStamp(kept.stamp, currentStamp())) return Promise.resolve(kept.dive);
  return read(id);
}

/** Forgets a dive (deleted, or changed in a way the screen does not follow). @param {number} id */
export function forgetDive(id) {
  details.delete(id);
}

/** Forgets every kept detail: the log was read again, the ids are new (lib/dive-ids.js). */
export function forgetAllDives() {
  details.clear();
  reading.clear();
}

/** The core's answer for an id it does not hold: a stale id after the log was read again, never a fault. @param {unknown} e */
const isStale = (e) => /dive not found/i.test(String(/** @type {any} */ (e)?.message ?? e));

/**
 * One read. An id that the core no longer knows (the log was read again since the id was taken) is asked once more
 * under the id the dive has now (lib/dive-ids.js); a dive that is gone fails as a stale id, which is not reported.
 * @param {number} id
 */
function read(id) {
  let promise = reading.get(id);
  if (!promise) {
    const stamp = currentStamp();
    const ask = (/** @type {number} */ at) => BenthicCore.getDive({ id: at });
    promise = ask(id)
      .catch(async (/** @type {unknown} */ e) => {
        const now = currentDiveId(id);
        if (!isStale(e) || now === null || now === id) throw e;
        return ask(now);
      })
      .then((dive) => {
        keepDive(id, dive, stamp);
        return dive;
      })
      .finally(() => reading.delete(id));
    reading.set(id, promise);
  }
  return promise;
}

/**
 * Prepares the dives a swipe can lead to: their detail, then their site's
 * picture. Quietly gives up on anything that fails (the swipe then loads it
 * as before).
 * @param {number[]} ids
 */
export async function preloadDives(ids) {
  // Side by side: the swipe can go either way, so neither waits for the other.
  await Promise.all(
    ids.map(async (id) => {
      try {
        const dive = await loadDive(id);
        const c = dive.siteCoordinates;
        if (c) {
          const { sharedSiteMap } = await import('./site-image.js'); // not loaded with the details (phone swipes only)
          await sharedSiteMap(c.latUdeg, c.lonUdeg).catch(() => {});
        }
      } catch (e) {
        // A stale id is a cache that was not renewed yet, not a fault: the swipe loads the dive as before.
        if (!isStale(e)) console.warn('Preparing a dive', id, e);
      }
    }),
  );
}
