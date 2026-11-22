// SPDX-License-Identifier: GPL-2.0
// Performance audit: measures the desktop app (Electron, CDP) on one synthetic logbook.
// usage: node tools/perf/measure-desktop.mjs <logbook.ssrf> <label> [--cpu=4]
// Needs the audit's Vite on 5241 (cd app; npx vite --port 5241) and the main checkout's Electron
// and helper builds (see start-electron.sh). Writes build/perf/result-<label>.json.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const cpu = Number((process.argv.find((a) => a.startsWith('--cpu=')) || '--cpu=1').slice(6));
const root = path.resolve(import.meta.dirname, '../..');
const ud = path.join(root, 'build/perf', `ud-${label}`);
const MAIN = process.env.MAIN || 'F:/projets/benthic';

killMine();
await sleep(1500);
rmSync(ud, { recursive: true, force: true });
mkdirSync(ud, { recursive: true });

const env = { ...process.env, BC_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, BC_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, BC_STAGE: `${MAIN}/build/desktop/stage`, BC_USER_DATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
const t0 = Date.now();
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", path.resolve(ssrf)], { env, stdio: 'ignore' });

const R = { label, ssrf, cpu };
const p = await attachLogbook();
console.error("attached", Date.now() - t0);
await p.send('Performance.enable');
await p.send('HeapProfiler.enable');
const poll = async (expr, ms = 180000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { try { if (await p.eval(expr)) return Date.now() - s; } catch { /* page busy */ } await sleep(50); }
  return -1;
};
const ROWS = `document.querySelectorAll('.bc-desktop-logbook--row').length>0`;
await poll(ROWS);
R.coldFromSpawnMs = Date.now() - t0;
await sleep(4000);
if (cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: cpu });

const snap = async (name) => {
  await p.send('HeapProfiler.collectGarbage');
  const m = await p.metrics();
  const dom = await p.eval(`(()=>{const per={};for(const e of document.querySelectorAll('.page'))per[e.className.split(' ')[0]+(e.className.includes('page-current')?'*':'')]=e.querySelectorAll('*').length;
    return {nodes:document.querySelectorAll('*').length,pages:per,pageCount:document.querySelectorAll('.page').length,rows:document.querySelectorAll('.bc-desktop-logbook--row').length,svgNodes:document.querySelectorAll('svg *').length}})()`);
  R[name] = { ...dom, jsHeapMB: +(m.JSHeapUsedSize / 1e6).toFixed(1), layoutCount: m.LayoutCount, recalcStyle: m.RecalcStyleCount, layoutMs: +(m.LayoutDuration * 1000).toFixed(0), scriptMs: +(m.ScriptDuration * 1000).toFixed(0), taskMs: +(m.TaskDuration * 1000).toFixed(0), listeners: m.JSEventListeners };
};
console.error('idle');await snap('idle');console.error('snap ok');

await p.eval(`window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});
 window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)});
 window.__time=async(fn)=>{const a=performance.now();await fn();const sync=performance.now()-a;await window.__frames(2);return {sync:Math.round(sync),total:Math.round(performance.now()-a)}};`);
const T = {};
const time = async (name, js) => { T[name] = await p.eval(`window.__time(async()=>{${js}})`); };

await time('selectDive', `document.querySelectorAll('.bc-desktop-logbook--row')[3].click()`);
await sleep(800);
await snap('afterSelect');
console.error('selected');await time('selectOther', `document.querySelectorAll('.bc-desktop-logbook--row')[6].click()`);
await sleep(400);
await time('sortByDepth', `const th=[...document.querySelectorAll('th')].find(x=>/Prof|Depth/i.test(x.textContent));(th.querySelector('button')||th).click()`);
await sleep(400);
await time('sortByDate', `const th=[...document.querySelectorAll('th')].find(x=>/^\\s*Date/i.test(x.textContent));(th.querySelector('button')||th).click()`);
await sleep(400);
console.error('sorted');T.search = await p.eval(`(async()=>{const i=document.querySelector('.bc-desktop-logbook--search input');const out=[];let v='';
 for(const ch of 'canyon'){v+=ch;const a=performance.now();i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));const s=performance.now()-a;await window.__frames(2);out.push([Math.round(s),Math.round(performance.now()-a)])}
 const rows=document.querySelectorAll('.bc-desktop-logbook--row').length;i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));await window.__frames(2);return {keystrokes_sync_total_ms:out,rowsAfter:rows}})()`);
await time('scrollList', `const sc=[...document.querySelectorAll('.bc-desktop-logbook *')].find(e=>e.scrollHeight>e.clientHeight+200&&getComputedStyle(e).overflowY!=='visible');if(sc){for(let i=0;i<10;i++){sc.scrollTop+=sc.clientHeight;await window.__frames(1)}}`);
console.error('scrolled');R.navs = await p.eval(`[...document.querySelectorAll('.bc-nav-rail--item')].map(a=>a.getAttribute('href'))`);
for (const name of ['sites', 'statistics', 'tools', 'logbook']) {
  T['nav_' + name] = await p.eval(`window.__time(async()=>{[...document.querySelectorAll('.bc-nav-rail--item')].find(x=>x.getAttribute('href')==='#${name}')?.click()})`);
  await sleep(1000);
  await snap('after_' + name);
}
R.timings = T;
R.longTasksInteractions = await p.eval(`window.__lt`);

console.error('navs');const heaps = [];
for (let i = 0; i < 10; i++) {
  for (const name of ['sites', 'statistics', 'tools', 'logbook']) { await p.eval(`[...document.querySelectorAll('.bc-nav-rail--item')].find(x=>x.getAttribute('href')==='#${name}')?.click()`); await sleep(300); }
  await p.eval(`document.querySelectorAll('.bc-desktop-logbook--row')[${(i % 5) + 1}]?.click()`); await sleep(300);
  await p.send('HeapProfiler.collectGarbage');
  const m = await p.metrics();
  heaps.push([+(m.JSHeapUsedSize / 1e6).toFixed(1), m.Nodes, m.JSEventListeners]);
}
R.navLoop_heapMB_nodes_listeners = heaps;

for (let i = 0; i < 12; i++) { await p.send('Emulation.setDeviceMetricsOverride', { width: i % 2 ? 1400 : 700, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(500); }
await p.send('Emulation.clearDeviceMetricsOverride');
await sleep(800);
await p.send('HeapProfiler.collectGarbage');
const m2 = await p.metrics();
R.afterResizesElements = await p.eval(`JSON.stringify({el:document.querySelectorAll('*').length,pages:[...document.querySelectorAll('.page')].map(e=>e.className.split(' ')[0]+':'+e.querySelectorAll('*').length)})`);
R.afterResizes = { heapMB: +(m2.JSHeapUsedSize / 1e6).toFixed(1), nodes: m2.Nodes, listeners: m2.JSEventListeners };

await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await p.send('Page.enable');
await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});` });
if (cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const r0 = Date.now();
await p.send('Page.reload');
await sleep(300);
await poll(ROWS);
R.reloadToRowsMs = Date.now() - r0;
await sleep(3000);
R.reload = JSON.parse(await p.eval(`JSON.stringify({paint:performance.getEntriesByType('paint').map(e=>[e.name,Math.round(e.startTime)]),longTasks:window.__lt,nav:(()=>{const n=performance.getEntriesByType('navigation')[0];return {dcl:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd)}})()})`));
writeFileSync(path.join(root, 'build/perf', `result-${label}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
p.close();
child.kill();
killMine();
