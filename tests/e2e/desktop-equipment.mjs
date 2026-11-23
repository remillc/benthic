// SPDX-License-Identifier: GPL-2.0
// Desktop dive detail, Équipement tab (task 2026-11-23-366), run by tests/e2e/navigation.mjs (`--equipment-only`).
// Without Benthic+: the cards of the computers, the thermal protection and the weights only. With Benthic+: five cards (kit,
// computers, protection, weights, other gear); a weight added with « + Ajouter » shows its chip, the total in the card's
// header and the « Ce lest était » selector, narrower than 360 px and centred; an item added to the dive shows its tile with
// the dive knife drawing; scrolled to the end, the + floating button covers nothing and 88 px stay empty.
// With BC_SHOTS=<folder> the tab is also saved as a screenshot, free and Benthic+.

import { readFileSync } from 'node:fs';

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function desktopEquipmentFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, shot } = h;
  console.log('Desktop, 1400x900: the Équipement tab, one card per section');
  const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  // Tabs of earlier blocks stay open in a shard: this one must be the visible one, or the page does not lay out.
  // At start the pane may hold the kept snapshot of the detail (hidden, with its own copy of the fields): only the live page counts.
  await tab.run(() => {
    window.__liveAll = (selector) => [...document.querySelectorAll(selector)].filter((e) => !e.closest('.bc-pane-opening'));
    window.__live = (selector) => window.__liveAll(selector)[0] ?? null;
    return 1;
  });
  await closeOtherTabs?.(tab.targetId);
  await tab.send('Page.bringToFront');
  await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await tab.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await tab.run(() => !!window.__live('.bc-desktop-logbook--table'));

  /** Polls the page until `check` is true (a loaded machine is slower than a quiet one). @param {() => boolean} check */
  const waitFor = async (check) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(check).catch(() => false)) return;
      await sleep(150);
    }
  };
  const openEquipment = async () => {
    // A second click on the selected row would close the pane (and, on a loaded machine, leave it opening): click it once.
    await tab.run(() => {
      if (!window.__live('.bc-dive-detail')) window.__live('.bc-desktop-logbook--row')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 1;
    });
    await waitFor(() => !!window.__live('[role="tab"][data-tab="equipment"]'));
    await tab.run(() => {
      /** @type {HTMLElement|null} */ (window.__live('[role="tab"][data-tab="equipment"]'))?.click();
      return 1;
    });
    await waitFor(() => (window.__live('.bc-desktop-dive-fields--equipment')?.getBoundingClientRect().height ?? 0) > 0);
  };
  /** The cards, their order, and what the tab shows. */
  const read = () =>
    tab.run(() => {
      const root = window.__live('.bc-desktop-dive-fields--equipment');
      const cards = root ? [...root.querySelectorAll('.bc-desktop-equipment-card')] : [];
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
      };
      const text = root?.textContent ?? '';
      const cardBox = box(cards[3] ?? null);
      const selector = root?.querySelector('.bc-desktop-dive-fields--feedback-group');
      const style = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : '');
      return {
        names: cards.map((c) => c.getAttribute('data-card')),
        headerIcon: cards.map((c) => Math.round(c.querySelector('.bc-desktop-equipment-card--icon')?.getBoundingClientRect().width ?? 0)),
        radius: style(cards[0], 'border-radius'),
        padding: style(cards[0], 'padding-top'),
        gaps: cards.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().top - cards[i].getBoundingClientRect().bottom)),
        hint: !!window.__live('.bc-desktop-dive-fields--hint'),
        undersuit: text.includes('Sous-vêtement'),
        feedbackTitle: text.includes('Ce lest était'),
        otherGear: text.includes('Autre équipement'),
        kit: text.includes('Changer de kit'),
        total: root?.querySelector('.bc-desktop-dive-fields--total')?.textContent?.trim() ?? '',
        chips: [...(root?.querySelectorAll('.bc-desktop-weights--chip-edit') ?? [])].map((c) => c.textContent?.replace(/\s+/g, ' ').trim()),
        selector: box(selector ?? null),
        weightsCard: cardBox,
        computerRows: [...(root?.querySelectorAll('.bc-desktop-dive-fields--computer') ?? [])].map((r) => Math.round(r.getBoundingClientRect().height)),
        suitFieldHeight: Math.round(root?.querySelector('[data-field="suit"] .bc-desktop-edit-field--rest')?.getBoundingClientRect().height ?? 0),
        gearRows: [...(root?.querySelectorAll('.bc-desktop-other-gear--tile') ?? [])].map((r) => ({ height: Math.round(r.getBoundingClientRect().height), text: r.textContent?.trim() ?? '' })),
        knifeIcon: !!root?.querySelector('.bc-desktop-other-gear--icon svg path[d^="M10.9 15.8"]'),
      };
    });

  /** The detail pane scrolled so that the hint above the cards is at its top (for the screenshots). */
  const toHint = async () => {
    await tab.run(() => (window.__live('.bc-desktop-dive-fields--hint')?.scrollIntoView({ block: 'start' }), 1));
    await sleep(300);
  };

  // --- Without Benthic+ -----------------------------------------------------------------------------------------
  await tab.run(() => window.__benthicPlusAccount({ signedIn: false, subscribed: false }));
  await openEquipment();
  let state = await read();
  expect('free: three cards (computers, protection, weights), no kit, no undersuit, no « Ce lest était », no other gear', { names: 'computers,protection,weights', hint: true, undersuit: false, feedbackTitle: false, otherGear: false, kit: false }, { ...state, names: state.names.join(',') });
  if (process.env.BC_SHOTS) {
    await toHint();
    await shot(tab, 'equipment-desktop-free');
  }

  // --- With Benthic+ ----------------------------------------------------------------------------------------------
  await tab.run(() => window.__benthicPlusAccount({ signedIn: true, subscribed: true, email: 'diver@benthic.test' }));
  await openEquipment();
  await waitFor(() => (window.__live('[data-card="kit"]')?.getBoundingClientRect().height ?? 0) > 0);
  state = await read();
  if (!state.headerIcon[0]) {
    console.log('  debug:', JSON.stringify(await tab.run(() => { const out = []; for (let e = window.__live('[data-card="kit"]'); e; e = e.parentElement) { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); out.push(`${e.tagName}.${String(e.className).split(' ')[0]} ${c.display} ${c.visibility} ${Math.round(r.width)}x${Math.round(r.height)}`); } return out.slice(0, 14); })));
    if (process.env.BC_SHOTS) await shot(tab, 'equipment-debug');
  }
  expect('Benthic+: five cards in order, 16 px corners, 16 px padding, 14 px apart, 40 px round icons', { names: 'kit,computers,protection,weights,other-gear', radius: '16px', padding: '16px', gaps: '14,14,14,14', headerIcon: '40,40,40,40,40', kit: true, undersuit: state.undersuit }, { ...state, names: state.names.join(','), gaps: state.gaps.join(','), headerIcon: state.headerIcon.join(',') });
  expect('the suit field is 48 px tall; the computers are 64 px rows (at least one)', { suitFieldHeight: 48, rows: true }, { suitFieldHeight: state.suitFieldHeight, rows: state.computerRows.length > 0 && state.computerRows.every((x) => x === 64) });

  // A weight: « + Ajouter », 5, Entrée.
  await tab.run(() => {
    /** @type {HTMLElement|null} */ (window.__live('.bc-desktop-weights--add'))?.click();
    return 1;
  });
  await sleep(300);
  await tab.run(() => {
    const input = /** @type {HTMLInputElement} */ (window.__live('.bc-desktop-weights--input'));
    input.value = '5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-desktop-dive-fields--feedback-group'));
  state = await read();
  const centred = state.selector && state.weightsCard ? Math.abs((state.selector.left + state.selector.right) / 2 - (state.weightsCard.left + state.weightsCard.right) / 2) < 2 : false;
  expect('a weight: a 5 kg chip, the total in the header, « Ce lest était » narrower than 360 px and centred', { chip: true, total: true, feedbackTitle: true, narrow: true, centred: true }, {
    chip: state.chips.some((c) => /5/.test(c ?? '')),
    total: /5/.test(state.total),
    feedbackTitle: state.feedbackTitle,
    narrow: !!state.selector && state.selector.width <= 360.5,
    centred,
  });
  expect('a chip is 40 px tall with a cross that removes it', { height: 40, cross: true }, await tab.run(() => ({
    height: Math.round(window.__live('.bc-desktop-weights--chip')?.getBoundingClientRect().height ?? 0),
    cross: !!window.__live('.bc-desktop-weights--chip-x'),
  })));

  // An item of the inventory, a dive knife, added to the dive.
  await tab.run(async () => {
    const inventory = await import('/src/lib/inventory.svelte.js');
    await inventory.change((inv) => inv.saveGear({ type: 'diveKnife', name: 'Couteau test' }));
    return 1;
  });
  await tab.run(() => {
    /** @type {HTMLElement|null} */ (window.__live('[data-card="other-gear"] .bc-desktop-dive-fields--text-button'))?.click();
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-add-equipment [role="checkbox"]'));
  await tab.run(() => {
    /** @type {HTMLElement|null} */ (window.__live('.bc-add-equipment [role="checkbox"]'))?.click();
    return 1;
  });
  await sleep(300);
  await tab.run(() => {
    /** @type {HTMLElement|null} */ (window.__live('.bc-add-equipment--main'))?.click();
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-desktop-other-gear--tile'));
  state = await read();
  expect('an item added to the dive: a 56 px grey row with the dive knife drawing', { rows: 1, height: 56, knifeIcon: true }, { rows: state.gearRows.length, height: state.gearRows[0]?.height, knifeIcon: state.knifeIcon });

  // Scrolled to the end: 88 px stay empty, and the + button covers no card.
  const end = await tab.run(async () => {
    const root = window.__live('.bc-desktop-dive-fields--equipment');
    let scroller = root?.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    await new Promise((r) => setTimeout(r, 300));
    const cards = [...(root?.querySelectorAll('.bc-desktop-equipment-card') ?? [])];
    const last = cards[cards.length - 1]?.getBoundingClientRect();
    const area = scroller?.getBoundingClientRect();
    const fab = window.__live('.bc-fab-menu--button')?.getBoundingClientRect();
    const overlap = !!(fab && last && fab.left < last.right && fab.right > last.left && fab.top < last.bottom && fab.bottom > last.top);
    return { room: area && last ? Math.round(area.bottom - last.bottom) : -1, scrolled: !!scroller, hasFab: !!fab, overlap };
  });
  expect('scrolled to the end: at least 88 px below the last card, and the + button does not cover it', { scrolled: true, roomOk: true, overlap: false }, { scrolled: end.scrolled, roomOk: end.room >= 88, overlap: end.overlap, room: end.room, hasFab: end.hasFab });
  if (process.env.BC_SHOTS) await shot(tab, 'equipment-desktop-plus-end');
  await tab.run(async () => {
    const root = window.__live('.bc-desktop-dive-fields--equipment');
    let scroller = root?.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (scroller) scroller.scrollTop = 0;
    return 1;
  });
  await sleep(300);
  if (process.env.BC_SHOTS) {
    await toHint();
    await shot(tab, 'equipment-desktop-plus');
    await tab.run(() => (window.__live('[data-card="weights"]')?.scrollIntoView({ block: 'start' }), 1));
    await sleep(300);
    await shot(tab, 'equipment-desktop-plus-2');
  }
  await tab.run(() => window.__benthicPlusAccount({ signedIn: false, subscribed: false }));
  if (tab.logs.length) console.log('  page errors:', tab.logs.slice(0, 5).join(' | ').slice(0, 800));
  tab.ws.close();
  if (process.env.BC_SHOTS) await iconShots(h);
}

/** With BC_SHOTS: a sheet of every icon of Icon.svelte at 24 px, light and dark, and the Outils tiles on a phone and the desktop. */
async function iconShots(h) {
  const { openTab, sleep, shot } = h;
  const source = readFileSync(new URL('../../app/src/components/Icon.svelte', import.meta.url), 'utf8');
  const table = (start) => {
    const body = source.slice(source.indexOf(start), source.indexOf('\n  };', source.indexOf(start)));
    return Object.fromEntries([...body.matchAll(/^\s*([a-zA-Z0-9]+): '([^']*)',/gm)].map((m) => [m[1], m[2]]));
  };
  const symbols = table('const symbols = {');
  const paths = table('const paths = {');
  const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  for (const dark of [false, true]) {
    await tab.run((symbols, paths, dark) => {
      const cell = (name, svg) => '<div style="width:110px;display:flex;flex-direction:column;align-items:center;gap:4px;font:11px sans-serif">' + svg + '<span>' + name + '</span></div>';
      const sym = Object.entries(symbols).map(([n, d]) => cell(n, '<svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="' + d + '"/></svg>'));
      const str = Object.entries(paths).map(([n, d]) => cell(n, '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'));
      document.body.innerHTML = '<div style="position:fixed;inset:0;overflow:auto;z-index:99999;padding:16px;background:' + (dark ? '#1C1D1F' : '#fff') + ';color:' + (dark ? '#F4F4F2' : '#1F2124') + '"><div style="font:600 13px sans-serif;margin-bottom:8px">Material Symbols Rounded (' + sym.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:12px">' + sym.join('') + '</div><div style="font:600 13px sans-serif;margin:16px 0 8px">Benthic drawings (' + str.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:12px">' + str.join('') + '</div></div>';
      return 1;
    }, symbols, paths, dark);
    await sleep(300);
    await shot(tab, 'icon-sheet-' + (dark ? 'dark' : 'light'));
    await tab.run(() => location.reload());
    await sleep(2500);
  }
  tab.ws.close();
  for (const [label, w, hgt, mobile, desktop] of [['phone', 390, 844, true, false], ['desktop', 1400, 900, false, true]]) {
    const t = await openTab(w, hgt, mobile, false, desktop, { theme: 'md' });
    await sleep(1000);
    await t.run(() => {
      const item = [...document.querySelectorAll('a, button, [role="tab"], [role="button"]')].find((e) => e.textContent?.trim() === 'Outils' && e.getClientRects().length);
      /** @type {HTMLElement|undefined} */ (item)?.click();
      return 1;
    });
    await sleep(1500);
    await shot(t, 'tools-' + label);
    t.ws.close();
  }
}
