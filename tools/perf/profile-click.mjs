// SPDX-License-Identifier: GPL-2.0
// Performance audit: CPU profile (CDP Profiler) of one action on the desktop logbook; prints the top self-time functions.
// usage: node tools/perf/profile-click.mjs <logbook.ssrf> <label> <select|search|nav-logbook>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run', action = 'select'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), '--remote-debugging-port=' + (process.env.CDP_PORT || 9391), path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await sleep(8000);
await p.send('Profiler.enable');
await p.send('Profiler.setSamplingInterval', { interval: 500 });
await p.eval(`document.querySelectorAll('.od-desktop-logbook--row')[3].click()`);
await sleep(4000);
await p.send('Profiler.start');
if (action === 'select') await p.eval(`document.querySelectorAll('.od-desktop-logbook--row')[8].click()`);
else if (action === 'search') await p.eval(`(()=>{const i=document.querySelector('.od-desktop-logbook--search input');i.value='c';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
else { await p.eval(`[...document.querySelectorAll('.od-nav-rail--item')].find(x=>x.getAttribute('href')==='#sites').click()`); await sleep(1500); await p.eval(`[...document.querySelectorAll('.od-nav-rail--item')].find(x=>x.getAttribute('href')==='#logbook').click()`); }
await sleep(6000);
const { profile } = await p.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000); });
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round(v)} ms  ${k}`);
console.log(action, 'total sampled ms', Math.round([...self.values()].reduce((a, b) => a + b, 0)));
console.log(top.join('\n'));
writeFileSync(path.join(root, 'build/perf', `cpuprofile-${label}-${action}.json`), JSON.stringify(profile));
p.close(); child.kill(); killMine();
