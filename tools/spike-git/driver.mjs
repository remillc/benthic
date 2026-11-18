// Runs the Node measurements: node driver.mjs <nDives> [runs] [skipList]
// Needs the proxy for the artificial latency (node proxy.mjs 3180 80) and OD_FORGEJO_USER / OD_FORGEJO_PASSWORD.
// Results are appended to build/spike-git/results-node.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { makeLogbook } from './gen.mjs';
import { WORK, DIRECT, USER, token, seedRepo, createRepo, deleteRepo, writeTree, rmrf, median, gitCli, authUrl, AUTHOR } from './lib.mjs';

const n = Number(process.argv[2]);
const RUNS = Number(process.argv[3] ?? 3);
const only = (process.argv[4] ?? '').split(',').filter(Boolean); // e.g. "up,cl" to run a family only
const LATENCIES = (process.env.LATENCIES ?? '0,80').split(',').map(Number);
const baseFor = (lat) => (lat ? `http://127.0.0.1:${3100 + lat}` : DIRECT);
const resultsFile = path.join(WORK, 'results-node.jsonl');
const want = (f) => !only.length || only.includes(f);
const env = { GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email };

function op(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--max-old-space-size=8192', path.resolve(import.meta.dirname, 'node-op.mjs'), JSON.stringify(args)], { env: process.env });
    let o = '', e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => {
      const line = o.split('\n').find((l) => l.startsWith('RESULT '));
      resolve(line ? JSON.parse(line.slice(7)) : { error: (e || o).slice(-300), code });
    });
  });
}
const results = {};
async function measure(label, lat, runs, fn) {
  const rs = [];
  for (let i = 0; i < runs; i++) {
    const r = await fn(i);
    rs.push(r);
    fs.appendFileSync(resultsFile, JSON.stringify({ n, lat, label, run: i, ...r }) + '\n');
    console.log(n, lat, label, i, r.error ? 'ERROR ' + r.error : `${Math.round(r.ms)} ms rss ${r.rssMB} MB`);
    if (r.error) break;
  }
  const ok = rs.filter((r) => !r.error);
  results[`${label}@${lat}`] = ok.length ? median(ok.map((r) => r.ms)) : null;
}

const { files, diveIds, gearIds } = makeLogbook(n);
const divePath = `dives/${diveIds[0].slice(0, 2)}/${diveIds[0]}/dive.json`;
const gearPath = `gear/${gearIds[0]}.json`;
const dataDir = path.join(WORK, `run-${n}`);
fs.mkdirSync(dataDir, { recursive: true });
await token();

for (const lat of LATENCIES) {
  const base = baseFor(lat);
  // 1. initial upload
  if (want('up')) {
    const K5 = Math.min(n, Number(process.env.CONTENTS_K5 ?? 50)), K50 = Math.min(n, Number(process.env.CONTENTS_K50 ?? 100));
    const cases = [['up-contents-b5', 5, K5], ['up-contents-b50', 50, K50]];
    const contentsRuns = Number(lat ? (process.env.CONTENTS_RUNS_LAT ?? 1) : (process.env.CONTENTS_RUNS ?? RUNS));
    for (const [label, batch, K] of cases) {
      // The repository is seeded (git push) with every dive but the first K; the contents API then sends those K, on a repository of full size.
      const first = new Set(diveIds.slice(0, K).map((id) => `dives/${id.slice(0, 2)}/${id}/`));
      const subset = new Map([...files].filter(([p]) => p !== 'opendives.json' && ![...first].some((pre) => p.startsWith(pre))));
      await measure(label, lat, contentsRuns, async () => {
        const repo = await seedRepo(subset, path.join(dataDir, 'preseed'));
        rmrf(path.join(dataDir, 'preseed'));
        const r = await op({ op: 'up-contents', n, batch, preseed: K, maxDives: K, base, repo });
        await deleteRepo(repo);
        return r;
      });
    }
    for (const kind of ['iso', 'cli']) {
      await measure(`up-${kind}`, lat, RUNS, async () => {
        const repo = await createRepo('up');
        const dir = path.join(dataDir, `up-${kind}`);
        rmrf(dir);
        writeTree(dir, files);
        const r = await op({ op: `up-${kind}`, dir, base, repo });
        await deleteRepo(repo);
        rmrf(dir);
        return r;
      });
    }
  }
  // 2. clone
  if (want('cl')) {
    const seedDir = path.join(dataDir, 'seed');
    const repo = await seedRepo(files, seedDir);
    rmrf(seedDir);
    const clone = (name, mk, runs = RUNS) => measure(name, lat, runs, async (i) => {
      const dir = path.join(dataDir, `clone-${name}`);
      rmrf(dir);
      const r = await op(mk(dir));
      rmrf(dir);
      return r;
    });
    await clone('cl-raw', () => ({ op: 'cl-raw', base, repo }), n >= 3000 ? 1 : RUNS);
    await clone('cl-zip', () => ({ op: 'cl-zip', base, repo }));
    await clone('cl-iso-d1', (dir) => ({ op: 'cl-iso', depth: 1, dir, base, repo }));
    await clone('cl-iso-full', (dir) => ({ op: 'cl-iso', depth: 0, dir, base, repo }));
    await clone('cl-cli-d1', (dir) => ({ op: 'cl-cli', depth: 1, dir, base, repo }));
    await clone('cl-cli-full', (dir) => ({ op: 'cl-cli', depth: 0, dir, base, repo }));
    await deleteRepo(repo);
  }
  // 3. edit round trip
  if (want('ed')) {
    for (const kind of ['contents', 'iso', 'cli']) {
      const seedDir = path.join(dataDir, 'seed');
      const repo = await seedRepo(files, seedDir);
      rmrf(seedDir);
      const dirA = path.join(dataDir, `ed-${kind}-A`), dirB = path.join(dataDir, `ed-${kind}-B`);
      const u = await authUrl(DIRECT, repo);
      if (kind !== 'contents') {
        rmrf(dirA); rmrf(dirB);
        gitCli(dataDir, ['clone', '-q', u, dirA]); gitCli(dataDir, ['clone', '-q', u, dirB]);
      }
      const shaFile = path.join(dataDir, `ed-${kind}.sha`);
      await measure(`ed-${kind}`, lat, RUNS, async () => {
        if (kind === 'contents') {
          const m = [];
          for (let page = 1; ; page++) {
            const j = await (await fetch(`${DIRECT}/api/v1/repos/${USER}/${repo}/git/trees/main?recursive=true&per_page=1000&page=${page}`, { headers: { Authorization: `token ${await token()}` } })).json();
            for (const e of j.tree ?? []) if (e.type === 'blob') m.push([e.path, e.sha]);
            if (!j.truncated && !(j.total_count > page * 1000)) break;
          }
          fs.writeFileSync(shaFile, JSON.stringify(m));
        }
        return op({ op: `ed-${kind}`, base, repo, divePath, gearPath, dirA, dirB, shaFile });
      });
      if (kind === 'iso' && want('ed') && lat === LATENCIES[0]) {
        // local operations on a full clone of the same repository
        const dirL = path.join(dataDir, 'local-L');
        rmrf(dirL);
        await op({ op: 'cl-iso', depth: 0, dir: dirL, base: DIRECT, repo }); // a working copy made by isomorphic-git itself
        await measure('local-iso', lat, RUNS, () => op({ op: 'local-iso', dir: dirL, divePath }));
        rmrf(dirL);
      }
      rmrf(dirA); rmrf(dirB);
      await deleteRepo(repo);
    }
  }
}
rmrf(dataDir);
console.log(JSON.stringify(results, null, 1));
