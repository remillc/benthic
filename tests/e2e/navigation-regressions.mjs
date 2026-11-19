// SPDX-License-Identifier: GPL-2.0
// Navigation e2e, the faults the random sequences found (run by tests/e2e/navigation.mjs). Each flow is the shortest
// path to one of them, with the seed that found it (tests/e2e/navigation-monkey.mjs).

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

  console.log('Phone, 390x844: faults found by the random sequences');
  let tab = await h.openTab(390, 844, true);

  // Seed 11 (phone, both looks): a dive, « Planifier depuis cette plongée », the planner's « Retour » (which replaces
  // the planner by the list of plans), « Nouveau plan », then Back twice: the view was left with no current page.
  console.log(' dive > plan from the dive > Retour (the plans) > new plan > Back > Back');
  await tapDive(tab);
  await settled(tab, 'plans: dive opened', { route: /^\/dives\/\d+$/ });
  const dive = await route(tab);
  await sleep(400);
  await tapText(tab, 'Planifier depuis cette plongée|Plan from this dive');
  await reach(tab, /^\/plan\/\d+$/);
  await settled(tab, 'plans: the planner opened from the dive', { route: /^\/plan\/\d+$/ });
  await tapText(tab, '^\\s*(Retour|Back)\\s*$', '.page-current .navbar, .page-current');
  await reach(tab, '/plans/');
  await settled(tab, 'plans: Retour shows the plans', { route: '/plans/' });
  await sound(tab, 'plans: the list of plans is sound');
  await tapText(tab, 'Nouveau plan|New plan');
  await reach(tab, '/plan/new');
  await settled(tab, 'plans: a new plan', { route: '/plan/new' });
  await hardwareBack(tab);
  await reach(tab, '/plans/');
  await settled(tab, 'plans: Back to the plans', { route: '/plans/' });
  await hardwareBack(tab);
  await reach(tab, dive);
  await settled(tab, 'plans: Back to the dive', { route: dive });
  await sound(tab, 'plans: the dive is sound');
  await hardwareBack(tab);
  await settled(tab, 'plans: Back to the logbook', { route: '/' });
  await sound(tab, 'plans: the logbook is sound');

  // The same fault on any stack four pages deep in the Logbook view, whose first page (the list) stays in the
  // document: Réglages opened over the Logbook, a subpage, a page under it, then Back three times.
  console.log(' Réglages > Types de blocs > a new type > Back > Back > Back');
  // A page of its own: the fault above must not be the cause of this one.
  tab.ws.close();
  tab = await h.openTab(390, 844, true);
  const open = async (path) => {
    await tab.run((p) => { document.querySelector('.views > .view.tab-active').f7View.router.navigate(p); }, path);
    await reach(tab, path);
    await settled(tab, `deep stack: ${path} opened`, { route: path });
  };
  for (const path of ['/settings/', '/settings/cylinders/', '/settings/cylinders/new']) await open(path);
  for (const back of ['/settings/cylinders/', '/settings/', '/']) {
    await hardwareBack(tab);
    await reach(tab, back);
    await settled(tab, `deep stack: Back to ${back}`, { route: back });
    await sound(tab, `deep stack: ${back} is sound`);
  }
  // The stack again, left with the navbar's arrow and a swipe back.
  for (const path of ['/settings/', '/settings/cylinders/', '/settings/cylinders/new']) await open(path);
  await h.tapBack(tab);
  await reach(tab, '/settings/cylinders/');
  await settled(tab, 'deep stack: the arrow goes back to the types', { route: '/settings/cylinders/' });
  await tab.swipe(60, 330, 500, 6);
  await reach(tab, '/settings/');
  await settled(tab, 'deep stack: a swipe back goes back to Réglages', { route: '/settings/' });
  await sound(tab, 'deep stack: Réglages is sound after the swipe');
  await hardwareBack(tab);
  await settled(tab, 'deep stack: Back to the logbook', { route: '/' });
  await sound(tab, 'deep stack: the logbook is sound');
  expect('the app found nothing broken', { broken: '' }, { broken: await tab.run(async () => (await import('/src/lib/nav-trace.js')).traceEvents().filter((e) => e.type === 'broken').map((e) => e.detail).join(' | ')) });
  tab.ws.close();
}
