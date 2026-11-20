// SPDX-License-Identifier: GPL-2.0
// Navigation e2e, the faults the random sequences found (run by tests/e2e/navigation.mjs). Each flow is the shortest
// path to one of them, with the seed that found it (tests/e2e/navigation-monkey.mjs).
import { readHealth, settleHealth } from './navigation-monkey.mjs';

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function regressionFlows(h) {
  const { sleep, tapDive, tapText, hardwareBack, readStack, expect } = h;
  /** `settled` of navigation.mjs; a failure also prints the end of the app's navigation trace. */
  const settled = async (t, label, o) => {
    const before = h.failureCount();
    await h.settled(t, label, o);
    // OD_DUMP=1: the view's pages after each step, and its child nodes with Svelte's markers (how the fault of the
    // page order was found: a page inside another page's markers leaves with it).
    if (process.env.OD_DUMP) console.log('    nodes:', await t.run(() => [...document.querySelector('.views > .view.tab-active').childNodes].map((n) => (n.nodeType === 8 ? '<!' + n.data + '>' : n.nodeType === 3 ? 'text' : (n.f7Page?.route?.url ?? n.className).replace(/[?].*/, ''))).join(' ')));
    if (process.env.OD_DUMP) console.log('    pages:', (await t.run(readStack)).pages.map((p) => `${p.route.replace(/[?].*/, '')}[${p.cls.split(' ').filter((c) => c.startsWith('page-')).join(',')}]`).join('  '), '| history', JSON.stringify((await t.run(readStack)).history));
    if (h.failureCount() > before) console.log(`    trace: ${await t.run(async () => (await import('/src/lib/nav-trace.js')).traceText().split('\n').slice(-14).join(' / ')).catch(() => '')}`);
  };
  /** The app's own invariants on the page (app/src/lib/nav-invariants.js). */
  const sound = async (t, label) => {
    const state = await t.run(async () => {
      const inv = await import('/src/lib/nav-invariants.js');
      const app = inv.readApp();
      return { moving: inv.appIsMoving(app), problems: inv.checkApp(app).join('; ') };
    });
    expect(label, { moving: false, problems: '' }, state);
  };
  const route = async (t) => (await t.run(readStack)).current.replace(/\?.*$/, '');
  /** Waits for the route to be `wanted` (a page loaded on demand can take a moment), at most 5 s. */
  const reach = async (t, wanted) => {
    for (let i = 0; i < 50 && !(wanted instanceof RegExp ? wanted.test(await route(t)) : (await route(t)) === wanted); i++) await sleep(100);
  };

  // Seed 101: the sheet can finish closing before its backdrop finishes fading.
  console.log('Phone: account sheet closes before its backdrop');
  const sheetTab = await h.openTab(390, 844, true, false, false, { theme: 'md' });
  await sheetTab.run(() => document.querySelector('.bc-account-avatar').click());
  await sleep(600);
  await sheetTab.run(() => {
    document.querySelector('.bc-account-sheet').style.setProperty('--f7-sheet-transition-duration', '50ms');
    document.querySelector('.sheet-backdrop').style.transitionDuration = '1200ms';
  });
  await hardwareBack(sheetTab);
  await sleep(200);
  const fading = await sheetTab.run(readHealth);
  expect('sheet backdrop: a fading scrim is still moving', { moving: true, layerOk: false }, fading);
  const rested = await settleHealth(() => sheetTab.run(readHealth), sleep);
  expect('sheet backdrop: settles without obstructing the page', { moving: false, layerOk: true }, rested || {});
  await sheetTab.run(() => {
    const b = document.querySelector('.sheet-backdrop');
    b.style.transition = 'none';
    b.style.visibility = 'visible';
    b.style.opacity = '1';
  });
  const stuck = await settleHealth(() => sheetTab.run(readHealth), sleep);
  expect('sheet backdrop: a stuck scrim is still reported', { moving: false, layerOk: false }, stuck || {});
  sheetTab.ws.close();

  console.log('Phone, 390x844: faults found by the random sequences');
  let tab = await h.openTab(390, 844, true);

  // Seed 11 (phone, both looks): a dive, « Planifier depuis cette plongée », the planner's « Retour » (which replaces
  // the planner by the list of plans), « Nouveau plan », then Back twice: the view was left with no current page.
  console.log(' dive > plan from the dive > Retour (the plans) > new plan > Back > Back');
  await tapDive(tab);
  await settled(tab, 'plans: dive opened', { route: /^\/dives\/\d+$/, setup: true });
  const dive = await route(tab);
  await sleep(400);
  await tapText(tab, 'Planifier depuis cette plongée|Plan from this dive');
  await reach(tab, /^\/plan\/\d+$/);
  await settled(tab, 'plans: the planner opened from the dive', { route: /^\/plan\/\d+$/, setup: true });
  await tapText(tab, '^\\s*(Retour|Back)\\s*$', '.page-current .navbar, .page-current');
  await reach(tab, '/plans/');
  await settled(tab, 'plans: Retour shows the plans', { route: '/plans/' });
  await tapText(tab, 'Nouveau plan|New plan');
  await reach(tab, '/plan/new');
  await settled(tab, 'plans: a new plan', { route: '/plan/new', setup: true });
  await hardwareBack(tab);
  await reach(tab, '/plans/');
  await settled(tab, 'plans: Back to the plans', { route: '/plans/' });
  await hardwareBack(tab);
  await reach(tab, dive);
  await settled(tab, 'plans: Back to the dive', { route: dive });
  await hardwareBack(tab);
  await settled(tab, 'plans: Back to the logbook', { route: '/' });
  await sound(tab, 'plans: the logbook is sound');

  // The same fault on any stack four pages deep in the Logbook view, whose first page (the list) stays in the
  // document: Réglages opened over the Logbook, a subpage, a page under it, then Back three times.
  console.log(' Réglages > Types de bouteilles > a new type > Back > Back > Back');
  // A page of its own: the fault above must not be the cause of this one.
  tab.ws.close();
  tab = await h.openTab(390, 844, true);
  const open = async (path) => {
    await tab.run((p) => { document.querySelector('.views > .view.tab-active').f7View.router.navigate(p); }, path);
    await reach(tab, path);
    await settled(tab, `deep stack: ${path} opened`, { route: path, setup: true });
  };
  for (const path of ['/settings/', '/settings/cylinders/', '/settings/cylinders/new']) await open(path);
  for (const back of ['/settings/cylinders/', '/settings/', '/']) {
    await hardwareBack(tab);
    await reach(tab, back);
    await settled(tab, `deep stack: Back to ${back}`, { route: back });
  }
  // The stack again, left with the navbar's arrow and a swipe back.
  for (const path of ['/settings/', '/settings/cylinders/', '/settings/cylinders/new']) await open(path);
  await h.tapBack(tab);
  await reach(tab, '/settings/cylinders/');
  await settled(tab, 'deep stack: the arrow goes back to the types', { route: '/settings/cylinders/' });
  await tab.swipe(60, 330, 500, 6);
  await reach(tab, '/settings/');
  await settled(tab, 'deep stack: a swipe back goes back to Réglages', { route: '/settings/' });
  await hardwareBack(tab);
  await settled(tab, 'deep stack: Back to the logbook', { route: '/' });
  await sound(tab, 'deep stack: the logbook is sound');
  expect('the app found nothing broken', { broken: '' }, { broken: await tab.run(async () => (await import('/src/lib/nav-trace.js')).traceEvents().filter((e) => e.type === 'broken').map((e) => e.detail).join(' | ')) });

  // Seeds 11 and 12 on unmodified code (both looks): a dive tapped, then another section tapped while the dive page
  // comes in. The Logbook view is hidden in the middle of its page change; the animation Framework7 waits for never
  // ends there, and the view stayed closed (« router-transition-forward », the dive waiting as page-next) for good.
  console.log(' a dive, then another section during its opening, then back to the Logbook');
  tab.ws.close();
  tab = await h.openTab(390, 844, true);
  const section = async (name) => {
    const at = await tab.run((n) => {
      const link = [...document.querySelectorAll('.bc-navigation-bar a, .bc-navigation-bar button, .toolbar a, .tabbar a')].find((a) => new RegExp(`^\\s*${n}\\s*$`).test(a.textContent));
      const r = link?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, name);
    if (!at) throw new Error(`no section ${name}`);
    await tab.tapAt(at.x, at.y);
  };
  for (const gap of [40, 150]) {
    await tapDive(tab);
    await sleep(gap);
    await section('Sites');
    await sleep(2500);
    await section('Carnet');
    await sleep(400);
    await settled(tab, `section ${gap} ms after a dive: the Logbook view is at rest`, {});
    const where = await route(tab);
    expect(`section ${gap} ms after a dive: on the dive or the list`, { ok: true }, { ok: where === '/' || /^\/dives\/\d+$/.test(where) });
    if (where !== '/') {
      await hardwareBack(tab);
      await settled(tab, `section ${gap} ms after a dive: Back to the list`, { route: '/' });
    }
  }
  tab.ws.close();

  // Tablet, seeds 11 and 13 on unmodified code: a swipe on the dive shown beside the list (the next dive), then a
  // dive tapped in the list: two dives were left in the pane.
  console.log('Tablet, 1280x800: a swipe to the next dive, then a dive tapped in the list');
  const wide = await h.openTab(1280, 800, false);
  await tapDive(wide);
  await settled(wide, 'tablet swipe: a dive beside the list', { split: true, setup: true });
  await sleep(600);
  const pane = await wide.run(() => {
    const r = document.querySelector('.view.tab-active > .page-master-detail.page-current .page-content')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height - 120 } : null;
  });
  expect('tablet swipe: the dive pane is there', { pane: true }, { pane: !!pane });
  if (pane) {
    for (const [from, to] of [[pane.x + 150, pane.x - 250], [pane.x - 150, pane.x + 250]]) {
      await wide.swipe(from, to, pane.y, 8);
      await sleep(1200);
      await settled(wide, `tablet swipe: after a swipe ${to < from ? 'left' : 'right'}`, { split: true });
      const row = await wide.run(() => {
        const rows = [...document.querySelectorAll('.view.tab-active > .page-master a[href^="/dives/"]')];
        const r = rows[Math.min(3, rows.length - 1)]?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
      });
      if (row) await wide.tapAt(row.x, row.y);
      await sleep(900);
      await settled(wide, 'tablet swipe: a dive tapped in the list', { split: true });
    }
  }
  // Tablet, seeds 12 and 13: another section and back to the Logbook, then a dive tapped in the list.
  console.log(' tablet: Statistiques, back to the Carnet, then a dive tapped in the list');
  const rail = async (name) => {
    const at = await wide.run((n) => {
      const link = [...document.querySelectorAll('.bc-nav-rail a, .bc-nav-rail button')].find((a) => new RegExp(`^\\s*${n}\\s*$`).test(a.textContent));
      const r = link?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, name);
    if (!at) throw new Error(`no rail entry ${name}`);
    await wide.tapAt(at.x, at.y);
  };
  const tapRow = async (n) => {
    const row = await wide.run((n) => {
      const rows = [...document.querySelectorAll('.view.tab-active > .page-master a[href^="/dives/"]')];
      const r = rows[Math.min(n, rows.length - 1)]?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
    }, n);
    if (row) await wide.tapAt(row.x, row.y);
  };
  for (const how of ['rail', 'Back']) {
    await rail('Statistiques');
    await sleep(700);
    if (how === 'rail') await rail('Carnet');
    else await hardwareBack(wide);
    await sleep(700);
    await settled(wide, `tablet sections (${how}): back on the Carnet`, { split: true, setup: true });
    await tapRow(how === 'rail' ? 1 : 2);
    await sleep(900);
    await settled(wide, `tablet sections (${how}): a dive tapped in the list`, { split: true });
  }

  // Tablet, seeds 11, 12 and 13 on unmodified code: a page opened inside the detail pane (the planner, from the dive),
  // then another dive tapped in the list. Framework7 hands both pages of the pane to be removed and only the first
  // was: the planner stayed under the new dive, and the next tap in the list left two dives in the pane.
  console.log(' tablet: the planner opened in the pane, then a dive tapped in the list, then another');
  await tapText(wide, 'Planifier depuis cette plongée|Plan from this dive', '.view.tab-active > .page-master-detail.page-current');
  for (let i = 0; i < 50 && !/^\/plan\/\d+$/.test(await route(wide)); i++) await sleep(100);
  await settled(wide, 'tablet pane: the planner is in the pane', { split: true, route: /^\/plan\/\d+$/, setup: true });
  for (const n of [0, 3]) {
    await tapRow(n);
    for (let i = 0; i < 30 && !/^\/dives\/\d+$/.test(await route(wide)); i++) await sleep(100);
    await sleep(600);
    await settled(wide, `tablet pane: dive ${n} of the list replaces the pane`, { split: true, route: /^\/dives\/\d+$/ });
    const stack = await wide.run(readStack);
    expect(`tablet pane: the list and one dive, a history of two (dive ${n})`, { pages: 2, history: 2 }, { pages: stack.pages.length, history: stack.history.length });
  }
  wide.ws.close();
}
