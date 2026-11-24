// SPDX-License-Identifier: GPL-2.0
// Desktop logbook and dive detail (tasks 2026-11-23-374, 375 and 376), run by tests/e2e/navigation.mjs (`--detail-only`).
//  - 374: a closed trip row is 48 px with the dive rows' 1 px line; a line above and below it; the row after an open trip's
//    card is separated from it; no double line.
//  - 375: no white block outside the chart's card in the right pane, also after a drag of the splitter.
//  - 376: the Informations tab as five cards (added below).
// With BC_SHOTS=<folder> the screens are also saved as screenshots, for a visual check.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function desktopDetailFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, shot } = h;
  console.log('Desktop, 1440x900: the logbook list with a trip, and the right pane');
  const tab = await openTab(1440, 900, false, false, true, { theme: 'md' });
  await tab.run(() => {
    window.__liveAll = (selector) => [...document.querySelectorAll(selector)].filter((e) => !e.closest('.bc-pane-opening'));
    window.__live = (selector) => window.__liveAll(selector)[0] ?? null;
    return 1;
  });
  await closeOtherTabs?.(tab.targetId);
  await tab.send('Page.bringToFront');
  await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await tab.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});

  /** Polls the page until `check` is true. @param {() => boolean} check */
  const waitFor = async (check) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(check).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  await waitFor(() => !!window.__live('.bc-desktop-logbook--row'));

  // --- 374: a trip between dives ------------------------------------------------------------------------------------
  // Two dives, the third and fourth of the list, become a trip.
  await tab.run(async () => {
    const lb = await import('/src/lib/logbook.svelte.js');
    const ids = [...document.querySelectorAll('.bc-desktop-logbook--row')].slice(2, 4).map((r) => Number(r.getAttribute('data-dive')));
    await lb.tripChange({ action: 'create', diveIds: ids });
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-desktop-logbook--trip'));
  const lines = () =>
    tab.run(() => {
      const trip = window.__live('.bc-desktop-logbook--trip');
      const td = trip?.querySelector('td');
      const rows = window.__liveAll('.bc-desktop-logbook--table tbody tr:not(.bc-desktop-logbook--pad)');
      const at = rows.indexOf(trip);
      /** The 1 px line a row draws on its top and bottom edge: a border or an inset shadow of the divider colour. */
      const edges = (tr) => {
        const cell = tr?.querySelector('td');
        if (!cell) return { top: false, bottom: false };
        const c = getComputedStyle(cell);
        const divider = getComputedStyle(document.documentElement).getPropertyValue('--bc-table-divider').trim().toLowerCase();
        const rgb = (v) => v.replace(/\s/g, '');
        const hex = divider.startsWith('#') ? divider : '';
        const want = hex ? `rgb(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)})` : '';
        const shadow = rgb(c.boxShadow);
        return {
          top: (parseFloat(c.borderTopWidth) === 1 && rgb(c.borderTopColor) === want) || shadow.includes(`${want}0px1px`),
          bottom: (parseFloat(c.borderBottomWidth) === 1 && rgb(c.borderBottomColor) === want) || shadow.includes(`${want}0px-1px`),
        };
      };
      const row = (tr) => ({ ...edges(tr), height: Math.round(tr?.getBoundingClientRect().height ?? 0), cls: tr?.className.replace(/bc-desktop-logbook--/g, '') ?? '' });
      return {
        folded: trip?.classList.contains('bc-desktop-logbook--folded') ?? false,
        height: Math.round(td?.getBoundingClientRect().height ?? 0),
        before: row(rows[at - 1]),
        trip: row(trip),
        after: row(rows[at + 1]),
        afterAfter: row(rows[at + 2]),
        radius: td ? getComputedStyle(td).borderTopLeftRadius : '',
      };
    });
  const toggle = () =>
    tab.run(() => {
      window.__live('.bc-desktop-logbook--trip .bc-desktop-logbook--chevron')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 1;
    });

  let state = await lines();
  if (state.folded === false) {
    await toggle();
    await sleep(300);
    state = await lines();
  }
  if (process.env.BC_SHOTS) await shot(tab, 'detail-374-closed');
  expect('a closed trip row is 48 px high with a line above (the dive before) and below it, no radius', { folded: true, height: 48, above: true, below: true, radius: '0px' }, { folded: state.folded, height: state.height, above: state.before.bottom, below: state.trip.bottom, radius: state.radius });
  expect('the dive after a closed trip has no line above it (no double line)', { top: false }, { top: state.after.top });

  await toggle();
  await sleep(300);
  state = await lines();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-374-open');
  const rows = await tab.run(() => {
    const all = window.__liveAll('.bc-desktop-logbook--table tbody tr:not(.bc-desktop-logbook--pad)');
    const end = all.findIndex((r) => r.classList.contains('bc-desktop-logbook--trip-end'));
    const cell = (r) => {
      const c = r && getComputedStyle(r.querySelector('td'));
      return c ? { bottom: parseFloat(c.borderBottomWidth), top: parseFloat(c.borderTopWidth) } : null;
    };
    return { end: end >= 0, endBottom: cell(all[end])?.bottom, afterTop: cell(all[end + 1])?.top, afterHeight: Math.round(all[end + 1]?.getBoundingClientRect().height ?? 0), headerHeight: Math.round(all.find((r) => r.classList.contains('bc-desktop-logbook--trip'))?.getBoundingClientRect().height ?? 0) };
  });
  expect('an open trip: its header is 48 px; the card has no line under it, the row after it has one above it (48 px, no double line)', { end: true, endBottom: 0, afterTop: 1, afterHeight: 48, headerHeight: 48 }, rows);
  expect('an open trip keeps its dives in the white card', { rows: true }, { rows: state.after.height === 48 });
  await toggle();
  await sleep(300);

  // --- 375: the right pane has no white block outside the chart's card ---------------------------------------------------
  // A dive whose site has coordinates (the site map sits behind the header).
  await tab.run(() => {
    const rows = window.__liveAll('.bc-desktop-logbook--row');
    const withSite = rows.find((r) => r.textContent.includes('Lock 23')) ?? rows[0];
    withSite.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-dive-detail--desk-card'));
  await sleep(1500);
  /** Samples a grid of points in the pane's top part, outside the card, and names any element painting the surface colour. */
  const whites = () =>
    tab.run(() => {
      const pane = window.__live('.bc-dive-detail--desk');
      const card = window.__live('.bc-dive-detail--desk-card').getBoundingClientRect();
      const pr = pane.getBoundingClientRect();
      const surface = (() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--bc-surface)';
        document.body.append(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
      })();
      const found = new Set();
      for (let y = pr.top + 8; y < Math.min(pr.bottom, card.bottom + 20); y += 8) {
        for (let x = pr.left + 2; x < pr.right - 2; x += 8) {
          const inCard = x >= card.left && x <= card.right && y >= card.top && y <= card.bottom;
          if (inCard) continue;
          for (const el of document.elementsFromPoint(x, y)) {
            if (!pane.contains(el) && el !== pane) break;
            if (getComputedStyle(el).backgroundColor === surface && !el.closest('.bc-dive-detail--desk-actions, button')) found.add(`${el.tagName}.${String(el.className).split(' ')[0]}`);
          }
        }
      }
      return { surface, paneBg: getComputedStyle(pane).backgroundColor, paneClass: pane.className, found: [...found], cardLeft: Math.round(card.left - pr.left), cardRadius: getComputedStyle(window.__live('.bc-dive-detail--desk-card')).borderTopLeftRadius };
    });
  state = await whites();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-375-1440');
  expect('375: nothing paints the surface colour outside the chart card (1440x900)', { found: '' }, { found: state.found.join(','), surface: state.surface, paneBg: state.paneBg, paneClass: state.paneClass });
  expect('375: the curve chips under the chart are outlined (transparent, a 1 px ring)', { outlined: true }, await tab.run(() => {
    const chip = window.__live('.bc-dive-profile--chip-outline');
    const c = chip ? getComputedStyle(chip) : null;
    return { outlined: !!c && c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.boxShadow !== 'none' };
  }));
  // The splitter dragged: still no white block.
  const handle = await tab.run(() => {
    const r = window.__live('.bc-desktop-logbook--handle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // The handle moved with its arrow keys (a drag in headless Chrome does not reach the pointer capture).
  for (let i = 0; i < 8; i++) {
    await tab.run(() => (window.__live('.bc-desktop-logbook--handle').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })), 1));
    await sleep(80);
  }
  await sleep(600);
  const moved = await whites();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-375-after-drag');
  expect('375: after a splitter drag the pane is still clean and the handle moved', { found: '', moved: true }, { found: moved.found.join(','), moved: await tab.run((x) => Math.abs(window.__live('.bc-desktop-logbook--handle').getBoundingClientRect().left - x) > 40, handle.x), was: handle.x, now: await tab.run(() => window.__live('.bc-desktop-logbook--handle').getBoundingClientRect().left) });
  expect('375: the card has 16 px corners and a 24 px margin from the pane edge', { radius: '16px', left: 24 }, { radius: state.cardRadius, left: state.cardLeft });
  return tab;
}
