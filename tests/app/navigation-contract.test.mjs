// The navigation contract (docs/architecture.md, section 13), checked on the sources: one owner of the history (the
// routers, in memory), one passage for page changes (lib/router-guard.js), one Back dispatcher (lib/back-button.js),
// one swipe back (lib/swipe-back.js). A new file that goes around one of them fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

/** Every source file of the app: [path, text]. */
const sources = ['', 'components/', 'pages/', 'lib/'].flatMap((dir) =>
  readdirSync(new URL(dir, root))
    .filter((f) => /\.(svelte|js)$/.test(f))
    .map((f) => [`${dir}${f}`, read(`${dir}${f}`)]),
);

/** The files where `pattern` is found, outside `allowed`. */
const users = (pattern, allowed = []) => sources.filter(([path, text]) => !allowed.includes(path) && pattern.test(text)).map(([path]) => path);

test('nothing is written to the browser history, and nothing listens to it but the trace', () => {
  assert.deepEqual(users(/\bhistory\s*\.\s*(pushState|replaceState|go|forward)\s*\(/), []);
  // `router.history` is an array: `history.back(` can only be the browser's.
  assert.deepEqual(users(/\bhistory\s*\.\s*back\s*\(/), []);
  assert.deepEqual(users(/location\s*\.\s*hash\s*=[^=]/), []);
  assert.deepEqual(users(/['"`](popstate|hashchange)['"`]/, ['lib/nav-health.js']), []);
  assert.deepEqual(users(/browserHistory\s*:\s*true/), []);
});

test('the router is only passed through its guard', () => {
  // The original `back` and `navigate`: the guard, and the reload of a broken view.
  assert.deepEqual(users(/\bodRaw\b/, ['lib/router-guard.js', 'lib/nav-health.js']), []);
  // Framework7's own switches are only written by the guard and by the repair.
  assert.deepEqual(users(/\b(allowPageChange|swipeBackActive|bcLocks|bcAnimating)\s*=[^=]/, ['lib/router-guard.js', 'lib/nav-health.js']), []);
  // A history is only edited by the guard (`dropPreviousPage`).
  assert.deepEqual(users(/\bhistory\s*\.\s*(splice|pop|push|shift|unshift)\s*\(/, ['lib/router-guard.js']), []);
  assert.deepEqual(users(/\.history\s*=[^=]/, ['lib/router-guard.js']), []);
  // A page is only removed by hand by the guard and the repair. The adaptive page (a desktop window crossing the
  // breakpoint) swaps a page's element in place; it is the one other file that touches a router's pages.
  assert.deepEqual(users(/\b(removePage|pageCallback)\s*\(/, ['lib/router-guard.js', 'lib/nav-health.js']), []);
  assert.deepEqual(users(/\b(setPagePosition\s*\(|currentPageEl\b)/, ['components/AdaptivePage.svelte']), []);
  // A property Framework7's router does not have (it read as « never busy »).
  assert.deepEqual(users(/router\.transitioning\b/), []);
});

test('Framework7’s own swipe back stays off: the app’s swipe back is the only one, under the guard', () => {
  const app = read('App.svelte');
  assert.match(app, /mdSwipeBack: false/);
  assert.match(app, /iosSwipeBack: false/);
  assert.match(app, /preloadPreviousPage: true/);
  assert.match(app, /enableRouterGuard\(f7\);\s*enableSwipeBack\(f7\);/);
  assert.deepEqual(users(/(md|ios)SwipeBack\w*\s*:\s*true/), []);
  const swipeBack = read('lib/swipe-back.js');
  assert.match(swipeBack, /lockRouter\(router, 'swipe-back'\)/);
  assert.match(swipeBack, /heldBack\(router, \{ animate: false \}\)/);
});

test('every swipe that follows the finger and holds the router says what it does when the system takes the touch', () => {
  for (const [path, text] of sources) {
    if (!/\bhorizontalSwipe\s*\(/.test(text) || path === 'lib/swipe.js') continue;
    if (!/\blockRouter\s*\(|router\.navigate\(/.test(text)) continue;
    assert.match(text, /\bcancel\b\s*[:(]/, `${path} gives horizontalSwipe a cancel`);
  }
  // The swipe itself hears the end of a touch on the element touched, and a system gesture zone starts no swipe.
  const swipe = read('lib/swipe.js');
  assert.match(swipe, /el\.addEventListener\('touchcancel', lost\)/);
  assert.match(swipe, /inSystemGestureZone\(e\.touches\[0\]\.clientX\)/);
});

test('the system Back, Escape and the tests reach one dispatcher; the first launch keeps its step handler behind it', () => {
  const capacitorBack = users(/addListener\(\s*['"]backButton['"]/);
  assert.deepEqual(capacitorBack, ['lib/back-button.js']);
  const dispatcher = read('lib/back-button.js');
  assert.match(dispatcher, /export function goBack\(/);
  for (const source of ['system', 'escape', 'test']) assert.ok(dispatcher.includes(`goBack('${source}')`), source);
  // The page layer of the dispatcher is the guarded router.
  assert.match(dispatcher, /view\.router\.back\(\);/);
  assert.deepEqual(users(/minimizeApp\s*\(/, ['lib/back-button.js']), []);
});

test('a route loaded on demand never leaves the router closed when its load fails', () => {
  const app = read('App.svelte');
  // Every `async` route of the app goes through `safeAsync` or `lazyRoute` (which uses it).
  const raw = app.match(/async:\s*async\s*\(/g) ?? [];
  assert.equal(raw.length, 0, 'an async route without safeAsync');
  const lazy = read('lib/lazy-route.js');
  assert.match(lazy, /context\.reject\(\);/);
  assert.match(lazy, /async: safeAsync\(/);
});

test('error reports and the problem report of About carry the navigation trace', () => {
  assert.match(read('lib/error-reports.svelte.js'), /nav: traceLines\(\)/);
  assert.match(read('lib/error-report.js'), /scrubLines\(nav\.slice\(-NAV_LINES\), 300\)/);
  assert.match(read('pages/About.svelte'), /traceLines\(200\)/);
  assert.match(read('components/DevToolsMenu.svelte'), /traceText\(\)/);
});

test('every section the Settings route accepts is one that Settings.svelte renders, and the other way round', () => {
  const route = read('App.svelte').match(/\/settings\/:section\(([^)]+)\)/);
  assert.ok(route, 'the Settings detail route');
  const routed = route[1].split('|').sort();
  const rendered = [...new Set([...read('pages/Settings.svelte').matchAll(/inPage\('(\w+)'\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(routed, rendered);
});
