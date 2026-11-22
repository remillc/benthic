// SPDX-License-Identifier: GPL-2.0
// Starts the desktop app (as staged by prepare.cjs), sets up the sample logbook without an
// account, and takes screenshots of the Carnet: the window, a hovered profile, two dives with
// the right-click menu. Used by the `desktop` workflow on a macOS runner, where nobody can look
// at the app. With BC_DUMP_MENU, main.cjs also writes the menu bar's items to menu.json.
//   node scripts/screenshots.mjs <output folder>
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.join(here, '..');
const out = path.resolve(process.argv[2] ?? 'screenshots');
fs.mkdirSync(out, { recursive: true });
const PORT = 9334;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const electron = path.join(desktop, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
// Never as plain Node: VS Code's terminals set ELECTRON_RUN_AS_NODE, and even empty it counts.
const env = { ...process.env, BC_DUMP_MENU: path.join(out, 'menu.json'), BC_USER_DATA: path.join(out, 'user-data') };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
  cwd: desktop,
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
});

/** The page's DevTools connection, once the window is up. */
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
        return ws;
      }
    } catch {
      // Not up yet.
    }
    await wait(1000);
  }
  throw new Error('the window did not open');
}

let ws = await connect();
let id = 0;
const pending = new Map();
const listen = () => (ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); });
listen();
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
/** A runner's screen is small and the window is cut to it: the page is laid out at 1440 x 900, as on a desktop. */
const desktopSize = () => send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('screenshot', name);
};
const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const centre = (selector, index = 0) =>
  run(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.getClientRects().length)[${index}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

try {
  await desktopSize();
  await wait(4000);
  await shot('01-first-launch');
  // « Commencer sans compte », then the sample logbook (the empty logbook's own start).
  await run(`[...document.querySelectorAll('a[href="#no-account"]')].find((e) => e.offsetParent)?.click()`);
  await wait(5000);
  await run(`window.Capacitor.Plugins.BenthicCore.importSample()`);
  await run('location.reload()');
  ws.close();
  await wait(4000);
  ws = await connect();
  listen();
  await desktopSize();
  for (let i = 0; i < 30 && !(await run(`document.querySelectorAll('.bc-desktop-logbook--row').length`)); i++) await wait(1000);
  await wait(2000);
  await shot('02-logbook');

  const svg = await centre('.bc-dive-profile--frame svg');
  if (svg) {
    await mouse('mouseMoved', svg.x, svg.y);
    await wait(500);
    await shot('03-profile-hover');
  }

  const first = await centre('.bc-desktop-logbook--row', 3);
  const second = await centre('.bc-desktop-logbook--row', 4);
  if (first && second) {
    await mouse('mousePressed', first.x, first.y);
    await mouse('mouseReleased', first.x, first.y);
    // ⌘-click on macOS (modifier 4), Ctrl-click elsewhere (2).
    const modifiers = process.platform === 'darwin' ? 4 : 2;
    await mouse('mousePressed', second.x, second.y, { modifiers });
    await mouse('mouseReleased', second.x, second.y, { modifiers });
    await wait(800);
    await mouse('mousePressed', second.x, second.y, { button: 'right' });
    await mouse('mouseReleased', second.x, second.y, { button: 'right' });
    await wait(800);
    await shot('04-selection-menu');
  }

  // The whole screen, with the system's menu bar (macOS only; may need the screen recording permission).
  if (process.platform === 'darwin') {
    try {
      execFileSync('screencapture', ['-x', path.join(out, '05-screen.png')]);
      console.log('screenshot 05-screen');
    } catch (e) {
      console.log('screencapture failed:', e.message);
    }
  }
} finally {
  // On Windows the app runs under a shell: end the whole tree, or the window stays open.
  if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
  else app.kill();
}
process.exit(0);
