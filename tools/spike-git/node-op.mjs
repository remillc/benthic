// One measured operation in its own process (so the peak memory is its own): node node-op.mjs '<json>'; prints one JSON line.
import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { unzipSync } from 'fflate';
import { makeLogbook, editDive, editGear } from './gen.mjs';
import { USER, token, time, AUTHOR, gitCli, authUrl, dirSize } from './lib.mjs';

const a = JSON.parse(process.argv[2]);
const tok = await token();
const onAuth = () => ({ username: USER, password: tok });
const out = { op: a.op };
const r1 = (x) => Math.round(x * 10) / 10;
const env = { GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email };
const url = `${a.base}/${USER}/${a.repo}.git`;
const apiBase = `${a.base}/api/v1/repos/${USER}/${a.repo}`;
const H = { Authorization: `token ${tok}`, 'Content-Type': 'application/json' };
const b64 = (t) => Buffer.from(t).toString('base64');
const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);

async function listTree() {
  const m = new Map();
  for (let page = 1; ; page++) {
    const j = await (await fetch(`${apiBase}/git/trees/main?recursive=true&per_page=1000&page=${page}`, { headers: H })).json();
    for (const e of j.tree ?? []) if (e.type === 'blob') m.set(e.path, e.sha);
    if (!j.truncated && !(j.total_count > page * 1000)) break;
  }
  return m;
}

switch (a.op) {
  case 'up-contents': {
    const { files, diveIds } = makeLogbook(a.n);
    const queueAll = diveIds.map((id) => [...files].filter(([p]) => p.startsWith(`dives/${id.slice(0, 2)}/${id}/`)).map(([p, text]) => ({ path: p, text })));
    const queue = a.maxDives ? queueAll.slice(0, a.maxDives) : queueAll;
    const extra = a.preseed ? [] : [...files].filter(([p]) => !p.startsWith('dives/') && p !== 'opendives.json').map(([p, text]) => ({ path: p, text }));
    let calls = 0, bytes = 0, maxBody = 0;
    const callMs = [];
    async function commit(batch, message) {
      const body = JSON.stringify({ branch: 'main', message, author: AUTHOR, committer: AUTHOR, files: batch.map((f) => ({ operation: 'create', path: f.path, content: b64(f.text) })) });
      maxBody = Math.max(maxBody, body.length);
      const tc = performance.now();
      const res = await fetch(`${apiBase}/contents`, { method: 'POST', headers: H, body });
      calls++; bytes += body.length;
      if (!res.ok) { out.error = `${res.status} ${(await res.text()).slice(0, 200)}`; throw new Error(out.error); }
      await res.arrayBuffer();
      callMs.push(performance.now() - tc);
    }
    // The real writer sends the sites and trips with the first dive that uses them; here they go first, same total.
    const t = await time(async () => {
      for (let i = 0; i < extra.length; i += 100) await commit(extra.slice(i, i + 100), 'Send sites');
      for (let i = 0; i < queue.length; i += a.batch) await commit(queue.slice(i, i + a.batch).flat(), `Send ${a.batch} dives`);
      await commit([{ path: 'opendives.json', text: files.get('opendives.json') }], 'Create the logbook');
    });
    Object.assign(out, { ms: t.ms, calls, uploadMB: r1(bytes / 1e6), maxBodyMB: r1(maxBody / 1e6) });
    if (a.preseed) {
      // the repository was seeded with the other dives: the first batches (not the marker) time a commit on a repository of full size
      const dive = callMs.slice(0, -1).sort((x, y) => x - y);
      out.perCallMs = dive[Math.floor(dive.length / 2)];
      out.measuredCalls = dive.length;
      out.fullCalls = Math.ceil(a.n / a.batch) + 1;
      out.measuredMs = out.ms;
      out.ms = out.perCallMs * out.fullCalls; // estimate of the whole upload
    }
    break;
  }
  case 'up-iso': {
    const dir = a.dir, phases = {};
    phases.init = (await time(() => git.init({ fs, dir, defaultBranch: 'main' }))).ms;
    phases.add = (await time(() => git.add({ fs, dir, filepath: '.' }))).ms;
    phases.commit = (await time(() => git.commit({ fs, dir, message: 'Create the logbook', author: AUTHOR }))).ms;
    phases.push = (await time(() => git.push({ fs, http, dir, url, ref: 'main', remoteRef: 'main', onAuth }))).ms;
    Object.assign(out, { ms: sum(phases), phases, repoMB: r1(dirSize(path.join(dir, '.git')) / 1e6) });
    break;
  }
  case 'up-cli': {
    const dir = a.dir, phases = {};
    const g = (args) => time(async () => gitCli(dir, args, env)).then((x) => x.ms);
    phases.init = await g(['init', '-q', '-b', 'main']);
    phases.add = await g(['add', '-A']);
    phases.commit = await g(['commit', '-q', '-m', 'Create the logbook']);
    phases.push = await g(['push', '-q', await authUrl(a.base, a.repo), 'main']);
    Object.assign(out, { ms: sum(phases), phases });
    break;
  }
  case 'cl-raw': {
    let bytes = 0, n = 0;
    const t = await time(async () => {
      const paths = [...(await listTree()).keys()];
      let next = 0;
      const worker = async () => { while (next < paths.length) { const p = paths[next++]; const r = await fetch(`${apiBase}/raw/${p.split('/').map(encodeURIComponent).join('/')}?ref=main`, { headers: H }); bytes += (await r.arrayBuffer()).byteLength; n++; } };
      await Promise.all([worker(), worker(), worker(), worker()]);
    });
    Object.assign(out, { ms: t.ms, files: n, downloadMB: r1(bytes / 1e6) });
    break;
  }
  case 'cl-zip': {
    let size = 0, n = 0;
    const phases = {};
    const t = await time(async () => {
      const t1 = performance.now();
      const r = await fetch(`${apiBase}/archive/main.zip`, { headers: H });
      const buf = new Uint8Array(await r.arrayBuffer());
      size = buf.length; phases.download = performance.now() - t1;
      const t2 = performance.now();
      n = Object.keys(unzipSync(buf)).length; phases.unzip = performance.now() - t2;
    });
    Object.assign(out, { ms: t.ms, files: n, downloadMB: r1(size / 1e6), phases });
    break;
  }
  case 'cl-iso': {
    const t = await time(() => git.clone({ fs, http, dir: a.dir, url, ref: 'main', singleBranch: true, depth: a.depth || undefined, onAuth }));
    Object.assign(out, { ms: t.ms, repoMB: r1(dirSize(path.join(a.dir, '.git')) / 1e6) });
    break;
  }
  case 'cl-cli': {
    const t = await time(async () => gitCli(process.cwd(), ['clone', '-q', '--single-branch', ...(a.depth ? ['--depth', String(a.depth)] : []), await authUrl(a.base, a.repo), a.dir]));
    Object.assign(out, { ms: t.ms, repoMB: r1(dirSize(path.join(a.dir, '.git')) / 1e6) });
    break;
  }
  case 'ed-contents': {
    const phases = {};
    const before = new Map(JSON.parse(fs.readFileSync(a.shaFile, 'utf8')));
    const t1 = performance.now();
    const read = async (p) => { for (let i = 0; i < 30; i++) { const j = await (await fetch(`${apiBase}/contents/${p}?ref=main`, { headers: H })).json(); if (j && j.content) return j; await new Promise((r) => setTimeout(r, 300)); } throw new Error('no content'); };
    const d = await read(a.divePath), g = await read(a.gearPath);
    const nd = editDive(Buffer.from(d.content, 'base64').toString(), 1), ng = editGear(Buffer.from(g.content, 'base64').toString(), 1);
    const res = await fetch(`${apiBase}/contents`, { method: 'POST', headers: H, body: JSON.stringify({ branch: 'main', message: 'Edit', author: AUTHOR, committer: AUTHOR, files: [{ operation: 'update', path: a.divePath, sha: d.sha, content: b64(nd) }, { operation: 'update', path: a.gearPath, sha: g.sha, content: b64(ng) }] }) });
    if (!res.ok) throw new Error(`edit ${res.status} ${await res.text()}`);
    await res.arrayBuffer();
    phases.push = performance.now() - t1;
    const t2 = performance.now();
    const after = await listTree();
    const changed = [...after].filter(([p, s]) => before.get(p) !== s).map(([p]) => p);
    for (const p of changed) await (await fetch(`${apiBase}/raw/${p}?ref=main`, { headers: H })).arrayBuffer();
    phases.pull = performance.now() - t2;
    Object.assign(out, { ms: sum(phases), phases, changed: changed.length });
    break;
  }
  case 'ed-iso': {
    const A = a.dirA, B = a.dirB, phases = {};
    const edit = (dir, p, f) => fs.writeFileSync(path.join(dir, p), f(fs.readFileSync(path.join(dir, p), 'utf8'), 1));
    edit(A, a.divePath, editDive); edit(A, a.gearPath, editGear);
    phases.push = (await time(async () => {
      await git.add({ fs, dir: A, filepath: a.divePath });
      await git.add({ fs, dir: A, filepath: a.gearPath });
      await git.commit({ fs, dir: A, message: 'Edit', author: AUTHOR });
      await git.push({ fs, http, dir: A, url, ref: 'main', remoteRef: 'main', onAuth });
    })).ms;
    phases.pull = (await time(() => git.pull({ fs, http, dir: B, url, ref: 'main', singleBranch: true, author: AUTHOR, onAuth }))).ms;
    Object.assign(out, { ms: sum(phases), phases });
    break;
  }
  case 'ed-cli': {
    const A = a.dirA, B = a.dirB, phases = {};
    const edit = (dir, p, f) => fs.writeFileSync(path.join(dir, p), f(fs.readFileSync(path.join(dir, p), 'utf8'), 1));
    edit(A, a.divePath, editDive); edit(A, a.gearPath, editGear);
    const u = await authUrl(a.base, a.repo);
    phases.push = (await time(async () => { gitCli(A, ['add', a.divePath, a.gearPath], env); gitCli(A, ['commit', '-q', '-m', 'Edit'], env); gitCli(A, ['push', '-q', u, 'main'], env); })).ms;
    phases.pull = (await time(async () => gitCli(B, ['pull', '-q', '--no-edit', u, 'main'], env))).ms;
    Object.assign(out, { ms: sum(phases), phases });
    break;
  }
  case 'local-iso': {
    const dir = a.dir, res = {};
    res.statusClean = (await time(() => git.statusMatrix({ fs, dir }))).ms;
    fs.writeFileSync(path.join(dir, a.divePath), editDive(fs.readFileSync(path.join(dir, a.divePath), 'utf8'), 9));
    const m = await git.statusMatrix({ fs, dir });
    res.changedFiles = m.filter((r) => r[1] !== r[2] || r[2] !== r[3]).length;
    res.statusDirty = (await time(() => git.statusMatrix({ fs, dir }))).ms;
    res.log20 = (await time(() => git.log({ fs, dir, depth: 20 }))).ms;
    res.statusOneFile = (await time(() => git.statusMatrix({ fs, dir, filepaths: [a.divePath] }))).ms;
    Object.assign(out, res);
    break;
  }
  default:
    throw new Error('unknown op ' + a.op);
}
out.rssMB = Math.round(process.resourceUsage().maxRSS / 1024);
console.log('RESULT ' + JSON.stringify(out));
