// The one progress line of a file import (app/src/lib/import-progress.js): the phases and their weights, the events the
// plugin and the piece loops feed it, the cancellation and its cleanup, and the line that stays across the questions
// of the shared-file flow (app/src/lib/shared-file.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeStagedCore } from './fake-staged-core.mjs';
import { CANCELLABLE, CANCELLED, PHASE_WEIGHTS, createImportProgress, isCancelled, overallFraction, sizeParts } from '../../app/src/lib/import-progress.js';
import { openSharedFile } from '../../app/src/lib/shared-file.js';
import { checkSharedFile } from '../../app/src/lib/deep-link.js';
import { stageFile } from '../../app/src/lib/staged-file.js';

const ALL = ['copy', 'read', 'check', 'import', 'save'];

function recorder() {
  const states = [];
  const progress = createImportProgress((s) => states.push(s));
  return { progress, states };
}

test('the weights are positive and a flow always ends at 100 %, whichever phases it goes through', () => {
  for (const w of Object.values(PHASE_WEIGHTS)) assert.ok(w > 0);
  for (const phases of [ALL, ['copy', 'check', 'import', 'save'], ['copy', 'import', 'save'], ['import', 'save'], ['read'], ['copy', 'read', 'check']]) {
    assert.equal(overallFraction(phases, phases.at(-1), 1), 1, phases.join());
    assert.equal(overallFraction(phases, phases[0], 0), 0, phases.join());
  }
});

test('the overall fraction never goes down across the phases of a flow', () => {
  const phases = ['copy', 'check', 'import', 'save'];
  let last = -1;
  for (const phase of phases) {
    for (let i = 0; i <= 10; i++) {
      const f = overallFraction(phases, phase, i / 10);
      assert.ok(f >= last, `${phase} ${i}`);
      last = f;
    }
  }
});

test('events move the bar: copy bytes, then check windows, then an indeterminate import', () => {
  const { progress, states } = recorder();
  progress.begin(['copy', 'check', 'import', 'save']);
  progress.phase('copy', 100);
  progress.report(50, 100);
  const half = progress.state.fraction;
  assert.ok(half > 0 && half < PHASE_WEIGHTS.copy);
  progress.phase('check', 100);
  assert.ok(progress.state.fraction >= PHASE_WEIGHTS.copy - 1e-9, 'the check starts where the copy ended');
  progress.report(100, 100);
  progress.phase('import');
  assert.equal(progress.state.indeterminate, true, 'the core reports nothing inside the import');
  assert.equal(progress.state.cancellable, false);
  progress.phase('save');
  progress.end();
  assert.equal(progress.state.active, false);
  // Monotonic across every state seen.
  const seen = states.filter((s) => s.active).map((s) => s.fraction);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
});

test('a phase the flow does not have is ignored; a flow that is not running ignores events', () => {
  const { progress } = recorder();
  progress.report(1, 2);
  progress.phase('copy', 10);
  assert.equal(progress.active, false);
  progress.begin(['import', 'save']);
  progress.phase('copy', 10);
  assert.equal(progress.state.phase, '');
});

test('the reporter enters its phase on the first call', () => {
  const { progress } = recorder();
  progress.begin(['copy', 'check']);
  const check = progress.reporter('check');
  check(1, 4);
  assert.equal(progress.state.phase, 'check');
  assert.equal(progress.state.total, 4);
});

test('only the copy and the check can be cancelled; cancelling stops the next report and tells the plugin', () => {
  assert.deepEqual([...CANCELLABLE].sort(), ['check', 'copy']);
  const { progress } = recorder();
  progress.begin(['copy', 'import']);
  let told = 0;
  progress.onCancel(() => told++);
  progress.phase('import');
  progress.cancel();
  assert.equal(progress.cancelled, false, 'the import is not cancellable');
  progress.phase('copy', 10);
  progress.cancel();
  assert.equal(told, 1);
  assert.throws(() => progress.report(5, 10), (e) => isCancelled(e) && e.message === CANCELLED);
  progress.end();
  assert.equal(progress.cancelled, false);
});

test('a picked file copied in pieces reports each piece; a cancel discards the partial file', async () => {
  const { core, files, stats } = fakeStagedCore();
  const { progress } = recorder();
  progress.begin(['copy']);
  const blob = new Blob([new Uint8Array(7 * 1024 * 1024)]);
  const seen = [];
  const report = progress.reporter('copy');
  const staged = await stageFile(core, blob, 'big.ssrf', (d, t) => {
    seen.push(d);
    report(d, t);
  });
  assert.deepEqual(seen, [3 * 1024 * 1024, 6 * 1024 * 1024, 7 * 1024 * 1024]);
  assert.equal(files.size, 1);
  assert.ok(staged.path);

  // Cancelled after the first piece.
  const again = recorder();
  again.progress.begin(['copy']);
  again.progress.phase('copy', blob.size);
  const r = again.progress.reporter('copy');
  await assert.rejects(
    stageFile(core, blob, 'big2.ssrf', (d, t) => {
      r(d, t);
      again.progress.cancel();
    }),
    (e) => isCancelled(e),
  );
  assert.equal(files.size, 1, 'the partial copy is gone');
  assert.ok(stats.discarded >= 1);
});

test('sizes read in kilobytes, megabytes or gigabytes', () => {
  assert.deepEqual(sizeParts(2048), { n: 2, unit: 'kb' });
  assert.deepEqual(sizeParts(45.5 * 1024 * 1024), { n: 45.5, unit: 'mb' });
  assert.deepEqual(sizeParts(100 * 1024 * 1024), { n: 100, unit: 'mb' });
  assert.deepEqual(sizeParts(1.5 * 1024 ** 3), { n: 1.5, unit: 'gb' });
});

test('a session starts a flow, ends it, and joins the one already running', async () => {
  const { progress } = recorder();
  await progress.session(['copy', 'import'], 'a.ssrf', async () => {
    assert.equal(progress.active, true);
    await progress.session(['import', 'save'], 'b', async () => {
      assert.deepEqual(progress.state.phase, '', 'joined, not restarted');
    });
    assert.equal(progress.active, true, 'the inner one does not end the outer');
  });
  assert.equal(progress.active, false);
  await assert.rejects(progress.session(['import'], 'c', async () => Promise.reject(new Error('x'))));
  assert.equal(progress.active, false, 'ended after a failure');
});

// --- The shared-file flow -------------------------------------------------------------------------------------------

const LOGBOOK = `<divelog program='subsurface' version='3'>\n<divesites>\n</divesites>\n<dives>\n<dive number='1' date='2020-05-01' time='10:00:00' duration='40:00 min'>\n</dive>\n</dives>\n</divelog>\n`;

function flow({ welcome = false, stage } = {}) {
  const staging = fakeStagedCore();
  const { progress, states } = recorder();
  const log = { confirms: [], refused: [], notes: [], first: [], cancelStage: [], imported: [] };
  const deps = {
    stage:
      stage ??
      (async (uri, onProgress) => {
        for (const d of [30, 60, 100]) onProgress?.(d, 100);
        return staging.put('Logbook.ssrf', new TextEncoder().encode(LOGBOOK));
      }),
    cancelStage: (uri) => log.cancelStage.push(uri),
    progress,
    core: staging.core,
    check: checkSharedFile,
    welcome: () => welcome,
    remembered: () => ({}),
    keep: () => {},
    listSites: async () => [],
    siteChange: async () => ({}),
    importData: async (n, data) => {
      progress.phase('import');
      progress.phase('save');
      log.imported.push(n);
      return 1;
    },
    toFirstLaunch: (n) => log.first.push(n),
    confirm: (o, run, cancel) => log.confirms.push({ o, run, cancel }),
    refuse: (key) => log.refused.push(key),
    notify: (key) => log.notes.push(key),
    imported: (n) => log.notes.push(`imported ${n}`),
    importFailed: (e) => log.notes.push(`failed ${e?.message}`),
  };
  return { deps, log, progress, states, staging };
}

test('a shared file: copy events, then the check, then the line waits hidden for the answer and finishes with the import', async () => {
  const { deps, log, progress, states } = flow();
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'confirm-dives');
  const phases = [...new Set(states.filter((s) => s.visible && s.phase).map((s) => s.phase))];
  assert.deepEqual(phases, ['copy', 'check']);
  assert.equal(progress.active, true, 'the flow goes on behind the question');
  assert.equal(progress.state.visible, false, 'hidden while the diver answers');
  const before = progress.state.fraction;
  assert.ok(before >= PHASE_WEIGHTS.copy + PHASE_WEIGHTS.check - 1e-9, 'the copy and the check are behind it');
  const segment = progress.state.segment;
  await log.confirms[0].run();
  const after = states.filter((s) => s.active);
  assert.ok(after.some((s) => s.visible && s.phase === 'import' && s.indeterminate));
  assert.ok(after.some((s) => s.visible && s.phase === 'save'));
  assert.ok(Math.max(...after.map((s) => s.segment)) > segment, 'the time left starts again after the pause');
  assert.equal(progress.active, false, 'the import is over: the line is gone');
  assert.deepEqual(log.notes.at(-1), 'imported 1');
});

test('« Annuler » in the question ends the line and deletes the file', async () => {
  const { deps, log, progress, staging } = flow();
  await openSharedFile(deps, 'content://x/1');
  assert.equal(staging.files.size, 1);
  log.confirms[0].cancel();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(progress.active, false);
  assert.equal(staging.files.size, 0);
});

test('first launch: the line ends after the check, the import there starts its own', async () => {
  const { deps, log, progress } = flow({ welcome: true });
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'first-launch');
  assert.equal(progress.active, false);
  assert.equal(log.first.length, 1);
});

test('cancel during the copy stops the plugin and cleans up', async () => {
  const staging = fakeStagedCore();
  let release;
  const gate = new Promise((r) => (release = r));
  const { deps, log, progress } = flow({
    stage: async (uri, onProgress) => {
      onProgress(10, 100);
      await gate;
      throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
    },
  });
  const running = openSharedFile(deps, 'content://x/9');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(progress.state.phase, 'copy');
  assert.equal(progress.state.cancellable, true);
  progress.cancel();
  assert.deepEqual(log.cancelStage, ['content://x/9']);
  release();
  assert.equal(await running, 'cancelled');
  assert.equal(progress.active, false);
  assert.equal(log.refused.length, 0, 'no error dialog for a cancel');
  void staging;
});

test('cancel during the check: no dialog, the staged file is deleted', async () => {
  const { deps, log, progress, staging } = flow();
  const stage = deps.stage;
  deps.stage = async (uri, onProgress) => {
    const file = await stage(uri, onProgress);
    // The diver presses « Annuler » as the check begins.
    const original = deps.core.readFileChunk;
    deps.core.readFileChunk = async (o) => {
      if (progress.state.phase === 'check') progress.cancel();
      return original(o);
    };
    return file;
  };
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'cancelled');
  assert.equal(progress.active, false);
  assert.equal(staging.files.size, 0);
  assert.equal(log.refused.length, 0);
});

test('a refused file ends the line', async () => {
  const staging = fakeStagedCore();
  const { deps, progress, log } = flow();
  deps.stage = async () => staging.put('photo.jpg', new TextEncoder().encode('JFIF'));
  deps.core = staging.core;
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'refused');
  assert.equal(progress.active, false);
  assert.equal(log.refused.length, 1);
});

test('the sites file: one step per site, then done', async () => {
  const staging = fakeStagedCore();
  const SITES = `<divesites program='subsurface' version='3'>\n<site uuid='0abc0def' name='Lake' />\n<site uuid='0abc0df0' name='Pond' />\n</divesites>\n`;
  const { deps, log, progress, states } = flow();
  deps.stage = async () => staging.put('sites.xml', new TextEncoder().encode(SITES));
  deps.core = staging.core;
  deps.siteChange = async (o) => (o.action === 'create' ? { uuid: 5 } : {});
  assert.equal(await openSharedFile(deps, 'content://x/2'), 'confirm-sites');
  assert.equal(progress.state.visible, false);
  await log.confirms[0].run();
  const steps = states.filter((s) => s.phase === 'import' && s.total === 2).map((s) => s.done);
  assert.deepEqual(steps, [0, 1, 2]);
  assert.equal(progress.active, false);
});
