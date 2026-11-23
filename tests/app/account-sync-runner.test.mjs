// When the account data sync runs (app/src/lib/account-sync-runner.js): the debounce after a change, the gating, the states
// the screens read, and what follows a run. The engine and the timers are fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSyncRunner, initialState, EDIT_DELAY_MS, RETRY_DELAY_MS } from '../../app/src/lib/account-sync-runner.js';
import { onAccountData, signalAccountData } from '../../app/src/lib/account-sync-signal.js';

/** Timers the test moves by hand. */
function clock() {
  let time = 0;
  /** @type {{ id: number, at: number, fn: () => void }[]} */
  let timers = [];
  let next = 1;
  return {
    setTimer: (fn, ms) => {
      const id = next++;
      timers.push({ id, at: time + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    async advance(ms) {
      time += ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= time).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        due.fn();
        await new Promise((r) => setImmediate(r));
      }
    },
    pending: () => timers.length,
  };
}

function setup({ results = [{ status: 'synced', received: 0 }], allowed = () => true } = {}) {
  const c = clock();
  const calls = { run: 0, after: 0 };
  const queue = [...results];
  const state = initialState();
  const runner = createAccountSyncRunner({
    engine: { run: async () => { calls.run++; return queue.length > 1 ? /** @type {any} */ (queue.shift()) : queue[0]; } },
    state,
    allowed,
    afterRun: async () => { calls.after++; },
    now: () => new Date('2026-11-23T10:00:00Z'),
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  return { c, calls, state, runner };
}

test('a change waits about 3 seconds, and a second change restarts the wait', async () => {
  const { c, calls, runner, state } = setup();
  runner.trigger('edit');
  await c.advance(EDIT_DELAY_MS - 1);
  assert.equal(calls.run, 0);
  runner.trigger('edit');
  await c.advance(EDIT_DELAY_MS - 1);
  assert.equal(calls.run, 0, 'the wait started again');
  await c.advance(1);
  assert.equal(calls.run, 1);
  assert.equal(state.status, 'synced');
  assert.equal(state.lastSyncedAt, '2026-11-23T10:00:00.000Z');
});

test('the start, a dives sync, a resume and the network coming back run at once', async () => {
  for (const kind of ['start', 'dives', 'resume', 'network']) {
    const { c, calls, runner } = setup();
    runner.trigger(kind);
    await c.advance(0);
    assert.equal(calls.run, 1, kind);
  }
});

test('nothing runs by itself when the gate is closed; « Synchroniser maintenant » asks the gate for a manual run', async () => {
  const seen = [];
  const { c, calls, runner } = setup({ allowed: ({ manual }) => { seen.push(manual); return manual; } });
  runner.trigger('edit');
  await c.advance(EDIT_DELAY_MS);
  assert.equal(calls.run, 0);
  await runner.syncNow();
  assert.equal(calls.run, 1);
  assert.ok(seen.includes(true) && seen.includes(false));
});

test('a trigger during a run asks for one more run afterwards, not a parallel one', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const c = clock();
  const state = initialState();
  let runs = 0;
  let active = 0;
  let overlapped = false;
  const runner = createAccountSyncRunner({
    engine: { run: async () => { runs++; active++; if (active > 1) overlapped = true; if (runs === 1) await gate; active--; return { status: 'synced', received: 0 }; } },
    state,
    allowed: () => true,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  runner.trigger('start');
  await c.advance(0);
  assert.equal(state.status, 'syncing');
  runner.trigger('edit');
  release();
  await new Promise((r) => setImmediate(r));
  await c.advance(0);
  assert.equal(runs, 2);
  assert.equal(overlapped, false);
});

test('the states the screens read: join needed, a different account, conflicts, locked items, an error, offline', async () => {
  const { c, calls, runner, state } = setup({ results: [{ status: 'joinNeeded' }] });
  runner.trigger('start');
  await c.advance(0);
  assert.equal(state.joinNeeded, true);
  runner.trigger('edit');
  await c.advance(EDIT_DELAY_MS);
  assert.equal(c.pending(), 0, 'nothing is scheduled while the join waits');

  const other = setup({ results: [{ status: 'differentAccount' }] });
  other.runner.trigger('start');
  await other.c.advance(0);
  assert.equal(other.state.differentAccount, true);

  const done = setup({ results: [{ status: 'synced', received: 2, conflicts: [{ path: 'gear/a.json', keys: ['note'] }], locked: ['profile/diver.json'], unsealed: ['x.json'], pullOnly: true }] });
  done.runner.trigger('start');
  await done.c.advance(0);
  assert.deepEqual(done.state.conflicts, [{ path: 'gear/a.json', keys: ['note'] }]);
  assert.deepEqual(done.state.locked, ['profile/diver.json']);
  assert.deepEqual(done.state.unsealed, ['x.json']);
  assert.equal(done.state.pullOnly, true);
  assert.equal(done.calls.after, 1, 'the screens read the data again after a run that changed it');
  done.runner.dismissConflicts();
  assert.deepEqual(done.state.conflicts, []);

  const failed = setup({ results: [{ status: 'error', error: 'GIT_ERROR' }] });
  failed.runner.trigger('start');
  await failed.c.advance(0);
  assert.equal(failed.state.status, 'error');
  assert.equal(failed.state.error, 'GIT_ERROR');

  const off = setup({ results: [{ status: 'offline', error: 'UNREACHABLE', retry: true }] });
  off.runner.trigger('start');
  await off.c.advance(0);
  assert.equal(off.state.status, 'offline');
  assert.equal(off.c.pending(), 0, 'offline waits for the network event, not for a timer');

  const before = calls.run;
  runner.resolved();
  await c.advance(0);
  assert.equal(calls.run, before + 1, 'answering the join starts a run');
});

test('a run that left something for the next one is retried after 5 seconds, at most three times in a row', async () => {
  const { c, calls, runner } = setup({ results: [{ status: 'synced', retry: true }] });
  runner.trigger('start');
  await c.advance(0);
  assert.equal(calls.run, 1);
  for (let i = 0; i < 5; i++) await c.advance(RETRY_DELAY_MS);
  assert.equal(calls.run, 4, 'the first run and three retries');
});

test('the signal door tells every listener, and a listener that throws does not stop the others', () => {
  const heard = [];
  const stop = onAccountData(() => { throw new Error('boom'); });
  const stopB = onAccountData((kind) => heard.push(kind));
  const log = console.error;
  console.error = () => {};
  try {
    signalAccountData('edit');
    signalAccountData('dives');
  } finally {
    console.error = log;
    stop();
    stopB();
  }
  assert.deepEqual(heard, ['edit', 'dives']);
  signalAccountData('edit');
  assert.deepEqual(heard, ['edit', 'dives'], 'a stopped listener hears nothing');
});
