// Browser harness of the REAL git layer (app/src/lib/bgit): repo.js + fs-adapter.js + http-adapter.js, over
// either LightningFS (IndexedDB) or a "bridge" backend that sends every file operation out of the page as JSON with
// base64 data (what @capacitor/filesystem does between the web view and Kotlin/Swift), done here by puppeteer's
// exposeFunction into Node's fs. Bundled by build-bgit.mjs, driven by bgit-run.mjs.
import LightningFS from '@isomorphic-git/lightning-fs';
import { base64ToBytes, bytesToBase64, createGitFs, fsError } from '../../app/src/lib/bgit/fs-adapter.js';
import { createGitHttp } from '../../app/src/lib/bgit/http-adapter.js';
import { openRepo } from '../../app/src/lib/bgit/repo.js';
import { editDive, editGear } from './gen.mjs';

let peak = 0;
const heap = () => {
  const m = performance.memory;
  if (m) peak = Math.max(peak, m.usedJSHeapSize);
};
setInterval(heap, 30);
const resetPeak = () => {
  peak = performance.memory?.usedJSHeapSize ?? 0;
};
const mb = () => Math.round(peak / 1e6);

/** @param {string} name */
function lightningBackend(name) {
  const pfs = new LightningFS(name, { wipe: true }).promises;
  const mkdirp = async (/** @type {string} */ p) => {
    let cur = '';
    for (const part of p.split('/').filter(Boolean)) {
      cur += '/' + part;
      try {
        await pfs.mkdir(cur);
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
  };
  const made = new Set();
  return {
    readFile: async (p) => new Uint8Array(await pfs.readFile(p)),
    async writeFile(p, data) {
      const d = p.split('/').slice(0, -1).join('/');
      if (d && !made.has(d)) {
        await mkdirp(d);
        made.add(d);
      }
      await pfs.writeFile(p, data);
    },
    unlink: (p) => pfs.unlink(p),
    readdir: (p) => pfs.readdir(p),
    mkdir: mkdirp,
    rmdir: (p) => pfs.rmdir(p),
    stat: async (p) => {
      const s = await pfs.stat(p);
      return { type: s.isDirectory() ? 'dir' : 'file', size: s.size, mtimeMs: s.mtimeMs };
    },
  };
}

/** @param {string} name the folder of this copy in Node (the root of the bridge) */
function bridgeBackend(name) {
  // @ts-ignore exposed by puppeteer
  const call = async (op, path, data) => {
    const r = await window.__odfs(name, op, path, data);
    if (r && r.err) throw fsError(r.err, path);
    return r;
  };
  return {
    readFile: async (p) => base64ToBytes((await call('readFile', p)).data),
    writeFile: (p, data) => call('writeFile', p, bytesToBase64(data)),
    unlink: (p) => call('unlink', p),
    readdir: async (p) => (await call('readdir', p)).names,
    mkdir: (p) => call('mkdir', p),
    rmdir: (p) => call('rmdir', p),
    stat: async (p) => (await call('stat', p)).stat,
  };
}

const transport = async (r) => {
  const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body });
  const headers = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { status: res.status, headers, body: new Uint8Array(await res.arrayBuffer()) };
};

const copies = {};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const time = async (fn) => {
  const t = performance.now();
  const value = await fn();
  heap();
  return [performance.now() - t, value];
};
const mk = (kind, name, url, token) => {
  const backend = kind === 'lightning' ? lightningBackend(name) : bridgeBackend(name);
  return openRepo({ fs: createGitFs(backend), http: createGitHttp(transport), dir: '/wc', url, branch: 'main', token });
};

window.odbench = {
  async clone({ kind, name, url, token }) {
    resetPeak();
    const repo = (copies[name] = mk(kind, name, url, token));
    const [ms] = await time(() => repo.clone());
    return { ms, peakHeapMB: mb(), files: (await repo.listFiles()).length };
  },
  /** Edit a dive and a gear file, commit, push from `a`; then `b` pulls. */
  async roundTrip({ a, b, divePath, gearPath, rounds }) {
    const A = copies[a],
      B = copies[b];
    const push = [],
      pull = [],
      total = [],
      heaps = [],
      phases = [];
    for (let i = 0; i < rounds; i++) {
      resetPeak();
      const dive = await A.readText(divePath);
      const gear = await A.readText(gearPath);
      const files = [
        { path: divePath, text: editDive(dive, i + 1) },
        { path: gearPath, text: editGear(gear, i + 1) },
      ];
      const ph = {};
      const [m1] = await time(async () => {
        ph.write = (await time(async () => { for (const f of files) await A.writeText(f.path, f.text); }))[0];
        ph.commit = (await time(() => A.commitStaged(files.map((f) => f.path), 'Edit')))[0];
        ph.push = (await time(() => A.push()))[0];
      });
      phases.push(ph);
      const [m2, how] = await time(() => B.pull());
      push.push(m1);
      pull.push(m2);
      total.push(m1 + m2);
      heaps.push(mb());
      if (how !== 'fastForward') throw new Error('pull gave ' + how);
    }
    return { pushMs: median(push), pullMs: median(pull), totalMs: median(total), peakHeapMB: Math.max(...heaps), all: total, phases };
  },
  async local({ name, divePath }) {
    const repo = copies[name];
    resetPeak();
    const out = {};
    out.statusAll = (await time(() => repo.status()))[0];
    const text = await repo.readText(divePath);
    await repo.writeText(divePath, editDive(text, 99));
    out.statusOneFileDirty = (await time(() => repo.status([divePath])))[0];
    out.statusOneFileDirty2 = (await time(() => repo.status([divePath])))[0];
    out.listFiles = (await time(() => repo.listFiles()))[0];
    out.peakHeapMB = mb();
    return out;
  },
};
