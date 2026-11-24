// @ts-check
// OpenStreetMap's Nominatim, shared by the callers of the app (place-lookup.js).
// Usage policy: at most one request per second for the whole app.

export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
/** The policy's absolute maximum is 1 request per second; a margin on top. */
export const NOMINATIM_GAP_MS = 1100;

/** Milliseconds to wait before the next request. @param {number} lastMs @param {number} nowMs @param {number} [gapMs] */
export function waitBeforeRequest(lastMs, nowMs, gapMs = NOMINATIM_GAP_MS) {
  return Math.max(0, lastMs + gapMs - nowMs);
}

let lastRequestMs = 0;

/**
 * Waits for the next allowed request. The slot is reserved before waiting, so
 * that two requests cannot both fire after the same wait.
 * @param {() => number} now @param {(ms: number) => Promise<void>} sleep
 */
export async function takeSlot(now, sleep) {
  const wait = waitBeforeRequest(lastRequestMs, now());
  lastRequestMs = now() + wait;
  if (wait > 0) await sleep(wait);
}

/** For the tests. */
export function resetSlot() {
  lastRequestMs = 0;
}
