// SPDX-License-Identifier: GPL-2.0
// Sync state in the account sheets (task 2026-11-23-356, part 2), run by tests/e2e/navigation.mjs (`--sync-state-only`):
// no « Synchroniser » button on any sheet, the state with its second line (synced, then changes waiting), and, on the
// tablet, the state as a third line under the account. The state is driven through `window.__logbook`, the app's own.
// With BC_SHOTS=<folder> each sheet is also saved as a screenshot.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function syncStateFlows(h) {
  const { openTab, sleep, expect, shot } = h;

  const setState = (tab, state) =>
    tab.run((s) => {
      const l = window.__logbook;
      l.loading = false;
      l.error = '';
      l.email = 'diver@benthic.test';
      l.syncFailure = null;
      l.conflict = null;
      l.syncProgress = null;
      l.pulling = false;
      l.sync = s.sync;
      l.pending = s.pending;
      l.lastSync = s.lastSync;
      return 1;
    }, state);
  const sheetOpen = (tab, open) =>
    tab.run(async (o) => {
      (await import('/src/lib/navigation.svelte.js')).navigation.accountOpen = o;
      return 1;
    }, open);
  /** What the open sheet shows. */
  const read = (tab) =>
    tab.run(() => {
      const root = document.querySelector('.bc-account-sheet.modal-in, .bc-desktop-account');
      const text = (root?.textContent ?? '').replace(/\s+/g, ' ');
      return {
        open: !!root,
        noSyncButton: ![...(root?.querySelectorAll('button') ?? [])].some((b) => /^\s*(Synchroniser|Sync)( maintenant| now)?\s*$/.test(b.textContent ?? '')) && !root?.querySelector('.bc-sync-button'),
        auto: /Automatique, dès qu’une modification est faite|Automatic, as soon as a change is made/.test(text),
        inline: /Synchronisé .*, automatiquement|Synced .*, automatically/.test(text),
        waiting: /\d+ modifications? non envoyées?|\d+ changes? not sent/.test(text),
        waitingLine: /Envoi automatique au retour du réseau|Sent automatically when the network is back/.test(text),
      };
    });

  const walk = async (name, tab, { tablet = false, fixed = false } = {}) => {
    await sleep(1500);
    await tab.run(() => window.__benthicPlusAccount({ signedIn: true, subscribed: true, email: 'diver@benthic.test' }));
    await setState(tab, { sync: 'cloud', pending: 0, lastSync: new Date(Date.now() - 120000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19) });
    await sheetOpen(tab, true);
    await sleep(900);
    const synced = await read(tab);
    expect(`${name}: synced, no sync button`, { open: true, noSyncButton: true }, synced);
    expect(`${name}: synced, ${tablet ? 'the state on one line, automatically' : 'the second line says it is automatic'}`, tablet ? { inline: true } : { auto: true }, synced);
    if (process.env.BC_SHOTS) await shot(tab, `sync-state-${name.replace(/\W+/g, '-')}-synced`);
    await setState(tab, { sync: 'offline', pending: 3, lastSync: new Date(Date.now() - 120000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19) });
    await sleep(fixed ? 150 : 500);
    const waiting = await read(tab);
    expect(`${name}: changes waiting, no sync button`, { open: true, noSyncButton: true, waiting: true }, waiting);
    if (!tablet) expect(`${name}: changes waiting, the second line`, { waitingLine: true }, waiting);
    if (process.env.BC_SHOTS) await shot(tab, `sync-state-${name.replace(/\W+/g, '-')}-waiting`);
    await sheetOpen(tab, false);
    await sleep(500);
  };

  console.log('Sync state: Android phone');
  let tab = await openTab(390, 844, true, false, false, { theme: 'md' });
  await walk('android phone', tab);
  tab.ws.close();
  console.log('Sync state: iPhone');
  tab = await openTab(390, 844, true, false, false, { theme: 'ios' });
  await walk('iphone', tab);
  const foot = await tab.run(() => /La synchronisation est automatique|Sync is automatic/.test(document.body.textContent ?? ''));
  expect('iphone: the footnote is shown with the sheet closed or open', { foot: true }, { foot: foot || (await (async () => { await sheetOpen(tab, true); await sleep(800); return tab.run(() => /La synchronisation est automatique|Sync is automatic/.test(document.body.textContent ?? '')); })()) });
  tab.ws.close();
  console.log('Sync state: Android tablet');
  tab = await openTab(1280, 800, false, false, false, { theme: 'md' });
  await walk('android tablet', tab, { tablet: true });
  tab.ws.close();
  console.log('Sync state: iPad (sidebar, no account sheet)');
  tab = await openTab(1024, 768, false, false, false, { theme: 'ios' });
  await sleep(1500);
  await setState(tab, { sync: 'cloud', pending: 0, lastSync: new Date(Date.now() - 120000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19) });
  await sleep(500);
  expect('ipad: the sidebar shows the state and no sync button', { state: true, button: false }, await tab.run(() => ({ state: /Synchronisé|Synced/.test(document.querySelector('.bc-nav-menu--status, .panel')?.textContent ?? document.body.textContent), button: !!document.querySelector('.bc-sync-button') })));
  tab.ws.close();
  console.log('Sync state: desktop');
  tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  await walk('desktop', tab, { fixed: true });
  tab.ws.close();
}
