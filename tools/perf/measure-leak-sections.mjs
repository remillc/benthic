// SPDX-License-Identifier: GPL-2.0
// Performance audit: nodes, listeners and heap after 1, 5 and 20 narrow/wide cycles, one section per launch.
// usage: node tools/perf/measure-leak-sections.mjs <logbook.ssrf> <label> <section> [cycles=1,5,20]
//   section: logbook | sites | statistics | tools | settings
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run', section = 'logbook', marks = '1,5,20'] = process.argv.slice(2);
const checkpoints = marks.split(',').map(Number);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await p.send('HeapProfiler.enable');
await p.send('Runtime.enable');
const errors = [];
p.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); });
await sleep(3000);
const go = (name) => p.eval(`[...document.querySelectorAll('.od-nav-rail--item')].find(x=>x.getAttribute('href')==='#${name}')?.click()`);
if (section !== 'logbook') { await go(section); await sleep(800); }
if (section === 'logbook') { await p.eval(`document.querySelectorAll('.od-desktop-logbook--row')[3]?.click()`); await sleep(600); }
if (section === 'tools') { await p.eval(`document.querySelectorAll('.od-desktop-tools--list button')[2]?.click()`); await sleep(600); }
const state = () => p.eval(`JSON.stringify({ hash: location.hash, pages: document.querySelectorAll('.page').length, sel: document.querySelectorAll('.od-desktop-logbook--row[aria-selected=true],.od-desktop-logbook--row.selected').length, title: document.querySelector('.page-current h1')?.textContent })`);
const out = [];
const counters = async (step) => {
  await p.send('HeapProfiler.collectGarbage');
  await p.send('HeapProfiler.collectGarbage');
  const c = await p.send('Memory.getDOMCounters');
  const hu = await p.send('Runtime.getHeapUsage');
  out.push({ step, ...c, jsHeapMB: +(hu.usedSize / 1e6).toFixed(1), state: await state() });
};
await counters('start');
const narrow = async () => { await p.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(1000); };
const wide = async () => { await p.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(1000); };
for (let cycle = 1; cycle <= Math.max(...checkpoints); cycle++) {
  await narrow(); await wide();
  if (checkpoints.includes(cycle)) await counters(`${cycle} cycles`);
}
if (process.env.SNAP) {
  await p.send('HeapProfiler.collectGarbage');
  const chunks = [];
  p.on((m) => { if (m.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(m.params.chunk); });
  await p.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  writeFileSync(process.env.SNAP, chunks.join(''));
}
await p.send('Emulation.clearDeviceMetricsOverride');
if (process.env.PROBE) console.log('PROBE', JSON.stringify(await p.eval(process.env.PROBE)));
const result = { section, label, out, errors };
writeFileSync(path.join(root, 'build/perf', `leaks-${label}-${section}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
p.close(); child.kill(); killMine();
