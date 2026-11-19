// SPDX-License-Identifier: GPL-2.0
// Walks the production build (build/perf/<STAGE>) in Electron: the sections, a dive and its tabs, the tools, the settings,
// the editor, in the wide and the phone layout, and reports console errors and unhandled exceptions.
// usage: STAGE=stage-after LANG_TAG=en-US node tools/perf/verify-lazy.mjs <logbook.ssrf> <label>   (CDP_PORT)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, OD_STAGE: path.join(root, 'build/perf', process.env.STAGE || 'stage-prod'), OD_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE;
delete env.OD_DEV_URL;
const args = [path.join(root, 'desktop'), '--remote-debugging-port=' + (process.env.CDP_PORT || 9391)];
if (process.env.LANG_TAG) args.push('--lang=' + process.env.LANG_TAG);
args.push(path.resolve(ssrf));
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, args, { env, stdio: 'ignore' });
const p = await attachLogbook();
await p.send('Runtime.enable');
await p.send('Log.enable');
const problems = [];
p.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text.slice(0, 160) + ' ' + (m.params.entry.url || ''));
});
await sleep(2500);
const steps = [];
const step = async (name, js, wait = 900) => {
  let result;
  try { result = await p.eval(`(async()=>{${js}})()`); } catch (e) { result = 'ERROR ' + e.message.slice(0, 120); }
  await sleep(wait);
  steps.push([name, result]);
};
const nav = (href) => `const a=[...document.querySelectorAll('.od-nav-rail--item')].find(x=>x.getAttribute('href')==='#${href}');if(!a)return 'no link ${href}';a.click();return 'ok'`;
const count = (sel) => `return document.querySelectorAll('${sel}').length`;
const lang = await p.eval('document.documentElement.lang');
steps.push(['language', lang]);
await step('rows', count('.od-desktop-logbook--row'));
await step('select a dive', `document.querySelectorAll('.od-desktop-logbook--row')[3].click();return 'ok'`, 1500);
for (const tab of ['equipment', 'gas', 'notes', 'map', 'info']) await step('tab ' + tab, `const b=document.querySelector('[data-tab="${tab}"]');if(!b)return 'no tab';b.click();return document.querySelectorAll('.od-desktop-edit-field').length`, 1200);
for (const s of ['sites', 'statistics', 'tools']) await step('section ' + s, nav(s) + `;`, 2500);
await step('tools: tool buttons', `const items=[...document.querySelectorAll('.od-desktop-tools--row')];let n=0;for(const b of items){b.click();await new Promise(r=>setTimeout(r,700));n++}return n+' tools clicked, '+document.querySelectorAll('.od-desktop-tools--pane *').length+' nodes'`, 800);
await step('section logbook', nav('logbook'), 1500);
await step('detail: plan from this dive (lazy page)', `document.querySelectorAll('.od-desktop-logbook--row')[3].click();await new Promise(r=>setTimeout(r,1200));const b=document.querySelector('.od-dive-detail--desk-action');if(!b)return 'no button';b.click();await new Promise(r=>setTimeout(r,3000));return [...document.querySelectorAll('.page')].map((p)=>p.className.split(' ').filter((c)=>c.startsWith('od-')).join('.')).join(',')`, 500);
await step('section settings', `const a=[...document.querySelectorAll('.od-nav-rail--item, .od-nav-rail a, button')].find(x=>/settings|réglages/i.test((x.getAttribute('href')||'')+x.textContent));if(!a)return 'no settings';a.click();return 'ok'`, 2500);
await step('settings page', count('.od-desktop-settings, .od-settings'));
await step('back to logbook', nav('logbook'), 1500);
// Phone layout
await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await p.send('Emulation.setTouchEmulationEnabled', { enabled: true });
await p.send('Page.reload');
await sleep(500);
for (let i = 0; i < 100; i++) { try { if (await p.eval(`document.querySelectorAll('.od-dive-row, .od-trip-row').length>0`)) break; } catch {} await sleep(150); }
await sleep(1500);
await step('phone rows', count('.od-dive-row, .od-trip-row'));
await step('phone: open a trip', `const t=document.querySelector('.od-trip-row');if(!t)return 'no trip';t.click();return 'ok'`, 1200);
await step('phone: open a dive', `const r=document.querySelector('.od-dive-row');if(!r)return 'no row';r.click();return 'ok'`, 2500);
await step('phone: dive page', count('.od-dive-detail'));
await step('phone: edit', `const l=document.querySelector('a[href$="/edit"]');if(!l)return 'no edit link';l.click();return 'ok'`, 2500);
await step('phone: editor page', count('.od-edit-dive, .page-current'));
await step('phone: back', `history.back();return 'ok'`, 1000);
const out = { label, lang, steps, problems: [...new Set(problems)] };
console.log(JSON.stringify(out, null, 1));
p.close(); child.kill(); killMine();
