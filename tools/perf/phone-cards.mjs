// SPDX-License-Identifier: GPL-2.0
// The phone logbook (task 2026-11-18-278): opens a .ssrf file logbook in the desktop app, emulates a phone
// (390x844), takes screenshots of the year cards, the trips folded and unfolded, a large text size, and counts
// the elements while scrolling.
// usage: CDP_PORT=9421 VITE_PORT=5401 node tools/perf/phone-cards.mjs <logbook.ssrf> <label> [fr|en] [outDir] [--feet] [--cpu=4]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [ssrf, label = 'run', lang = 'fr', outDir = 'build/perf/shots'] = args;
const cpu = Number((process.argv.find((a) => a.startsWith('--cpu=')) || '--cpu=1').slice(6));
const root = path.resolve(import.meta.dirname, '../..');
const ud = path.join(root, 'build/perf', `ud-${label}`);
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
const out = path.resolve(root, outDir);
mkdirSync(out, { recursive: true });
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5401}`, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9421}`, `--lang=${lang}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
const R = { label, lang, cpu };
const feet = process.argv.includes('--feet');
const dark = process.argv.includes('--dark');
if (feet) {
  // Units of this device: imperial (the Preferences plugin keeps them in localStorage in a browser).
  await p.eval(`localStorage.setItem('CapacitorStorage.od.corePrefs', JSON.stringify({ unitSystem: 'imperial' })); location.reload()`);
  await sleep(2500);
  for (let i = 0; i < 600; i++) { try { if (await p.eval(`!!document.querySelector('.od-desktop-logbook--row')`)) break; } catch { /* reloading */ } await sleep(200); }
}
if (dark) await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await p.send('Emulation.setTouchEmulationEnabled', { enabled: true });
if (cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await p.eval(`window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});
 window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)});`);
for (let i = 0; i < 600; i++) { if (await p.eval(`document.querySelectorAll('.od-dive-row').length>0`)) break; await sleep(100); }
await sleep(2500);
// The wide window opened the first dive beside the list; on a phone it covers the list: back to the list.
if (await p.eval(`!!document.querySelector('.od-logbook.page-previous')`)) { await p.eval(`document.querySelector('.page-current .navbar a.back')?.click()`); await sleep(1500); }
const scroller = `[...document.querySelectorAll('.page-current *')].find(e=>e.scrollHeight>e.clientHeight+300&&/auto|scroll/.test(getComputedStyle(e).overflowY))`;
const counts = () => p.eval(`JSON.stringify({elements:document.querySelectorAll('*').length,list:document.querySelector('.od-logbook--virtual-list')?.querySelectorAll('*').length,rows:document.querySelectorAll('.od-logbook--virtual-list li').length,height:${scroller}?.scrollHeight})`);
const shot = async (name) => { await sleep(500); await p.shot(path.join(out, `${label}-${lang}${feet ? '-ft' : ''}${dark ? '-dark' : ''}-${name}.png`)); };
const scrollTo = (y) => p.eval(`(()=>{const s=${scroller};s.scrollTop=${y};return s.scrollTop})()`);
R.initial = await counts();
await shot('1-top');
// Fold and unfold the first trip.
const hasTrip = await p.eval(`!!document.querySelector('.od-trip-row--expand')`);
if (hasTrip) {
  await p.eval(`${scroller}.scrollTop=1e6`);
  await shot('2-trip-folded');
  await p.eval(`document.querySelector('.od-trip-row--expand').click()`);
  await sleep(700);
  await p.eval(`${scroller}.scrollTop=1e6`);
  await shot('3-trip-unfolded');
  R.afterUnfold = await counts();
  await p.eval(`document.querySelector('.od-trip-row--expand').click()`);
  await sleep(500);
}
await scrollTo(0);
// Large text: every font size of the list doubled (what Android's 200 % text size does).
await scrollTo(0);
await p.eval(`(()=>{const all=[...document.querySelectorAll('.od-logbook--virtual-list *')].map((el)=>{const cs=getComputedStyle(el);return [el,parseFloat(cs.fontSize)*2,/px/.test(cs.lineHeight)?parseFloat(cs.lineHeight)*2:0]});for(const [el,f,l] of all){el.style.fontSize=f+'px';if(l)el.style.lineHeight=l+'px'}})()`);
await sleep(600);
await shot('4-font-200');
// Scroll to the end in screens: frames and long tasks.
await p.eval(`location.reload()`);
await sleep(4000);
for (let i = 0; i < 600; i++) { try { if (await p.eval(`document.querySelectorAll('.od-dive-row').length>0`)) break; } catch { /* reloading */ } await sleep(100); }
await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(2500);
await p.eval(`window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});
 window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)});`);
R.scroll = await p.eval(`(async()=>{const s=${scroller};if(!s)return null;const times=[];const max=s.scrollHeight;let n=0;const a=performance.now();while(s.scrollTop+s.clientHeight<max-5&&n<60){const t=performance.now();s.scrollTop+=s.clientHeight*0.8;await window.__frames(2);times.push(Math.round(performance.now()-t));n++;}return {screens:n,totalMs:Math.round(performance.now()-a),worstMs:Math.max(...times),medianMs:times.sort((x,y)=>x-y)[times.length>>1],height:s.scrollHeight}})()`);
R.afterScroll = await counts();
await shot('5-scrolled');
R.longTasks = await p.eval('window.__lt');
const m = await p.metrics();
R.layoutCount = m.LayoutCount; R.recalcStyle = m.RecalcStyleCount; R.jsHeapMB = +(m.JSHeapUsedSize / 1e6).toFixed(1);
writeFileSync(path.join(out, `${label}-${lang}${feet ? '-ft' : ''}${dark ? '-dark' : ''}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R));
await p.send('Emulation.clearDeviceMetricsOverride');
p.close();
child.kill();
killMine();
