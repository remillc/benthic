// SPDX-License-Identifier: GPL-2.0
// Sync progress line (task 2026-11-23-340), run by tests/e2e/navigation.mjs (`--sync-line-only`). The logbook's state is
// driven through the development hook `window.__logbook` (the app's own state, nothing faked in the page): the exchange
// with the server starts (`pulling`), its progress is unknown, then known, then it ends. With BC_SHOTS=<folder> each
// state is also saved as a screenshot, for a look against the task's description.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function syncLineFlows(h) {
  const { openTab, sleep, expect, shot } = h;

  /** What the page shows of the line, and of the profile it must run on. */
  const read = () => {
    const root = document.querySelector('.bc-sync-line');
    if (!root) return { present: false };
    const svg = root.querySelector('svg');
    const line = root.querySelector('.bc-sync-line--line');
    const box = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? { left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom), height: Math.round(r.height) } : null;
    };
    const style = getComputedStyle(line);
    return {
      present: true,
      role: svg.getAttribute('role'),
      label: svg.getAttribute('aria-label'),
      valuenow: svg.getAttribute('aria-valuenow'),
      dash: line.style.strokeDasharray.replace(', ', ' '),
      pathLength: line.getAttribute('pathLength'),
      animated: style.animationName !== 'none',
      lineOpacity: Number(style.opacity),
      groupOpacity: Number(getComputedStyle(svg).opacity),
      strokeWidth: Number.parseFloat(style.strokeWidth),
      glow: getComputedStyle(svg).filter !== 'none',
      mine: box(root),
      bandProfile: box(document.querySelector('.bc-band-backdrop--profile')),
    };
  };
  /** The top of the first dive row: the list must not move while the line is drawn. */
  const rowTop = () => Math.round(document.querySelector('.page-current a[href^="/dives/"], .page-master a[href^="/dives/"], .bc-desktop-logbook--row')?.getBoundingClientRect().top ?? -1);
  const start = (tab) =>
    tab.run(() => {
      const l = window.__logbook;
      l.syncProgress = null;
      l.loading = false;
      l.error = '';
      l.pulling = true;
      return 1;
    });
  const progress = (tab, fraction) => tab.run((f) => ((window.__logbook.syncProgress = { stage: 'receive', fraction: f }), 1), fraction);
  const stop = (tab) => tab.run(() => ((window.__logbook.pulling = false), 1));
  const name_ = (name) => name.replace(/\W+/g, '-');

  /**
   * One device: unknown, known, done (complete, hold, fade, gone).
   * @param {string} name
   * @param {any} tab
   * @param {{ onBand?: boolean, reduced?: boolean }} o
   */
  const walk = async (name, tab, o = {}) => {
    expect(`${name}: no line when no exchange runs`, { present: false }, await tab.run(read));
    const listTop = await tab.run(rowTop);
    await start(tab);
    await sleep(500);
    const unknown = await tab.run(read);
    expect(`${name}: unknown progress, the line is the progressbar`, { present: true, role: 'progressbar', pathLength: '100', valuenow: null }, unknown);
    expect(`${name}: unknown progress, line style`, { strokeWidth: 2.5, glow: !!o.onBand }, unknown);
    if (o.reduced) expect(`${name}: unknown progress, reduced motion: a still line at half opacity`, { animated: false, dash: '100 101', lineOpacity: 0.5 }, unknown);
    else expect(`${name}: unknown progress, a quarter of the line slides`, { animated: true, dash: '25 101', lineOpacity: 1 }, unknown);
    if (o.onBand) {
      const want = unknown.bandProfile ?? {};
      expect(`${name}: the line sits exactly on the band's profile`, { left: want.left, width: want.width, bottom: want.bottom, height: want.height }, unknown.mine ?? {});
    }
    expect(`${name}: the list does not move`, { top: listTop }, { top: await tab.run(rowTop) });
    if (process.env.BC_SHOTS) {
      await shot(tab, `${name_(name)}-unknown`);
      if (!o.reduced) {
        await sleep(700);
        await shot(tab, `${name_(name)}-unknown-later`);
      }
    }
    await progress(tab, 0.6);
    await sleep(600);
    const known = await tab.run(read);
    expect(`${name}: 60 % is drawn up to 60 and announced`, { dash: '60 101', valuenow: '60', animated: false }, known);
    if (process.env.BC_SHOTS) await shot(tab, `${name_(name)}-60`);
    await stop(tab);
    if (o.reduced) {
      await sleep(150);
      expect(`${name}: reduced motion, the line just goes at the end`, { present: false }, await tab.run(read));
      return;
    }
    await sleep(450);
    const completing = await tab.run(read);
    expect(`${name}: done, the line completes to 100 %`, { present: true, dash: '100 101', valuenow: '100', groupOpacity: 1 }, completing);
    if (process.env.BC_SHOTS) await shot(tab, `${name_(name)}-done`);
    // 0.6 s fill + 0.3 s hold are over after 0.9 s; the fade then runs 1.1 s.
    await sleep(850);
    const fading = await tab.run(read);
    expect(`${name}: done, the line is fading out`, { present: true, fading: true }, { ...fading, fading: fading.groupOpacity < 1 });
    if (process.env.BC_SHOTS) await shot(tab, `${name_(name)}-fading`);
    await sleep(1500);
    expect(`${name}: nothing is left after the fade`, { present: false }, await tab.run(read));
    expect(`${name}: the list never moved`, { top: listTop }, { top: await tab.run(rowTop) });
  };

  console.log('Sync line: phone, Material look');
  let tab = await openTab(390, 844, true, false, false, { theme: 'md' });
  await walk('sync line phone md', tab, { onBand: true });

  console.log('Sync line: phone, band collapsed by scrolling');
  await start(tab);
  await progress(tab, 0.4);
  const scrolled = await tab.run(() => {
    const content = [...document.querySelectorAll('.bc-logbook .page-content')].find((c) => c.clientHeight > 0) ?? document.querySelector('.bc-logbook .page-content');
    content.scrollTop = 400;
    return { top: content.scrollTop, info: [content.className, content.scrollHeight, content.clientHeight, getComputedStyle(content).overflowY].join('|') };
  });
  await sleep(500);
  expect('sync line phone md collapsed: the list scrolled', { scrolled: true }, { scrolled: scrolled.top > 100, info: scrolled.info });
  const rise = await tab.run(() => Number.parseFloat(document.querySelector('.bc-band-backdrop--layer')?.style.getPropertyValue('--bc-band-rise') || '0'));
  expect('sync line phone md collapsed: the band rose', { risen: true }, { risen: rise > 50 });
  const collapsed = await tab.run(read);
  const want = collapsed.bandProfile ?? {};
  expect('sync line phone md collapsed: the line stays on the collapsed band profile', { left: want.left, width: want.width, bottom: want.bottom }, collapsed.mine ?? {});
  expect('sync line phone md collapsed: the line is on screen', { onScreen: true }, { onScreen: (collapsed.mine?.bottom ?? -1) > 0 && (collapsed.mine?.bottom ?? 9999) < 200 });
  if (process.env.BC_SHOTS) await shot(tab, 'sync-line-phone-md-collapsed');
  await stop(tab);
  await sleep(3200);
  tab.ws.close();

  console.log('Sync line: phone, reduced motion');
  tab = await openTab(390, 844, true, false, false, { theme: 'md', reducedMotion: true });
  await walk('sync line phone reduced motion', tab, { onBand: true, reduced: true });
  tab.ws.close();

  console.log('Sync line: iPhone look');
  tab = await openTab(390, 844, true, false, false, { theme: 'ios' });
  await walk('sync line iphone', tab);
  tab.ws.close();

  console.log('Sync line: tablet, Material look');
  tab = await openTab(1280, 800, false, false, false, { theme: 'md' });
  await walk('sync line tablet md', tab, { onBand: true });
  tab.ws.close();

  console.log('Sync line: iPad look');
  tab = await openTab(1024, 768, false, false, false, { theme: 'ios' });
  await walk('sync line ipad', tab);
  tab.ws.close();

  console.log('Sync line: desktop');
  tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  await tab.run(() => !!document.querySelector('.bc-desktop-logbook--table'));
  await walk('sync line desktop', tab);
  tab.ws.close();
}
