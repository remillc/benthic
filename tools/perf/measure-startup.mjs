// SPDX-License-Identifier: GPL-2.0
// Performance audit: start-up of the production build (vite build -> build/perf/stage-prod/web) in Electron.
// PHONE=1: the same under a 390x844 touch emulation and a 4x CPU throttle. STAGE=<name>, STAGE_TAG=<tag>: which build (make-stage.sh) and the result's name.
// Times: spawn to the first logbook row, first (contentful) paint, long tasks during start-up, JS heap, DOM.
// usage: node tools/perf/measure-startup.mjs <logbook.ssrf> <label> [runs]   (reuses ud-<label>)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run', runsArg = '3'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/benthic';
const phone = process.env.PHONE === '1';
const results = [];
for (let run = 0; run < Number(runsArg); run++) {
  killMine();
  await sleep(1500);
  const env = { ...process.env, BC_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, BC_STAGE: path.join(root, 'build/perf', process.env.STAGE || 'stage-prod'), BC_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BC_DEV_URL;
  const t0 = Date.now();
  const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", path.resolve(ssrf)], { env, stdio: 'ignore' });
  const p = await attachLogbook();
  let rowsMs = Date.now() - t0;
  if (phone) {
    // Phone layout, CPU 4x: the page is loaded again under the emulation; rowsMs is then reload to the first dive row.
    await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.send('Page.reload');
    const r0 = Date.now();
    await sleep(500);
    for (let i = 0; i < 600; i++) { try { if (await p.eval(`document.querySelectorAll('.bc-dive-row, .bc-trip-row').length > 0`)) break; } catch { /* reloading */ } await sleep(100); }
    rowsMs = Date.now() - r0;
  }
  await sleep(2500);
  const info = JSON.parse(await p.eval(`(async()=>{const lt=await new Promise(r=>{const a=[];new PerformanceObserver(l=>{for(const e of l.getEntries())a.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true});setTimeout(()=>r(a),300)});
    return JSON.stringify({paint:performance.getEntriesByType('paint').map(e=>[e.name,Math.round(e.startTime)]),longTasks:lt,res:performance.getEntriesByType('resource').map(e=>[e.name.split('/').pop(),Math.round(e.startTime),Math.round(e.duration),e.transferSize]).slice(0,40),marks:performance.getEntriesByType('mark').map(e=>[e.name,Math.round(e.startTime)]),nav:(()=>{const n=performance.getEntriesByType('navigation')[0];return n?[Math.round(n.domContentLoadedEventEnd),Math.round(n.loadEventEnd)]:null})(),nodes:document.querySelectorAll('*').length,heapMB:Math.round(performance.memory.usedJSHeapSize/1e5)/10})})()`));
  results.push({ run, spawnToRowsMs: rowsMs, ...info });
  p.close(); child.kill(); killMine();
}
writeFileSync(path.join(root, 'build/perf', `startup-${process.env.STAGE_TAG ? process.env.STAGE_TAG + '-' : ''}${phone ? 'phone-' : ''}${label}.json`), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results.map((r) => ({ run: r.run, spawnToRowsMs: r.spawnToRowsMs, paint: r.paint, longTasks: r.longTasks, nodes: r.nodes, heapMB: r.heapMB }))));
