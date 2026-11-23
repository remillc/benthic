// @ts-check
// The push channel (to-do #185, docs/architecture.md « The push channel »): the Benthic server keeps one Server-Sent Events
// stream open (`GET /v1/events`) and says when a branch of the logbook repository has a new head. This module owns what is
// the same on every platform, without Svelte and without the core: the SSE parsing, the reconnection with backoff, the
// watchdog on the server's pings, the hooks (resume, network back), and what an event triggers. The native side only
// opens the connection and gives the lines (Kotlin, Swift, the desktop's main process); it is a parameter here, so that
// node:test drives it with a fake stream and fake timers.
//
// Events (server): `hello` {"heads":{"main","benthic"}} after connecting; `changed` {"repo":"logbook","branch","head"} on
// every push; `: ping` comments every 25 s; `retry: 5000` once. A head that differs from the one this device has starts the
// matching sync (`main`: the dives, `benthic`: the account data). The polling and the other triggers stay as the fallback.

/** Wait after a `changed` before looking, so that a burst of pushes is one sync. */
export const CHANGED_DELAY_MS = 800;
/** Wait after `hello` (a pass of the other triggers may be running at start). */
export const HELLO_DELAY_MS = 1500;
/** Reconnection delay when the server did not say (`retry:`). */
export const DEFAULT_RETRY_MS = 5000;
/** The longest wait between two attempts. */
export const MAX_BACKOFF_MS = 60000;
/** No line (a ping is every 25 s) for this long: the connection is taken as dead. */
export const IDLE_LIMIT_MS = 70000;
/** An attempt that has not been answered after this long is dropped (a hanging connection). */
export const CONNECT_LIMIT_MS = 20000;
/** The same head is not asked for twice within this time. */
export const SAME_HEAD_MS = 30000;
/** When the sync could not start (one is running), look again after this. */
export const BUSY_RETRY_MS = 3000;
const BUSY_RETRIES = 5;
/** Back on screen: a connection quiet for this long is replaced (it may have died while the app was suspended). */
export const RESUME_IDLE_MS = 30000;

/** @typedef {'main'|'benthic'} Branch */

/**
 * What the native side tells, for one connection `id`.
 * @typedef {Object} StreamEvent
 * @property {number} id
 * @property {'open'|'line'|'closed'} kind
 * @property {string} [line] a line of the stream, without its end of line (empty lines included)
 * @property {number} [status] the HTTP status (`open`: 200; `closed`: 0 when the connection failed before an answer)
 * @property {string} [message]
 */

/**
 * @typedef {Object} BranchHandler
 * @property {() => Promise<string>} localHead the head this device has ('' when none)
 * @property {() => Promise<'started'|'busy'|void>|'started'|'busy'|void} sync starts the sync; `busy` when one is running and could not take it
 */

/**
 * @typedef {Object} PushDeps
 * @property {(options: { id: number, url: string, token: string }) => Promise<void>} open starts the native stream; its events arrive by `onEvent`
 * @property {(id: number) => Promise<void>|void} close
 * @property {(listener: (event: StreamEvent) => void) => (() => void)} onEvent
 * @property {() => Promise<{ url: string, token: string }|null>} session the events address and the session token; null when signed out
 * @property {Record<Branch, BranchHandler>} handlers
 * @property {() => boolean} allowed whether a sync may run on this connection (« Seulement sur Wi-Fi ou câble »)
 * @property {() => number} [now]
 * @property {(fn: () => void, ms: number) => unknown} [setTimer]
 * @property {(handle: unknown) => void} [clearTimer]
 * @property {() => number} [random] 0..1, for the jitter
 * @property {(live: boolean) => void} [onLive] told when the channel becomes live (the server's `hello` came on the open connection) and when it stops being (closed, dead, stopped): while it is live the pairing requests are not polled
 */

/**
 * Reads the lines of a Server-Sent Events stream.
 * @param {(event: { type: string, data: string }) => void} onMessage
 * @param {(ms: number) => void} onRetry
 */
export function createSseParser(onMessage, onRetry) {
  let type = '';
  /** @type {string[]} */
  let data = [];
  return {
    /** @param {string} rawLine */
    line(rawLine) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line === '') {
        if (data.length) onMessage({ type: type || 'message', data: data.join('\n') });
        type = '';
        data = [];
        return;
      }
      if (line.startsWith(':')) return;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') type = value;
      else if (field === 'data') data.push(value);
      else if (field === 'retry' && /^\d+$/.test(value)) onRetry(Number(value));
    },
    reset() {
      type = '';
      data = [];
    },
  };
}

/** @param {PushDeps} deps */
export function createPushEvents({ open, close, onEvent, session, handlers, allowed, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(/** @type {any} */ (h)), random = Math.random, onLive = () => {} }) {
  let wanted = false;
  let id = 0;
  let isOpen = false;
  let opened = false;
  let failures = 0;
  let retryMs = DEFAULT_RETRY_MS;
  let lastLineAt = 0;
  let denied = false;
  /** @type {unknown} */ let reconnectTimer = null;
  /** @type {unknown} */ let idleTimer = null;
  /** @type {(() => void)|null} */ let off = null;
  /** @type {Record<Branch, { head: string, timer: unknown, running: boolean, asked: { head: string, at: number }|null, busyTries: number }>} */
  const branches = {
    main: { head: '', timer: null, running: false, asked: null, busyTries: 0 },
    benthic: { head: '', timer: null, running: false, asked: null, busyTries: 0 },
  };

  let live = false;
  /** @param {boolean} value */
  const setLive = (value) => {
    if (live === value) return;
    live = value;
    try {
      onLive(value);
    } catch {
      // The listener's trouble is not the channel's.
    }
  };
  let loggedOutage = false;
  /** The channel is best-effort: a failure is logged once per outage, quietly, and never shown. @param {...unknown} what */
  const quiet = (...what) => {
    if (loggedOutage) return;
    loggedOutage = true;
    console.debug('Push channel:', ...what);
  };

  const parser = createSseParser(
    (message) => {
      /** @type {any} */ let body = null;
      try {
        body = JSON.parse(message.data);
      } catch {
        return;
      }
      if (message.type === 'hello') {
        setLive(true);
        const heads = body?.heads ?? {};
        for (const branch of /** @type {Branch[]} */ (['main', 'benthic'])) if (typeof heads[branch] === 'string') note(branch, heads[branch], HELLO_DELAY_MS);
      } else if (message.type === 'changed') {
        if (body?.repo !== 'logbook' || (body?.branch !== 'main' && body?.branch !== 'benthic') || typeof body?.head !== 'string') return;
        note(body.branch, body.head, CHANGED_DELAY_MS);
      }
    },
    (ms) => {
      retryMs = Math.min(Math.max(ms, 1000), MAX_BACKOFF_MS);
    },
  );

  /** A head the server says is current for a branch; looked at after `delay`. @param {Branch} branch @param {string} head @param {number} delay */
  function note(branch, head, delay) {
    const b = branches[branch];
    if (!head) return;
    b.head = head;
    b.busyTries = 0;
    if (b.timer !== null) clearTimer(b.timer);
    b.timer = setTimer(() => {
      b.timer = null;
      void look(branch);
    }, delay);
  }

  /** Does this device have the head? If not, starts the sync (one at a time per branch). @param {Branch} branch */
  async function look(branch) {
    const b = branches[branch];
    if (!wanted || !b.head) return;
    if (!allowed()) return;
    if (b.running) {
      // A sync is in flight: look again when it ends, the head may have moved on.
      b.timer = setTimer(() => {
        b.timer = null;
        void look(branch);
      }, BUSY_RETRY_MS);
      return;
    }
    b.running = true;
    try {
      const head = b.head;
      /** @type {string} */ let local = '';
      try {
        local = await handlers[branch].localHead();
      } catch (e) {
        quiet('reading the local head', branch, e);
      }
      // Already ours: this device pushed it, or got it by another trigger.
      if (local === head) return;
      if (b.asked && b.asked.head === head && now() - b.asked.at < SAME_HEAD_MS) return;
      b.asked = { head, at: now() };
      /** @type {any} */ let outcome;
      try {
        outcome = await handlers[branch].sync();
      } catch (e) {
        quiet('starting the sync', branch, e);
      }
      if (outcome === 'busy' && b.busyTries < BUSY_RETRIES) {
        b.busyTries++;
        b.asked = null;
        b.timer = setTimer(() => {
          b.timer = null;
          void look(branch);
        }, BUSY_RETRY_MS);
      }
    } finally {
      b.running = false;
    }
  }

  function armIdle() {
    if (idleTimer !== null) clearTimer(idleTimer);
    const wasAnswered = opened;
    idleTimer = setTimer(() => {
      idleTimer = null;
      // Nothing, not even a ping (or no answer at all): the connection is dead without having said so.
      void drop(true, !wasAnswered);
    }, wasAnswered ? IDLE_LIMIT_MS : CONNECT_LIMIT_MS);
  }

  /** Closes the current connection; reconnects when `again`. @param {boolean} again @param {boolean} [failed] */
  async function drop(again, failed = false) {
    const current = id;
    isOpen = false;
    setLive(false);
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = null;
    parser.reset();
    try {
      await close(current);
    } catch {
      // Already closed.
    }
    if (again && wanted) scheduleReconnect(failed);
  }

  /** @param {boolean} failed the attempt did not get an answer */
  function scheduleReconnect(failed) {
    if (!wanted || denied) return;
    if (reconnectTimer !== null) clearTimer(reconnectTimer);
    if (failed) failures++;
    else failures = 0;
    const base = Math.min(MAX_BACKOFF_MS, retryMs * 2 ** Math.max(0, failures - 1));
    const delay = failures ? base + Math.floor(random() * Math.min(1000, base / 4)) : retryMs;
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect() {
    if (!wanted) return;
    if (reconnectTimer !== null) clearTimer(reconnectTimer);
    reconnectTimer = null;
    if (isOpen) await drop(false);
    /** @type {{ url: string, token: string }|null} */ let target = null;
    try {
      target = await session();
    } catch {
      target = null;
    }
    if (!wanted) return;
    if (!target?.token || !target.url) return; // signed out: `start` is called again with the session
    id++;
    opened = false;
    isOpen = true;
    lastLineAt = now();
    armIdle();
    try {
      await open({ id, url: target.url, token: target.token });
    } catch (e) {
      quiet('opening the stream', e);
      isOpen = false;
      scheduleReconnect(true);
    }
  }

  /** @param {StreamEvent} event */
  function handle(event) {
    if (!wanted || event.id !== id) return;
    if (event.kind === 'open') {
      if (event.status === undefined || event.status === 200) {
        opened = true;
        loggedOutage = false;
        failures = 0;
        lastLineAt = now();
        armIdle();
      }
      return;
    }
    if (event.kind === 'line') {
      lastLineAt = now();
      armIdle();
      parser.line(event.line ?? '');
      return;
    }
    // closed
    isOpen = false;
    setLive(false);
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = null;
    parser.reset();
    const status = event.status ?? 0;
    if (!opened) quiet('no stream', status || event.message || '');
    if (status === 401 || status === 403) {
      // The session is no good: no use trying again until a sign-in or a resume.
      denied = true;
      return;
    }
    // 404/501: a server without the route: the same backoff, and the polling is the fallback.
    scheduleReconnect(!opened);
  }

  return {
    /** Starts the stream (signed in); safe to call again. */
    start() {
      if (wanted) return;
      wanted = true;
      denied = false;
      failures = 0;
      off = onEvent(handle);
      void connect();
    },
    /** Signed out, or the logbook closed: the stream is closed and nothing is left running. */
    stop() {
      if (!wanted) return;
      wanted = false;
      for (const b of Object.values(branches)) {
        if (b.timer !== null) clearTimer(b.timer);
        b.timer = null;
        b.head = '';
        b.asked = null;
      }
      if (reconnectTimer !== null) clearTimer(reconnectTimer);
      reconnectTimer = null;
      if (idleTimer !== null) clearTimer(idleTimer);
      idleTimer = null;
      off?.();
      off = null;
      parser.reset();
      const current = id;
      isOpen = false;
      setLive(false);
      void Promise.resolve(close(current)).catch(() => {});
    },
    /** The app came back to the front: a quiet connection is replaced, which brings a fresh `hello`. */
    resume() {
      if (!wanted) return;
      denied = false;
      if (!isOpen || now() - lastLineAt > RESUME_IDLE_MS) {
        failures = 0;
        void connect();
      }
    },
    /** The network came back. */
    online() {
      if (!wanted) return;
      denied = false;
      if (!isOpen) {
        failures = 0;
        void connect();
      }
    },
    get running() {
      return wanted;
    },
    /** The server's hello came and the connection has not ended since. */
    get live() {
      return live;
    },
    get connected() {
      return isOpen && opened;
    },
  };
}
