// SPDX-License-Identifier: GPL-2.0
// Navigation e2e, the touches the system takes away (run by tests/e2e/navigation.mjs).
//
// On Android with gesture navigation, a swipe from the edge of the screen is the system's Back gesture. The page
// sees the touch start and a few moves; then the system takes the touch (`touchcancel`, never a `touchend`) and, when
// the finger is lifted far enough, sends Back. A swipe that follows the finger (the swipe back, the dive page's
// neighbour, a section) had started by then. These flows play exactly that, and what must hold: the pages are back
// in place at once, the router is free, and the Back that follows goes back.
//
// This is the root cause of the « page left half-way after Back » reports of November 2026: Framework7's own swipe
// back has no `touchcancel` handler; the pages stayed where the finger had put them and `router.back()` was refused
// (`swipeBackActive`) until another touch ended the old swipe (docs/architecture.md, section 13).

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function gestureFlows(h) {
  const { sleep, tapDive, tapText, tapBack, hardwareBack, readStack, expect, openEditPage } = h;
  /** `settled` of navigation.mjs; a failure also prints the end of the app's navigation trace. */
  const settled = async (t, label, o) => {
    const before = h.failureCount();
    await h.settled(t, label, o);
    if (h.failureCount() > before) console.log(`    trace: ${await t.run(async () => (await import('/src/lib/nav-trace.js')).traceText().split('\n').slice(-12).join(' / ')).catch(() => '')}`);
  };
  console.log('Phone, 390x844: touches the system takes away');
  const tab = await h.openTab(390, 844, true);
  const touch = (type, x = 0, y = 0) => tab.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
  /** The start of the system's Back gesture: the page gets the touch and `moves` moves, then loses it. */
  const taken = async (x0, dx, y, moves = 3) => {
    await touch('touchStart', x0, y);
    for (let i = 1; i <= moves; i++) {
      await touch('touchMove', x0 + (dx * i) / moves, y + (i % 2));
      await sleep(16);
    }
    await touch('touchCancel');
  };
  /** The app's own invariants on the page (app/src/lib/nav-invariants.js), right now. */
  const sound = async (label) => {
    const state = await tab.run(async () => {
      const inv = await import('/src/lib/nav-invariants.js');
      const app = inv.readApp();
      return { moving: inv.appIsMoving(app), problems: inv.checkApp(app) };
    });
    expect(label, { moving: false, problems: '' }, { moving: state.moving, problems: state.problems.join('; ') });
  };
  const openEdit = async (label) => {
    await tapDive(tab);
    await settled(tab, `${label}: dive opened`, { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/, setup: true });
    const dive = (await tab.run(readStack)).current;
    // The dive page is still filling in (its profile, its site): the edit page opens once it has settled.
    await sleep(600);
    await openEditPage(tab);
    // The first opening of a page loaded on demand can take longer than `settled` waits: its route first.
    for (let i = 0; i < 100 && !(await tab.run(readStack)).current.endsWith('/edit'); i++) await sleep(100);
    // When the page did not open: what the app's navigation trace says of the tap.
    if (!(await tab.run(readStack)).current.endsWith('/edit')) console.log(`    trace: ${await tab.run(async () => (await import('/src/lib/nav-trace.js')).traceText().split('\n').slice(-10).join(' / '))} ${JSON.stringify(tab.logs.slice(-3))}`);
    await settled(tab, `${label}: edit opened`, { route: /\/edit$/, setup: true });
    return dive;
  };

  console.log(' the system takes a swipe back and the finger is lifted short: nothing moves');
  let dive = await openEdit('gesture given up');
  await taken(4, 44, 400);
  // No wait: the pages are back in place at once, not after an animation.
  await sound('gesture given up: the pages are in place at once');
  await settled(tab, 'gesture given up: still on the edit page', { route: /\/edit$/, setup: true });
  await hardwareBack(tab);
  await settled(tab, 'gesture given up: Back still goes back', { route: dive });
  await tapBack(tab);
  await settled(tab, 'gesture given up: logbook', { route: '/' });

  // The two extremes of the delay: Back at once, and Back after the swipe has been given up for good.
  for (const gap of [0, 250]) {
    console.log(` the system takes a swipe back, then sends Back ${gap} ms later`);
    dive = await openEdit(`Back ${gap} ms after`);
    await taken(6, 60, 380, 4);
    if (gap) await sleep(gap);
    await hardwareBack(tab);
    await settled(tab, `Back ${gap} ms after the system took the swipe: one page back`, { route: dive });
    await sound(`Back ${gap} ms after: sound`);
    await hardwareBack(tab);
    await settled(tab, `Back ${gap} ms after: logbook`, { route: '/' });
  }

  console.log(' the system takes the touch from the right edge of a dive page (the neighbour dive had started to come in)');
  for (const gap of [0, 120]) {
    await tapDive(tab);
    await settled(tab, 'dive opened', { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/, setup: true });
    await taken(386, -70, 600, 4);
    if (gap) await sleep(gap);
    await hardwareBack(tab);
    await settled(tab, `Back ${gap} ms after the system took a dive swipe: logbook`, { route: '/' });
    const after = await tab.run(readStack);
    expect(`Back ${gap} ms after a dive swipe: the history`, { length: 1 }, { length: after.history.length });
  }

  console.log(' the system takes a swipe between sections');
  await taken(3, 80, 500, 4);
  await sound('section swipe taken: the sections are in place at once');
  await settled(tab, 'section swipe taken: logbook', { route: '/', setup: true });
  await tapDive(tab);
  await settled(tab, 'section swipe taken: a dive opens', { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/, setup: true });
  await hardwareBack(tab);
  await settled(tab, 'section swipe taken: Back', { route: '/' });

  console.log(' the swipe back itself: far goes back, short stays, a flick goes back');
  dive = await openEdit('swipe back');
  // Slow: the finger stays down for more than 300 ms (a quicker one is a flick, which goes back).
  await touch('touchStart', 120, 400);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', 120 + i * 8, 400);
    await sleep(70);
  }
  await touch('touchEnd');
  await sleep(450);
  await settled(tab, 'a short slow swipe stays on the page', { route: /\/edit$/ });
  await touch('touchStart', 100, 400);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', 100 + i * 20, 400);
    await sleep(30);
  }
  await touch('touchEnd');
  await settled(tab, 'a swipe past half of the width goes back', { route: dive });
  await openEditPage(tab);
  await settled(tab, 'swipe back: edit opened again', { route: /\/edit$/, setup: true });
  await tab.swipe(60, 130, 400, 3);
  await settled(tab, 'a flick goes back', { route: dive });
  await sound('after the swipes: sound');
  // A swipe back that the page under the finger refuses (the dive page shows its neighbour instead) changes nothing.
  await hardwareBack(tab);
  await settled(tab, 'swipe back: logbook', { route: '/' });

  console.log(' Back while a swipe back is under the finger is ignored, and the swipe ends as usual');
  dive = await openEdit('Back under the finger');
  await touch('touchStart', 80, 420);
  for (let i = 1; i <= 4; i++) {
    await touch('touchMove', 80 + i * 15, 420);
    await sleep(16);
  }
  await hardwareBack(tab);
  await sleep(350);
  await touch('touchEnd');
  await settled(tab, 'Back under the finger: the page is sound', {});
  const where = (await tab.run(readStack)).current;
  expect('Back under the finger: on the edit page or the dive, never elsewhere', { ok: true }, { ok: /\/edit$/.test(where) || where === dive });
  for (let i = 0; i < 3 && (await tab.run(readStack)).current !== '/'; i++) {
    await hardwareBack(tab);
    await settled(tab, `Back under the finger: Back ${i + 1}`, { setup: true });
  }
  await settled(tab, 'Back under the finger: logbook', { route: '/' });

  // Framework7's own gestures only end on `touchend`: the cancelled touch is given to them as their end.
  console.log(' the system takes the touch while the account sheet is dragged down');
  // A real tap: after a drag, Framework7 swallows a click that no touch announced.
  const avatar = await tab.run(() => {
    const r = document.querySelector('.view.tab-active .page-current .bc-account-avatar')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (avatar) await tab.tapAt(avatar.x, avatar.y);
  await sleep(800);
  const top = await tab.run(() => {
    const r = document.querySelector('.bc-account-sheet.modal-in')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + 14 } : null;
  });
  expect('the account sheet is open', { open: true }, { open: !!top });
  if (top) {
    await touch('touchStart', top.x, top.y);
    for (let i = 1; i <= 3; i++) {
      await touch('touchMove', top.x, top.y + i * 25);
      await sleep(40);
    }
    await sleep(400);
    await touch('touchCancel');
    await sleep(700);
    // The sheet is at rest, open or closed: never left where the finger was.
    const rest = await tab.run(() => {
      const el = document.querySelector('.bc-account-sheet');
      return { dragged: !!el && el.style.transform !== '', closing: !!document.querySelector('.bc-account-sheet.modal-out') };
    });
    expect('the sheet taken by the system is at rest', { dragged: false, closing: false }, rest);
    if (await tab.run(() => !!document.querySelector('.bc-account-sheet.modal-in'))) await hardwareBack(tab);
    await sleep(700);
    expect('the sheet is closed after Back', { open: false, scrim: false }, await tab.run(() => ({ open: !!document.querySelector('.bc-account-sheet.modal-in'), scrim: !!document.querySelector('.sheet-backdrop.backdrop-in') })));
    await sound('after the sheet: sound');
  }
  // The app's own check ran after each of these navigations (lib/nav-health.js): it found nothing to repair.
  const broken = (t) => t.run(async () => (await import('/src/lib/nav-trace.js')).traceEvents().filter((e) => e.type === 'broken' || e.type === 'repair').map((e) => `${e.type} ${e.detail}`).join(' | '));
  expect('phone: the app found nothing broken', { broken: '' }, { broken: await broken(tab) });
  tab.ws.close();

  // A route opened as a popup has no page of its own in the view (Edit dive on a tablet): the app's check must
  // not take the view for broken, and Back closes the popup.
  console.log('Tablet, 1280x800: a route opened as a popup');
  const wide = await h.openTab(1280, 800, false);
  const state = () => wide.run(async () => {
    const inv = await import('/src/lib/nav-invariants.js');
    const app = inv.readApp();
    const view = document.querySelector('.views > .view.tab-active');
    return { moving: inv.appIsMoving(app), problems: inv.checkApp(app).join('; '), popup: !!document.querySelector('.popup.modal-in'), route: view?.f7View?.router?.currentRoute?.path ?? '' };
  });
  await tapDive(wide);
  await settled(wide, 'tablet: dive shown beside the list', { split: true, setup: true });
  const shownDive = (await state()).route;
  await openEditPage(wide);
  for (let i = 0; i < 100 && !(await state()).popup; i++) await sleep(100);
  // Long enough for the app's own check to run (700 ms after the last navigation event).
  await sleep(1600);
  let now = await state();
  expect('tablet: Edit dive is open as a popup, the view is sound', { popup: true, moving: false, problems: '', edit: true }, { ...now, edit: /\/edit$/.test(now.route) });
  await hardwareBack(wide);
  for (let i = 0; i < 50 && (await state()).popup; i++) await sleep(100);
  await sleep(1600);
  now = await state();
  expect('tablet: Back closes the popup, the dive is still beside the list', { popup: false, moving: false, problems: '', route: shownDive }, now);
  expect('tablet: the app found nothing broken', { broken: '' }, { broken: await broken(wide) });
  wide.ws.close();
}
