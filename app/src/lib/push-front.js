// The push channel lives only while the diver uses the app (decided on 23 November 2026): on a phone or a tablet the
// connection closes shortly after the app leaves the screen and opens again when it comes back (the server's `hello`
// then brings what was missed). A closed or hidden app costs the server no connection and the device no radio wake-up;
// an access request still reaches it as a push notification. The short wait keeps the connection through a brief
// absence (the photo picker, a permission dialog, a glance at another app).

/** How long the app may stay away before the connection closes. */
export const AWAY_GRACE_MS = 30000;

/**
 * @param {object} deps
 * @param {() => void} deps.start opens the channel (does nothing when open)
 * @param {() => void} deps.stop closes it
 * @param {() => void} deps.resume replaces a quiet connection
 * @param {() => boolean} deps.wanted whether a channel is wanted at all (signed in)
 * @param {(fn: () => void, ms: number) => unknown} [deps.setTimer]
 * @param {(timer: any) => void} [deps.clearTimer]
 * @param {number} [deps.graceMs]
 */
export function createFrontGate({ start, stop, resume, wanted, setTimer = setTimeout, clearTimer = clearTimeout, graceMs = AWAY_GRACE_MS }) {
  /** @type {unknown} */
  let timer = null;
  let away = false;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    /** The app left the screen. */
    toBack() {
      if (away || timer !== null) return;
      timer = setTimer(() => {
        timer = null;
        away = true;
        stop();
      }, graceMs);
    },
    /** The app is on screen again. */
    toFront() {
      cancel();
      if (away) {
        away = false;
        if (wanted()) start();
      } else if (wanted()) resume();
    },
    /** Signed in or out: the channel follows, unless the app is away. */
    follow() {
      if (wanted() && !away) start();
      else stop();
    },
    get away() {
      return away;
    },
  };
}
