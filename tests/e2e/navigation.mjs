// SPDX-License-Identifier: GPL-2.0
// Navigation e2e in a real browser (Chromium headless, driven through the DevTools protocol, no dependency).
//
//   node tests/e2e/navigation.mjs [--tablet-only|--phone-only|--gestures-only|--regressions-only|--monkey-only|--export-only|--computer-photo-only|--units-only|--profile-insets-only|--gear-add-only|--gear-type-dialog-only|--profile-layers-only|--certs-fab-only|--cert-agencies-only|--settings-computers-only|--no-monkey] [--keep]
//
// It starts the app's development server (app/vite.e2e.config.js, port OD_E2E_PORT, default 5541) and opens the
// app at 390x844 (phone, Material look) and at 1280x800 (tablet), with the sample logbook of the core. After each
// step, once the transitions are over, it checks the invariants of the page stack of the view on screen:
//   - exactly one page is current (the tablet's list and detail: the list plus the detail);
//   - the current page's own route is the router's current route and the last entry of its history;
//   - no page waits as page-next, no page keeps a transform, the view keeps no router-transition class and none of
//     the dive page's swipe classes (bc-pushing).
// The flows try to break the stack: Back tapped twice, Back during the opening animation, Back in the middle of the
// dive page's side-by-side swipe, Back after the account sheet, the Android Back key, Back right after a save.
//
// The core: the real one (benthic-host) holding Subsurface's sample log, reached through a stand-in of the
// desktop bridge (the browser has no plugin). Set OPENDIVES_HOST to the host binary, or build it for the desktop
// (desktop/README.md); without it the suite stops with exit code 2 and says why. Chrome: set CHROME to its path
// when it is not in a usual place. Never uses the ports 5180, 9333, 8080 and 3443.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monkeyFlows } from './navigation-monkey.mjs';
import { gestureFlows } from './navigation-gestures.mjs';
import { regressionFlows } from './navigation-regressions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.OD_E2E_PORT || 5541);
const args = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- What it needs -----------------------------------------------------------------------------------------------

function findFirst(candidates) {
  return candidates.find((p) => p && existsSync(p)) ?? '';
}
function findChrome() {
  const local = process.env.LOCALAPPDATA || '';
  const playwright = [path.join(local, 'ms-playwright'), path.join(process.env.HOME || '', '.cache', 'ms-playwright')]
    .filter(existsSync)
    .flatMap((d) => readdirSync(d).filter((n) => /^chromium-\d+$/.test(n)).map((n) => path.join(d, n, 'chrome-win', 'chrome.exe')));
  return findFirst([
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    ...playwright,
  ]);
}
function findHost() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  return findFirst([
    process.env.OPENDIVES_HOST,
    path.join(root, 'build/desktop/stage/bin', `benthic-host${exe}`),
    path.join(root, 'build/desktop/win-x64/bin', `benthic-host${exe}`),
    path.join(root, 'build/desktop/benthic-host'),
    'F:/projets/OpenDives/build/desktop/stage/bin/benthic-host.exe',
    'F:/projets/OpenDives/build/desktop/stage/bin/opendives-host.exe', // before the main folder is rebuilt after the rename
  ]);
}
const chromePath = findChrome();
const hostPath = findHost();
const stage = findFirst([process.env.OPENDIVES_STAGE, path.join(root, 'build/desktop/stage'), 'F:/projets/OpenDives/build/desktop/stage']);
const sample = findFirst([path.join(root, 'core/sample/SampleLogbook.ssrf'), path.join(stage || '', 'SampleDivesV2.ssrf')]);
if (!chromePath || !hostPath || !sample) {
  console.log(`navigation e2e skipped: ${!chromePath ? 'no Chrome (set CHROME)' : !hostPath ? 'no core host (set OPENDIVES_HOST)' : 'no sample log'}`);
  process.exit(2);
}

// --- Processes ---------------------------------------------------------------------------------------------------

const work = mkdtempSync(path.join(tmpdir(), 'od-nav-'));
const home = path.join(work, 'home');
const temp = path.join(work, 'temp');
mkdirSync(home, { recursive: true });
mkdirSync(temp, { recursive: true });
/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
function cleanup() {
  for (const c of children) {
    try {
      if (process.platform === 'win32' && c.pid) spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore' });
      else c.kill();
    } catch {}
  }
  if (!args.has('--keep')) setTimeout(() => { try { rmSync(work, { recursive: true, force: true }); } catch {} }, 1500);
}
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

// The core's helper, one JSON object per line over stdio (desktop/bridge.cjs).
const host = spawn(hostPath, [], { stdio: ['pipe', 'pipe', 'ignore'] });
children.push(host);
const pending = new Map();
let nextId = 1;
createInterface({ input: host.stdout }).on('line', (line) => {
  try {
    const m = JSON.parse(line);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error !== undefined) p.reject(new Error(m.error));
    else p.resolve(m.result);
  } catch {}
});
const core = (method, a) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  host.stdin.write(`${JSON.stringify({ id, method, args: a })}\n`);
});
await core('init', { home });
if (stage) await core('setXsltDir', { dir: path.join(stage, 'xslt') }).catch(() => {});
// A few dives with other buddies and guides: the people fields then list several values (the tallest suggestion list).
const seeded = path.join(work, 'sample-people.ssrf');
{
  let n = 0;
  const names = ['Bea', 'Cal', 'Dan', 'Eli', 'Fay', 'Gus'];
  writeFileSync(
    seeded,
    readFileSync(sample, 'utf8').replace(/<buddy>Alex<\/buddy>/g, (m) => (n < names.length ? `<buddy>${names[n]}</buddy>
  <divemaster>${names[n++]} Guide</divemaster>` : m)),
  );
}
await core('importFile', { source: seeded, repo: `${path.join(home, 'carnet')}[main]` });

// The app's development server.
const vite = spawn(process.execPath, [path.join(root, 'app/node_modules/vite/bin/vite.js'), '--config', 'vite.e2e.config.js'], {
  cwd: path.join(root, 'app'),
  env: { ...process.env, OD_E2E_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(vite);
let viteOut = '';
vite.stdout.on('data', (d) => (viteOut += d));
vite.stderr.on('data', (d) => (viteOut += d));
const viteUp = () => /127\.0\.0\.1:\S*\d+/.test(viteOut.replace(/\[[0-9;]*m/g, ''));
for (let i = 0; i < 150 && !viteUp(); i++) await sleep(200);
if (!viteUp()) {
  console.log('the development server did not start:\n' + viteOut);
  process.exit(1);
}

// Chrome, headless, with a remote debugging port it picks itself.
const profile = path.join(work, 'chrome');
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
children.push(chrome);
let wsBase = '';
for (let i = 0; i < 100 && !wsBase; i++) {
  await sleep(200);
  try {
    const [port] = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
    wsBase = `http://127.0.0.1:${port}`;
  } catch {}
}
if (!wsBase) {
  console.log('Chrome did not start');
  process.exit(1);
}

// --- A page driven through the DevTools protocol ---------------------------------------------------------------

class Tab {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    this.logs = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiting.has(m.id)) {
        const w = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        if (m.error) w.reject(new Error(m.error.message));
        else w.resolve(m.result);
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        this.logs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (m.method === 'Runtime.exceptionThrown') {
        this.logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
      } else if (m.method === 'Runtime.bindingCalled') {
        this.onBinding?.(m.params.name, m.params.payload);
      } else this.onEvent?.(m);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  /** Runs `fn(...args)` in the page; resolves with its (JSON) value. */
  async run(fn, ...fnArgs) {
    const expression = `(${fn.toString()})(...${JSON.stringify(fnArgs)})`;
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async touch(type, x, y) {
    await this.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  }
  /** A tap at the centre of the first visible element that `find` returns the box of. */
  async tapAt(x, y) {
    await this.touch('touchStart', x, y);
    await sleep(30);
    await this.touch('touchEnd', x, y);
  }
  async swipe(x0, x1, y, steps = 8) {
    await this.touch('touchStart', x0, y);
    for (let i = 1; i <= steps; i++) {
      await this.touch('touchMove', x0 + ((x1 - x0) * i) / steps, y);
      await sleep(16);
    }
    await this.touch('touchEnd', x1, y);
  }
}

/** `opts`: `theme` (md or ios; else OD_THEME), `reducedMotion` (« Remove animations »), `throttle` (a slower processor; else OD_THROTTLE). */
async function openTab(width, height, mobile, welcome = false, desktop = false, opts = {}) {
  const target = await (await fetch(`${wsBase}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const tab = new Tab(ws);
  tab.targetId = target.id;
  await tab.send('Runtime.enable');
  await tab.send('Page.enable');
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
  const throttle = Number(opts.throttle || process.env.OD_THROTTLE || 0);
  if (throttle) await tab.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  if (opts.reducedMotion) await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await tab.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  // The stand-in of the desktop bridge: the core through this process, files in the work folder, nothing else.
  await tab.send('Runtime.addBinding', { name: '__odCall' });
  tab.onBinding = async (name, payload) => {
    if (name !== '__odCall') return;
    const { token, kind, method, a } = JSON.parse(payload);
    let reply;
    try {
      // The sample logbook has no cloud account: the host answers « Cloud account not configured » to the cached cloud read
      // the app makes at start, and the error report sheet (task #102) opens over the page and takes the taps. The stand-in
      // answers « nothing cached » instead, as the app's own start does without an account.
      if (kind === 'core' && method === 'cloudListCachedDives') reply = { ok: true, v: '' };
      else if (kind === 'core') reply = { ok: true, v: await core(method, a) };
      else if (method === 'writeFile') {
        const p = path.join(temp, a.area, path.basename(a.name));
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, Buffer.from(a.base64, 'base64'));
        reply = { ok: true, v: { path: p } };
      } else if (method === 'exists') reply = { ok: true, v: existsSync(a.path) };
      else if (method === 'readDevEnv') reply = { ok: true, v: '' };
      else reply = { ok: true, v: null };
    } catch (e) {
      reply = { ok: false, e: String(e.message) };
    }
    tab.run((t, r) => window.__odAnswer(t, r), token, reply).catch(() => {});
  };
  await tab.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${function (home, temp, stage, welcome) {
      // The very first start (no value) shows the first launch; otherwise the logbook.
      if (welcome) {
        localStorage.removeItem('CapacitorStorage.od.welcomeBeta');
        localStorage.removeItem('CapacitorStorage.od.welcome');
      } else {
        localStorage.setItem('CapacitorStorage.od.welcomeBeta', 'done');
        localStorage.setItem('CapacitorStorage.od.welcome', 'done');
      }
      // The hardware Back flow ends on App.minimizeApp, which a browser does not implement: that error is queued as a report
      // (task #102) and would be offered over the next tab. Each tab starts with no report waiting.
      localStorage.removeItem('CapacitorStorage.od.errorReports');
      const answers = new Map();
      let n = 0;
      window.__odAnswer = (token, reply) => answers.get(token)?.(reply);
      const call = (kind, method, a) => new Promise((resolve, reject) => {
        const token = ++n;
        answers.set(token, (r) => (answers.delete(token), r.ok ? resolve(r.v) : reject(new Error(r.e))));
        window.__odCall(JSON.stringify({ token, kind, method, a }));
      });
      window.odDesktop = {
        platform: 'win32',
        logbook: { id: 'main', kind: 'main', name: '', location: '' },
        paths: { userData: home, temp, resourcesDir: stage, xsltDir: `${stage}/xslt`, caFile: `${temp}/ca.pem` },
        core: (m, a) => call('core', m, a),
        onCoreEvent: () => () => {},
        credentials: { get: async () => null, set: async () => {}, clear: async () => {} },
        // The recent logbooks (the desktop layout reads them at start): none, as on a first run.
        logbooks: { recent: async () => [], exists: async () => ({}), forget: async () => [], clearRecent: async () => [] },
        fs: new Proxy({}, { get: (_, op) => (o) => call('fs', op, o) }),
      };
    }})(${JSON.stringify(home)}, ${JSON.stringify(temp)}, ${JSON.stringify(stage || path.dirname(sample))}, ${JSON.stringify(welcome)})`,
  });
  await tab.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?theme=${opts.theme || process.env.OD_THEME || 'md'}${desktop ? '&desktop=1' : ''}` });
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    if (await tab.run((w) => !!document.querySelector(w ? '.bc-welcome.modal-in .bc-first-launch, .bc-welcome.modal-in' : 'a[href^="/dives/"]'), welcome).catch(() => false)) break;
  }
  await sleep(500);
  return tab;
}

// --- The invariants ----------------------------------------------------------------------------------------------

/** Read in the page: the state of the view on screen. */
function readStack() {
  const view = document.querySelector('.views .tab-active.view, .views > .view.tab-active') || document.querySelector('.view-main');
  const router = view?.f7View?.router;
  const pages = [...view.querySelectorAll(':scope > .page')].map((p) => ({
    cls: p.className,
    route: p.f7Page?.route?.url ?? '',
    transform: getComputedStyle(p).transform,
  }));
  return {
    view: view.className,
    current: router?.currentRoute?.url ?? '',
    history: router?.history ?? [],
    allow: router?.allowPageChange,
    locks: router?.odLocks ?? 0,
    pages,
  };
}

const failures = [];
let checks = 0;

/** Waits for the transitions to be over, then checks the stack. @param {Tab} tab @param {string} label @param {{ split?: boolean, route?: string|RegExp }} [o] */
async function settled(tab, label, o = {}) {
  let stack;
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    stack = await tab.run(readStack);
    // A swipe that follows the finger holds the router until its release animation has ended (lib/router-guard.js).
    if (!/router-transition|bc-pushing|bc-push-settle/.test(stack.view) && stack.allow !== false && !stack.locks) break;
  }
  const problems = [];
  if (stack.locks) problems.push(`the router is still held (${stack.locks})`);
  const cur = stack.pages.filter((p) => /\bpage-current\b/.test(p.cls));
  if (/router-transition|bc-pushing|bc-push-settle/.test(stack.view)) problems.push(`the view keeps ${stack.view.replace(/view\s+|tab\S*\s*/g, '').trim()}`);
  if (!o.split && cur.length !== 1) problems.push(`${cur.length} current pages`);
  if (o.split && (cur.length < 1 || cur.length > 2)) problems.push(`${cur.length} current pages (list and detail)`);
  const top = cur[cur.length - 1];
  const route = (u) => u.replace(/\?.*$/, '');
  if (top && route(top.route) !== route(stack.current)) problems.push(`the current page is ${top.route}, the router says ${stack.current}`);
  const last = stack.history[stack.history.length - 1] ?? '';
  if (route(last) !== route(stack.current)) problems.push(`the history ends on ${last}, the router says ${stack.current}`);
  for (const p of stack.pages) {
    if (/\bpage-next\b/.test(p.cls)) problems.push(`${p.route} waits as page-next`);
    if (/\bpage-current\b/.test(p.cls) && p.transform !== 'none') problems.push(`the current page ${p.route} keeps a transform`);
    if (/bc-push-from/.test(p.cls)) problems.push(`${p.route} keeps bc-push-from`);
  }
  if (o.route && !(o.route instanceof RegExp ? o.route.test(stack.current) : route(stack.current) === o.route)) problems.push(`expected ${o.route}, on ${stack.current}`);
  checks++;
  if (problems.length) {
    failures.push({ label, problems, stack });
    console.log(`  FAIL ${label}: ${problems.join('; ')}`);
  } else console.log(`  ok   ${label}`);
}

// --- Actions -----------------------------------------------------------------------------------------------------

/** The page-current's elements as boxes, found by a test run in the page. */
const boxOf = (tab, finder, ...a) => tab.run(finder, ...a);

/** Taps the first element whose text or label matches. @param {Tab} tab @param {string} pattern @param {string} [scope] */
async function tapText(tab, pattern, scope = '.page-current') {
  const box = await boxOf(
    tab,
    (pattern, scope) => {
      const re = new RegExp(pattern);
      const roots = [...document.querySelectorAll(scope)].filter((r) => r.getClientRects().length);
      for (const rootEl of roots) {
        for (const el of rootEl.querySelectorAll('a, button, [role=button], li, .tab-link')) {
          if (!re.test((el.getAttribute('aria-label') || '').trim()) && !re.test(el.textContent.trim())) continue;
          const r = el.getBoundingClientRect();
          if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    },
    pattern,
    scope,
  );
  if (!box) throw new Error(`nothing to tap for /${pattern}/ in ${scope}`);
  await tab.tapAt(box.x, box.y);
}
/** Taps Back until the logbook shows (at most four times); each state met is checked. */
async function toLogbook(tab, label) {
  for (let i = 0; i < 4 && (await tab.run(readStack)).current.replace(/\?.*$/, '') !== '/'; i++) {
    await tapBack(tab).catch(() => {});
    await settled(tab, `${label}: Back ${i + 1}`);
  }
  await settled(tab, `${label}: logbook`, { route: '/' });
}
const tapBack = (tab) => tapText(tab, '^\\s*(Retour|Back)|Retour au carnet|detail.back|icon-back', '.page-current .navbar, .page-current');
const tapDive = async (tab) => {
  const box = await tab.run(() => {
    const a = document.querySelector('.page-current a[href^="/dives/"], .page-master a[href^="/dives/"]');
    const r = a?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
  });
  if (!box) throw new Error('no dive row');
  await tab.tapAt(box.x, box.y);
};
/** The Android Back key: the app's listener of the Capacitor App plugin, as the native side calls it. */
const hardwareBack = async (tab) => {
  await tab.run(() => window.dispatchEvent(new Event('od:back')));
  await sleep(60);
};

/** With OD_SHOTS=<folder>: a screenshot of the page, for a visual check against the mock-ups. */
async function shot(tab, name) {
  const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(process.env.OD_SHOTS, { recursive: true });
  writeFileSync(path.join(process.env.OD_SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}

// --- Flows -------------------------------------------------------------------------------------------------------

async function phoneFlows() {
  console.log('Phone, 390x844, Material look');
  let tab = await openTab(390, 844, true);
  await settled(tab, 'logbook at start', { route: '/' });

  console.log(' selection toolbar above the bottom bar');
  for (const demo of [false, true]) {
    await tab.run((on) => document.documentElement.classList.toggle('bc-demo-bottom-on', on), demo);
    const row = await tab.run(() => {
      const r = document.querySelector('.page-current a.bc-dive-row--link')?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
    });
    if (!row) throw new Error('no dive row');
    await tab.touch('touchStart', row.x, row.y);
    await sleep(900);
    await tab.touch('touchEnd', row.x, row.y);
    await sleep(900);
    if (process.env.OD_SHOTS) await shot(tab, `selection-toolbar${demo ? '-demo' : ''}`);
    const g = await tab.run(() => {
      const t = document.querySelector('.bc-floating-toolbar')?.getBoundingClientRect();
      const b = document.querySelector('.bc-navigation-bar')?.getBoundingClientRect();
      return { toolbar: t ? t.bottom : null, bar: b ? b.top : null };
    });
    checks++;
    if (g.toolbar === null || g.bar === null || g.toolbar > g.bar) failures.push({ label: `selection toolbar (banner ${demo})`, problems: [`toolbar bottom ${g.toolbar}, bottom bar top ${g.bar}`] });
    else console.log(`  ok   toolbar bottom ${Math.round(g.toolbar)} <= bar top ${Math.round(g.bar)} (banner ${demo})`);
    await hardwareBack(tab);
    await sleep(500);
  }
  await tab.run(() => document.documentElement.classList.remove('bc-demo-bottom-on'));
  await settled(tab, 'after the selection', { route: '/' });

  console.log(' logbook > dive > back');
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  await tapBack(tab);
  await settled(tab, 'back to the logbook', { route: '/' });

  console.log(' rapid double Back taps');
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  await tapBack(tab);
  await sleep(40);
  await tapBack(tab).catch(() => {});
  await settled(tab, 'after two Back taps', { route: '/' });

  console.log(' Back during the opening animation');
  await tapDive(tab);
  await sleep(80);
  await tapBack(tab).catch(() => {});
  await settled(tab, 'after Back during the opening');
  await toLogbook(tab, 'after Back during the opening');

  console.log(' dive > edit > save');
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  const diveRoute = (await tab.run(readStack)).current;
  await tapText(tab, '^\\s*(Modifier|Edit)\\s*$');
  await settled(tab, 'edit opened', { route: /\/edit$/ });
  await tapText(tab, '^\\s*(Enregistrer|Save)\\s*$');
  await settled(tab, 'after Save', { route: diveRoute });
  await tapBack(tab);
  await settled(tab, 'back after Save', { route: '/' });

  // Dive validation by signature (task 2026-11-19-309, point 2; OpenDives+): « Faire signer » of the dive's Validations
  // section, the choice, the signature drawn with the finger, « Signer »; the dive shows the validation, the logbook marks
  // the dive, and the validation can be removed. The stack stays sound at every step.
  console.log(' dive > validate by signature > Back');
  await tapDive(tab);
  await settled(tab, 'validation: dive opened', { route: /^\/dives\/\d+$/ });
  const validated = (await tab.run(readStack)).current;
  await tab.run(() => window.__odplusAccount({ signedIn: true, subscribed: true, email: 'diver@opendives.test' }));
  await sleep(800);
  await tapText(tab, '^\\s*(Faire signer|Get it signed)\\s*$');
  await settled(tab, 'validation: choice opened', { route: /^\/validate(\?.*)?$/ });
  await tapText(tab, 'Signature sur cet écran|Signature on this screen');
  await sleep(300);
  await tab.run(() => {
    const field = document.querySelector('.page-current .bc-validate--fields input');
    field.value = 'Marc Gagnon';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const pad = await tab.run(() => {
    const r = document.querySelector('.page-current canvas.bc-signature-pad').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await tab.touch('touchStart', pad.x + pad.w * 0.2, pad.y + pad.h * 0.6);
  for (let i = 1; i <= 8; i++) {
    await tab.touch('touchMove', pad.x + pad.w * (0.2 + 0.075 * i), pad.y + pad.h * (0.6 - 0.3 * Math.sin(i / 2)));
    await sleep(16);
  }
  // The finger rests before it is lifted. Lifted while moving, the stroke ends as a fling, and the browser takes the tap
  // that follows within a moment for « stop the fling »: it sends the touch to « Signer » but no click (seen on
  // 19 November 2026: the page stayed on /validate because the button was never clicked, not because Back failed).
  await sleep(300);
  await tab.touch('touchEnd', pad.x + pad.w * 0.8, pad.y + pad.h * 0.5);
  await sleep(200);
  const enabled = await tab.run(() => ![...document.querySelectorAll('.page-current .navbar a')].some((a) => /Signer|Sign/.test(a.textContent) && a.classList.contains('disabled')));
  checks++;
  if (!enabled) failures.push({ label: 'validation: Signer enabled', problems: ['« Signer » stays disabled after a name and a signature'] });
  if (process.env.OD_SHOTS) await shot(tab, 'validation-signature');
  await tapText(tab, '^\\s*(Signer|Sign)\\s*$', '.page-current .navbar');
  for (let i = 0; i < 60 && (await tab.run(readStack)).current !== validated; i++) await sleep(100);
  await settled(tab, 'validation: back on the dive', { route: validated });
  const shown = await tab.run(() => ({
    text: document.querySelector('.page-current .bc-dive-validations')?.textContent ?? '',
    signature: !!document.querySelector('.page-current .bc-dive-validations--signature'),
  }));
  checks++;
  if (!/Marc Gagnon/.test(shown.text) || !shown.signature) failures.push({ label: 'validation: section', problems: ['the Validations section shows "' + shown.text.slice(0, 80) + '", signature ' + shown.signature] });
  if (process.env.OD_SHOTS) await shot(tab, 'validation-detail');
  await tapBack(tab);
  await settled(tab, 'validation: back to the logbook', { route: '/' });
  const marked = await tab.run(() => !!document.querySelector('.page-current .bc-dive-row--validated'));
  checks++;
  if (!marked) failures.push({ label: 'validation: mark', problems: ['no mark on the validated dive in the logbook list'] });
  await tapDive(tab);
  await settled(tab, 'validation: dive reopened', { route: /^\/dives\/\d+$/ });
  await tapText(tab, 'Retirer la validation|Remove the validation');
  await sleep(500);
  await tapText(tab, '^\\s*(Retirer|Remove)\\s*$', '.dialog');
  await sleep(500);
  const gone = await tab.run(() => !document.querySelector('.page-current .bc-dive-validations--item'));
  checks++;
  if (!gone) failures.push({ label: 'validation: removed', problems: ['the validation is still listed after « Retirer »'] });
  await tapBack(tab);
  await settled(tab, 'validation: back after removing', { route: '/' });
  // The « Validation retirée » message covers the dive's toolbar: wait for it to go before the next flow.
  for (let i = 0; i < 100 && (await tab.run(() => !!document.querySelector('.toast'))); i++) await sleep(100);
  await sleep(300);
  // Back to a free, signed-out account: the flows below test the account sheet and the offer of that case.
  await tab.run(() => window.__odplusAccount({ signedIn: false, subscribed: false }));
  await sleep(300);

  // The reported regression: a dive, Edit, a field changed, Save, then Back (arrow, Android Back key, edge swipe), with the
  // « Dive saved / Undo » message on screen. The stack must be sound, and Back again must reach the logbook.
  for (const how of ['arrow', 'hardware']) {
    console.log(` dive > edit > change a field > save > Back (${how})`);
    await tapDive(tab);
    await settled(tab, `${how}: dive opened`, { route: /^\/dives\/\d+$/ });
    const route = (await tab.run(readStack)).current;
    await tapText(tab, '^\s*(Modifier|Edit)\s*$');
    await settled(tab, `${how}: edit opened`, { route: /\/edit$/ });
    await tab.run(() => {
      const field = document.querySelector('.page-current textarea');
      field.value = `navigation test ${Date.now()}`;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(150);
    await tapText(tab, '^\s*(Enregistrer|Save)\s*$');
    for (let i = 0; i < 100 && (await tab.run(readStack)).current.endsWith('/edit'); i++) await sleep(100);
    await settled(tab, `${how}: after Save`, { route });
    const toast = await tab.run(() => !!document.querySelector('.toast.bc-undo-toast'));
    checks++;
    if (!toast) failures.push({ label: `${how}: Undo message`, problems: ['no Undo message after the save'] });
    if (how === 'arrow') await tapBack(tab);
    else await hardwareBack(tab);
    await settled(tab, `${how}: back after Save`, { route: '/' });
    // Back must not have stacked anything: the logbook is the only page and its history holds one entry.
    const after = await tab.run(readStack);
    checks++;
    if (after.history.length !== 1) failures.push({ label: `${how}: history`, problems: [`history after Back is ${JSON.stringify(after.history)}`] });
    for (let i = 0; i < 100 && (await tab.run(() => !!document.querySelector('.toast'))); i++) await sleep(100);
    await sleep(300);
  }

  // Second reported regression: the account avatar's sheet, Réglages, then Back (arrow, Android Back key, edge swipe), then Back again.
  for (const how of ['arrow', 'hardware', 'edge swipe']) {
    console.log(` avatar sheet > Settings > Back (${how})`);
    await settled(tab, `${how}: logbook before the sheet`, { route: '/' });
    await tab.run(() => document.querySelector('.page-current .bc-account-avatar, .bc-account-avatar')?.click());
    await sleep(700);
    await tab.run(() => [...document.querySelectorAll('.bc-account-sheet a, .bc-account-sheet button')].find((el) => el.getAttribute('href') === '#settings' || el.getAttribute('data-row') === 'settings' || /^\s*(Réglages|Settings)\s*$/.test(el.textContent))?.click());
    await settled(tab, `${how}: Settings opened`, { route: '/settings/' });
    if (how === 'arrow') await tapBack(tab);
    else if (how === 'hardware') await hardwareBack(tab);
    else await tab.swipe(2, 330, 400);
    await settled(tab, `${how}: back from Settings`, { route: '/' });
    const after = await tab.run(readStack);
    checks++;
    if (after.history.length !== 1) failures.push({ label: `${how}: history`, problems: [`history after Back is ${JSON.stringify(after.history)}`] });
    const sheet = await tab.run(() => ({ hash: location.hash, open: !!document.querySelector('.sheet-modal.modal-in') }));
    checks++;
    if (sheet.hash || sheet.open) failures.push({ label: `${how}: sheet`, problems: [`after Back: hash "${sheet.hash}", sheet open ${sheet.open}`] });
    // The app still answers: a dive opens and Back returns to the logbook.
    await tapDive(tab);
    await settled(tab, `${how}: dive opens after Settings`, { route: /^\/dives\/\d+$/ });
    await tapBack(tab);
    await settled(tab, `${how}: Back again on the logbook`, { route: '/' });
    await sleep(300);
  }

  console.log(' edit > suggestion lists float above the following cards');
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  await tapText(tab, '^\s*(Modifier|Edit)\s*$');
  await settled(tab, 'edit opened', { route: /\/edit$/ });
  // Each field is brought to the bottom of the screen (little room below) and to the middle (the list passes over the
  // cards that follow).
  for (const [label, block] of [['^(Guide|Dive guide|Guides)', 'end'], ['^(Compagnons|Buddies|Buddy)', 'end'], ['^(Guide|Dive guide|Guides)', 'center'], ['^(Compagnons|Buddies|Buddy)', 'center']]) {
    const placed = await tab.run((label, block) => {
      const re = new RegExp(label, 'i');
      const l = [...document.querySelectorAll('.page-current .bc-chips-field--label')].find((x) => re.test(x.textContent.trim()));
      const input = l && document.getElementById(l.getAttribute('for'));
      if (!input) return false;
      input.scrollIntoView({ block });
      input.focus();
      return true;
    }, label, block);
    checks++;
    if (!placed) {
      failures.push({ label: `suggestions ${label} (${block})`, problems: ['field not found'] });
      console.log(`  FAIL suggestions ${label} (${block}): field not found`);
      continue;
    }
    // Focused and empty, the field lists the logbook's values (up to six): the tallest list it can show.
    await sleep(300);
    if (!(await tab.run(() => document.querySelectorAll('.page-current .bc-chips-field--proposals button').length > 1))) await tab.send('Input.insertText', { text: 'a' });
    await sleep(300);
    if (process.env.OD_SHOTS) await shot(tab, `suggestions-${label.replace(/\W/g, '')}-${process.env.OD_THEME === 'ios' ? 'ios' : 'android'}`);
    const res = await tab.run(() => {
      const ul = [...document.querySelectorAll('.page-current .bc-chips-field--proposals')].find((u) => u.getClientRects().length);
      if (!ul) return { problem: 'no open list' };
      const items = [...ul.querySelectorAll('button')];
      const bad = [];
      for (const b of items) {
        const r = b.getBoundingClientRect();
        const x = r.x + r.width / 2;
        // Both edges of the row, not only its centre: a card's clipping cuts the lower part.
        for (const y of [r.top + 4, r.top + r.height / 2, r.bottom - 4]) {
          if (y < 0 || y > innerHeight) bad.push(`${b.textContent.trim()} is off screen (y=${Math.round(y)})`);
          else if (!b.contains(document.elementFromPoint(x, y))) bad.push(`${b.textContent.trim()} is covered at y=${Math.round(y)} by ${document.elementFromPoint(x, y)?.className || '?'}`);
        }
      }
      const ir = document.activeElement?.getBoundingClientRect();
      return { n: items.length, bad, at: `${document.activeElement?.id} input y=${Math.round(ir?.top ?? -1)} list y=${Math.round(ul.getBoundingClientRect().top)}-${Math.round(ul.getBoundingClientRect().bottom)}` };
    });
    if (res.problem || res.bad.length || !res.n) {
      failures.push({ label: `suggestions ${label} (${block})`, problems: [res.problem ?? (res.bad.join('; ') || 'empty list')] });
      console.log(`  FAIL suggestions ${label} (${block}): ${res.problem ?? res.bad.join('; ')}`);
    } else console.log(`  ok   suggestions ${label} (${block}): ${res.n} rows on top (${res.at})`);
    await tab.run(() => document.activeElement?.blur());
    await sleep(300);
  }
  // Leave without saving: the dive stays as it was for the next flows.
  await tapBack(tab);
  await sleep(500);
  // Typed text asks first; a field only focused does not.
  await tapText(tab, '^(Quitter|Leave)$', '.bc-leave-guard--dialog').catch(() => {});
  await settled(tab, 'after leaving the edit page', { route: /^\/dives\/\d+$/ });
  await toLogbook(tab, 'after the suggestions check');

  console.log(' quick entry after a download (Complete the dive)');
  // The phone is at a known site: the nearest site is preselected and named.
  const here = JSON.parse(await core('siteQuery', { kind: 'list', uuid: 0, lat: 0, lon: 0, a: 0, b: 0, text: '' })).find((x) => x.hasLocation !== false && (x.latUdeg || x.lonUdeg) && x.dives);
  if (here) {
    await tab.send('Emulation.setGeolocationOverride', { latitude: here.latUdeg / 1e6, longitude: here.lonUdeg / 1e6, accuracy: 5 });
    await tab.send('Browser.grantPermissions', { permissions: ['geolocation'] }).catch(() => {});
  }
  const quickRoute = await tab.run(() => {
    const view = document.querySelector('.view-main');
    const id = view?.querySelector('a[href^="/dives/"]')?.getAttribute('href')?.split('/')[2];
    view.f7View.router.navigate(`/dives/${id}/complete`);
    return `/dives/${id}/complete`;
  });
  await settled(tab, 'quick entry opened', { route: quickRoute });
  for (let i = 0; i < 40 && here && !(await tab.run(() => !!document.querySelector('.bc-quick-entry [role=option][aria-selected=true]'))); i++) await sleep(200);
  if (process.env.OD_SHOTS) await shot(tab, `quick-entry-${process.env.OD_THEME === 'ios' ? 'ios' : 'android'}`);
  if (here) {
    const preselected = await tab.run(() => document.querySelector('.bc-quick-entry [role=option][aria-selected=true] .bc-quick-entry--nearest')?.textContent ?? '');
    checks++;
    if (!/\S/.test(preselected)) {
      failures.push({ label: 'quick entry: nearest site', problems: [`no preselected nearest site for ${here.name}`] });
      console.log('  FAIL quick entry: the nearest site is not preselected');
    } else console.log('  ok   quick entry: the nearest site is preselected');
  }
  const sawSite = await tab.run(() => !!document.querySelector('.bc-quick-entry [role=listbox]') && document.querySelectorAll('.bc-quick-entry [role=option]').length > 0);
  checks++;
  if (!sawSite) {
    failures.push({ label: 'quick entry: site list', problems: ['no site rows'] });
    console.log('  FAIL quick entry: the site list is empty');
  } else console.log('  ok   quick entry: the site list shows');
  await tapText(tab, '^\s*(Chercher un autre site|Search for another site)\s*$', '.bc-quick-entry');
  await settled(tab, 'quick entry > Choose a site', { route: '/sites/choose' });
  await tapBack(tab);
  await settled(tab, 'back to the quick entry', { route: quickRoute });
  await tapText(tab, '^\s*(Enregistrer|Save)\s*$', '.bc-quick-entry');
  // Saving a site writes the log: the screen is left when the write is done.
  for (let i = 0; i < 50 && (await tab.run(() => /\/complete$/.test(document.querySelector('.view-main')?.f7View?.router?.currentRoute?.url ?? ''))); i++) await sleep(200);
  await settled(tab, 'quick entry saved', { route: '/' });
  if (here) {
    // The dive was saved with the preselected site (its uuid may be above 2^31: JSON integers are 64-bit in the core).
    const savedSite = JSON.parse(await core('getDive', { id: Number(quickRoute.split('/')[2]) })).site;
    checks++;
    if (savedSite !== here.name) {
      failures.push({ label: 'quick entry: saved site', problems: [`the dive's site is "${savedSite}", expected "${here.name}"`] });
      console.log('  FAIL quick entry: the dive was not saved with the preselected site');
    } else console.log('  ok   quick entry: the dive was saved with the preselected site');
  }
  await toLogbook(tab, 'after the quick entry');
  // The Undo message of the save stays 6 s over the screen: wait for it to go before the next flow.
  for (let i = 0; i < 60 && (await tab.run(() => !!document.querySelector('.toast.bc-undo-toast'))); i++) await sleep(200);

  console.log(' error report sheet over the Download page and over the logbook');
  for (const where of ['/download', '/']) {
    if (where !== '/') {
      await tab.run((r) => { document.querySelector('.view-main').f7View.router.navigate(r); }, where);
      await settled(tab, 'download opened', { route: where });
    }
    // A forced error: the report sheet opens, both buttons answer, and the page is usable afterwards.
    // At most three offers per session: decline over both pages, and « Envoyer » once over the Download page (no server
    // answers in this test: the sheet then shows « Plus tard », which closes it).
    for (const [button, label] of where === '/' ? [['.bc-error-report--secondary', 'decline']] : [['.bc-error-report--secondary', 'decline'], ['.bc-error-report--primary', 'send']]) {
      await tab.run((n) => window.dispatchEvent(new ErrorEvent('error', { error: new Error(`forced report ${n}`), message: `forced report ${n}` })), `${where}-${label}-${Date.now()}`);
      let up = false;
      for (let i = 0; i < 25 && !up; i++) {
        await sleep(200);
        up = await tab.run(() => !!document.querySelector('.bc-error-report.modal-in'));
      }
      checks++;
      if (!up) {
        failures.push({ label: `report sheet over ${where}`, problems: ['the sheet did not open'] });
        console.log(`  FAIL report sheet over ${where}: not opened`);
        continue;
      }
      await sleep(500);
      const box = await boxOf(tab, (sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      }, button);
      if (box) await tab.tapAt(box.x, box.y);
      if (label === 'send') {
        await sleep(1500);
        if (await tab.run(() => !!document.querySelector('.bc-error-report.modal-in'))) {
          const later = await boxOf(tab, () => {
            const r = document.querySelector('.bc-error-report--secondary')?.getBoundingClientRect();
            return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
          });
          if (later) await tab.tapAt(later.x, later.y);
        }
      }
      let closed = false;
      for (let i = 0; i < 25 && !closed; i++) {
        await sleep(200);
        closed = await tab.run(() => !document.querySelector('.bc-error-report.modal-in') && !document.querySelector('.sheet-backdrop-in'));
      }
      checks++;
      if (!closed) {
        failures.push({ label: `report sheet over ${where}`, problems: [`« ${label} » did not close the sheet`] });
        console.log(`  FAIL report sheet over ${where}: ${label} does not close it`);
      } else console.log(`  ok   report sheet over ${where}: ${label} closes it`);
    }
    if (where !== '/') {
      await hardwareBack(tab);
      await settled(tab, 'back from the download page', { route: '/' });
    }
  }

  await sleep(600);
  console.log(' edit > Back arrow, then Back at once after Save');
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  await tapText(tab, '^\\s*(Modifier|Edit)\\s*$');
  await settled(tab, 'edit opened', { route: /\/edit$/ });
  await tapBack(tab);
  await settled(tab, 'edit left with the arrow', { route: diveRoute });
  await tapText(tab, '^\\s*(Modifier|Edit)\\s*$');
  await settled(tab, 'edit opened again', { route: /\/edit$/ });
  await tapText(tab, '^\\s*(Enregistrer|Save)\\s*$');
  await sleep(120);
  await tapBack(tab).catch(() => {});
  await sleep(40);
  await tapBack(tab).catch(() => {});
  await settled(tab, 'Back right after Save');
  // Wherever the second Back led, the stack is sound; Back reaches the logbook.
  await toLogbook(tab, 'after Save');

  console.log(' dive page swipe, then Back (the half-transitioned stack)');
  for (const [name, x1, gap] of [['through', 60, 10], ['through', 60, 100], ['through', 60, 250], ['short', 250, 10], ['short', 250, 100]]) {
    await tapDive(tab);
    await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
    await tab.swipe(name === 'through' ? 330 : 300, x1, 700);
    await sleep(gap);
    await tapBack(tab).catch(() => {});
    await settled(tab, `Back ${gap} ms after a ${name} swipe`);
    await toLogbook(tab, `after a ${name} swipe`);
  }

  console.log(' the Android Back key');
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  await hardwareBack(tab);
  await settled(tab, 'hardware Back from the dive', { route: '/' });
  await tapDive(tab);
  await settled(tab, 'dive opened', { route: /^\/dives\/\d+$/ });
  await hardwareBack(tab);
  await sleep(30);
  await hardwareBack(tab);
  await settled(tab, 'hardware Back twice', { route: '/' });
  await tapDive(tab);
  await sleep(80);
  await hardwareBack(tab);
  await settled(tab, 'hardware Back during the opening');
  await toLogbook(tab, 'after hardware Back during the opening');

  console.log(' the account sheet, then a dive');
  await tapText(tab, '^\\s*Compte', '.page-current .navbar, .page-current').catch(async () => {
    await tab.run(() => document.querySelector('[aria-label^="Compte"]')?.click());
  });
  await sleep(700);
  await hardwareBack(tab);
  await sleep(500);
  await settled(tab, 'account sheet closed with Back', { route: '/' });
  await tapDive(tab);
  await settled(tab, 'dive opened after the sheet', { route: /^\/dives\/\d+$/ });
  await tapBack(tab);
  await settled(tab, 'back after the sheet', { route: '/' });

  console.log(' free account sheet > OpenDives+ offer > Back reopens the sheet');
  const sheetState = () => tab.run(() => ({ hash: location.hash, sheet: !!document.querySelector('.bc-account-sheet.modal-in, .sheet-modal.modal-in .bc-account-sheet--row, .modal-in .bc-account-sheet--row'), welcome: !!document.querySelector('.bc-welcome.modal-in'), len: history.length }));
  const expectState = (label, want, got) => {
    checks++;
    const bad = Object.entries(want).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k} is ${got[k]}, expected ${v}`);
    if (bad.length) {
      failures.push({ label, problems: bad, got });
      console.log(`  FAIL ${label}: ${bad.join('; ')}`);
    } else console.log(`  ok   ${label}`);
  };
  for (const row of ['#offer-sync', '#offer-profile']) {
    await tapText(tab, '^\s*Compte', '.page-current .navbar, .page-current');
    await sleep(800);
    // The sheet writes nothing to the browser's history (no « #compte » since 19 November 2026: docs/architecture.md, section 13).
    expectState(`${row}: the sheet is open, the address has no fragment`, { hash: '', sheet: true }, await sheetState());
    await tab.run((r) => document.querySelector(`a[href="${r}"], [data-row="${r.slice(1)}"]`)?.click(), row);
    await sleep(1000);
    expectState(`${row}: the offer is open`, { welcome: true, sheet: false }, await sheetState());
    await hardwareBack(tab);
    await sleep(900);
    expectState(`${row}: Back from the offer reopens the sheet`, { welcome: false, sheet: true, hash: '' }, await sheetState());
    await hardwareBack(tab);
    await sleep(900);
    expectState(`${row}: a second Back closes the sheet`, { welcome: false, sheet: false, hash: '' }, await sheetState());
    await settled(tab, `${row}: logbook after the sheet`, { route: '/' });
  }

  console.log(' subscriber with the logbook still on the device: the profile and the backup page open, never the offer');
  // What the development menu's « Abonné » does (lib/dev-tools.js): the account state, with no restart and the logbook untouched.
  await tab.run(() => window.__odplusAccount({ signedIn: true, email: 'essai@opendives.test', subscribed: true }));
  for (const [row, route, page] of [['#profile', '/profile', '.bc-profile, .bc-profile-page, .page-current'], ['#backup', '/account/backup', '.bc-backup-not-on-server']]) {
    await tapText(tab, '^\s*Compte', '.page-current .navbar, .page-current');
    await sleep(800);
    expectState(`subscriber ${row}: the sheet is open`, { hash: '', sheet: true }, await sheetState());
    const rows = await tab.run((r) => ({ row: !!document.querySelector(`a[href="${r}"], [data-row="${r.slice(1)}"]`), offer: !!document.querySelector('a[href^="#offer-"], [data-row^="offer-"]') }), row);
    expectState(`subscriber ${row}: the row is there and the sheet shows no offer`, { row: true, offer: false }, rows);
    await tab.run((r) => document.querySelector(`a[href="${r}"], [data-row="${r.slice(1)}"]`)?.click(), row);
    await sleep(1000);
    await settled(tab, `subscriber ${row}: its page is open`, { route });
    expectState(`subscriber ${row}: the page, not the offer`, { welcome: false, shown: true }, { ...(await sheetState()), shown: await tab.run((q) => !!document.querySelector(q), page) });
    await tapBack(tab);
    await settled(tab, `subscriber ${row}: back`, { route: '/' });
  }
  await tab.run(() => window.__odplusAccount({ signedIn: false }));
  await tapText(tab, '^\s*Compte', '.page-current .navbar, .page-current');
  await sleep(800);
  expectState('free again: the sheet offers again', { sheet: true }, { ...(await sheetState()), sheet: await tab.run(() => !!document.querySelector('a[href="#offer-profile"], [data-row="offer-profile"]')) });
  await hardwareBack(tab);
  await sleep(900);

  console.log(' sections: sites, statistics, tools, settings');
  for (const [label, pattern] of [['Sites', '^\\s*Sites\\s*$'], ['Statistiques', '^\\s*Statistiques\\s*$'], ['Outils', '^\\s*Outils\\s*$']]) {
    await tapText(tab, pattern, '.toolbar, .bc-bottom-nav, .tabbar').catch(() => tab.run((l) => [...document.querySelectorAll('.toolbar a, .tabbar a')].find((a) => a.textContent.trim() === l)?.click(), label));
    await settled(tab, `${label} shown`);
  }
  tab.ws.close();

  console.log('Phone, a lazy page and a quick Back');
  tab = await openTab(390, 844, true);
  await tab.run(() => [...document.querySelectorAll('.toolbar a, .tabbar a')].find((a) => /Sites/.test(a.textContent))?.click());
  await settled(tab, 'Sites tab');
  const siteLink = await tab.run(() => {
    const a = document.querySelector('.tab-active a[href^="/sites/"]:not([href="/sites/"])');
    const r = a?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (siteLink) {
    await tab.tapAt(siteLink.x, siteLink.y);
    await sleep(60);
    await tapBack(tab).catch(() => {});
    await settled(tab, 'Back while a site page loads');
  }
  tab.ws.close();
}

/** The step of the first launch on screen (data-step of lib/first-launch-steps.js), once its transition is over. */
async function welcomeStep(tab) {
  await sleep(700);
  return tab.run(() => document.querySelector('.bc-welcome.modal-in .bc-first-launch--step:last-of-type')?.getAttribute('data-step') ?? null);
}
/** Checks the step reached; counts as one check. */
async function expectStep(tab, label, expected) {
  const got = await welcomeStep(tab);
  checks++;
  if (got !== expected) {
    failures.push({ label, problems: [`first launch on step ${got}, expected ${expected}`] });
    console.log(`  FAIL ${label}: ${got} instead of ${expected}`);
    console.log((await tab.run(() => document.body.innerText.slice(0, 300) + ' | ' + [...document.querySelectorAll('.modal-in')].map((m) => m.className).join(';'))));
  }
}

async function welcomeFlows() {
  console.log('First launch, 390x844: the system Back goes to the previous step');
  const tab = await openTab(390, 844, true, true);
  console.log(await tab.run(() => document.querySelector('.bc-welcome')?.outerHTML.slice(0, 1500)));
  await expectStep(tab, 'first launch opens on the first step', 'start');
  const welcomeTap = (pattern) => tapText(tab, pattern, '.bc-welcome.modal-in');
  const cases = [
    ['Import a logbook / Importer un carnet', '^\s*(Import a logbook|Importer un carnet)', 'import'],
    ['New logbook / Commencer un carnet', '^\s*(Start a logbook|Commencer un carnet)', 'new'],
    ['Sign in or create an account', '(Sign in|Se connecter)', 'odplusConnect'],
  ];
  for (const [name, pattern, step] of cases) {
    await welcomeTap(pattern).catch(async (e) => { console.log(await tab.run(() => [...document.querySelectorAll('.bc-welcome.modal-in button, .bc-welcome.modal-in a')].map((b) => b.textContent.trim().slice(0, 30) + '@' + Math.round(b.getBoundingClientRect().y)).join(' | '))); throw e; });
    await expectStep(tab, `${name}: opens`, step);
    await hardwareBack(tab);
    await expectStep(tab, `${name}: Back returns to the first step`, 'start');
  }
  await hardwareBack(tab);
  await sleep(300);
  checks++;
  if (!(await tab.run(() => !!document.querySelector('.bc-welcome.modal-in')))) failures.push({ label: 'first step', problems: ['Back on the first step closed the first launch'] });
  await expectStep(tab, 'Back on the first step keeps the first launch', 'start');
  tab.ws.close();
}

async function tabletFlows() {
  console.log('Tablet, 1280x800');
  const tab = await openTab(1280, 800, false);
  await settled(tab, 'logbook at start', { split: true });
  await tapDive(tab);
  await settled(tab, 'dive shown beside the list', { split: true });
  await tapDive(tab);
  await settled(tab, 'dive tapped again', { split: true });
  await hardwareBack(tab);
  await settled(tab, 'hardware Back', { split: true });
  tab.ws.close();
}

async function settingsComputersFlows(expect) {
  for (const [label, width, height, mobile, desktop, theme] of [
    ['Android phone', 390, 844, true, false, 'md'],
    ['Android tablet', 1280, 800, false, false, 'md'],
    ['iPad', 1280, 800, false, false, 'ios'],
    ['desktop', 1400, 900, false, true, 'md'],
  ]) {
    const tab = await openTab(width, height, mobile, false, desktop, { theme });
    await tab.run(async () => (await import('/src/lib/navigation.svelte.js')).openOver('/settings/'));
    await sleep(1200);
    if (!desktop) {
      await tab.run(() => {
        const row = document.querySelector('.bc-settings--overview-row[href="/settings/download"]');
        if (!row) throw new Error('download settings row missing');
        row.click();
      });
      await sleep(1000);
      await tab.run(async () => {
        const { t } = await import('/src/lib/i18n.js');
        const row = [...document.querySelectorAll('.bc-settings--row')].find((el) => el.querySelector('.bc-settings--label')?.textContent === t('settings.logbookComputers.title'));
        if (!row) throw new Error('logbook computers row missing');
        row.click();
      });
    } else {
      await tab.run(() => { document.querySelector('.view.tab-active').f7View.router.navigate('/settings/computers/'); });
    }
    await sleep(1200);
    const state = await tab.run(async () => {
      const { t } = await import('/src/lib/i18n.js');
      const view = document.querySelector('.view.tab-active');
      const page = view.querySelector('.page-current.bc-logbook-computers');
      return {
        route: view.f7View.router.currentRoute.url,
        page: !!page,
        title: !!page && page.textContent.includes(t('settings.logbookComputers.title')),
        content: !!page?.querySelector('.bc-logbook-computers--intro'),
        matched: view.f7View.router.currentRoute.route.path,
        visibleText: view.querySelector('.page-current')?.textContent?.trim().slice(0, 100),
      };
    });
    expect(`${label}: logbook computers opens its page`, { route: '/settings/computers/', page: true, title: true, content: true }, state);
    await tab.run(() => {
      const row = document.querySelector('.page-current.bc-logbook-computers .bc-logbook-computers--row');
      if (!row) throw new Error('sample computer missing');
      row.click();
    });
    await sleep(900);
    const edit = await tab.run(() => {
      const view = document.querySelector('.view.tab-active');
      return { path: view.f7View.router.currentRoute.path, page: !!view.querySelector('.page-current.bc-logbook-computer') };
    });
    expect(`${label}: a computer opens its edit page`, { path: '/settings/computers/edit', page: true }, edit);
    await tab.run(() => { document.querySelector('.view.tab-active').f7View.router.back(); });
    await sleep(900);
    expect(`${label}: Back returns to the computers list`, { page: true }, { page: await tab.run(() => !!document.querySelector('.view.tab-active .page-current.bc-logbook-computers')) });
    await tab.run(() => { document.querySelector('.view.tab-active').f7View.router.back(); });
    await sleep(900);
    const back = await tab.run(() => {
      const view = document.querySelector('.view.tab-active');
      return { route: view.f7View.router.currentRoute.url, computers: !!view.querySelector('.page-current.bc-logbook-computers') };
    });
    expect(`${label}: Back leaves logbook computers`, desktop ? { computers: false } : { route: '/settings/download', computers: false }, back);

    if (!mobile && !desktop) {
      for (const section of ['display', 'language', 'units', 'notifications', 'logbook', 'equipment', 'decompression', 'gases', 'tools', 'download', 'privacy', 'advanced']) {
        await tab.run((section) => { document.querySelector('#view-account').f7View.router.navigate(`/settings/${section}`, { reloadDetail: true }); }, section);
        await sleep(500);
        const detail = await tab.run(() => {
          const view = document.querySelector('#view-account');
          const route = view.f7View.router.currentRoute;
          const page = view.querySelector('.page-current.bc-settings');
          return { section: route.params.section, detail: !!route.route.masterRoute, content: !!page?.querySelector('.bc-settings--surface, .bc-settings--segmented, .bc-settings--warning') };
        });
        expect(`${label}: ${section} remains a settings detail`, { section, detail: true, content: true }, detail);
      }
      for (const [path, selector] of [
        ['/settings/maps/', '.bc-settings-maps'],
        ['/settings/cylinders/', '.bc-cylinder-types'],
        ['/settings/bailout', '.bc-settings-bailout'],
        ['/settings/planner', '.bc-planner-settings'],
      ]) {
        await tab.run((path) => { document.querySelector('#view-account').f7View.router.navigate(path); }, path);
        await sleep(900);
        const page = await tab.run((selector) => {
          const view = document.querySelector('#view-account');
          return { route: view.f7View.router.currentRoute.url, shown: !!view.querySelector(`.page-current${selector}`) };
        }, selector);
        expect(`${label}: ${path} opens its own page`, { route: path, shown: true }, page);
        await tab.run(() => { document.querySelector('#view-account').f7View.router.back(); });
        await sleep(700);
      }
    }
    tab.ws.close();
  }
}

/** Pages opened over a section (the profile, an equipment piece) must have room in the desktop layout, with Settings opened before. */
async function desktopFlows() {
  console.log('Desktop, 1400x900: pages opened over Réglages');
  const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  await tab.run(() => !!document.querySelector('.bc-desktop-logbook--table'));
  const open = (path) => tab.run(async (p) => { (await import('/src/lib/navigation.svelte.js')).openOver(p); return 1; }, path);
  await open('/settings/');
  await sleep(1200);
  for (const path of ['/profile/gear/new', '/about/libraries']) {
    await open(path);
    await sleep(1200);
    const room = await tab.run((path) => {
      const page = [...document.querySelectorAll('.view.tab-active > .page')].find((p) => p.f7Page?.route?.path === path) ?? document.body;
      const r = page.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { cls: page.className, width: Math.round(r.width), onTop: !!hit && page.contains(hit), back: [...page.querySelectorAll('.navbar .left a, .navbar .left button')].some((b) => b.getClientRects().length > 0) };
    }, path);
    checks++;
    const problems = [];
    if (room.width < 600) problems.push(`the page is ${room.width} px wide`);
    if (!room.onTop) problems.push('Réglages covers the page');
    if (!room.back) problems.push('no Back or close button');
    if (problems.length) {
      failures.push({ label: `${path} over Réglages (desktop)`, problems, room });
      console.log(`  FAIL ${path} over Réglages: ${problems.join('; ')}`);
    } else console.log(`  ok   ${path} over Réglages: ${room.width} px`);
    await tab.run(() => { document.querySelector('.view.tab-active').f7View.router.back({ animate: false }); return 1; });
    await sleep(600);
  }
  tab.ws.close();
}

async function exportFlows(expect) {
  for (const desktop of [false, true]) {
    const tab = await openTab(desktop ? 1400 : 390, desktop ? 900 : 844, !desktop, false, desktop, { theme: 'md' });
    const ids = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const { filter } = await import('/src/lib/filter.svelte.js');
      const ids = logbook.dives.map((d) => d.id);
      filter.ids = new Set(ids.slice(0, 1));
      window.__exportCalls = [];
      const core = window.odDesktop.core;
      window.odDesktop.core = (method, args) => {
        if (method === 'exportDives') {
          window.__exportCalls.push(args);
          return Promise.resolve({});
        }
        return core(method, args);
      };
      window.odDesktop.saveAs = async () => ({ saved: false });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
      return ids;
    });
    await sleep(500);
    await tab.run((desktop) => {
      const button = document.querySelector(desktop ? '.bc-desktop-logbook--bar .bc-desktop-logbook--icon-button[aria-haspopup="menu"]' : '.page-current [data-popover=".bc-logbook-menu"], .page-master [data-popover=".bc-logbook-menu"]');
      if (!button) throw new Error('logbook menu button missing');
      button.click();
    }, desktop);
    await sleep(500);
    await tab.run((desktop) => {
      const menu = document.querySelector(desktop ? '.bc-context-menu' : '.bc-logbook-menu');
      const item = [...menu.querySelectorAll('a, button')].find((el) => /Exporter le carnet|Export the logbook/.test(el.textContent));
      if (!item) throw new Error('whole logbook export missing');
      item.click();
    }, desktop);
    await sleep(600);
    const dialog = desktop ? '.bc-desktop-export' : '.bc-export-sheet';
    const state = await tab.run((dialog, count) => {
      const el = document.querySelector(dialog);
      if (!el) return { shown: false, formatCount: 0, title: false, allSelected: false };
      const groups = el.querySelectorAll('[role="radiogroup"]');
      const scope = groups.length > 1 ? groups[0] : null;
      return {
        shown: true,
        formatCount: groups[groups.length - 1].querySelectorAll('[role="radio"], input[type="radio"]').length,
        title: el.textContent.includes(String(count)),
        allSelected: !scope || scope.querySelector('[role="radio"]:last-child')?.getAttribute('aria-checked') === 'true',
      };
    }, dialog, ids.length);
    expect(`${desktop ? 'desktop' : 'phone'} export choices`, { shown: true, formatCount: 5, title: true, allSelected: true }, state);
    await tab.run((dialog) => {
      const groups = document.querySelector(dialog).querySelectorAll('[role="radiogroup"]');
      groups[groups.length - 1].querySelectorAll('[role="radio"]')[1].click();
      const button = [...document.querySelector(dialog).querySelectorAll('button')].find((b) => /^Exporter|^Export/.test(b.textContent.trim()) && b.getAttribute('role') !== 'radio');
      if (!button) throw new Error('export confirmation missing');
      button.click();
    }, dialog);
    await sleep(800);
    const call = await tab.run(() => window.__exportCalls[0] ?? null);
    expect(`${desktop ? 'desktop' : 'phone'} exports every dive as UDDF`, { ids: JSON.stringify(ids), format: 'uddf' }, { ids: JSON.stringify(call?.ids), format: call?.format });
    tab.ws.close();
  }
}

async function unitsMenuFlows(expect) {
  for (const [width, height, mobile] of [[390, 844, true], [1280, 800, false]]) {
    const tab = await openTab(width, height, mobile, false, false, { theme: 'md' });
    const before = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const { deviceStore } = await import('/src/lib/device-store.js');
      const { unitSystem, length, temperature, pressure, volume, weight } = logbook.prefs;
      return {
        prefs: { unitSystem, length, temperature, pressure, volume, weight },
        core: deviceStore.getItem('od.corePrefs'),
        app: deviceStore.getItem('od.appSettings'),
      };
    });
    await tab.run(async (mobile) => {
      window.__unitsErrors = [];
      window.addEventListener('error', (event) => window.__unitsErrors.push(event.message));
      (await import('/src/lib/navigation.svelte.js')).openOver(mobile ? '/settings/units' : '/settings/');
    }, mobile);
    await sleep(1200);
    if (!mobile) {
      await tab.run(() => {
        document.querySelector('#view-account').f7View.router.navigate('/settings/units');
      });
      await sleep(900);
    }
    await tab.run(() => {
      const imperial = [...document.querySelectorAll('.bc-settings--segmented [role="radio"]')].find((el) => /impérial|imperial/i.test(el.textContent));
      if (!imperial) throw new Error('imperial unit system missing');
      imperial.click();
    });
    await sleep(700);
    await tab.run(() => {
      const row = [...document.querySelectorAll('.bc-settings--row')].find((el) => /température|temperature/i.test(el.textContent));
      if (!row) throw new Error('temperature row missing');
      row.click();
    });
    await sleep(300);
    await tab.run(() => {
      const option = [...document.querySelectorAll('.bc-row-menu [role="option"]')].find((el) => /°C/.test(el.textContent));
      if (!option) throw new Error('Celsius option missing');
      option.click();
    });
    await sleep(700);
    const result = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const row = [...document.querySelectorAll('.bc-settings--row')].find((el) => /température|temperature/i.test(el.textContent));
      return {
        system: logbook.prefs.unitSystem,
        temperature: logbook.prefs.temperature,
        length: logbook.prefs.length,
        focused: document.activeElement === row,
        errors: window.__unitsErrors.join(' | '),
      };
    });
    expect(`${width}px: Celsius with imperial units closes cleanly`, { system: 'personalize', temperature: 'C', length: 'ft', focused: true, errors: '' }, result);
    await tab.run(() => {
      const row = [...document.querySelectorAll('.bc-settings--row')].find((el) => /température|temperature/i.test(el.textContent));
      row.click();
    });
    await sleep(300);
    await tab.run(() => document.querySelector('.bc-row-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await sleep(300);
    const cancelled = await tab.run(() => ({
      closed: !document.querySelector('.bc-row-menu'),
      errors: window.__unitsErrors.join(' | '),
    }));
    expect(`${width}px: Escape closes a choice menu cleanly`, { closed: true, errors: '' }, cancelled);
    if (!mobile) {
      await tab.run(() => {
        const router = document.querySelector('#view-account').f7View.router;
        router.back();
        router.back();
      });
      await sleep(1800);
      const state = await tab.run(async () => {
        const { readApp, checkApp } = await import('/src/lib/nav-invariants.js');
        const { traceEvents } = await import('/src/lib/nav-trace.js');
        return {
          problems: checkApp(readApp()).join(' | '),
          broken: traceEvents().filter((event) => event.type === 'broken').map((event) => event.detail).join(' | '),
        };
      });
      expect('tablet: two rapid Back calls from Settings leave navigation sound', { problems: '', broken: '' }, state);
    }
    await tab.run(async (before) => {
      await window.odDesktop.core('setPrefs', { changes: JSON.stringify(before.prefs) });
      const { deviceStore } = await import('/src/lib/device-store.js');
      for (const [key, value] of [['od.corePrefs', before.core], ['od.appSettings', before.app]]) {
        if (value === null) deviceStore.removeItem(key);
        else deviceStore.setItem(key, value);
      }
    }, before);
    await sleep(200);
    tab.ws.close();
  }
}

async function computerPhotoFlows(expect) {
  const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  await tab.run(async () => {
    const { useStorage, getCatalog } = await import('/src/lib/dc-images.js');
    useStorage({
      getText: async () => JSON.stringify([{ vendor: 'Test', product: 'Sample', slug: 'sample', hasImage: true }]),
      putText: async () => {},
      imageUrl: async () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E',
      putImage: async () => {},
    });
    await getCatalog();
    const { logbook } = await import('/src/lib/logbook.svelte.js');
    document.querySelector('#view-logbook').f7View.router.navigate(`/dives/${logbook.dives[0].id}`);
  });
  await sleep(1200);
  await tab.run(() => {
    const button = document.querySelector('.bc-dive-detail--desk-tabs [data-tab="equipment"]');
    if (!button) throw new Error('desktop equipment tab missing');
    button.click();
  });
  await sleep(800);
  const state = await tab.run(() => {
    const row = document.querySelector('.bc-desktop-edit-field[data-field="computer"] .bc-desktop-edit-field--value');
    const image = row?.querySelector('.bc-dc-tile img');
    return { named: !!row?.textContent.includes('Sample'), photo: !!image && image.getAttribute('src')?.startsWith('data:image/svg+xml') };
  });
  expect('desktop equipment shows the computer photo beside its name', { named: true, photo: true }, state);
  tab.ws.close();
}

async function profileInsetsFlows(expect) {
  for (const [label, width, height] of [['landscape narrow', 1000, 700], ['landscape', 1280, 800], ['portrait', 800, 1280]]) {
    for (const [route, bar] of [['/profile', 'none'], ['/profile/maintenance/', 'none'], ['/profile/certs/', 'main'], ['/profile/gear/new', 'dialog']]) {
      const tab = await openTab(width, height, false, false, false, { theme: 'md' });
      await tab.run(async (path) => {
        window.__odSetInsets({ top: 24, bottom: 48, left: 0, right: 0 });
        (await import('/src/lib/navigation.svelte.js')).openOver(path);
      }, route);
      await sleep(1600);
      const state = await tab.run(({ kind, portrait }) => {
        const page = [...document.querySelectorAll('.view.tab-active > .page-current')].find((item) => item.getBoundingClientRect().width > 0);
        const frame = page?.querySelector('.bc-pf')?.getBoundingClientRect();
        const nav = page?.querySelector('.bc-profile-nav')?.getBoundingClientRect();
        const back = page?.querySelector('.bc-profile-nav--back')?.getBoundingClientRect();
        const add = page?.querySelector('.bc-gear-list--add, .fab:not([style*="display: none"])')?.getBoundingClientRect();
        const navbar = page?.querySelector(':scope > .navbar')?.getBoundingClientRect();
        const inner = page?.querySelector(':scope > .navbar .navbar-inner')?.getBoundingClientRect();
        const box = page?.querySelector('.bc-pf--box')?.getBoundingClientRect();
        const bottom = innerHeight - 48;
        const near = (a, b) => Math.abs(a - b) < 2;
        return {
          frame: portrait ? !frame : !!frame && near(frame.top, 24) && near(frame.bottom, bottom),
          back: portrait || (!!back && back.top >= 24),
          add: !add || add.bottom <= bottom,
          main: (!portrait && kind !== 'main') || (!!navbar && !!inner && inner.top + parseFloat(getComputedStyle(page.querySelector(':scope > .navbar .navbar-inner')).paddingTop) >= 24),
          dialog: portrait || kind !== 'dialog' || (!!navbar && !!box && near(navbar.top, box.top) && box.top >= 24 && box.bottom <= bottom),
          navWidth: portrait || (!!nav && near(nav.width, innerWidth >= 1200 ? 350 : 320)),
          barAligned: portrait || kind !== 'main' || (!!nav && !!navbar && near(nav.right, navbar.left)),
        };
      }, { kind: bar, portrait: label === 'portrait' });
      expect(`${label} ${route}: profile panes and controls avoid system bars`, { frame: true, back: true, add: true, main: true, dialog: true, navWidth: true, barAligned: true }, state);
      if (label === 'landscape' && bar === 'dialog') {
        const changed = await tab.run(() => {
          window.__odSetInsets({ top: 40, bottom: 20, left: 0, right: 0 });
          const page = document.querySelector('.view.tab-active > .page-current:has(.bc-pf)');
          const frame = page.querySelector('.bc-pf').getBoundingClientRect();
          const box = page.querySelector('.bc-pf--box').getBoundingClientRect();
          const navbar = page.querySelector(':scope > .navbar').getBoundingClientRect();
          return {
            frame: Math.abs(frame.top - 40) < 2 && Math.abs(frame.bottom - (innerHeight - 20)) < 2,
            dialog: Math.abs(navbar.top - box.top) < 2 && box.top >= 40 && box.bottom <= innerHeight - 20,
          };
        });
        expect('landscape: profile dialog follows changed system insets', { frame: true, dialog: true }, changed);
      }
      tab.ws.close();
    }
  }
}

async function gearAddFlows(expect) {
  for (const [label, width, height, desktop, theme] of [['Android tablet', 1280, 800, false, 'md'], ['iPad', 1280, 800, false, 'ios'], ['desktop', 1400, 900, true, 'md']]) {
    const tab = await openTab(width, height, false, false, desktop, { theme });
    await tab.run(async () => (await import('/src/lib/navigation.svelte.js')).openOver('/profile'));
    await sleep(1600);
    const geometry = await tab.run(() => {
      const button = document.querySelector('.page-current .bc-gear-list--add');
      if (!button) return { visible: false, contentWidth: false, right: false };
      const rect = button.getBoundingClientRect();
      const panel = button.closest('.bc-gear-list').getBoundingClientRect();
      const nav = document.querySelector('.page-current .bc-profile-nav').getBoundingClientRect();
      const icon = button.querySelector('svg').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button.lastChild);
      const text = range.getBoundingClientRect();
      const style = getComputedStyle(button);
      const expectedWidth = icon.width + text.width + parseFloat(style.columnGap) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return {
        visible: rect.width > 0 && rect.height > 0,
        contentWidth: Math.abs(rect.width - expectedWidth) < 2,
        right: Math.abs(panel.right - rect.right - 17) < 2,
        navWidth: nav.width,
      };
    });
    expect(`${label}: gear Add fits its content at the right of the list`, { visible: true, contentWidth: true, right: true }, geometry);
    expect(`${label}: profile navigation has the expected width`, { navWidth: desktop ? 330 : 350 }, geometry);
    await tab.run(() => document.querySelector('.page-current .bc-gear-list--add').click());
    await sleep(1000);
    expect(`${label}: gear Add opens the new piece`, { opened: true }, { opened: await tab.run(() => !!document.querySelector('.page-current[data-name="profile-piece-edit"], .page-current.bc-piece-edit')) });
    tab.ws.close();
  }
}

async function certsFabFlows(expect) {
  for (const [label, width, height, mobile, desktop, theme] of [['Android phone', 390, 844, true, false, 'md'], ['iPhone', 390, 844, true, false, 'ios'], ['tablet landscape', 1280, 800, false, false, 'md'], ['tablet portrait', 800, 1280, false, false, 'md'], ['desktop', 1400, 900, false, true, 'md']]) {
    const tab = await openTab(width, height, mobile, false, desktop, { theme });
    await tab.send('Page.bringToFront');
    await tab.run(async () => (await import('/src/lib/navigation.svelte.js')).openOver('/profile/certs/'));
    await sleep(1600);
    const position = await tab.run(() => {
      const page = document.querySelector('.page-current.bc-docs');
      const fab = page?.querySelector('.bc-fab-add');
      const rect = fab?.getBoundingClientRect();
      const bounds = page?.getBoundingClientRect();
      return {
        visible: !!rect && rect.width > 0 && rect.height > 0,
        bottomRight: !!rect && !!bounds && bounds.right - rect.right >= 0 && bounds.right - rect.right <= 64 && bounds.bottom - rect.bottom >= 0 && bounds.bottom - rect.bottom <= 64,
        oldButton: !!page?.querySelector('.bc-docs--wide-bar'),
      };
    });
    expect(`${label}: the Add FAB is at the bottom right`, { visible: true, bottomRight: true, oldButton: false }, position);
    const empty = await tab.run(() => {
      const page = document.querySelector('.page-current.bc-docs');
      const content = page.querySelector('.bc-docs--content').getBoundingClientRect();
      const panel = page.querySelector('.bc-pf--main') || page.querySelector('.page-content');
      const bounds = panel.getBoundingClientRect();
      const style = getComputedStyle(panel);
      const top = bounds.top + parseFloat(style.paddingTop);
      const bottom = bounds.bottom - parseFloat(style.paddingBottom);
      const state = page.querySelector('.bc-docs--empty');
      const first = state?.firstElementChild?.getBoundingClientRect();
      const last = state?.lastElementChild?.getBoundingClientRect();
      return { shown: !!state, fits: Math.abs(content.top - top) < 2 && Math.abs(content.bottom - bottom) < 2, centred: !!first && !!last && Math.abs((first.top + last.bottom) / 2 - (top + bottom) / 2) < 2 };
    });
    expect(`${label}: empty state is centred in its panel`, { shown: true, fits: true, centred: true }, empty);
    const appearance = await tab.run(async () => {
      const page = document.querySelector('.page-current.bc-docs');
      const button = page.querySelector('.bc-fab-add a');
      const sample = document.createElement('span');
      sample.style.backgroundColor = 'var(--bc-secondary-container)';
      sample.style.color = 'var(--bc-on-secondary-container)';
      page.append(sample);
      const root = document.documentElement;
      const wasDark = root.classList.contains('dark');
      const colours = async (dark) => {
        root.classList.toggle('dark', dark);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const actual = getComputedStyle(button);
        const expected = getComputedStyle(sample);
        const values = { background: actual.backgroundColor, expectedBackground: expected.backgroundColor, text: actual.color, expectedText: expected.color };
        return { matches: values.background === values.expectedBackground && values.text === values.expectedText, values };
      };
      const light = await colours(false);
      const dark = await colours(true);
      const result = { light: light.matches, dark: dark.matches, note: !!page.querySelector('.bc-docs--note'), darkValues: dark.values };
      root.classList.toggle('dark', wasDark);
      sample.remove();
      return result;
    });
    expect(`${label}: Add uses the blue container in both themes and the note is absent`, { light: true, dark: true, note: false }, appearance);
    if (theme === 'md') {
      const spacing = await tab.run(() => {
        const button = document.querySelector('.page-current.bc-docs .bc-fab-add a');
        const rect = button.getBoundingClientRect();
        const icon = button.querySelector('i').getBoundingClientRect();
        const text = button.querySelector('.fab-text').getBoundingClientRect();
        const near = (a, b) => Math.abs(a - b) < 1;
        return { height: near(rect.height, 56), icon: near(icon.width, 24) && near(icon.height, 24), start: near(icon.left - rect.left, 16), gap: near(text.left - icon.right, 8), end: near(rect.right - text.right, 16) };
      });
      expect(`${label}: Add has Expressive small extended FAB spacing`, { height: true, icon: true, start: true, gap: true, end: true }, spacing);
    }
    await tab.run(() => document.querySelector('.page-current.bc-docs .bc-fab-add a').click());
    await sleep(500);
    const sheet = await tab.run(() => document.querySelectorAll('.bc-doc-choice.modal-in .bc-doc-choice--option').length);
    expect(`${label}: Add opens the document choices`, { count: 4 }, { count: sheet });
    await tab.run(async () => {
      const { gear } = await import('/src/lib/inventory.svelte.js');
      gear.readOnly = true;
    });
    await sleep(100);
    const hidden = await tab.run(() => getComputedStyle(document.querySelector('.page-current.bc-docs .bc-fab-add')).display === 'none');
    expect(`${label}: read-only hides Add`, { hidden: true }, { hidden });
    await tab.run(async () => {
      const { gear } = await import('/src/lib/inventory.svelte.js');
      const { changeProfile } = await import('/src/lib/profile.svelte.js');
      gear.readOnly = false;
      await changeProfile((profile) => profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: 'test-1' }));
    });
    await sleep(300);
    const populated = await tab.run(() => {
      const page = document.querySelector('.page-current.bc-docs');
      return { empty: !!page.querySelector('.bc-docs--empty'), card: !!page.querySelector('.bc-docs--row') };
    });
    expect(`${label}: a saved document replaces the empty state`, { empty: false, card: true }, populated);
    tab.ws.close();
  }
}

async function certificationAgencyFlows(expect) {
  for (const [label, width, height, mobile, desktop] of [['phone', 390, 844, true, false], ['tablet', 1280, 800, false, false], ['desktop', 1400, 900, false, true]]) {
    const tab = await openTab(width, height, mobile, false, desktop, { theme: 'md' });
    await tab.send('Page.bringToFront');
    await tab.run(async () => { (await import('/src/lib/navigation.svelte.js')).openOver('/profile/certs/new'); });
    await sleep(1600);
    await tab.run(() => {
      const input = document.querySelector('.bc-cert-edit .bc-combo-field input');
      if (!input) throw new Error('agency field missing');
      input.focus();
    });
    await sleep(300);
    const menu = await tab.run(() => {
      const options = [...document.querySelectorAll('.bc-combo-field--menu [role="option"]')];
      const { lang } = document.documentElement;
      return {
        sorted: options.every((o, i) => i === 0 || options[i - 1].textContent.trim().localeCompare(o.textContent.trim(), lang, { sensitivity: 'base' }) <= 0),
        fqas: options.some((o) => o.textContent.trim().startsWith('FQAS ·')),
        other: options.some((o) => /^(Other agency|Autre agence)$/.test(o.textContent.trim())),
      };
    });
    expect(`${label}: certification agencies`, { sorted: true, fqas: true, other: false }, menu);
    await tab.run(() => [...document.querySelectorAll('.bc-combo-field--menu [role="option"]')].find((o) => o.textContent.trim().startsWith('FQAS ·')).click());
    await sleep(200);
    await tab.run(() => document.querySelectorAll('.bc-cert-edit .bc-combo-field input')[1].focus());
    await sleep(200);
    const levels = await tab.run(() => [...document.querySelectorAll('.bc-combo-field--menu [role="option"]')].map((o) => o.textContent.trim()));
    expect(`${label}: levels match the agency`, { fqas: true, cdaa: false }, { fqas: levels.includes('Plongeur classe A'), cdaa: levels.includes('Advanced Cave Diver') });
    await tab.run(() => {
      const input = document.querySelectorAll('.bc-cert-edit .bc-combo-field input')[1];
      input.value = 'Custom level';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    await sleep(250);
    expect(`${label}: an unlisted level can be entered`, { value: 'Custom level' }, { value: await tab.run(() => document.querySelectorAll('.bc-cert-edit .bc-combo-field input')[1].value) });
    await tab.run((agencyName) => {
      const [agency] = document.querySelectorAll('.bc-cert-edit .bc-combo-field input');
      agency.focus();
      agency.value = agencyName;
      agency.dispatchEvent(new Event('input', { bubbles: true }));
      agency.blur();
      const instructorNumber = document.querySelectorAll('.bc-cert-edit .bc-text-field input')[2];
      instructorNumber.value = 'instructor-42';
      instructorNumber.dispatchEvent(new Event('input', { bubbles: true }));
    }, `Custom agency ${label}`);
    await sleep(250);
    await tab.run(() => {
      const save = document.querySelector('.bc-cert-edit--save');
      if (!save || save.disabled) throw new Error('certificate cannot be saved');
      save.click();
    });
    await sleep(1000);
    const saved = await tab.run(async (agencyName) => {
      const { services } = await import('/src/lib/profile.svelte.js');
      const card = (await services().profile.listCertifications()).find((c) => c.agencyName === agencyName && c.level === 'Custom level');
      return card && { id: card.id, agency: card.agency, agencyName: card.agencyName, level: card.level, number: card.number, instructorNumber: card.instructorNumber };
    }, `Custom agency ${label}`);
    expect(`${label}: the issuing instructor number is saved without a diver number`, { agency: 'other', agencyName: `Custom agency ${label}`, level: 'Custom level', number: '', instructorNumber: 'instructor-42' }, saved || {});
    if (!saved) throw new Error('saved certificate missing');
    await tab.run(async (id) => { (await import('/src/lib/navigation.svelte.js')).openOver(`/profile/certs/${id}/edit`); }, saved.id);
    await sleep(1200);
    const reopened = await tab.run(() => [...document.querySelectorAll('.bc-cert-edit .bc-combo-field input')].map((input) => input.value));
    expect(`${label}: custom values reopen`, { agency: `Custom agency ${label}`, level: 'Custom level' }, { agency: reopened[0], level: reopened[1] });
    expect(`${label}: the instructor number reopens`, { number: 'instructor-42' }, { number: await tab.run(() => document.querySelectorAll('.bc-cert-edit .bc-text-field input')[2].value) });
    await tab.run((number) => {
      const input = document.querySelector('.bc-cert-edit .bc-combo-field input');
      input.focus();
      input.value = 'FQAS';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const field = document.querySelector('.bc-cert-edit .bc-text-field input');
      field.value = number;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, `test-${label}`);
    await sleep(200);
    await tab.run(() => [...document.querySelectorAll('.bc-combo-field--menu [role="option"]')].find((o) => o.textContent.trim().startsWith('FQAS ·')).click());
    await sleep(200);
    await tab.run(() => document.querySelector('.bc-cert-edit--save').click());
    await sleep(1000);
    const updated = await tab.run(async (id) => {
      const { services } = await import('/src/lib/profile.svelte.js');
      const card = await services().profile.getCertification(id);
      return card && { agency: card.agency, agencyName: card.agencyName, level: card.level, number: card.number, instructorNumber: card.instructorNumber };
    }, saved.id);
    expect(`${label}: a selected agency keeps its identifier and a number can be added`, { agency: 'FQAS', agencyName: '', level: 'Custom level', number: `test-${label}`, instructorNumber: 'instructor-42' }, updated || {});
    tab.ws.close();
  }
}

async function gearTypeDialogFlows(expect) {
  for (const [label, width, height, mobile, desktop, theme] of [
    ['Android phone', 390, 844, true, false, 'md'],
    ['iPhone', 390, 844, true, false, 'ios'],
    ['Android tablet', 1280, 800, false, false, 'md'],
    ['iPad', 1280, 800, false, false, 'ios'],
    ['desktop', 1400, 900, false, true, 'md'],
  ]) {
    const tab = await openTab(width, height, mobile, false, desktop, { theme });
    await tab.run(async () => { (await import('/src/lib/navigation.svelte.js')).openOver('/profile/gear/new'); });
    await sleep(1400);
    const initial = await tab.run(() => {
      const page = document.querySelector('.page-current.bc-piece-edit');
      window.__gearSurface = page.querySelector('.bc-piece-edit--stage');
      return { save: !!page.querySelector('.bc-piece-edit--save'), selected: !!page.querySelector('.bc-piece-edit--tile[aria-checked="true"]') };
    });
    expect(`${label}: a type must be chosen first`, { save: false, selected: false }, initial);
    const selectType = async (type) => {
      const animation = await tab.run(async (type) => {
        const page = document.querySelector('.page-current.bc-piece-edit');
        const { t } = await import('/src/lib/i18n.js');
        const label = t(`gear.pieceNew.tile.${type}`);
        const tiles = [...page.querySelectorAll('.bc-piece-edit--tile')];
        const tile = tiles.find((element) => element.textContent.trim() === label);
        if (!tile) throw new Error(`Missing tile ${type}`);
        tile.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const incoming = page.querySelector('.bc-piece-edit--in-forward');
        return incoming ? getComputedStyle(incoming).animationName : '';
      }, type);
      await sleep(600);
      return animation;
    };
    const animation = await selectType('suit');
    if (theme === 'md') expect(`${label}: the form uses the Expressive shared-axis motion`, { animated: true }, { animated: animation.includes('od-piece-in-forward') && animation.includes('od-piece-fade-in') });
    const fields = await tab.run(async () => {
      const { t } = await import('/src/lib/i18n.js');
      const page = document.querySelector('.page-current.bc-piece-edit');
      const stage = page.querySelector('.bc-piece-edit--stage');
      const labels = [...stage.querySelectorAll('label')].map((element) => element.textContent.trim());
      return {
        sameSurface: stage === window.__gearSurface,
        step: stage.dataset.step,
        nestedDialog: !!document.querySelector('.bc-piece-type-dialog'),
        brand: labels.includes(t('gear.pieceEdit.brand')),
        serial: labels.includes(t('gear.pieceEdit.serialOptional')),
        suit: !!stage.querySelector('.bc-piece-edit--segments'),
        photo: !!stage.querySelector('[data-testid="piece-picture"]'),
        common: labels.includes(t('gear.pieceEdit.purchasedOn')),
      };
    });
    expect(`${label}: choosing a suit transitions to its form in the same surface`, { sameSurface: true, step: 'form', nestedDialog: false, brand: true, serial: true, suit: true, photo: false, common: true }, fields);
    await tab.run(async (name) => {
      const { t } = await import('/src/lib/i18n.js');
      const dialog = document.querySelector('.page-current .bc-piece-edit--stage');
      const input = (key) => {
        const label = [...dialog.querySelectorAll('label')].find((element) => element.textContent.trim() === t(key));
        if (!label) throw new Error(`Missing label ${key}`);
        return document.getElementById(label.htmlFor);
      };
      for (const [key, value] of [['gear.pieceEdit.brand', name], ['gear.pieceEdit.model', 'Dialog model'], ['gear.pieceEdit.serialOptional', 'S-123']]) {
        const field = input(key);
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      [...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === t('gear.fieldOption.suitType.dry')).click();
    }, `Dialog ${label}`);
    await tab.run(() => window.dispatchEvent(new Event('od:back')));
    await sleep(600);
    expect(`${label}: Back returns to the type choices`, { step: 'choose' }, { step: await tab.run(() => document.querySelector('.page-current .bc-piece-edit--stage').dataset.step) });
    await selectType('suit');
    const reopened = await tab.run(async () => {
      const { t } = await import('/src/lib/i18n.js');
      const dialog = document.querySelector('.page-current .bc-piece-edit--stage');
      const label = [...dialog.querySelectorAll('label')].find((element) => element.textContent.trim() === t('gear.pieceEdit.brand'));
      return { brand: document.getElementById(label.htmlFor).value };
    });
    expect(`${label}: returning to the same type keeps entered fields`, { brand: `Dialog ${label}` }, reopened);
    await tab.run(() => document.querySelector('.page-current .bc-piece-edit--save').click());
    await sleep(900);
    const saved = await tab.run(async (name) => {
      const { gear } = await import('/src/lib/inventory.svelte.js');
      const piece = gear.pieces.find((item) => item.brand === name && item.model === 'Dialog model');
      return { found: !!piece, type: piece?.type, serial: piece?.serial, suitType: piece?.details?.suitType };
    }, `Dialog ${label}`);
    expect(`${label}: the piece saves its type details`, { found: true, type: 'suit', serial: 'S-123', suitType: 'dry' }, saved);
    await tab.run(async () => { (await import('/src/lib/navigation.svelte.js')).openOver('/profile/gear/new'); });
    await sleep(1000);
    await selectType('other');
    const otherFields = await tab.run(async (name) => {
      const { t } = await import('/src/lib/i18n.js');
      const page = document.querySelector('.page-current.bc-piece-edit');
      const labels = [...page.querySelectorAll('label')];
      const nameLabel = labels.find((element) => element.textContent.trim() === t('gear.pieceNew.otherName'));
      if (!nameLabel) throw new Error('Missing other piece name');
      const input = document.getElementById(nameLabel.htmlFor);
      input.value = name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        typeName: labels.some((element) => element.textContent.trim() === t('gear.field.typeName')),
        photo: !!page.querySelector('[data-testid="piece-picture"]'),
        name: !!input,
      };
    }, `Other ${label}`);
    expect(`${label}: a new Other piece has a name and photo but no type name field`, { typeName: false, photo: true, name: true }, otherFields);
    await tab.run(() => document.querySelector('.page-current .bc-piece-edit--save').click());
    await sleep(900);
    const other = await tab.run(async (name) => {
      const { gear } = await import('/src/lib/inventory.svelte.js');
      const item = gear.pieces.find((piece) => piece.type === 'other' && piece.name === name);
      return item && { id: item.id, name: item.name, typeName: item.details?.typeName ?? '' };
    }, `Other ${label}`);
    expect(`${label}: the Other piece saves its name without a type name`, { name: `Other ${label}`, typeName: '' }, other ? { name: other.name, typeName: other.typeName } : {});
    if (label === 'Android tablet' && other) {
      await tab.run(async (id) => { (await import('/src/lib/navigation.svelte.js')).openOver(`/profile/gear/${id}/edit`); }, other.id);
      await sleep(1000);
      const editType = await tab.run(async () => {
        const { t } = await import('/src/lib/i18n.js');
        const page = document.querySelector('.page-current.bc-piece-edit');
        const fieldLabel = [...page.querySelectorAll('label')].find((element) => element.textContent.trim() === t('gear.field.typeName'));
        if (!fieldLabel) return false;
        const input = document.getElementById(fieldLabel.htmlFor);
        input.value = 'Repair kit';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      });
      expect('tablet: an existing Other piece keeps its type name field', { present: true }, { present: editType });
      await tab.run(() => document.querySelector('.page-current .bc-piece-edit--save').click());
      await sleep(900);
      const savedType = await tab.run(async (id) => {
        const { gear } = await import('/src/lib/inventory.svelte.js');
        return gear.pieces.find((piece) => piece.id === id)?.details?.typeName;
      }, other.id);
      expect('tablet: an existing Other piece keeps its type name when saved', { typeName: 'Repair kit' }, { typeName: savedType });
    }
    if (label === 'Android tablet') {
      for (const type of ['knife', 'diveKnife', 'compass']) {
        await tab.run(async () => { (await import('/src/lib/navigation.svelte.js')).openOver('/profile/gear/new'); });
        await sleep(1000);
        await selectType(type);
        const dialog = await tab.run(async (type) => {
          const { t } = await import('/src/lib/i18n.js');
          const dialog = document.querySelector('.page-current .bc-piece-edit--stage');
          const labels = [...dialog.querySelectorAll('label')].map((element) => element.textContent.trim());
          return {
            title: dialog.querySelector('.bc-piece-edit--form-title').textContent.trim(),
            expected: t(`gear.pieceNew.tile.${type}`),
            brand: labels.includes(t('gear.pieceEdit.brand')),
            model: labels.includes(t('gear.pieceEdit.model')),
            photo: !!dialog.querySelector('[data-testid="piece-picture"]'),
          };
        }, type);
        expect(`tablet: ${type} has its own title, brand and model`, { title: dialog.expected, brand: true, model: true, photo: false }, dialog);
        await tab.run(() => document.querySelector('.page-current .bc-piece-edit--save').click());
        await sleep(600);
        const found = await tab.run(async (type) => {
          const { gear } = await import('/src/lib/inventory.svelte.js');
          return gear.pieces.some((piece) => piece.type === type);
        }, type);
        expect(`tablet: ${type} can be saved`, { found: true }, { found });
      }
    }
    tab.ws.close();
  }
}

async function profileLayersFlows(expect) {
  for (const [label, width, height, mobile] of [['phone', 390, 844, true], ['tablet', 1280, 800, false]]) {
    const tab = await openTab(width, height, mobile);
    await tab.run(async () => {
      const { mount, unmount, tick } = await import('/node_modules/.vite/deps/svelte.js');
      const Component = (await import('/src/components/DiveProfile.svelte')).default;
      const { t } = await import('/src/lib/i18n.js');
      const full = {
        timeSeconds: [0, 60], depthMm: [0, 10000], temperatureMk: [293150, 291150],
        ppo2Mbar: [400, 800], cylinder: [0, 0], ceilingMm: [0, 1000], tissues: Array(32).fill(50),
      };
      const props = { samples: full, cylinders: [{ gas: 'Air', o2Permille: 210 }], divemode: 'OC', maxDepthMm: 10000, durationSeconds: 60, prefs: { length: 'm', temperature: 'C', pressure: 'bar' } };
      const instances = [];
      window.__layerTest = {
        async add(samples = full) {
          const target = document.createElement('div');
          target.style.width = '320px';
          document.body.append(target);
          const component = mount(Component, { target, props: { ...props, samples } });
          instances.push({ target, component });
          await tick();
          return instances.length - 1;
        },
        async remove(index) {
          await unmount(instances[index].component);
          instances[index].target.remove();
        },
        state(index) {
          const target = instances[index].target;
          const names = ['temperature', 'gas', 'ppo2', 'ceiling', 'tissues'];
          return Object.fromEntries(names.map((name) => {
            const labels = name === 'temperature' ? [t('profile.temperature'), t('profile.temperatureShort')] : [t(`profile.${name}`)];
            const button = [...target.querySelectorAll('.bc-dive-profile--filter')].find((b) => labels.includes(b.querySelector('.chip-label')?.textContent));
            return [name, button ? button.getAttribute('aria-pressed') === 'true' : null];
          }));
        },
        async toggle(index, name) {
          const labels = name === 'temperature' ? [t('profile.temperature'), t('profile.temperatureShort')] : [t(`profile.${name}`)];
          const button = [...instances[index].target.querySelectorAll('.bc-dive-profile--filter')].find((b) => labels.includes(b.querySelector('.chip-label')?.textContent));
          if (!button) throw new Error(`Missing ${name} chip`);
          button.click();
          await tick();
        },
        sparse: { ...full, temperatureMk: [], ppo2Mbar: [], tissues: [], cylinder: [-1, -1], ceilingMm: [] },
        scale(index) {
          const target = instances[index].target;
          return target.querySelector('.bc-dive-profile--ppo2-label') ? 'ppo2' : target.querySelector('.bc-dive-profile--temperature-label') ? 'temperature' : 'none';
        },
      };
      await window.__layerTest.add();
      await window.__layerTest.add();
    });
    expect(`${label}: the second profile starts with the existing default`, { state: JSON.stringify({ temperature: true, gas: false, ppo2: false, ceiling: false, tissues: false }) }, { state: JSON.stringify(await tab.run(() => window.__layerTest.state(1))) });
    await tab.run(async () => {
      for (const name of ['temperature', 'gas', 'ppo2', 'ceiling', 'tissues']) await window.__layerTest.toggle(0, name);
    });
    expect(`${label}: choices update another mounted profile`, { state: JSON.stringify({ temperature: false, gas: true, ppo2: true, ceiling: true, tissues: true }), scale: 'ppo2' }, await tab.run(() => ({ state: JSON.stringify(window.__layerTest.state(1)), scale: window.__layerTest.scale(1) })));
    await tab.run(async () => {
      await window.__layerTest.remove(0);
      await window.__layerTest.remove(1);
      await window.__layerTest.add(window.__layerTest.sparse);
      await window.__layerTest.add();
    });
    expect(`${label}: unavailable curves return when the next dive has data`, { state: JSON.stringify({ temperature: false, gas: true, ppo2: true, ceiling: true, tissues: true }) }, { state: JSON.stringify(await tab.run(() => window.__layerTest.state(3))) });
    await tab.run(async () => window.__layerTest.toggle(3, 'temperature'));
    expect(`${label}: the last enabled right-hand scale wins`, { scale: 'temperature' }, await tab.run(() => ({ scale: window.__layerTest.scale(3) })));
    await tab.run(async () => {
      for (const name of ['temperature', 'gas', 'ppo2', 'ceiling', 'tissues']) await window.__layerTest.toggle(3, name);
      await window.__layerTest.remove(3);
      await window.__layerTest.add();
    });
    expect(`${label}: turning every curve off is remembered`, { state: JSON.stringify({ temperature: false, gas: false, ppo2: false, ceiling: false, tissues: false }) }, { state: JSON.stringify(await tab.run(() => window.__layerTest.state(4))) });
    await tab.send('Page.reload');
    await sleep(1800);
    const restarted = await tab.run(async () => {
      const { sessionLayers } = await import('/src/lib/profile-layers.js');
      let value;
      const unsubscribe = sessionLayers.subscribe((layers) => (value = layers));
      unsubscribe();
      return JSON.stringify(value);
    });
    expect(`${label}: a new app session restores the default`, { state: '["temperature"]' }, { state: restarted });
    tab.ws.close();
  }
}

try {
  const fixed = !args.has('--monkey-only') && !args.has('--gestures-only') && !args.has('--regressions-only') && !args.has('--export-only') && !args.has('--computer-photo-only') && !args.has('--units-only') && !args.has('--profile-insets-only') && !args.has('--gear-add-only') && !args.has('--gear-type-dialog-only') && !args.has('--profile-layers-only') && !args.has('--certs-fab-only') && !args.has('--cert-agencies-only') && !args.has('--settings-computers-only');
  /** One check: every key of `want` has that value in `got`. */
  const expect = (label, want, got) => {
    checks++;
    const bad = Object.entries(want).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k} is ${JSON.stringify(got[k])}, expected ${JSON.stringify(v)}`);
    if (bad.length) {
      failures.push({ label, problems: bad, got });
      console.log(`  FAIL ${label}: ${bad.join('; ')}`);
    } else console.log(`  ok   ${label}`);
  };
  if (args.has('--export-only') || fixed) await exportFlows(expect);
  if (args.has('--computer-photo-only') || (fixed && !args.has('--phone-only') && !args.has('--tablet-only') && !args.has('--welcome-only'))) await computerPhotoFlows(expect);
  if (args.has('--units-only') || fixed) await unitsMenuFlows(expect);
  if (args.has('--profile-insets-only') || (fixed && !args.has('--phone-only') && !args.has('--welcome-only'))) await profileInsetsFlows(expect);
  if (args.has('--gear-add-only') || (fixed && !args.has('--phone-only') && !args.has('--welcome-only'))) await gearAddFlows(expect);
  if (args.has('--gear-type-dialog-only') || fixed) await gearTypeDialogFlows(expect);
  if (args.has('--certs-fab-only') || (fixed && !args.has('--phone-only') && !args.has('--welcome-only'))) await certsFabFlows(expect);
  if (args.has('--cert-agencies-only') || fixed) await certificationAgencyFlows(expect);
  if (args.has('--settings-computers-only') || fixed) await settingsComputersFlows(expect);
  if (args.has('--profile-layers-only') || fixed) await profileLayersFlows(expect);
  if (fixed && !args.has('--tablet-only') && !args.has('--welcome-only')) await phoneFlows();
  if (fixed && !args.has('--tablet-only')) await welcomeFlows();
  if (fixed && !args.has('--phone-only')) await tabletFlows();
  if (fixed && !args.has('--phone-only') && !args.has('--tablet-only')) await desktopFlows();
  // The touches the system takes away (tests/e2e/navigation-gestures.mjs).
  if (args.has('--gestures-only') || (fixed && !args.has('--tablet-only') && !args.has('--welcome-only'))) {
    await gestureFlows({ openTab, sleep, settled, tapDive, tapText, tapBack, hardwareBack, readStack, expect, failureCount: () => failures.length });
  }
  // The faults the random sequences found (tests/e2e/navigation-regressions.mjs).
  if (args.has('--regressions-only') || (fixed && !args.has('--tablet-only') && !args.has('--welcome-only'))) {
    await regressionFlows({ openTab, sleep, settled, tapDive, tapText, tapBack, hardwareBack, readStack, expect, failureCount: () => failures.length });
  }
  // Seeded random sequences (tests/e2e/navigation-monkey.mjs).
  if (args.has('--monkey-only') || (fixed && !args.has('--no-monkey') && !args.has('--tablet-only') && !args.has('--phone-only') && !args.has('--welcome-only'))) {
    await monkeyFlows({
      openTab,
      sleep,
      blankTab: async () => (await (await fetch(`${wsBase}/json/new?about:blank`, { method: 'PUT' })).json()).id,
      activate: (id) => fetch(`${wsBase}/json/activate/${id}`),
      count: () => void checks++,
      fail: (label, problems, extra = {}) => {
        failures.push({ label, problems, ...extra });
        console.log(`  FAIL ${label}: ${problems.join('; ')}`);
      },
    });
  }
} catch (e) {
  failures.push({ label: 'the run', problems: [String(e.stack ?? e)] });
  console.log(`  ERROR ${e.stack ?? e}`);
}
console.log(`\n${checks} checks, ${failures.length} failure(s)`);
if (failures.length) console.log(JSON.stringify(failures.slice(0, 3), null, 1));
process.exitCode = failures.length ? 1 : 0;
cleanup();
setTimeout(() => process.exit(process.exitCode), 300);
