// SPDX-License-Identifier: GPL-2.0
// Performance audit: start-up of the production build (vite build -> build/perf/stage-prod/web) in Electron.
// Times: spawn to the first logbook row, first (contentful) paint, long tasks during start-up, JS heap, DOM.
// usage: node tools/perf/measure-startup.mjs <logbook.ssrf> <label> [runs]   (reuses ud-<label>)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run', runsArg = '3'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
const results = [];
for (let run = 0; run < Number(runsArg); run++) {
  killMine();
  await sleep(1500);
  const env = { ...process.env, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: path.join(root, 'build/perf/stage-prod'), OD_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OD_DEV_URL;
  const t0 = Date.now();
  const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), '--remote-debugging-port=' + (process.env.CDP_PORT || 9391), path.resolve(ssrf)], { env, stdio: 'ignore' });
  const p = await attachLogbook();
  const rowsMs = Date.now() - t0;
  await sleep(2500);
  const info = JSON.parse(await p.eval(`(async()=>{const lt=await new Promise(r=>{const a=[];new PerformanceObserver(l=>{for(const e of l.getEntries())a.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true});setTimeout(()=>r(a),300)});
    return JSON.stringify({paint:performance.getEntriesByType('paint').map(e=>[e.name,Math.round(e.startTime)]),longTasks:lt,res:performance.getEntriesByType('resource').map(e=>[e.name.split('/').pop(),Math.round(e.startTime),Math.round(e.duration),e.transferSize]).slice(0,40),nodes:document.querySelectorAll('*').length,heapMB:Math.round(performance.memory.usedJSHeapSize/1e5)/10})})()`));
  results.push({ run, spawnToRowsMs: rowsMs, ...info });
  p.close(); child.kill(); killMine();
}
writeFileSync(path.join(root, 'build/perf', `startup-${label}.json`), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results.map((r) => ({ run: r.run, spawnToRowsMs: r.spawnToRowsMs, paint: r.paint, longTasks: r.longTasks, nodes: r.nodes, heapMB: r.heapMB }))));
