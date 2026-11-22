// SPDX-License-Identifier: GPL-2.0
// Performance audit: DOM growth over window-size changes (the adaptive layout swap) and section navigation.
// Memory.getDOMCounters after a forced GC: documents, nodes (all, detached included), listeners.
// usage: node tools/perf/measure-leak.mjs <logbook.ssrf> <label>   (reuses ud-<label> of measure-desktop.mjs)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/benthic';
killMine();
await sleep(1500);
const env = { ...process.env, BC_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, BC_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, BC_STAGE: `${MAIN}/build/desktop/stage`, BC_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await p.send('HeapProfiler.enable');
await sleep(3000);
const out = [];
const counters = async (step) => {
  await p.send('HeapProfiler.collectGarbage');
  await p.send('HeapProfiler.collectGarbage');
  const c = await p.send('Memory.getDOMCounters');
  const els = await p.eval(`document.querySelectorAll('*').length`);
  const m = await p.metrics();
  out.push({ step, elements: els, ...c, jsHeapMB: +(m.JSHeapUsedSize / 1e6).toFixed(1) });
};
await counters('start');
for (let cycle = 1; cycle <= 8; cycle++) {
  await p.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  if (cycle === 1 || cycle === 2 || cycle === 4 || cycle === 8) await counters(`after ${cycle} narrow/wide cycles`);
}
await p.send('Emulation.clearDeviceMetricsOverride');
writeFileSync(path.join(root, 'build/perf', `leak-${label}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
p.close(); child.kill(); killMine();
