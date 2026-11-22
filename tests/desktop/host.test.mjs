// SPDX-License-Identifier: GPL-2.0
// Tests of benthic-host (desktop/host/host.cpp) through its stdio protocol.
// Skipped when the host binary is not there.
//
//   desktop/host/build-linux-test.sh                  # after poc/build.sh, Linux or WSL
//   BENTHIC_HOST=build/desktop/benthic-host node --test tests/desktop/host.test.mjs
//
// Other environment variables (all optional):
//   BENTHIC_HOST_ARGS  JSON array of arguments put before the protocol, for a host that
//                        runs through another program (BENTHIC_HOST=wsl, ARGS=["-e","<host>"])
//   BENTHIC_SAMPLE     the sample log to import, as the host sees the path
//                        (default: third_party/subsurface/dives/SampleDivesV2.ssrf)
//   BENTHIC_TEST_DIR   a directory for the host's files, as the host sees it (default: a
//                        temporary directory)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hostPath = process.env.BENTHIC_HOST ? path.resolve(process.env.BENTHIC_HOST) : '';
const hostArgs = process.env.BENTHIC_HOST_ARGS ? JSON.parse(process.env.BENTHIC_HOST_ARGS) : [];
const command = hostArgs.length ? process.env.BENTHIC_HOST : hostPath;
const sample = process.env.BENTHIC_SAMPLE || path.join(root, 'third_party/subsurface/dives/SampleDivesV2.ssrf');
const skip = !process.env.BENTHIC_HOST
  ? 'BENTHIC_HOST is not set'
  : !hostArgs.length && !existsSync(hostPath)
    ? `no host binary at ${hostPath}`
    : !process.env.BENTHIC_SAMPLE && !existsSync(sample)
      ? `no sample log at ${sample}`
      : false;

/** A running host: call(method, args) resolves with the result or rejects with the host's error. */
function startHost() {
  const child = spawn(command, hostArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  const events = [];
  const badLines = [];
  const unmatched = [];
  let nextId = 1;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      badLines.push(line);
      return;
    }
    if (message.event) {
      events.push(message);
      return;
    }
    if (message.id === null && 'error' in message) {
      unmatched.push(message.error);
      return;
    }
    const waiting = pending.get(message.id);
    if (!waiting) {
      badLines.push(line);
      return;
    }
    pending.delete(message.id);
    if ('error' in message) waiting.reject(new Error(message.error));
    else waiting.resolve(message.result);
  });
  const exited = new Promise((resolve) => child.on('close', (code) => resolve(code)));
  return {
    child,
    events,
    badLines,
    unmatched,
    exited,
    call(method, args) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ id, method, args })}\n`);
      });
    },
    /** A raw line, for malformed requests. */
    raw(text) {
      child.stdin.write(`${text}\n`);
    },
    close() {
      child.stdin.end();
      return exited;
    },
  };
}

describe('benthic-host', { skip }, () => {
  let host;
  let dir;
  let ownsDir = false;
  let repo;
  let imported = 0;
  let firstId = 0;

  before(async () => {
    host = startHost();
    if (process.env.BENTHIC_TEST_DIR) {
      dir = process.env.BENTHIC_TEST_DIR;
    } else {
      dir = mkdtempSync(path.join(tmpdir(), 'od-host-'));
      ownsDir = true;
    }
    repo = `${dir.replace(/\\/g, '/')}/carnet[main]`;
    await host.call('init', { home: dir });
  });

  after(async () => {
    if (host) await host.close();
    if (ownsDir) rmSync(dir, { recursive: true, force: true });
  });

  test('ping answers at once', async () => {
    assert.equal(await host.call('ping'), 'pong');
  });

  test('a log that does not exist is reported as such', async () => {
    assert.equal(await host.call('logExists', { repo }), false);
  });

  test('importFile creates the log and returns the number of dives as a JSON number', async () => {
    imported = await host.call('importFile', { source: sample, repo });
    assert.equal(typeof imported, 'number');
    assert.ok(imported > 0);
    assert.equal(await host.call('logExists', { repo }), true);
  });

  test('importing progress comes as syncProgress events', () => {
    assert.ok(host.events.length > 0);
    for (const event of host.events) {
      assert.equal(event.event, 'syncProgress');
      assert.equal(typeof event.data.message, 'string');
    }
  });

  test('listDives returns the dives as a JSON string, parsed once by the caller', async () => {
    const text = await host.call('listDives', { repo });
    assert.equal(typeof text, 'string');
    const dives = JSON.parse(text);
    assert.equal(dives.length, imported);
    assert.ok(Number.isInteger(dives[0].id));
    firstId = dives[0].id;
  });

  test('listLoadedDives can include an invalid dive hidden by preferences', async () => {
    await host.call('setPrefs', { changes: JSON.stringify({ displayInvalidDives: false }) });
    await host.call('editDive', { id: firstId, changes: JSON.stringify({ invalid: true }) });
    const visible = JSON.parse(await host.call('listLoadedDives'));
    const all = JSON.parse(await host.call('listLoadedDives', { includeInvalid: true }));
    assert.equal(visible.some((d) => d.id === firstId), false);
    assert.equal(all.some((d) => d.id === firstId), true);
    await host.call('undo', { redo: false });
  });

  test('getDive gives the detail, and an unknown dive is an error', async () => {
    const dive = JSON.parse(await host.call('getDive', { id: firstId }));
    assert.equal(dive.id, firstId);
    assert.ok(Array.isArray(dive.cylinders));
    await assert.rejects(host.call('getDive', { id: 987654 }), /not found/i);
  });

  test('filterQuery: options, search and dives with rules passed as flat strings', async () => {
    const options = JSON.parse(await host.call('filterQuery', { kind: 'options' }));
    assert.ok(Array.isArray(options.sites));
    const all = JSON.parse(await host.call('filterQuery', { kind: 'dives', fulltext: '', mode: 'starts_with', rules: [] }));
    assert.equal(all.length, imported);
    assert.deepEqual(JSON.parse(await host.call('filterQuery', { kind: 'search', fulltext: '' })), []);
    await assert.rejects(
      host.call('filterQuery', { kind: 'dives', fulltext: '', mode: 'starts_with', rules: ['nonsense', '', '', '0', ''] }),
      /BAD_REQUEST/,
    );
  });

  test('editDive: text with quotes, new lines and non-ASCII characters survives the round trip', async () => {
    const notes = 'Plongée "découverte"\nà la ligne \\ 🐠 中文';
    const reply = JSON.parse(await host.call('editDive', { id: firstId, changes: JSON.stringify({ notes }) }));
    assert.equal(reply.dive.notes, notes);
    assert.equal(typeof reply.undo, 'string');
    assert.notEqual(reply.undo, '');
    const again = JSON.parse(await host.call('getDive', { id: firstId }));
    assert.equal(again.notes, notes);
    const undone = JSON.parse(await host.call('undo', { redo: false }));
    assert.notEqual(undone.dive.notes, notes);
  });

  test('arrays of integers and strings reach the core', async () => {
    const renumbered = JSON.parse(await host.call('renumberDives', { ids: [firstId], start: 500, numbers: [] }));
    assert.equal(typeof renumbered.undo, 'string');
    assert.equal(typeof renumbered.redo, 'string');
    assert.equal(JSON.parse(await host.call('getDive', { id: firstId })).number, 500);
    await host.call('undo', { redo: false });
    const sites = JSON.parse(await host.call('siteQuery', { kind: 'list', uuid: 0, lat: 0, lon: 0, a: 0, b: 0, text: '' }));
    assert.ok(Array.isArray(sites));
  });

  test('toolQuery, getPrefs and statsQuery return strings of JSON', async () => {
    assert.ok(Array.isArray(JSON.parse(await host.call('toolQuery', { kind: 'cylinders' })).types ?? [0]));
    assert.equal(typeof JSON.parse(await host.call('getPrefs')).gfLow, 'number');
    assert.equal(JSON.parse(await host.call('toolQuery', { kind: 'unknown' })), null);
    assert.ok(JSON.parse(await host.call('statsQuery', { kind: 'stats', text: '{}' })));
  });

  test('a void function returns null', async () => {
    assert.equal(await host.call('setPrefs', { changes: JSON.stringify({ gfLow: 30 }) }), null);
    assert.equal(JSON.parse(await host.call('getPrefs')).gfLow, 30);
  });

  test('errors: unknown method, bad request, core error', async () => {
    await assert.rejects(host.call('noSuchMethod', {}), /Unknown method noSuchMethod/);
    await assert.rejects(host.call('editDive', { id: firstId, changes: 'not json' }), /BAD_REQUEST/);
    await assert.rejects(host.call('countDives', { log: `${dir}/missing[main]` }));
    host.raw('this is not json');
    await host.call('ping');
    assert.deepEqual(host.unmatched, ['Bad request: not a JSON object']);
    // The host stays alive and in order.
    assert.equal(await host.call('ping'), 'pong');
  });

  test('requests sent together are answered, and the answers are matched by id', async () => {
    const results = await Promise.all([
      host.call('getDive', { id: firstId }),
      host.call('logExists', { repo }),
      host.call('listLoadedDives'),
      host.call('logExists', { repo: `${dir}/nowhere[main]` }),
    ]);
    assert.equal(JSON.parse(results[0]).id, firstId);
    assert.equal(results[1], true);
    assert.equal(JSON.parse(results[2]).length, imported);
    assert.equal(results[3], false);
  });

  test('downloadCancel and the Bluetooth name lookups answer without the core', async () => {
    assert.equal(await host.call('downloadCancel'), null);
    assert.equal(typeof (await host.call('dcBluetoothModels')), 'string');
    assert.equal(typeof (await host.call('dcFromBluetoothName', { name: 'Perdix' })), 'string');
  });

  test('stdout holds protocol lines only, and the host exits cleanly when stdin closes', async () => {
    const code = await host.close();
    assert.equal(code, 0);
    assert.deepEqual(host.badLines, []);
    host = null;
  });
});
