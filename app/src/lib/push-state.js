// @ts-check
// Whether the push channel is live (lib/push-events.js: the server's hello came and the connection has not ended since). The
// polling of pairing requests reads it: while the channel is live the server says when a request arrives, so nothing is
// polled; the moment it drops the polling is back (to-do #185, task 2026-11-23-356). Plain module, no Svelte.

let live = false;
/** @type {Set<(live: boolean) => void>} */
const listeners = new Set();

/** @returns {boolean} */
export const pushLive = () => live;

/** @param {boolean} value */
export function setPushLive(value) {
  if (live === value) return;
  live = value;
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch (e) {
      console.debug('Push state listener', e);
    }
  }
}

/** @param {(live: boolean) => void} listener @returns {() => void} */
export function onPushLive(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
