// Effect of a long history on clone: node history.mjs [nDives] [commits]. One edit per commit, like the app's validated actions.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeLogbook, editDive } from './gen.mjs';
import { WORK, DIRECT, USER, token, createRepo, deleteRepo, writeTree, rmrf, gitCli, authUrl, AUTHOR, median } from './lib.mjs';

const n = Number(process.argv[2] ?? 1000), commits = Number(process.argv[3] ?? 1000);
await token();
const { files, diveIds } = makeLogbook(n);
const dir = path.join(WORK, 'hist-src');
rmrf(dir); fs.mkdirSync(dir, { recursive: true }); writeTree(dir, files);
const env = { GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email };
gitCli(dir, ['init', '-q', '-b', 'main']); gitCli(dir, ['add', '-A'], env); gitCli(dir, ['commit', '-q', '-m', 'Create the logbook'], env);
for (let i = 0; i < commits; i++) {
  const id = diveIds[(i * 7) % n];
  const p = `dives/${id.slice(0, 2)}/${id}/dive.json`;
  fs.writeFileSync(path.join(dir, p), editDive(fs.readFileSync(path.join(dir, p), 'utf8'), i + 1));
  gitCli(dir, ['commit', '-q', '-am', `Edit ${i}`], env);
}
const repo = await createRepo('hist');
gitCli(dir, ['push', '-q', await authUrl(DIRECT, repo), 'main'], env);
await new Promise((r) => setTimeout(r, 2000));
rmrf(dir);
const out = [];
for (const [label, spec] of [['iso depth 1', { op: 'cl-iso', depth: 1 }], ['iso full', { op: 'cl-iso', depth: 0 }], ['cli depth 1', { op: 'cl-cli', depth: 1 }], ['cli full', { op: 'cl-cli', depth: 0 }]]) {
  const rs = [];
  for (let i = 0; i < 3; i++) {
    const d = path.join(WORK, 'hist-clone');
    rmrf(d);
    const p = spawnSync(process.execPath, [path.resolve(import.meta.dirname, 'node-op.mjs'), JSON.stringify({ ...spec, dir: d, base: DIRECT, repo })], { encoding: 'utf8', env: process.env });
    const line = p.stdout.split('\n').find((l) => l.startsWith('RESULT '));
    rs.push(line ? JSON.parse(line.slice(7)) : { error: p.stderr.slice(-200) });
    rmrf(d);
  }
  out.push({ label, n, commits, ms: median(rs.map((r) => r.ms)), repoMB: rs[0].repoMB, rssMB: median(rs.map((r) => r.rssMB)) });
  console.log(JSON.stringify(out.at(-1)));
}
fs.writeFileSync(path.join(WORK, 'results-history.json'), JSON.stringify(out, null, 1));
await deleteRepo(repo);
