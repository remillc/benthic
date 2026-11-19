// SPDX-License-Identifier: GPL-2.0
// Performance audit: the core calls from a page reload to the first dive shown, then for two more clicks on a dive.
// The plugin's desktop.js is rewritten on its way to the page (CDP Fetch) so that the calls made before the page
// is ready are counted too.
// usage: node tools/perf/measure-mount.mjs <logbook.ssrf> <label>   (VITE_PORT, CDP_PORT as the other scripts)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const ud = path.join(root, 'build/perf', `ud-${label}`);
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: `http://localhost:${process.env.VITE_PORT || 5241}`, OD_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), '--remote-debugging-port=' + (process.env.CDP_PORT || 9391), path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await sleep(3000);

const hook = 'async core(method, args) {';
const logging = `${hook} (window.__calls ||= []).push({ method, bytes: JSON.stringify(args ?? {}).length, t: Math.round(performance.now()) });`;
await p.send('Fetch.enable', { patterns: [{ urlPattern: '*opendives-core/desktop.js*', requestStage: 'Response' }] });
p.on(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, responseStatusCode } = m.params;
  const { body, base64Encoded } = await p.send('Fetch.getResponseBody', { requestId });
  const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
  await p.send('Fetch.fulfillRequest', {
    requestId, responseCode: responseStatusCode,
    responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
    body: Buffer.from(text.replace(hook, logging)).toString('base64'),
  });
});
const summarise = async (name, R) => {
  const calls = (await p.eval('window.__calls || []'));
  await p.eval('window.__calls = []');
  const by = {};
  for (const c of calls) by[c.method] = (by[c.method] || 0) + 1;
  R[name] = { calls: calls.length, byMethod: by };
};
const R = { label };
await p.send('Page.reload');
await sleep(500);
const t0 = Date.now();
for (let i = 0; i < 300; i++) { try { if (await p.eval(`document.querySelectorAll('.od-desktop-logbook--row').length > 0`)) break; } catch { /* reloading */ } await sleep(100); }
R.rowsMs = Date.now() - t0;
await sleep(4000);
await summarise('reloadToRows', R);
R.detailShown = await p.eval(`!!document.querySelector('.od-desktop-edit-field')`);
const frames = `window.__frames=(n=2)=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)})`;
await p.eval(frames);
for (const [name, index] of [['click1', 3], ['click2', 4], ['click3', 5]]) {
  await p.eval(`(async()=>{document.querySelectorAll('.od-desktop-logbook--row')[${index}].click();await window.__frames(2)})()`);
  await sleep(1500);
  await summarise(name, R);
}
writeFileSync(path.join(root, 'build/perf', `mount-${process.env.PERF_TAG || 'run'}-${label}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R));
p.close();
child.kill();
killMine();
