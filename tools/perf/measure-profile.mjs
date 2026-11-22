// SPDX-License-Identifier: GPL-2.0
// Performance audit: the dive profile on long dives (gen-logbook.mjs <n> out 7 1 180: 10,800 samples at 1 s).
// Opens the first dives, measures getDive payload and duration, the profile's DOM, the render task, the cost of a
// hover move (pointermove) and a layer toggle.
// usage: node tools/perf/measure-profile.mjs <logbook.ssrf> <label> [--cpu=4]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'long'] = process.argv.slice(2);
const cpu = Number((process.argv.find((a) => a.startsWith('--cpu=')) || '--cpu=1').slice(6));
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/benthic';
const ud = path.join(root, 'build/perf', `ud-${label}`);
mkdirSync(ud, { recursive: true });
killMine();
await sleep(1500);
const env = { ...process.env, BC_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, BC_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, BC_STAGE: `${MAIN}/build/desktop/stage`, BC_USER_DATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await sleep(3000);
await p.eval(`(async()=>{const mod=await import('/@fs/${root.replace(/\\/g, '/')}/plugins/benthic-core/desktop.js');window.__calls=[];const proto=mod.BenthicCoreDesktop.prototype;proto.__orig=proto.core;
 proto.core=async function(method,args){const t=performance.now();let size=-1;try{const r=await proto.__orig.call(this,method,args);size=typeof r==='string'?r.length:JSON.stringify(r??null).length;return r}finally{window.__calls.push({method,resultBytes:size,ms:Math.round(performance.now()-t)})}};
 window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});
 window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)})})()`);
if (cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const R = { label, cpu };
await p.eval(`document.querySelectorAll('.bc-desktop-logbook--row')[1].click()`);
await sleep(4000);
R.getDive = await p.eval(`window.__calls.filter(c=>c.method==='getDive')`);
R.longTasksOnSelect = await p.eval('window.__lt');
R.profileDom = await p.eval(`(()=>{const s=document.querySelector('.bc-dive-profile svg')||document.querySelector('svg.bc-dive-profile');const paths=[...document.querySelectorAll('.bc-dive-profile path')].map(x=>x.getAttribute('d')?.length||0).sort((a,b)=>b-a);return {found:!!s,svgNodes:s?s.querySelectorAll('*').length:0,pathDLengths:paths.slice(0,6),pathCount:paths.length}})()`);
R.hover = await p.eval(`(async()=>{const s=document.querySelector('.bc-dive-profile svg')||document.querySelector('svg.bc-dive-profile');if(!s)return null;const r=s.getBoundingClientRect();const out=[];
 for(let i=0;i<40;i++){const a=performance.now();s.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+40+i*(r.width-80)/40,clientY:r.top+r.height/2,pointerType:'mouse',bubbles:true}));const sy=performance.now()-a;await window.__frames(1);out.push([Math.round(sy*10)/10,Math.round(performance.now()-a)])}
 const sync=out.map(o=>o[0]);const tot=out.map(o=>o[1]);return {syncAvgMs:+(sync.reduce((a,b)=>a+b,0)/sync.length).toFixed(1),frameAvgMs:+(tot.reduce((a,b)=>a+b,0)/tot.length).toFixed(1),frameMaxMs:Math.max(...tot)}})()`);
R.toggleLayer = await p.eval(`(async()=>{const b=[...document.querySelectorAll('.bc-dive-profile ~ * button, .bc-dive-detail button')].find(x=>/Temp|Gaz|Gas|ppO|Tissus|Tissues/.test(x.textContent));if(!b)return null;const a=performance.now();b.click();await window.__frames(2);return Math.round(performance.now()-a)})()`);
await p.shot(path.join(root, 'build/perf', `profile-${label}.png`));
writeFileSync(path.join(root, 'build/perf', `profile-${label}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R));
p.close(); child.kill(); killMine();
