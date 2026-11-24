// SPDX-License-Identifier: GPL-2.0
// The core reads the log again while a dive is open (a change from another device arrives by the push channel): every dive
// has a new id. The open dive stays open under its new id, with no page change and no history entry; the neighbours and the
// Back work; a dive deleted on the other device goes back to the logbook with a message. Run by tests/e2e/navigation.mjs
// (`--dive-renumber-only`). The reload is the one `syncEdits` makes: the core reads the log (`listDives`), then the app
// replaces its list (`logbook.dives = await listLoadedDives()`).

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function diveRenumberFlows(h) {
  const { openTab, sleep, expect, settled, tapDive, tapBack, readStack } = h;

  /** What the page shows of the open dive: the route's id and the date the list gives that id. */
  const shown = (tab) =>
    tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const view = document.querySelector('.views .tab-active.view, .views > .view.tab-active') || document.querySelector('.view-main');
      const router = view.f7View.router;
      // The route holds the dive's Benthic id (an old numeric address is a core id).
      const param = /\/dives\/(\w+)/.exec(router.currentRoute.url)?.[1] ?? '';
      const dive = logbook.dives.find((d) => d.benthicId === param || String(d.id) === param);
      const id = dive?.id ?? 0;
      return { id, param, date: dive?.date ?? null, depth: router.history.length, route: router.currentRoute.url };
    });
  /** The core reads the log again; `without` names a date whose dive the other device deleted. */
  const reload = (tab, without = null) =>
    tab.run(async (without) => {
      const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /benthic-core[^/]*(\/core-api)?\.js|core-api\.js/.test(n));
      const { BenthicCore: core } = await import(url);
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      window.__reports = [];
      window.addEventListener('unhandledrejection', (e) => window.__reports.push(String(e.reason?.message ?? e.reason)));
      await core.listDives();
      logbook.dives = (await core.listLoadedDives()).filter((d) => d.date !== without);
      return logbook.dives.length;
    }, without);

  const walk = async (name, tab, { split = false } = {}) => {
    await settled(tab, `${name}: logbook at start`, split ? { split } : { route: '/' });
    if (split) {
      // The tablet shows the first dive beside the list.
      await sleep(800);
    } else {
      await tapDive(tab);
      await settled(tab, `${name}: dive opened`, { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/, setup: true });
    }
    const before = await shown(tab);
    expect(`${name}: a dive is open`, { open: before.id > 0 && !!before.date }, { open: before.id > 0 && !!before.date });

    await reload(tab);
    await sleep(900);
    await settled(tab, `${name}: after the log was read again`, { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/, split });
    const after = await shown(tab);
    expect(`${name}: the same dive under a new id`, { moved: true, same: true }, { moved: after.id !== before.id, same: after.date === before.date });
    expect(`${name}: no page was added to the history`, { depth: before.depth }, { depth: after.depth });
    const reports = await tab.run(() => window.__reports);
    expect(`${name}: no unhandled error`, { n: 0 }, { n: reports.length });

    // The page shows the dive after the reload: the neighbour is the next of the new list.
    if (!split) {
      await tab.swipe(330, 60, 700);
      await settled(tab, `${name}: swipe to the neighbour dive`, { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/ });
      const next = await shown(tab);
      expect(`${name}: the neighbour is a dive of the new list`, { known: true, other: true }, { known: next.date !== null, other: next.id !== after.id });
      await tab.swipe(60, 330, 700);
      await settled(tab, `${name}: swipe back to the first dive`, { route: /^\/dives\/(\d+|[0-9a-hjkmnp-tv-z]{10})$/ });
      const again = await shown(tab);
      expect(`${name}: and back on the dive`, { date: after.date }, { date: again.date });
    }

    // The dive was deleted on the other device.
    const now = await shown(tab);
    await reload(tab, now.date);
    await sleep(1200);
    if (split) await settled(tab, `${name}: dive deleted elsewhere`, { split });
    else await settled(tab, `${name}: dive deleted elsewhere, back to the logbook`, { route: '/' });
    const msg = await tab.run(() => /supprimée sur un autre appareil|deleted on another device/.test(document.body.textContent ?? ''));
    expect(`${name}: the message tells it`, { msg: true }, { msg });
    const stack = await tab.run(readStack);
    expect(`${name}: the dive is no longer shown`, { still: false }, { still: new RegExp(`/dives/${now.param}$`).test(stack.current) });
  };

  console.log('Dive renumbering: Android phone');
  let tab = await openTab(390, 844, true, false, false, { theme: 'md' });
  await walk('android phone', tab);
  tab.ws.close();
  console.log('Dive renumbering: Android tablet');
  tab = await openTab(1280, 800, false, false, false, { theme: 'md' });
  await walk('android tablet', tab, { split: true });
  tab.ws.close();
}
