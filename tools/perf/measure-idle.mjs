// SPDX-License-Identifier: GPL-2.0
// Performance audit: idle main-thread load of each window (battery) and running animations, production build.
// Uses a fresh data folder without a logbook file argument, so the first-launch screen shows; and the same with a logbook.
// usage: node tools/perf/measure-idle.mjs <logbook.ssrf> <label>
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Page, pages, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: path.join(root, 'build/perf/stage-prod'), OD_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE; delete env.OD_DEV_URL;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), '--remote-debugging-port=9391', path.resolve(ssrf)], { env, stdio: 'ignore' });
await sleep(20000);
const out = [];
const list = await pages();
for (let i = 0; i < list.length; i++) {
  const p = await Page.attach(i);
  await p.send('Performance.enable');
  const kind = await p.eval(`document.querySelector('.od-desktop-logbook--row') ? 'logbook' : (document.querySelector('.od-welcome-start') ? 'first-launch' : 'other')`);
  const a = await p.metrics();
  await sleep(5000);
  const b = await p.metrics();
  const anims = await p.eval(`JSON.stringify(document.getAnimations().map(x=>({name:x.animationName||x.constructor.name,state:x.playState,infinite:x.effect?.getComputedTiming().iterations===Infinity})).filter(x=>x.state==='running'))`);
  out.push({ window: i, kind, mainThreadBusyPct: +(((b.TaskDuration - a.TaskDuration) / 5) * 100).toFixed(1), scriptPct: +(((b.ScriptDuration - a.ScriptDuration) / 5) * 100).toFixed(1), layoutsIn5s: b.LayoutCount - a.LayoutCount, styleRecalcIn5s: b.RecalcStyleCount - a.RecalcStyleCount, runningAnimations: JSON.parse(anims) });
  p.close();
}
console.log(JSON.stringify(out));
child.kill(); killMine();
