// Merge behaviour of isomorphic-git against Forgejo: node merge.mjs [nDives]
// Scenarios: concurrent edits of two different dives, of the same dive in different fields, of the same field.
import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { makeLogbook, stableJson } from './gen.mjs';
import { WORK, DIRECT, USER, token, seedRepo, deleteRepo, rmrf, time, AUTHOR } from './lib.mjs';

const n = Number(process.argv[2] ?? 1000);
const tok = await token();
const onAuth = () => ({ username: USER, password: tok });
const { files, diveIds } = makeLogbook(n);
const dp = (i) => `dives/${diveIds[i].slice(0, 2)}/${diveIds[i]}/dive.json`;
const root = path.join(WORK, 'merge');
const report = {};

async function scenario(name, editA, editB) {
  const seed = path.join(root, 'seed');
  const repo = await seedRepo(files, seed);
  rmrf(root);
  const url = `${DIRECT}/${USER}/${repo}.git`;
  const A = path.join(root, 'A'), B = path.join(root, 'B');
  for (const d of [A, B]) await git.clone({ fs, http, dir: d, url, ref: 'main', singleBranch: true, onAuth });
  const edit = async (dir, file, fn, msg) => {
    const f = path.join(dir, file);
    fs.writeFileSync(f, stableJson(fn(JSON.parse(fs.readFileSync(f, 'utf8')))));
    await git.add({ fs, dir, filepath: file });
    await git.commit({ fs, dir, message: msg, author: AUTHOR });
  };
  await edit(A, editA.file, editA.fn, 'A edit');
  await git.push({ fs, http, dir: A, url, ref: 'main', remoteRef: 'main', onAuth });
  await edit(B, editB.file, editB.fn, 'B edit');
  const res = { name };
  // what the app would do after a refused push: fetch, then merge
  res.fetchMs = (await time(() => git.fetch({ fs, http, dir: B, url, ref: 'main', singleBranch: true, onAuth }))).ms;
  const ours = await git.resolveRef({ fs, dir: B, ref: 'main' });
  const theirs = await git.resolveRef({ fs, dir: B, ref: 'refs/remotes/origin/main' });
  const [base] = await git.findMergeBase({ fs, dir: B, oids: [ours, theirs] });
  res.mergeBaseFound = !!base;
  try {
    const m = await time(() => git.merge({ fs, dir: B, ours: 'main', theirs: 'refs/remotes/origin/main', author: AUTHOR, abortOnConflict: true }));
    res.merge = { ok: true, ms: m.ms, oid: m.value.oid?.slice(0, 7), fastForward: m.value.fastForward, mergeCommit: m.value.mergeCommit, alreadyMerged: m.value.alreadyMerged };
    await git.checkout({ fs, dir: B, ref: 'main' });
    await git.push({ fs, http, dir: B, url, ref: 'main', remoteRef: 'main', onAuth });
    const file = JSON.parse(fs.readFileSync(path.join(B, editB.file), 'utf8'));
    res.mergedFileFields = { rating: file.rating, notes: file.notes, tags: file.tags };
  } catch (e) {
    res.merge = { ok: false, error: e.code ?? e.name, data: e.data };
    // what the three versions look like for the app's own JSON three-way merge
    const read = async (oid, file) => JSON.parse(Buffer.from((await git.readBlob({ fs, dir: B, oid, filepath: file })).blob).toString());
    const t = performance.now();
    const [b, o, th] = [await read(base, editB.file), await read(ours, editB.file), await read(theirs, editB.file)];
    res.readThreeVersionsMs = performance.now() - t;
    res.threeVersions = { base: { rating: b.rating, notes: b.notes }, ours: { rating: o.rating, notes: o.notes }, theirs: { rating: th.rating, notes: th.notes } };
    // and with conflict markers written, to show the text conflict
    try {
      await git.merge({ fs, dir: B, ours: 'main', theirs: 'refs/remotes/origin/main', author: AUTHOR, abortOnConflict: false });
    } catch (e2) { res.noAbortError = e2.code ?? e2.name; }
    const text = fs.readFileSync(path.join(B, editB.file), 'utf8');
    res.workingFileAfterNoAbort = text.includes('<<<<<<<') ? text.split('\n').filter((l, i, a) => /^(<<<<<<<|=======|>>>>>>>)/.test(l) || /^(<<<<<<<|=======)/.test(a[i - 1] ?? '') || /^>>>>>>>/.test(a[i + 1] ?? '')).join(' | ') : 'no markers';
  }
  report[name] = res;
  console.log(name, JSON.stringify(res, null, 1));
  await deleteRepo(repo);
  rmrf(root);
}

await scenario('different dives', { file: dp(1), fn: (j) => ({ ...j, notes: 'from A' }) }, { file: dp(2), fn: (j) => ({ ...j, notes: 'from B' }) });
await scenario('same dive, different fields', { file: dp(3), fn: (j) => ({ ...j, notes: 'from A' }) }, { file: dp(3), fn: (j) => ({ ...j, rating: 5 }) });
await scenario('same dive, adjacent fields', { file: dp(4), fn: (j) => ({ ...j, maxDepthMm: 1111 }) }, { file: dp(4), fn: (j) => ({ ...j, meanDepthMm: 2222 }) });
await scenario('same dive, same field', { file: dp(5), fn: (j) => ({ ...j, notes: 'from A', rating: 1 }) }, { file: dp(5), fn: (j) => ({ ...j, notes: 'from B', rating: 2 }) });
fs.writeFileSync(path.join(WORK, 'results-merge.json'), JSON.stringify(report, null, 1));
