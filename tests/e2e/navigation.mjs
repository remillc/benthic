// SPDX-License-Identifier: GPL-2.0
// Navigation e2e in a real browser (Chromium headless, driven through the DevTools protocol, no dependency).
//
//   node tests/e2e/navigation.mjs [--tablet-only|--phone-only|--gestures-only|--regressions-only|--monkey-only|--units-only|--no-monkey] [--keep]
//
// It starts the app's development server (app/vite.e2e.config.js, port OD_E2E_PORT, default 5541) and opens the
// app at 390x844 (phone, Material look) and at 1280x800 (tablet), with the sample logbook of the core. After each
// step, once the transitions are over, it checks the invariants of the page stack of the view on screen:
//   - exactly one page is current (the tablet's list and detail: the list plus the detail);
//   - the current page's own route is the router's current route and the last entry of its history;
//   - no page waits as page-next, no page keeps a transform, the view keeps no router-transition class and none of
//     the dive page's swipe classes (od-pushing).
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
    if (await tab.run((w) => !!document.querySelector(w ? '.od-welcome.modal-in .od-first-launch, .od-welcome.modal-in' : 'a[href^="/dives/"]'), welcome).catch(() => false)) break;
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
    if (!/router-transition|od-pushing|od-push-settle/.test(stack.view) && stack.allow !== false && !stack.locks) break;
  }
  const problems = [];
  if (stack.locks) problems.push(`the router is still held (${stack.locks})`);
  const cur = stack.pages.filter((p) => /\bpage-current\b/.test(p.cls));
  if (/router-transition|od-pushing|od-push-settle/.test(stack.view)) problems.push(`the view keeps ${stack.view.replace(/view\s+|tab\S*\s*/g, '').trim()}`);
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
    if (/od-push-from/.test(p.cls)) problems.push(`${p.route} keeps od-push-from`);
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
    await tab.run((on) => document.documentElement.classList.toggle('od-demo-bottom-on', on), demo);
    const row = await tab.run(() => {
      const r = document.querySelector('.page-current a.od-dive-row--link')?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
    });
    if (!row) throw new Error('no dive row');
    await tab.touch('touchStart', row.x, row.y);
    await sleep(900);
    await tab.touch('touchEnd', row.x, row.y);
    await sleep(900);
    if (process.env.OD_SHOTS) await shot(tab, `selection-toolbar${demo ? '-demo' : ''}`);
    const g = await tab.run(() => {
      const t = document.querySelector('.od-floating-toolbar')?.getBoundingClientRect();
      const b = document.querySelector('.od-navigation-bar')?.getBoundingClientRect();
      return { toolbar: t ? t.bottom : null, bar: b ? b.top : null };
    });
    checks++;
    if (g.toolbar === null || g.bar === null || g.toolbar > g.bar) failures.push({ label: `selection toolbar (banner ${demo})`, problems: [`toolbar bottom ${g.toolbar}, bottom bar top ${g.bar}`] });
    else console.log(`  ok   toolbar bottom ${Math.round(g.toolbar)} <= bar top ${Math.round(g.bar)} (banner ${demo})`);
    await hardwareBack(tab);
    await sleep(500);
  }
  await tab.run(() => document.documentElement.classList.remove('od-demo-bottom-on'));
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

  // Dive validation by signature (task 2026-11-19-309, point 2; OpenDives+): « Faire valider » of the dive's Validations
  // section, the choice, the signature drawn with the finger, « Valider »; the dive shows the validation, the logbook marks
  // the dive, and the validation can be removed. The stack stays sound at every step.
  console.log(' dive > validate by signature > Back');
  await tapDive(tab);
  await settled(tab, 'validation: dive opened', { route: /^\/dives\/\d+$/ });
  const validated = (await tab.run(readStack)).current;
  await tab.run(() => window.__odplusAccount({ signedIn: true, subscribed: true, email: 'diver@opendives.test' }));
  await sleep(800);
  await tapText(tab, '^\\s*(Faire valider|Get it validated)\\s*$');
  await settled(tab, 'validation: choice opened', { route: /^\/validate(\?.*)?$/ });
  await tapText(tab, 'Signature sur cet écran|Signature on this screen');
  await sleep(300);
  await tab.run(() => {
    const field = document.querySelector('.page-current .od-validate--fields input');
    field.value = 'Marc Gagnon';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const pad = await tab.run(() => {
    const r = document.querySelector('.page-current canvas.od-signature-pad').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await tab.touch('touchStart', pad.x + pad.w * 0.2, pad.y + pad.h * 0.6);
  for (let i = 1; i <= 8; i++) {
    await tab.touch('touchMove', pad.x + pad.w * (0.2 + 0.075 * i), pad.y + pad.h * (0.6 - 0.3 * Math.sin(i / 2)));
    await sleep(16);
  }
  // The finger rests before it is lifted. Lifted while moving, the stroke ends as a fling, and the browser takes the tap
  // that follows within a moment for « stop the fling »: it sends the touch to « Valider » but no click (seen on
  // 19 November 2026: the page stayed on /validate because the button was never clicked, not because Back failed).
  await sleep(300);
  await tab.touch('touchEnd', pad.x + pad.w * 0.8, pad.y + pad.h * 0.5);
  await sleep(200);
  const enabled = await tab.run(() => ![...document.querySelectorAll('.page-current .navbar a')].some((a) => /Valider|Validate/.test(a.textContent) && a.classList.contains('disabled')));
  checks++;
  if (!enabled) failures.push({ label: 'validation: Valider enabled', problems: ['« Valider » stays disabled after a name and a signature'] });
  if (process.env.OD_SHOTS) await shot(tab, 'validation-signature');
  await tapText(tab, '^\\s*(Valider|Validate)\\s*$', '.page-current .navbar');
  for (let i = 0; i < 60 && (await tab.run(readStack)).current !== validated; i++) await sleep(100);
  await settled(tab, 'validation: back on the dive', { route: validated });
  const shown = await tab.run(() => ({
    text: document.querySelector('.page-current .od-dive-validations')?.textContent ?? '',
    signature: !!document.querySelector('.page-current .od-dive-validations--signature'),
  }));
  checks++;
  if (!/Marc Gagnon/.test(shown.text) || !shown.signature) failures.push({ label: 'validation: section', problems: ['the Validations section shows "' + shown.text.slice(0, 80) + '", signature ' + shown.signature] });
  if (process.env.OD_SHOTS) await shot(tab, 'validation-detail');
  await tapBack(tab);
  await settled(tab, 'validation: back to the logbook', { route: '/' });
  const marked = await tab.run(() => !!document.querySelector('.page-current .od-dive-row--validated'));
  checks++;
  if (!marked) failures.push({ label: 'validation: mark', problems: ['no mark on the validated dive in the logbook list'] });
  await tapDive(tab);
  await settled(tab, 'validation: dive reopened', { route: /^\/dives\/\d+$/ });
  await tapText(tab, 'Retirer la validation|Remove the validation');
  await sleep(500);
  await tapText(tab, '^\\s*(Retirer|Remove)\\s*$', '.dialog');
  await sleep(500);
  const gone = await tab.run(() => !document.querySelector('.page-current .od-dive-validations--item'));
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
    const toast = await tab.run(() => !!document.querySelector('.toast.od-undo-toast'));
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
    await tab.run(() => document.querySelector('.page-current .od-account-avatar, .od-account-avatar')?.click());
    await sleep(700);
    await tab.run(() => [...document.querySelectorAll('.od-account-sheet a, .od-account-sheet button')].find((el) => el.getAttribute('href') === '#settings' || el.getAttribute('data-row') === 'settings' || /^\s*(Réglages|Settings)\s*$/.test(el.textContent))?.click());
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
      const l = [...document.querySelectorAll('.page-current .od-chips-field--label')].find((x) => re.test(x.textContent.trim()));
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
    if (!(await tab.run(() => document.querySelectorAll('.page-current .od-chips-field--proposals button').length > 1))) await tab.send('Input.insertText', { text: 'a' });
    await sleep(300);
    if (process.env.OD_SHOTS) await shot(tab, `suggestions-${label.replace(/\W/g, '')}-${process.env.OD_THEME === 'ios' ? 'ios' : 'android'}`);
    const res = await tab.run(() => {
      const ul = [...document.querySelectorAll('.page-current .od-chips-field--proposals')].find((u) => u.getClientRects().length);
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
  await tapText(tab, '^(Quitter|Leave)$', '.od-leave-guard--dialog').catch(() => {});
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
  for (let i = 0; i < 40 && here && !(await tab.run(() => !!document.querySelector('.od-quick-entry [role=option][aria-selected=true]'))); i++) await sleep(200);
  if (process.env.OD_SHOTS) await shot(tab, `quick-entry-${process.env.OD_THEME === 'ios' ? 'ios' : 'android'}`);
  if (here) {
    const preselected = await tab.run(() => document.querySelector('.od-quick-entry [role=option][aria-selected=true] .od-quick-entry--nearest')?.textContent ?? '');
    checks++;
    if (!/\S/.test(preselected)) {
      failures.push({ label: 'quick entry: nearest site', problems: [`no preselected nearest site for ${here.name}`] });
      console.log('  FAIL quick entry: the nearest site is not preselected');
    } else console.log('  ok   quick entry: the nearest site is preselected');
  }
  const sawSite = await tab.run(() => !!document.querySelector('.od-quick-entry [role=listbox]') && document.querySelectorAll('.od-quick-entry [role=option]').length > 0);
  checks++;
  if (!sawSite) {
    failures.push({ label: 'quick entry: site list', problems: ['no site rows'] });
    console.log('  FAIL quick entry: the site list is empty');
  } else console.log('  ok   quick entry: the site list shows');
  await tapText(tab, '^\s*(Chercher un autre site|Search for another site)\s*$', '.od-quick-entry');
  await settled(tab, 'quick entry > Choose a site', { route: '/sites/choose' });
  await tapBack(tab);
  await settled(tab, 'back to the quick entry', { route: quickRoute });
  await tapText(tab, '^\s*(Enregistrer|Save)\s*$', '.od-quick-entry');
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
  for (let i = 0; i < 60 && (await tab.run(() => !!document.querySelector('.toast.od-undo-toast'))); i++) await sleep(200);

  console.log(' error report sheet over the Download page and over the logbook');
  for (const where of ['/download', '/']) {
    if (where !== '/') {
      await tab.run((r) => { document.querySelector('.view-main').f7View.router.navigate(r); }, where);
      await settled(tab, 'download opened', { route: where });
    }
    // A forced error: the report sheet opens, both buttons answer, and the page is usable afterwards.
    // At most three offers per session: decline over both pages, and « Envoyer » once over the Download page (no server
    // answers in this test: the sheet then shows « Plus tard », which closes it).
    for (const [button, label] of where === '/' ? [['.od-error-report--secondary', 'decline']] : [['.od-error-report--secondary', 'decline'], ['.od-error-report--primary', 'send']]) {
      await tab.run((n) => window.dispatchEvent(new ErrorEvent('error', { error: new Error(`forced report ${n}`), message: `forced report ${n}` })), `${where}-${label}-${Date.now()}`);
      let up = false;
      for (let i = 0; i < 25 && !up; i++) {
        await sleep(200);
        up = await tab.run(() => !!document.querySelector('.od-error-report.modal-in'));
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
        if (await tab.run(() => !!document.querySelector('.od-error-report.modal-in'))) {
          const later = await boxOf(tab, () => {
            const r = document.querySelector('.od-error-report--secondary')?.getBoundingClientRect();
            return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
          });
          if (later) await tab.tapAt(later.x, later.y);
        }
      }
      let closed = false;
      for (let i = 0; i < 25 && !closed; i++) {
        await sleep(200);
        closed = await tab.run(() => !document.querySelector('.od-error-report.modal-in') && !document.querySelector('.sheet-backdrop-in'));
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
  const sheetState = () => tab.run(() => ({ hash: location.hash, sheet: !!document.querySelector('.od-account-sheet.modal-in, .sheet-modal.modal-in .od-account-sheet--row, .modal-in .od-account-sheet--row'), welcome: !!document.querySelector('.od-welcome.modal-in'), len: history.length }));
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
  for (const [row, route, page] of [['#profile', '/profile', '.od-profile, .od-profile-page, .page-current'], ['#backup', '/account/backup', '.od-backup-not-on-server']]) {
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
    await tapText(tab, pattern, '.toolbar, .od-bottom-nav, .tabbar').catch(() => tab.run((l) => [...document.querySelectorAll('.toolbar a, .tabbar a')].find((a) => a.textContent.trim() === l)?.click(), label));
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
  return tab.run(() => document.querySelector('.od-welcome.modal-in .od-first-launch--step:last-of-type')?.getAttribute('data-step') ?? null);
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
  console.log(await tab.run(() => document.querySelector('.od-welcome')?.outerHTML.slice(0, 1500)));
  await expectStep(tab, 'first launch opens on the first step', 'start');
  const welcomeTap = (pattern) => tapText(tab, pattern, '.od-welcome.modal-in');
  const cases = [
    ['Import a logbook / Importer un carnet', '^\s*(Import a logbook|Importer un carnet)', 'import'],
    ['New logbook / Commencer un carnet', '^\s*(Start a logbook|Commencer un carnet)', 'new'],
    ['Sign in or create an account', '(Sign in|Se connecter)', 'odplusConnect'],
  ];
  for (const [name, pattern, step] of cases) {
    await welcomeTap(pattern).catch(async (e) => { console.log(await tab.run(() => [...document.querySelectorAll('.od-welcome.modal-in button, .od-welcome.modal-in a')].map((b) => b.textContent.trim().slice(0, 30) + '@' + Math.round(b.getBoundingClientRect().y)).join(' | '))); throw e; });
    await expectStep(tab, `${name}: opens`, step);
    await hardwareBack(tab);
    await expectStep(tab, `${name}: Back returns to the first step`, 'start');
  }
  await hardwareBack(tab);
  await sleep(300);
  checks++;
  if (!(await tab.run(() => !!document.querySelector('.od-welcome.modal-in')))) failures.push({ label: 'first step', problems: ['Back on the first step closed the first launch'] });
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

/** Pages opened over a section (the profile, an equipment piece) must have room in the desktop layout, with Settings opened before. */
async function desktopFlows() {
  console.log('Desktop, 1400x900: pages opened over Réglages');
  const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  await tab.run(() => !!document.querySelector('.od-desktop-logbook--table'));
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
      const imperial = [...document.querySelectorAll('.od-settings--segmented [role="radio"]')].find((el) => /impérial|imperial/i.test(el.textContent));
      if (!imperial) throw new Error('imperial unit system missing');
      imperial.click();
    });
    await sleep(700);
    await tab.run(() => {
      const row = [...document.querySelectorAll('.od-settings--row')].find((el) => /température|temperature/i.test(el.textContent));
      if (!row) throw new Error('temperature row missing');
      row.click();
    });
    await sleep(300);
    await tab.run(() => {
      const option = [...document.querySelectorAll('.od-row-menu [role="option"]')].find((el) => /°C/.test(el.textContent));
      if (!option) throw new Error('Celsius option missing');
      option.click();
    });
    await sleep(700);
    const result = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const row = [...document.querySelectorAll('.od-settings--row')].find((el) => /température|temperature/i.test(el.textContent));
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
      const row = [...document.querySelectorAll('.od-settings--row')].find((el) => /température|temperature/i.test(el.textContent));
      row.click();
    });
    await sleep(300);
    await tab.run(() => document.querySelector('.od-row-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await sleep(300);
    const cancelled = await tab.run(() => ({
      closed: !document.querySelector('.od-row-menu'),
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

try {
  const fixed = !args.has('--monkey-only') && !args.has('--gestures-only') && !args.has('--regressions-only') && !args.has('--units-only');
  /** One check: every key of `want` has that value in `got`. */
  const expect = (label, want, got) => {
    checks++;
    const bad = Object.entries(want).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k} is ${JSON.stringify(got[k])}, expected ${JSON.stringify(v)}`);
    if (bad.length) {
      failures.push({ label, problems: bad, got });
      console.log(`  FAIL ${label}: ${bad.join('; ')}`);
    } else console.log(`  ok   ${label}`);
  };
  if (args.has('--units-only') || fixed) await unitsMenuFlows(expect);
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
