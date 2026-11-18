// The git layer: clone, commit, push in packs, pull and merge against a local git HTTP server (git's own http-backend).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { GitError } from '../../app/src/lib/odgit/repo.js';
import { findHttpBackend, makeRepo, startGitServer } from './odgit-helpers.mjs';

const backend = findHttpBackend();
const skip = backend ? false : 'git is not installed';

/** @param {number} n */
const dives = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ path: `dives/${String(from + i).padStart(2, '0')}/d${from + i}/dive.json`, text: JSON.stringify({ n: from + i }, null, 2) + '\n' }));

describe('git layer', { skip }, () => {
  /** @type {Awaited<ReturnType<typeof startGitServer>>} */
  let server;
  before(async () => {
    server = await startGitServer(/** @type {string} */ (backend));
  });
  after(() => server.close());

  it('clones an empty repository into an empty working copy, then commits and pushes in packs', async () => {
    const a = makeRepo({ url: server.url });
    assert.equal(await a.repo.hasWorkingCopy(), false);
    assert.equal(await a.repo.clone(), 'empty');
    assert.equal(await a.repo.hasWorkingCopy(), true);
    assert.equal(await a.repo.unpushed(), 0);
    await a.repo.commitFiles(dives(3, 0), 'Send 3 dives');
    await a.repo.commitFiles(dives(2, 3), 'Send 2 dives');
    assert.equal(await a.repo.unpushed(), 2);
    await a.repo.push();
    assert.equal(await a.repo.unpushed(), 0);
    assert.equal(server.commits(), 2);
    assert.equal(server.files().length, 5);
    assert.match(server.show('dives/04/d4/dive.json'), /"n": 4/);
    a.cleanup();
  });

  it('clones what is on the host and lists the files', async () => {
    const b = makeRepo({ url: server.url });
    const seen = [];
    assert.equal(await b.repo.clone((p) => seen.push(p.phase)), 'cloned');
    assert.equal((await b.repo.listFiles()).length, 5);
    assert.equal(await b.repo.readText('dives/02/d2/dive.json'), JSON.stringify({ n: 2 }, null, 2) + '\n');
    assert.ok(seen.length > 0);
    assert.deepEqual(await b.repo.status(['dives/02/d2/dive.json']), { 'dives/02/d2/dive.json': 'unmodified' });
    b.cleanup();
  });

  it('keeps a pushed state after a refused push: the commit is still there to push', async () => {
    const a = makeRepo({ url: server.url });
    await a.repo.clone();
    await a.repo.commitFiles(dives(1, 10), 'Send 1 dive');
    server.state.failNext = 1;
    await assert.rejects(a.repo.push(), (e) => e instanceof GitError && e.code === 'UNREACHABLE');
    assert.equal(await a.repo.unpushed(), 1);
    await a.repo.push();
    assert.equal(await a.repo.unpushed(), 0);
    assert.ok(server.files().includes('dives/10/d10/dive.json'));
    a.cleanup();
  });

  it('refuses a wrong token', async () => {
    const c = makeRepo({ url: server.url, token: 'wrong' });
    await assert.rejects(c.repo.clone(), (e) => e instanceof GitError && e.code === 'REFUSED');
    c.cleanup();
  });

  it('pulls: fast-forward, then merges two clients that edited different dives', async () => {
    const a = makeRepo({ url: server.url });
    const b = makeRepo({ url: server.url });
    await a.repo.clone();
    await b.repo.clone();
    assert.equal(await b.repo.pull(), 'upToDate');
    await a.repo.commitFiles([{ path: 'dives/00/d0/dive.json', text: '{"n": 0, "notes": "A"}\n' }], 'A edits dive 0');
    await a.repo.push();
    assert.equal(await b.repo.pull(), 'fastForward');
    assert.match((await b.repo.readText('dives/00/d0/dive.json')) ?? '', /"notes": "A"/);
    // B and A edit different dives from the same base.
    await a.repo.commitFiles([{ path: 'dives/01/d1/dive.json', text: '{"n": 1, "notes": "A1"}\n' }], 'A edits dive 1');
    await a.repo.push();
    await b.repo.commitFiles([{ path: 'dives/02/d2/dive.json', text: '{"n": 2, "notes": "B2"}\n' }], 'B edits dive 2');
    assert.equal(await b.repo.pull(), 'merged');
    assert.match((await b.repo.readText('dives/01/d1/dive.json')) ?? '', /A1/);
    assert.match((await b.repo.readText('dives/02/d2/dive.json')) ?? '', /B2/);
    await b.repo.push();
    assert.match(server.show('dives/02/d2/dive.json'), /B2/);
    assert.match(server.show('dives/01/d1/dive.json'), /A1/);
    a.cleanup();
    b.cleanup();
  });

  it('reports a conflict of the same lines without touching the working copy', async () => {
    const a = makeRepo({ url: server.url });
    const b = makeRepo({ url: server.url });
    await a.repo.clone();
    await b.repo.clone();
    await a.repo.commitFiles([{ path: 'dives/03/d3/dive.json', text: '{"n": 3, "notes": "from A"}\n' }], 'A');
    await a.repo.push();
    await b.repo.commitFiles([{ path: 'dives/03/d3/dive.json', text: '{"n": 3, "notes": "from B"}\n' }], 'B');
    await assert.rejects(b.repo.pull(), (e) => e instanceof GitError && e.code === 'CONFLICT' && e.paths.includes('dives/03/d3/dive.json'));
    assert.match((await b.repo.readText('dives/03/d3/dive.json')) ?? '', /from B/);
    assert.equal(await b.repo.unpushed(), 1);
    a.cleanup();
    b.cleanup();
  });
});
