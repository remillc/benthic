// Browser harness: isomorphic-git on LightningFS (IndexedDB), bundled by build-web.mjs and driven by browser-run.mjs.
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { makeLogbook, editDive, editGear } from './gen.mjs';

const AUTHOR = { name: 'Benthic', email: 'noreply@benthicdivelog.app' };
let peak = 0;
const heap = () => { const m = performance.memory; if (m) peak = Math.max(peak, m.usedJSHeapSize); };
setInterval(heap, 50);
const ms = async (fn) => { const t = performance.now(); const value = await fn(); heap(); return [performance.now() - t, value]; };
const open = {};
const mk = (name) => (open[name] = new LightningFS(name, { wipe: true }));
function mkdirp(pfs, p) {
  const parts = p.split('/').filter(Boolean);
  let cur = '';
  return parts.reduce((chain, part) => chain.then(async () => { cur += '/' + part; try { await pfs.mkdir(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; } }), Promise.resolve());
}

window.spike = {
  async upload({ n, url, token, dbName }) {
    const fs = mk(dbName), pfs = fs.promises, dir = '/repo', out = { n, phases: {} };
    const { files } = makeLogbook(n);
    out.generatedFiles = files.size;
    const made = new Set();
    out.phases.writeFiles = (await ms(async () => {
      await mkdirp(pfs, dir);
      for (const [p, text] of files) {
        const d = dir + '/' + p.split('/').slice(0, -1).join('/');
        if (p.includes('/') && !made.has(d)) { await mkdirp(pfs, d); made.add(d); }
        await pfs.writeFile(dir + '/' + p, text, 'utf8');
      }
    }))[0];
    out.phases.init = (await ms(() => git.init({ fs, dir, defaultBranch: 'main' })))[0];
    out.phases.add = (await ms(() => git.add({ fs, dir, filepath: '.' })))[0];
    out.phases.commit = (await ms(() => git.commit({ fs, dir, message: 'Create the logbook', author: AUTHOR })))[0];
    out.phases.push = (await ms(() => git.push({ fs, http, dir, url, ref: 'main', remoteRef: 'main', onAuth: () => ({ username: 'u', password: token }) })))[0];
    out.ms = out.phases.add + out.phases.commit + out.phases.push + out.phases.init;
    out.msWithWrite = out.ms + out.phases.writeFiles;
    out.peakHeapMB = Math.round(peak / 1e6);
    return out;
  },
  async clone({ url, token, depth, dbName, paged }) {
    const fs = mk(dbName), dir = '/repo', out = {};
    out.ms = (await ms(() => git.clone({ fs, http, dir, url, ref: 'main', singleBranch: true, depth: depth || undefined, onAuth: () => ({ username: 'u', password: token }) })))[0];
    out.peakHeapMB = Math.round(peak / 1e6);
    return out;
  },
  /** edit two files, commit, push; second copy pulls. A must be cloned already by clone() with the same dbName. */
  async editRoundTrip({ url, token, dbNameA, dbNameB, divePath, gearPath }) {
    const onAuth = () => ({ username: 'u', password: token }), out = { phases: {} };
    const A = open[dbNameA], B = open[dbNameB];
    const dir = '/repo';
    const edit = async (p, f) => A.promises.writeFile(dir + '/' + p, f(await A.promises.readFile(dir + '/' + p, 'utf8'), 1), 'utf8');
    out.phases.push = (await ms(async () => {
      await edit(divePath, editDive); await edit(gearPath, editGear);
      await git.add({ fs: A, dir, filepath: divePath }); await git.add({ fs: A, dir, filepath: gearPath });
      await git.commit({ fs: A, dir, message: 'Edit', author: AUTHOR });
      await git.push({ fs: A, http, dir, url, ref: 'main', remoteRef: 'main', onAuth });
    }))[0];
    out.phases.pull = (await ms(() => git.pull({ fs: B, http, dir, url, ref: 'main', singleBranch: true, author: AUTHOR, onAuth })))[0];
    out.ms = out.phases.push + out.phases.pull;
    out.peakHeapMB = Math.round(peak / 1e6);
    return out;
  },
  async local({ dbName, divePath }) {
    const fs = open[dbName], dir = '/repo', out = {};
    out.statusClean = (await ms(() => git.statusMatrix({ fs, dir })))[0];
    await fs.promises.writeFile(dir + '/' + divePath, editDive(await fs.promises.readFile(dir + '/' + divePath, 'utf8'), 9), 'utf8');
    out.statusDirty = (await ms(() => git.statusMatrix({ fs, dir })))[0];
    out.log20 = (await ms(() => git.log({ fs, dir, depth: 20 })))[0];
    out.statusOneFile = (await ms(() => git.statusMatrix({ fs, dir, filepaths: [divePath] })))[0];
    out.peakHeapMB = Math.round(peak / 1e6);
    return out;
  },
};
