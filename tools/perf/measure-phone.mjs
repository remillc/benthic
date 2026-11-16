// SPDX-License-Identifier: GPL-2.0
// Performance audit: the phone layout in Electron/Chromium (device emulation 390x844, DPR 3, touch, CPU 4x)
// on one synthetic logbook. Reuses the user-data folder of measure-desktop.mjs for the same label (no re-import).
// usage: node tools/perf/measure-phone.mjs <logbook.ssrf> <label> [--cpu=4]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const cpu = Number((process.argv.find((a) => a.startsWith('--cpu=')) || '--cpu=4').slice(6));
const root = path.resolve(import.meta.dirname, '../..');
const ud = path.join(root, 'build/perf', `ud-${label}`);
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: 'http://localhost:5241', OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), '--remote-debugging-port=9391', path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await p.send('Performance.enable');
await p.send('HeapProfiler.enable');
await sleep(3000);
const R = { label, cpu };
const snap = async (name) => {
  await p.send('HeapProfiler.collectGarbage');
  const m = await p.metrics();
  const dom = await p.eval(`(()=>{const per={};for(const e of document.querySelectorAll('.page'))per[e.className.split(' ').slice(0,2).join('.')]=e.querySelectorAll('*').length;return {elements:document.querySelectorAll('*').length,pages:per}})()`);
  R[name] = { ...dom, cdpNodes: m.Nodes, jsHeapMB: +(m.JSHeapUsedSize / 1e6).toFixed(1), layoutCount: m.LayoutCount, recalcStyle: m.RecalcStyleCount };
};
await snap('wideBefore');
await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await p.send('Emulation.setTouchEmulationEnabled', { enabled: true });
await p.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await p.eval(`window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});
 window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)});`);
const t0 = Date.now();
for (let i = 0; i < 600; i++) { if (await p.eval(`document.querySelectorAll('.od-dive-row, .od-trip-row').length>0`)) break; await sleep(100); }
R.phoneLayoutReadyMs = Date.now() - t0;
await sleep(3000);
await snap('phoneAfterSwap');
R.phoneRows = await p.eval(`JSON.stringify({diveRows:document.querySelectorAll('.od-dive-row').length,tripRows:document.querySelectorAll('.od-trip-row').length,profileSvgs:document.querySelectorAll('.od-dive-row svg, .od-trip-row svg').length,svgNodes:document.querySelectorAll('svg *').length})`);
R.longTasksSwap = await p.eval('window.__lt');
const scrolled = await p.eval(`(async()=>{const sc=[...document.querySelectorAll('.page-current *')].find(e=>e.scrollHeight>e.clientHeight+500&&/auto|scroll/.test(getComputedStyle(e).overflowY));if(!sc)return null;const a=performance.now();for(let i=0;i<10;i++){sc.scrollTop+=sc.clientHeight;await window.__frames(1)}return {ms:Math.round(performance.now()-a),h:sc.scrollHeight}})()`);
R.scroll10Screens = scrolled;
R.longTasksTotal = await p.eval('window.__lt');
writeFileSync(path.join(root, 'build/perf', `phone-${label}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R));
await p.send('Emulation.clearDeviceMetricsOverride');
await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
p.close();
child.kill();
killMine();
