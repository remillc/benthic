// SPDX-License-Identifier: GPL-2.0
// The navigation « monkey »: seeded random sequences of what a diver's fingers and the system can do to the page
// stack, run by tests/e2e/navigation.mjs after its fixed flows (docs/architecture.md, section 13).
//
//   node tests/e2e/navigation.mjs --monkey-only
//   OD_MONKEY_SEEDS=7,8,9 OD_MONKEY_STEPS=400 node tests/e2e/navigation.mjs --monkey-only     (a long run)
//   OD_MONKEY_SEED=1234 OD_MONKEY_CONFIG=phone-md node tests/e2e/navigation.mjs --monkey-only  (replays one failure)
// OD_MONKEY_VERBOSE=1 prints each action; OD_MONKEY_MAX_MIN stops the run after that many minutes.
//
// Each step is one action picked by the seed: a tap on something of the top layer, the navbar's arrow, the system
// Back, a swipe back from the edge, the system's own back gesture (the touch starts in the page, the system takes it
// away: `touchcancel`, then Back or nothing), a swipe between sections or dives, the account sheet, a section of the
// bottom bar, the app sent to the background and back. Half of the steps are chained without waiting for the page to
// settle, to land inside the transitions.
//
// After each settled step the invariants of app/src/lib/nav-invariants.js are checked with the app's own code (one
// current page per view, no transition class left, history and pages in step, no hold left, no fragment in the
// address, no orphan scrim), plus what only a test can see: the page under the middle of the screen belongs to the
// top layer, and Back does something visible within a second. A failure prints its seed, the last actions and the
// app's navigation trace; the page is then reloaded and the seed goes on.

/** Labels the monkey never taps: they erase data, leave the app or open a system screen. */
const AVOID = 'supprim|delete|effac|erase|réinitialis|reset|déconnect|sign out|log out|remplacer|replace|partager|share|export|import|envoyer|send|scann|photo|qr|fusionner|merge|vider|restaur|restore|retirer|rejouer|replay|imprimer|print';

/** A small seeded generator (mulberry32). @param {number} seed */
function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** @param {number} lo @param {number} hi */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** @template T @param {T[]} list @returns {T} */
    pick: (list) => list[Math.floor(next() * list.length)],
    /** @param {number} p */
    chance: (p) => next() < p,
  };
}

export const CONFIGS = {
  'phone-md': { width: 390, height: 844, mobile: true, theme: 'md' },
  'phone-ios': { width: 390, height: 844, mobile: true, theme: 'ios' },
  'tablet-md': { width: 1280, height: 800, mobile: false, theme: 'md' },
};

// --- Run in the page ---------------------------------------------------------------------------------------------

/** What can be tapped in the top layer. */
function readTappables(avoid) {
  const re = new RegExp(avoid, 'i');
  const out = [];
  for (const el of document.querySelectorAll('a, button, [role=button], [role=tab], [role=option], [role=menuitem], [role=radio], label.item-content')) {
    if (el.closest('.bc-dev-tools-menu, .bc-dev-tools-host, .bc-route-badge')) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const href = el.getAttribute('href') || '';
    if (/^(https?:|mailto:|tel:)/.test(href) || el.classList.contains('external') || el.target === '_blank') continue;
    const label = `${el.getAttribute('aria-label') || ''} ${el.textContent}`.replace(/\s+/g, ' ').trim().slice(0, 50);
    if (re.test(label) || re.test(href)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const x = Math.min(Math.max(r.x + r.width / 2, 1), innerWidth - 2);
    const y = Math.min(Math.max(r.y + Math.min(r.height / 2, 24), 1), innerHeight - 2);
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(el === hit || el.contains(hit))) continue;
    out.push({ x, y, label: label || href || el.className.slice(0, 30), back: el.classList.contains('back') && !!el.closest('.navbar'), nav: !!el.closest('.bc-navigation-bar, .bc-nav-rail, .toolbar.tabbar'), avatar: !!el.closest('.bc-account-avatar') || el.classList.contains('bc-account-avatar') });
  }
  return out;
}

/** The app's own invariants (app/src/lib/nav-invariants.js) and what only the test looks at. */
async function readHealth() {
  const inv = await import('/src/lib/nav-invariants.js');
  const app = inv.readApp();
  const view = document.querySelector('.views > .view.tab-active');
  const router = view?.f7View?.router;
  const modals = [...document.querySelectorAll('.modal-in:not(.toast)')];
  const top = modals[modals.length - 1] ?? null;
  // The middle of the screen belongs to the top layer: an open modal or its scrim, else the active section's current page.
  const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const current = view ? [...view.querySelectorAll(':scope > .page-current')] : [];
  const layerOk = !hit || !!hit.closest('.modal-in, .modal-out, .backdrop-in, .panel, .panel-backdrop, .bc-fab-menu, [popover], .bc-map-fullscreen, [class*="bc-select-field--"], .bc-row-menu') || current.some((p) => p.contains(hit)) || !!hit.closest('.bc-navigation-bar, .bc-nav-rail') || (!!view && view.classList.contains('view-master-detail') && view.contains(hit));
  let trace = null;
  try {
    trace = await import('/src/lib/nav-trace.js');
  } catch {}
  return {
    moving: inv.appIsMoving(app) || !!document.querySelector('.modal-out, .panel-in-swipe, .bc-tab-sliding'),
    problems: inv.checkApp(app),
    layerOk,
    hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)}` : '',
    broken: trace ? trace.traceEvents().filter((e) => e.type === 'broken').length : 0,
    // What Back can change: when it does nothing of this, it did nothing the diver can see.
    signature: JSON.stringify({
      tab: view?.id ?? '',
      route: router?.currentRoute?.url ?? '',
      depth: router?.history?.length ?? 0,
      modals: modals.map((m) => m.className.split(' ').slice(0, 3).join('.')),
      inner: top?.querySelector('.view')?.f7View?.router?.currentRoute?.url ?? '',
      step: document.querySelector('.bc-welcome.modal-in .bc-first-launch--step:last-of-type')?.getAttribute('data-step') ?? '',
      panel: !!document.querySelector('.panel.panel-in'),
      fab: !!document.querySelector('.bc-fab-menu--open, .fab-opened'),
      search: !!document.querySelector('.view.tab-active .searchbar-enabled, .bc-sites--search.bc-sites--open'),
      menus: document.querySelectorAll('.bc-row-menu, .bc-select-field--open, .bc-map-site-card, .bc-map-fullscreen, .bc-edit-gas--open, [popover]:popover-open').length,
      selection: !!document.querySelector('.bc-logbook--selection-bar'),
      wizard: document.querySelector('.page-current .bc-delete-wizard--body')?.getAttribute('data-step') ?? '',
    }),
    // Back from here sends the app to the background: nothing changes on screen.
    exit: !modals.length && view?.id === 'view-logbook' && (router?.history?.length ?? 1) <= 1 && !document.querySelector('.panel.panel-in, .bc-fab-menu--open, .fab-opened, .searchbar-enabled, .bc-logbook--selection-bar, .bc-row-menu, .bc-select-field--open, [popover]:popover-open'),
    exitSplit: !modals.length && view?.id === 'view-logbook' && !!view?.classList.contains('view-master-detail') && !!view.querySelector(':scope > .page-current.page-master-detail-root, :scope > .page-master:only-child'),
  };
}

/** The pages of the section on screen, with their place and role, and the history of its router. */
function readPages() {
  const view = document.querySelector('.views > .view.tab-active');
  const pages = [...(view?.children ?? [])].filter((el) => el.classList.contains('page')).map((el) => `${(el.f7Page?.route?.url ?? '?').split('?')[0]}[${[...el.classList].filter((c) => c.startsWith('page-')).map((c) => c.slice(5)).join(',')}]`);
  return `${pages.join('  ')} | history ${JSON.stringify(view?.f7View?.router?.history ?? [])} | ${view?.className ?? ''}`;
}

async function readTrace() {
  try {
    return (await import('/src/lib/nav-trace.js')).traceText();
  } catch {
    return '';
  }
}

// --- The monkey --------------------------------------------------------------------------------------------------

/**
 * @param {object} h the harness of navigation.mjs
 * @param {Function} h.openTab
 * @param {(targetId: string) => Promise<unknown>} h.activate brings a tab to the front
 * @param {() => Promise<string>} h.blankTab opens an empty tab and returns its id
 * @param {(ms: number) => Promise<void>} h.sleep
 * @param {(label: string, problems: string[], extra?: object) => void} h.fail
 * @param {() => void} h.count one more check made
 */
export async function monkeyFlows(h) {
  const { sleep } = h;
  const steps = Number(process.env.OD_MONKEY_STEPS || 45);
  const only = process.env.OD_MONKEY_CONFIG;
  const one = process.env.OD_MONKEY_SEED;
  /** @type {Record<string, number[]>} */
  const plan = one
    ? { [only || 'phone-md']: [Number(one)] }
    : process.env.OD_MONKEY_SEEDS
      ? Object.fromEntries(Object.keys(CONFIGS).filter((c) => !only || c === only).map((c) => [c, process.env.OD_MONKEY_SEEDS.split(',').map(Number)]))
      : { 'phone-md': [101, 102, 103], 'phone-ios': [201], 'tablet-md': [301] };
  const summary = [];
  /** OD_MONKEY_IGNORE: problems that are not counted (a regular expression), to compare with an older code that has them by design. */
  const ignore = process.env.OD_MONKEY_IGNORE ? new RegExp(process.env.OD_MONKEY_IGNORE) : null;
  const counted = (/** @type {string[]} */ list) => (ignore ? list.filter((p) => !ignore.test(p)) : list);
  const blank = await h.blankTab();
  const started = Date.now();
  /** OD_MONKEY_MAX_MIN: the run stops by itself after this many minutes (the seeds left are not run). */
  const maxMs = Number(process.env.OD_MONKEY_MAX_MIN || 0) * 60000;

  for (const [name, seeds] of Object.entries(plan)) {
    const config = CONFIGS[name];
    for (const seed of seeds) {
      console.log(`Monkey ${name}, seed ${seed}, ${steps} steps`);
      const rng = random(seed);
      // One seed in three runs with « Remove animations », one in three on a slow processor.
      const reduced = seed % 3 === 1;
      const throttle = seed % 3 === 2 ? 4 : 0;
      let tab = await h.openTab(config.width, config.height, config.mobile, false, false, { theme: config.theme, reducedMotion: reduced, throttle });
      tab.onEvent = (m) => {
        if (m.method === 'Page.javascriptDialogOpening') tab.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
      };
      /** @type {string[]} */
      const actions = [];
      let failures = 0;
      let brokenSeen = 0;
      const note = (/** @type {string} */ text) => {
        actions.push(text);
        if (process.env.OD_MONKEY_VERBOSE) console.log(`    ${text}`);
      };
      /** A call to the page that cannot wait for ever (a page that stopped answering is a finding, not a hang). */
      const limit = (/** @type {Promise<any>} */ p, /** @type {string} */ what) =>
        Promise.race([p, sleep(10000).then(() => Promise.reject(new Error(`no answer to ${what}`)))]);
      const send = (/** @type {string} */ method, /** @type {object} */ params = {}) => limit(tab.send(method, params), method);
      const run = (/** @type {Function} */ fn, /** @type {any[]} */ ...a) => limit(tab.run(fn, ...a), fn.name || 'run');

      const touch = (/** @type {string} */ type, /** @type {number} */ x = 0, /** @type {number} */ y = 0) =>
        send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: Math.round(x), y: Math.round(y) }] }).catch(() => {});
      const tap = async (/** @type {number} */ x, /** @type {number} */ y) => {
        await touch('touchStart', x, y);
        await sleep(rng.int(15, 50));
        await touch('touchEnd');
      };
      const drag = async (/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y, /** @type {{ steps?: number, pause?: number, cancelAt?: number }} */ o = {}) => {
        const n = o.steps ?? rng.int(3, 9);
        await touch('touchStart', x0, y);
        for (let i = 1; i <= n; i++) {
          await touch('touchMove', x0 + ((x1 - x0) * i) / n, y + (i % 2));
          await sleep(o.pause ?? 16);
          if (o.cancelAt && i >= o.cancelAt) return touch('touchCancel');
        }
        return touch('touchEnd');
      };
      const systemBack = () => run(() => window.dispatchEvent(new Event('od:back'))).catch(() => {});

      /** The actions, by weight. Each returns false when it had nothing to do. */
      const moves = {
        async tapAnything() {
          const all = await run(readTappables, AVOID).catch(() => []);
          const list = all.filter((t) => !t.back);
          if (!list.length) return false;
          const t = rng.pick(list);
          note(`tap « ${t.label} »`);
          await tap(t.x, t.y);
        },
        async backArrow() {
          const arrow = (await run(readTappables, AVOID).catch(() => [])).find((t) => t.back);
          if (!arrow) return false;
          note('back arrow');
          await tap(arrow.x, arrow.y);
        },
        async systemBack() {
          note('system Back');
          await systemBack();
        },
        async swipeBack() {
          const x1 = rng.pick([40, 90, 180, 300, 370]);
          const y = rng.int(180, config.height - 200);
          const slow = rng.chance(0.4);
          note(`swipe back to ${x1}${slow ? ' (slow)' : ''}`);
          await drag(rng.int(1, 24), x1, y, slow ? { steps: 12, pause: 30 } : {});
        },
        /** Android's own back gesture: the page sees the touch start and a few moves, then the system takes the touch. */
        async systemGesture() {
          const right = rng.chance(0.25);
          const x0 = right ? config.width - rng.int(1, 16) : rng.int(1, 16);
          const reach = rng.int(8, 70) * (right ? -1 : 1);
          const n = rng.int(1, 4);
          const y = rng.int(160, config.height - 180);
          const commit = rng.chance(0.75);
          const gap = rng.pick([0, 0, 20, 60, 150, 320]);
          note(`system gesture from the ${right ? 'right' : 'left'} edge, ${n} moves over ${reach} px, ${commit ? `Back after ${gap} ms` : 'given up'}`);
          await drag(x0, x0 + reach, y, { steps: n, cancelAt: n, pause: 12 });
          if (commit) {
            await sleep(gap);
            await systemBack();
          }
        },
        async swipeSideways() {
          const left = rng.chance(0.5);
          const y = rng.int(200, config.height - 220);
          const far = rng.chance(0.6);
          const cancel = rng.chance(0.2);
          const x0 = left ? rng.int(250, 340) : rng.int(60, 140);
          const x1 = left ? x0 - (far ? 220 : 40) : x0 + (far ? 220 : 40);
          const n = rng.int(4, 8);
          note(`swipe ${left ? 'left' : 'right'} ${far ? 'far' : 'short'}${cancel ? ', taken by the system' : ''}`);
          await drag(x0, x1, y, { steps: n, ...(cancel ? { cancelAt: rng.int(1, n) } : {}) });
        },
        async section() {
          const list = (await run(readTappables, AVOID).catch(() => [])).filter((t) => t.nav);
          if (!list.length) return false;
          const t = rng.pick(list);
          note(`section « ${t.label} »`);
          await tap(t.x, t.y);
        },
        async avatar() {
          const t = (await run(readTappables, AVOID).catch(() => [])).find((x) => x.avatar);
          if (!t) return false;
          note('account avatar');
          await tap(t.x, t.y);
        },
        async background() {
          const ms = rng.pick([50, 200, 700]);
          note(`background for ${ms} ms`);
          // Another tab takes the screen: the page is hidden (no frame is drawn, as for an app in the background), then shown again.
          await h.activate(blank).catch(() => {});
          await sleep(ms);
          await h.activate(tab.targetId).catch(() => {});
        },
        async pause() {
          const ms = rng.pick([100, 300, 900]);
          note(`wait ${ms} ms`);
          await sleep(ms);
        },
      };
      const weights = [
        ['tapAnything', 30], ['backArrow', 12], ['systemBack', 14], ['swipeBack', 8], ['systemGesture', 14],
        ['swipeSideways', 8], ['section', 5], ['avatar', 4], ['background', 2], ['pause', 3],
      ];
      const total = weights.reduce((s, [, w]) => s + Number(w), 0);
      const pickMove = () => {
        let r = rng.next() * total;
        for (const [n, w] of weights) if ((r -= Number(w)) < 0) return String(n);
        return 'pause';
      };

      /** Waits for the page to be at rest, then reads it. */
      const settle = async () => {
        let health = null;
        let still = 0;
        let silent = 0;
        for (let i = 0; i < 45 && still < 2 && silent < 2; i++) {
          await sleep(100);
          const read = await run(readHealth).catch(() => null);
          silent = read ? 0 : silent + 1;
          health = read ?? health;
          still = read && !read.moving ? still + 1 : 0;
        }
        if (silent >= 2) return null;
        await sleep(150);
        return (await run(readHealth).catch(() => null)) ?? health;
      };

      const report = async (/** @type {number} */ step, /** @type {string[]} */ problems) => {
        failures++;
        const trace = await run(readTrace).catch(() => '');
        const pages = await run(readPages).catch(() => '');
        h.fail(`monkey ${name} seed ${seed} step ${step}`, problems, { seed, config: name, step, reduced, throttle, actions: actions.slice(-12), trace: trace.split('\n').slice(-60) });
        console.log(`    last actions: ${actions.slice(-8).join(' → ')}`);
        if (pages) console.log(`    pages: ${pages}`);
        if (trace) console.log(`    trace (end):\n      ${trace.split('\n').slice(-25).join('\n      ')}`);
        // A fresh page for the rest of the seed.
        await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
        await h.activate(tab.targetId).catch(() => {});
        // The same address without a fragment (an older code left « #compte » there, which a reload keeps).
        const address = await run(() => location.href.split('#')[0]).catch(() => '');
        await (address ? send('Page.navigate', { url: address }) : send('Page.reload', {})).catch(() => {});
        for (let i = 0; i < 100; i++) {
          await sleep(200);
          if (await run(() => !!document.querySelector('a[href^="/dives/"]')).catch(() => false)) break;
        }
        await sleep(600);
        brokenSeen = 0;
      };

      for (let step = 1; step <= steps; step++) {
        if (maxMs && Date.now() - started > maxMs) break;
        const name1 = pickMove();
        if ((await moves[name1]()) === false) continue;
        // Half of the time a second action lands inside the first one's transition.
        if (rng.chance(0.5)) {
          await sleep(rng.pick([0, 20, 60, 120, 200, 350]));
          await moves[pickMove()]();
        }
        const health = await settle();
        h.count();
        // OD_MONKEY_DUMP=1: the pages of the section on screen after each step (to find where a fault starts).
        if (process.env.OD_MONKEY_DUMP) console.log(`      [${step}] ${await run(readPages).catch(() => '')}`);
        if (!health) {
          await report(step, ['the page did not answer']);
          continue;
        }
        const problems = counted([...health.problems]);
        if (health.moving) problems.push('the page never came to rest');
        if (!health.layerOk) problems.push(`the middle of the screen is not in the top layer (${health.hit})`);
        if (health.broken > brokenSeen) problems.push('the app found its navigation broken (see the trace)');
        brokenSeen = health.broken;
        if (problems.length) {
          await report(step, problems);
          continue;
        }
        // Back always does something visible within a second (except where it sends the app to the background).
        if (rng.chance(0.3) && !health.exit && !health.exitSplit) {
          note('system Back (liveness)');
          await systemBack();
          let changed = false;
          for (let i = 0; i < 12 && !changed; i++) {
            await sleep(100);
            const now = await run(readHealth).catch(() => null);
            changed = !!now && now.signature !== health.signature;
          }
          h.count();
          if (!changed) {
            await report(step, [`Back did nothing within a second on ${health.signature}`]);
            continue;
          }
          const after = await settle();
          h.count();
          const late = after ? [...counted(after.problems), ...(after.moving ? ['the page never came to rest'] : []), ...(after.layerOk ? [] : [`the middle of the screen is not in the top layer (${after.hit})`])] : ['the page did not answer'];
          if (after && after.broken > brokenSeen) late.push('the app found its navigation broken (see the trace)');
          brokenSeen = after?.broken ?? brokenSeen;
          if (late.length) await report(step, late);
        }
      }
      const errors = tab.logs.filter((l) => !/minimizeApp|not implemented|Failed to load resource|net::ERR/i.test(l));
      summary.push({ config: name, seed, steps, failures, consoleErrors: errors.length });
      console.log(`  ${failures ? 'FAIL' : 'ok  '} monkey ${name} seed ${seed}: ${failures} failure(s), ${errors.length} console error(s)`);
      if (errors.length) console.log(`    console: ${[...new Set(errors)].slice(0, 5).join(' | ').slice(0, 600)}`);
      tab.ws.close();
    }
  }
  console.log(`Monkey: ${summary.map((s) => `${s.config}#${s.seed}:${s.failures}`).join(' ')}`);
  return summary;
}
