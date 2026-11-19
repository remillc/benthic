// The invariants of a settled navigation (lib/nav-invariants.js): what the app checks after each navigation and what
// the navigation e2e suite checks after each step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appIsMoving, checkApp, checkView, isMoving } from '../../app/src/lib/nav-invariants.js';

/** A phone view at rest on a dive opened from the logbook. */
const sound = () => ({
  id: 'view-logbook',
  classes: 'view view-main tab tab-active',
  visible: true,
  current: '/dives/3',
  history: ['/', '/dives/3'],
  allow: true,
  locks: 0,
  swiping: false,
  pages: [
    { classes: 'page page-master page-previous', route: '/', transform: 'matrix(1, 0, 0, 1, -24, 0)', dx: -24 },
    { classes: 'page od-dive-detail page-current', route: '/dives/3', transform: 'none', dx: 0 },
  ],
});
const app = (view, more = {}) => ({ hash: '', activeTabs: 1, orphanBackdrop: false, views: [view], ...more });

test('a view at rest is sound', () => {
  assert.deepEqual(checkView(sound()), []);
  assert.equal(isMoving(sound()), false);
  assert.deepEqual(checkApp(app(sound())), []);
});

test('the query of a route is not compared', () => {
  const v = sound();
  v.current = '/dives/3?from=trip';
  assert.deepEqual(checkView(v), []);
});

test('the half-transitioned stack: a transition class left, the page shifted, the router closed', () => {
  const v = sound();
  v.classes += ' router-transition-backward router-transition';
  v.allow = false;
  v.pages[1].transform = 'matrix(1, 0, 0, 1, 37, 0)';
  const problems = checkView(v);
  assert.ok(problems.some((p) => /refuses page changes/.test(p)), problems.join('|'));
  assert.ok(problems.some((p) => /keeps router-transition-backward/.test(p)), problems.join('|'));
  assert.ok(problems.some((p) => /keeps a transform/.test(p)), problems.join('|'));
  assert.equal(isMoving(v), true);
});

test('a swipe back the system took away: the pages keep their swipe class and the router is held', () => {
  const v = sound();
  v.locks = 1;
  v.pages[0].classes += ' page-swipeback-active';
  v.pages[1].classes += ' page-swipeback-active';
  v.pages[1].transform = 'matrix(1, 0, 0, 1, 18, 0)';
  const problems = checkView(v);
  assert.ok(problems.some((p) => /still held/.test(p)));
  assert.ok(problems.some((p) => /keeps page-swipeback-active/.test(p)));
  assert.equal(isMoving(v), true);
});

test('two current pages, none, and a page left as « next »', () => {
  const two = sound();
  two.pages[0].classes = 'page page-current';
  assert.ok(checkView(two).some((p) => /2 current pages/.test(p)));
  const none = sound();
  none.pages[1].classes = 'page page-next';
  const problems = checkView(none);
  assert.ok(problems.some((p) => /0 current pages/.test(p)));
  assert.ok(problems.some((p) => /waits as page-next/.test(p)));
});

test('the page on screen is not the route the router says, or not the end of its history', () => {
  const wrong = sound();
  wrong.current = '/dives/4';
  assert.ok(checkView(wrong).some((p) => /the current page is \/dives\/3, the router says \/dives\/4/.test(p)));
  const history = sound();
  history.history = ['/'];
  assert.ok(checkView(history).some((p) => /the history ends on \/, the router says \/dives\/3/.test(p)));
});

test('a current page off its place without a transform', () => {
  const v = sound();
  v.pages[1].dx = 37;
  assert.ok(checkView(v).some((p) => /37 px off its place/.test(p)));
});

test('a hidden section is judged on its classes and history only', () => {
  const v = sound();
  v.visible = false;
  v.pages[1].dx = 390;
  assert.deepEqual(checkView(v), []);
});

test('list and detail side by side: two current pages are sound, three are not', () => {
  const v = sound();
  v.classes += ' view-master-detail';
  v.pages = [
    { classes: 'page page-master page-current', route: '/', transform: 'none', dx: 0 },
    { classes: 'page page-master-detail page-master-detail-root page-current', route: '/dives/3', transform: 'none', dx: 360 },
  ];
  assert.deepEqual(checkView(v), []);
  v.pages.push({ classes: 'page page-master-detail page-current', route: '/dives/3', transform: 'none', dx: 360 });
  assert.ok(checkView(v).some((p) => /3 current pages/.test(p)));
});

test('the app: a fragment in the address, two sections shown, a scrim with nothing above it', () => {
  assert.ok(checkApp(app(sound(), { hash: '#compte' })).some((p) => /fragment/.test(p)));
  assert.ok(checkApp(app(sound(), { activeTabs: 2 })).some((p) => /2 sections/.test(p)));
  assert.ok(checkApp(app(sound(), { orphanBackdrop: true })).some((p) => /scrim/.test(p)));
  const moving = sound();
  moving.locks = 1;
  assert.equal(appIsMoving(app(moving)), true);
  assert.ok(checkApp(app(moving))[0].startsWith('view-logbook: '));
});

test('a route opened as a popup (Edit dive on a tablet) keeps the page under it as the current page', () => {
  const v = sound();
  v.current = '/dives/3/edit';
  v.history = ['/', '/dives/3', '/dives/3/edit'];
  assert.ok(checkView(v).some((p) => /the current page is \/dives\/3, the router says \/dives\/3\/edit/.test(p)), 'a page route would be a fault');
  v.modalRoute = true;
  assert.deepEqual(checkView(v), []);
  // Its history must still end on it.
  v.history = ['/', '/dives/3'];
  assert.ok(checkView(v).some((p) => /the history ends on/.test(p)));
});
