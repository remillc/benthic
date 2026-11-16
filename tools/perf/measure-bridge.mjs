// SPDX-License-Identifier: GPL-2.0
// Performance audit: the bridge between the web layer and the core (desktop: renderer -> main -> helper over stdio).
// Patches OpenDivesCoreDesktop.prototype.core in the renderer to log every call (method, arguments size,
// result size, duration), then drives the app: reload, select a dive, the four sections, one edit.
// Reuses the user-data folder of measure-desktop.mjs for the same label.
// usage: node tools/perf/measure-bridge.mjs <logbook.ssrf> <label>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const ud = path.join(root, 'build/perf', `ud-${label}`);
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await sleep(3000);

const patch = `(async()=>{
  const mod = await import('/@fs/${root.replace(/\\/g, '/')}/plugins/opendives-core/desktop.js');
  window.__calls = [];
  const proto = mod.OpenDivesCoreDesktop.prototype;
  if (!proto.__orig) { proto.__orig = proto.core; }
  proto.core = async function (method, args) {
    const t = performance.now();
    let size = -1;
    try { const r = await proto.__orig.call(this, method, args); size = typeof r === 'string' ? r.length : JSON.stringify(r ?? null).length; return r; }
    finally { window.__calls.push({ method, argBytes: JSON.stringify(args ?? {}).length, resultBytes: size, ms: Math.round(performance.now() - t) }); }
  };
  return true;
})()`;
const R = { label };
R.patched = await p.eval(patch);
const summarise = async (name) => {
  const calls = await p.eval('window.__calls');
  await p.eval('window.__calls=[]');
  const by = {};
  for (const c of calls) {
    const b = (by[c.method] ||= { n: 0, ms: 0, maxMs: 0, bytes: 0, argBytes: 0 });
    b.n++; b.ms += c.ms; b.maxMs = Math.max(b.maxMs, c.ms); b.bytes += Math.max(0, c.resultBytes); b.argBytes += c.argBytes;
  }
  R[name] = { calls: calls.length, totalMs: calls.reduce((a, c) => a + c.ms, 0), totalKB: Math.round(calls.reduce((a, c) => a + Math.max(0, c.resultBytes), 0) / 1024), byMethod: by };
};
await p.eval(`window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)})`);
const click = (js) => p.eval(`(async()=>{${js};await window.__frames(2)})()`);

// 1. A reload: what the start-up asks of the core (the patch is lost: re-apply right after load is too late,
// so this step runs the loading functions again instead).
await p.eval(`(async()=>{const m=await import('/src/lib/logbook.svelte.js');await m.loadLogbook({force:true})})()`);
await summarise('loadLogbookForce');
await click(`document.querySelectorAll('.od-desktop-logbook--row')[3].click()`); await sleep(1500);
await summarise('selectDive');
for (const name of ['sites', 'statistics', 'tools', 'logbook']) {
  await click(`[...document.querySelectorAll('.od-nav-rail--item')].find(x=>x.getAttribute('href')==='#${name}')?.click()`);
  await sleep(2500);
  await summarise('section_' + name);
}
await click(`document.querySelectorAll('.od-desktop-logbook--row')[2].click()`); await sleep(800);
await p.eval('window.__calls=[]');
const id = await p.eval(`Number(document.querySelector('.od-desktop-logbook--row.od-desktop-logbook--selected')?.dataset.dive)`);
R.editDiveId = id;
R.editTimings = await p.eval(`(async()=>{try{const m=await import('/src/lib/logbook.svelte.js');const a=performance.now();await m.saveDiveChanges(${id},{notes:'perf audit note'});const b=performance.now()-a;await window.__frames(2);return {saveDiveChangesMs:Math.round(b),totalMs:Math.round(performance.now()-a)}}catch(e){return {error:String(e)}}})()`);
await summarise('editNotes');
const t = await p.eval(`(async()=>{try{const m=await import('/src/lib/logbook.svelte.js');const a=performance.now();await m.refreshAfterChange('x');const b=performance.now()-a;await window.__frames(2);return {refreshAfterChangeMs:Math.round(b),totalMs:Math.round(performance.now()-a)}}catch(e){return {error:String(e)}}})()`);
R.refreshTimings = t;
await summarise('refreshAfterChange');
writeFileSync(path.join(root, 'build/perf', `bridge-${label}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R));
p.close();
child.kill();
killMine();
