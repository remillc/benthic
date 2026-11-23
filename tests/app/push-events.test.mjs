// The push channel (app/src/lib/push-events.js): SSE parsing, reconnection and backoff, the idle watchdog, what an event
// triggers (debounce, own pushes skipped, one run at a time, the network rule). The native stream and the timers are fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPushEvents,
  createSseParser,
  CHANGED_DELAY_MS,
  HELLO_DELAY_MS,
  DEFAULT_RETRY_MS,
  MAX_BACKOFF_MS,
  IDLE_LIMIT_MS,
  BUSY_RETRY_MS,
  SAME_HEAD_MS,
  CONNECT_LIMIT_MS,
} from '../../app/src/lib/push-events.js';

/** A rig: fake stream, fake clock, fake handlers. */
function rig({ localMain = '', localBenthic = '', allowed = true, session = { url: 'https://s/v1/events', token: 't' } } = {}) {
  let time = 0;
  let nextTimer = 1;
  /** @type {{ id: number, at: number, fn: () => void }[]} */
  let timers = [];
  /** @type {((e: any) => void)|null} */
  let listener = null;
  const r = {
    opens: /** @type {any[]} */ ([]),
    closes: /** @type {number[]} */ ([]),
    syncs: /** @type {string[]} */ ([]),
    local: { main: localMain, benthic: localBenthic },
    allowed,
    session,
    outcome: /** @type {any} */ (undefined),
    sessionFails: false,
  };
  const channel = createPushEvents({
    open: async (o) => void r.opens.push(o),
    close: async (id) => void r.closes.push(id),
    onEvent: (l) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    session: async () => (r.sessionFails ? Promise.reject(new Error('no')) : r.session),
    allowed: () => r.allowed,
    handlers: {
      main: { localHead: async () => r.local.main, sync: () => (r.syncs.push('main'), r.outcome) },
      benthic: { localHead: async () => r.local.benthic, sync: () => void r.syncs.push('benthic') },
    },
    now: () => time,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.push({ id, at: time + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    random: () => 0,
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return Object.assign(r, {
    channel,
    flush,
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        time = Math.max(time, t.at);
        t.fn();
        await flush();
      }
      time = end;
      await flush();
    },
    send: (e) => listener?.(e),
    /** The server's side of a connection. */
    async serve(lines, id = r.opens.at(-1).id) {
      listener?.({ id, kind: 'open', status: 200 });
      for (const line of lines) listener?.({ id, kind: 'line', line });
      await flush();
    },
    async start() {
      channel.start();
      await flush();
    },
    now: () => time,
    pending: () => timers.length,
  });
}

const hello = (main, benthic = '') => ['retry: 5000', '', 'event: hello', `data: ${JSON.stringify({ heads: { main, benthic } })}`, ''];
const changed = (branch, head) => ['event: changed', `data: ${JSON.stringify({ repo: 'logbook', branch, head })}`, ''];

test('the parser: events, comments, retry, CRLF, split data lines', () => {
  const seen = [];
  const retries = [];
  const p = createSseParser((m) => seen.push(m), (ms) => retries.push(ms));
  for (const l of [': ping', 'retry: 4000', '', 'event: hello\r', 'data: {"a":1}\r', '\r', 'data: x', 'data: y', '', 'event: lonely', '']) p.line(l);
  assert.deepEqual(retries, [4000]);
  assert.deepEqual(seen, [{ type: 'hello', data: '{"a":1}' }, { type: 'message', data: 'x\ny' }]);
});

test('start opens the stream with the session; stop closes it and nothing is left running', async () => {
  const r = rig();
  await r.start();
  assert.deepEqual(r.opens, [{ id: 1, url: 'https://s/v1/events', token: 't' }]);
  r.channel.stop();
  assert.deepEqual(r.closes.at(-1), 1);
  assert.equal(r.pending(), 0);
  r.send({ id: 1, kind: 'line', line: 'x' });
  await r.advance(200000);
  assert.equal(r.opens.length, 1, 'no reconnection after stop');
});

test('signed out (no session): nothing opens', async () => {
  const r = rig({ session: null });
  await r.start();
  assert.equal(r.opens.length, 0);
});

test('hello with a head this device lacks starts the dives sync once, after the delay', async () => {
  const r = rig({ localMain: 'old' });
  await r.start();
  await r.serve(hello('new'));
  assert.deepEqual(r.syncs, []);
  await r.advance(HELLO_DELAY_MS);
  assert.deepEqual(r.syncs, ['main']);
});

test('a head this device already has (its own push) starts nothing', async () => {
  const r = rig({ localMain: 'same', localBenthic: 'b1' });
  await r.start();
  await r.serve([...hello('same', 'b1'), ...changed('main', 'same'), ...changed('benthic', 'b1')]);
  await r.advance(5000);
  assert.deepEqual(r.syncs, []);
});

test('a head that reaches the device meanwhile (its own push, recorded late) starts nothing', async () => {
  const r = rig({ localMain: 'old' });
  await r.start();
  await r.serve(changed('main', 'mine'));
  r.local.main = 'mine';
  await r.advance(CHANGED_DELAY_MS);
  assert.deepEqual(r.syncs, []);
});

test('changed per branch starts the matching sync; a burst is one sync for the last head', async () => {
  const r = rig({ localMain: 'm0', localBenthic: 'b0' });
  await r.start();
  await r.serve([...changed('main', 'm1'), ...changed('main', 'm2'), ...changed('benthic', 'b1')]);
  await r.advance(CHANGED_DELAY_MS);
  assert.deepEqual(r.syncs.sort(), ['benthic', 'main']);
});

test('other repos, other branches and bad data are ignored', async () => {
  const r = rig();
  await r.start();
  await r.serve([
    'event: changed', `data: ${JSON.stringify({ repo: 'photos', branch: 'main', head: 'x' })}`, '',
    'event: changed', `data: ${JSON.stringify({ repo: 'logbook', branch: 'other', head: 'x' })}`, '',
    'event: changed', 'data: not json', '',
    'event: unknown', 'data: {}', '',
  ]);
  await r.advance(10000);
  assert.deepEqual(r.syncs, []);
});

test('the same head is not asked twice within the guard time, a new one is', async () => {
  const r = rig({ localMain: 'old' });
  await r.start();
  await r.serve(changed('main', 'h1'));
  await r.advance(CHANGED_DELAY_MS);
  await r.serve(changed('main', 'h1'));
  await r.advance(CHANGED_DELAY_MS);
  assert.equal(r.syncs.length, 1);
  await r.serve(changed('main', 'h2'));
  await r.advance(CHANGED_DELAY_MS);
  assert.equal(r.syncs.length, 2);
  await r.advance(SAME_HEAD_MS);
  await r.serve(changed('main', 'h2'));
  await r.advance(CHANGED_DELAY_MS);
  assert.equal(r.syncs.length, 3);
});

test('a sync that cannot start (busy) is asked again shortly, a few times at most', async () => {
  const r = rig({ localMain: 'old' });
  r.outcome = 'busy';
  await r.start();
  await r.serve(changed('main', 'h1'));
  await r.advance(CHANGED_DELAY_MS);
  assert.equal(r.syncs.length, 1);
  await r.advance(BUSY_RETRY_MS);
  assert.equal(r.syncs.length, 2);
  r.outcome = 'started';
  await r.advance(BUSY_RETRY_MS);
  assert.equal(r.syncs.length, 3);
  await r.advance(BUSY_RETRY_MS * 10);
  assert.equal(r.syncs.length, 3);
});

test('the network rule: the connection stays, nothing is synced while it is not allowed', async () => {
  const r = rig({ localMain: 'old', allowed: false });
  await r.start();
  await r.serve(changed('main', 'h1'));
  await r.advance(CHANGED_DELAY_MS * 3);
  assert.deepEqual(r.syncs, []);
  assert.equal(r.opens.length, 1);
  assert.equal(r.channel.connected, true);
  r.allowed = true;
  await r.serve(changed('main', 'h2'));
  await r.advance(CHANGED_DELAY_MS);
  assert.deepEqual(r.syncs, ['main']);
});

test('a connection that fails is retried with a growing delay, capped, and it starts over after a good one', async () => {
  const r = rig();
  await r.start();
  const delays = [];
  for (let i = 0; i < 7; i++) {
    const before = r.now();
    r.send({ id: r.opens.at(-1).id, kind: 'closed', status: 0 });
    const n = r.opens.length;
    while (r.opens.length === n) await r.advance(1000);
    delays.push(r.now() - before);
  }
  assert.deepEqual(delays, [5000, 10000, 20000, 40000, 60000, 60000, 60000]);
  // A connection that was answered, then ends: the base delay again.
  await r.serve([]);
  const before = r.now();
  r.send({ id: r.opens.at(-1).id, kind: 'closed', status: 0 });
  const n = r.opens.length;
  while (r.opens.length === n) await r.advance(1000);
  assert.equal(r.now() - before, DEFAULT_RETRY_MS);
  assert.ok(MAX_BACKOFF_MS >= 60000);
});

test("the server's retry value is the base delay", async () => {
  const r = rig();
  await r.start();
  await r.serve(['retry: 2000', '']);
  const before = r.now();
  r.send({ id: 1, kind: 'closed', status: 0 });
  while (r.opens.length < 2) await r.advance(500);
  assert.equal(r.now() - before, 2000);
});

test('401 stops the retries; a resume tries again', async () => {
  const r = rig();
  await r.start();
  r.send({ id: 1, kind: 'closed', status: 401 });
  await r.advance(300000);
  assert.equal(r.opens.length, 1);
  r.channel.resume();
  await r.flush();
  assert.equal(r.opens.length, 2);
});

test('events of an old connection are ignored', async () => {
  const r = rig({ localMain: 'old' });
  await r.start();
  r.send({ id: 1, kind: 'closed', status: 0 });
  while (r.opens.length < 2) await r.advance(1000);
  r.send({ id: 1, kind: 'line', line: 'event: changed' });
  r.send({ id: 1, kind: 'line', line: `data: ${JSON.stringify({ repo: 'logbook', branch: 'main', head: 'x' })}` });
  r.send({ id: 1, kind: 'line', line: '' });
  await r.advance(5000);
  assert.deepEqual(r.syncs, []);
});

test('no line for too long (not even a ping): the connection is replaced; pings keep it', async () => {
  const r = rig();
  await r.start();
  await r.serve([]);
  for (let i = 0; i < 6; i++) {
    await r.advance(25000);
    r.send({ id: 1, kind: 'line', line: ': ping' });
  }
  assert.equal(r.opens.length, 1);
  await r.advance(IDLE_LIMIT_MS);
  await r.advance(DEFAULT_RETRY_MS);
  assert.equal(r.opens.length, 2);
  assert.ok(r.closes.includes(1));
});

test('resume replaces a quiet connection and keeps a lively one; online reconnects only a closed one', async () => {
  const r = rig();
  await r.start();
  await r.serve([]);
  r.channel.resume();
  await r.flush();
  assert.equal(r.opens.length, 1, 'just heard of: kept');
  await r.advance(40000);
  r.channel.resume();
  await r.flush();
  assert.equal(r.opens.length, 2, 'quiet: replaced, which brings a fresh hello');
  r.channel.online();
  await r.flush();
  assert.equal(r.opens.length, 2);
  r.send({ id: 2, kind: 'closed', status: 0 });
  r.channel.online();
  await r.flush();
  assert.equal(r.opens.length, 3);
});

test('a session that cannot be read opens nothing and does not throw', async () => {
  const r = rig();
  r.sessionFails = true;
  await r.start();
  assert.equal(r.opens.length, 0);
});

// --- The server is down: best effort only (nothing is shown, nothing else waits for the stream) ---

/** Runs `work` and fails when it wrote an error to the console (the channel only logs quietly). */
async function silently(work) {
  const original = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a);
  try {
    await work();
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, [], 'nothing is logged as an error');
}

test('server unreachable or connection refused: quiet retries with backoff, no sync call, no error', async () => {
  await silently(async () => {
    const r = rig({ localMain: 'old' });
    await r.start();
    for (const message of ['connect ECONNREFUSED', 'getaddrinfo ENOTFOUND', 'timeout']) {
      r.send({ id: r.opens.at(-1).id, kind: 'closed', status: 0, message });
      const n = r.opens.length;
      while (r.opens.length === n) await r.advance(1000);
    }
    assert.deepEqual(r.syncs, []);
    assert.equal(r.channel.connected, false);
  });
});

test('a 5xx or a 404 answer is retried with the same backoff, never faster than the base delay', async () => {
  await silently(async () => {
    const r = rig();
    await r.start();
    const delays = [];
    for (const status of [503, 500, 404, 502]) {
      const before = r.now();
      r.send({ id: r.opens.at(-1).id, kind: 'closed', status });
      const n = r.opens.length;
      while (r.opens.length === n) await r.advance(500);
      delays.push(r.now() - before);
    }
    assert.deepEqual(delays, [5000, 10000, 20000, 40000]);
  });
});

test('a down server for hours is a few dozen attempts at most (no hot loop)', async () => {
  await silently(async () => {
    const r = rig();
    await r.start();
    const hours = 3 * 3600 * 1000;
    for (let t = 0; t < hours; t += 1000) {
      const n = r.opens.length;
      r.send({ id: n, kind: 'closed', status: 503 });
      await r.advance(1000);
    }
    assert.ok(r.opens.length < 3 * 60 + 12, `${r.opens.length} attempts in 3 hours`);
  });
});

test('a connection that hangs with no answer is dropped after the connect limit, counted as a failure', async () => {
  await silently(async () => {
    const r = rig();
    await r.start();
    await r.advance(CONNECT_LIMIT_MS);
    assert.ok(r.closes.includes(1), 'the hanging attempt is closed');
    const before = r.now();
    while (r.opens.length < 2) await r.advance(500);
    assert.equal(r.now() - before, DEFAULT_RETRY_MS);
    await r.advance(CONNECT_LIMIT_MS);
    const second = r.now();
    while (r.opens.length < 3) await r.advance(500);
    assert.equal(r.now() - second, DEFAULT_RETRY_MS * 2, 'the delay grows');
  });
});

test('open and no hello (a proxy holding the line): replaced after the idle limit, nothing synced', async () => {
  await silently(async () => {
    const r = rig({ localMain: 'old' });
    await r.start();
    r.send({ id: 1, kind: 'open', status: 200 });
    await r.advance(IDLE_LIMIT_MS + DEFAULT_RETRY_MS);
    assert.equal(r.opens.length, 2);
    assert.deepEqual(r.syncs, []);
  });
});

test('a stream dropped mid-way (after hello and a changed) reconnects after the base delay and catches up from the new hello', async () => {
  await silently(async () => {
    const r = rig({ localMain: 'm0' });
    await r.start();
    await r.serve([...hello('m0'), ...changed('main', 'm1')]);
    await r.advance(CHANGED_DELAY_MS);
    assert.equal(r.syncs.length, 1);
    r.send({ id: 1, kind: 'line', line: 'event: chan' }); // cut in the middle of an event
    r.send({ id: 1, kind: 'closed', status: 0, message: 'reset' });
    while (r.opens.length < 2) await r.advance(500);
    await r.serve(hello('m2'), 2); // the half event is forgotten; the hello says what moved meanwhile
    await r.advance(HELLO_DELAY_MS);
    assert.equal(r.syncs.length, 2);
  });
});

test('a failing open() or handler never throws out of the channel', async () => {
  await silently(async () => {
    let fail = true;
    const channel = createPushEvents({
      open: async () => {
        if (fail) throw new Error('native crashed');
      },
      close: async () => {
        throw new Error('already closed');
      },
      onEvent: () => () => {},
      session: async () => ({ url: 'https://s/v1/events', token: 't' }),
      handlers: {
        main: { localHead: async () => Promise.reject(new Error('core busy')), sync: () => Promise.reject(new Error('x')) },
        benthic: { localHead: () => Promise.reject(new Error('x')), sync: () => {} },
      },
      allowed: () => true,
    });
    channel.start();
    await new Promise((resolve) => setImmediate(resolve));
    fail = false;
    channel.stop();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

test('live: true on the hello of the open connection, false when it drops, dies or stops (the pairing polling follows)', async () => {
  const states = [];
  let time = 0;
  let timers = [];
  let listener = null;
  let opens = 0;
  const channel = createPushEvents({
    open: async () => void opens++,
    close: async () => {},
    onEvent: (l) => ((listener = l), () => (listener = null)),
    session: async () => ({ url: 'https://s/v1/events', token: 't' }),
    handlers: { main: { localHead: async () => '', sync: () => {} }, benthic: { localHead: async () => '', sync: () => {} } },
    allowed: () => true,
    now: () => time,
    setTimer: (fn, ms) => (timers.push({ at: time + ms, fn }), timers.length),
    clearTimer: () => {},
    onLive: (v) => states.push(v),
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  channel.start();
  await tick();
  listener({ id: 1, kind: 'open', status: 200 });
  assert.deepEqual(states, [], 'open alone is not live: the hello says the server knows this device');
  for (const line of hello('m')) listener({ id: 1, kind: 'line', line });
  assert.deepEqual(states, [true]);
  assert.equal(channel.live, true);
  listener({ id: 1, kind: 'closed', status: 0 });
  assert.deepEqual(states, [true, false]);
  channel.stop();
  assert.deepEqual(states, [true, false]);
});
