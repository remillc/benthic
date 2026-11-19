// @ts-check
// The states of one computer photo on screen (tasks 2026-11-19-302 and 303), as a pure transition function so that
// every place that shows a photo behaves the same:
//   idle     nothing asked yet
//   loading  the photo is being read or fetched: the generic icon shows, in a tile that already has its size
//   failed   offline or the server did not answer: the generic icon stays, no message; asked again when the
//            device is back online, or at the next display once RETRY_MS has passed (never in a tight loop)
//   ready    the photo shows; `fade` is true when it arrived from the network (a short fade), false when the
//            device already had it (shown directly)

/** A failed fetch is asked again, at the next display, after this. */
export const RETRY_MS = 5 * 60 * 1000;

/**
 * @typedef {{ phase: 'idle'|'loading'|'failed'|'ready', src: string|null, fade: boolean, failedAt: number }} ImageState
 * @typedef {{ type: 'show', now: number } | { type: 'online', now: number } | { type: 'result', src: string|null, cached: boolean, now: number } | { type: 'reset' }} ImageEvent
 */

/** @returns {ImageState} */
export const initialImageState = () => ({ phase: 'idle', src: null, fade: false, failedAt: 0 });

/**
 * @param {ImageState} state
 * @param {ImageEvent} event
 * @returns {ImageState}
 */
export function nextImageState(state, event) {
  switch (event.type) {
    case 'reset':
      return initialImageState();
    case 'show':
      if (state.phase === 'idle') return { ...state, phase: 'loading' };
      if (state.phase === 'failed' && event.now - state.failedAt >= RETRY_MS) return { ...state, phase: 'loading' };
      return state;
    case 'online':
      return state.phase === 'failed' ? { ...state, phase: 'loading' } : state;
    case 'result':
      if (state.phase !== 'loading') return state;
      return event.src ? { phase: 'ready', src: event.src, fade: !event.cached, failedAt: 0 } : { phase: 'failed', src: null, fade: false, failedAt: event.now };
    default:
      return state;
  }
}
