<script>
  // @ts-check
  // « Site de la plongée » (task 2026-11-27-412; mock-ups choisir-site-android, choisir-site-commun-android, ios-choisir-site,
  // android-tablette-detail-choisir-site-paysage, bureau-detail-choisir-site): what the dive detail's Site card opens.
  // A full screen on a phone (Android: the search bar with ←; iPhone: « Annuler », the title, the search field), a dialog on
  // a tablet and on the desktop with « Dans votre carnet » and « Dans la carte commune » side by side.
  // The search filters both lists (name, region, country). « Dans votre carnet » is the logbook's sites in alphabetical
  // order, the dive's site checked. « Dans la carte commune » (Benthic+, online, a position for the dive) lists the shared
  // map's sites near the dive; choosing one adds it to the diver's sites (the caller does it and links it).
  // Choosing links at once: the caller writes the dive and this component is closed. « Plongée sans site » unlinks it.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import SearchClear from './SearchClear.svelte';
  import { ios, layout } from '../lib/layout.svelte.js';
  import { language, t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { deskSites, loadRegions } from '../lib/desktop-sites.svelte.js';
  import { logbookChoice } from '../lib/dive-site-choice.js';
  import { metresTo } from '../lib/site-distance.js';
  import { benthicPlusAccount } from '../lib/benthic-plus-state.svelte.js';
  import { loadLinks, sharedSites, withSession } from '../lib/shared-sites.svelte.js';
  import { CHOOSE_RADIUS_M, inYourSites } from '../lib/shared-sites.js';
  import { baseDivesText, distanceText as awayText } from '../lib/shared-sites-format.js';
  import { connection } from '../lib/online.svelte.js';

  /**
   * `current`: the uuid of the dive's site, 0 without one. `position`: where the dive was recorded, or null. The caller
   * writes the dive: `onchoose` gets the logbook site, `onchoosebase` the shared map's site (it adds it to the diver's
   * sites first and may reject), `onnone` unlinks. `onnew` gets the text typed in the search.
   * @type {{
   *   sites: import('benthic-core').SiteSummary[],
   *   current: number,
   *   position: { latUdeg: number, lonUdeg: number }|null,
   *   onchoose: (site: import('benthic-core').SiteSummary) => void|Promise<void>,
   *   onchoosebase: (site: import('../lib/shared-sites.js').BaseSite) => Promise<void>,
   *   onnone: () => void|Promise<void>,
   *   onnew: (name: string) => void,
   *   onclose: () => void,
   * }}
   */
  let { sites, current, position, onchoose, onchoosebase, onnone, onnew, onclose } = $props();

  const id = `bc-dive-site-chooser-${Math.random().toString(36).slice(2, 9)}`;
  const phone = $derived(layout.phone);
  let query = $state('');
  let busy = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();

  // The regions are read once, when the diver starts typing (the sites' list does not carry them).
  $effect(() => {
    if (query.trim()) loadRegions(sites, logbook.sitesVersion);
  });

  const rows = $derived(logbookChoice(sites, deskSites.regions, query, language));
  const unit = $derived(logbook.prefs);

  /** « Nouvelle-Zélande · à 61 mi · aucune plongée »: the distance on an Android phone, when the dive has a position. @param {import('benthic-core').SiteSummary} s */
  function line(s) {
    const parts = [s.country];
    const metres = phone && !ios && position && s.hasLocation ? metresTo(position, s) : null;
    if (metres !== null) parts.push(awayText(metres, unit));
    parts.push(s.dives ? t('sites.diveCount', { n: s.dives }) : t('sites.noDive').toLocaleLowerCase(language));
    return parts.filter(Boolean).join(' · ');
  }

  // « Dans la carte commune »: the shared map's sites near the dive that the logbook does not have.
  const commonOn = $derived(!!position && benthicPlusAccount.signedIn && connection.online);
  let common = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite[]} */ ([]));
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let commonTimer;
  let commonAsk = 0;
  $effect(() => {
    const p = position;
    const q = query;
    clearTimeout(commonTimer);
    if (!p || !commonOn) {
      common = [];
      return;
    }
    commonTimer = setTimeout(async () => {
      const ask = ++commonAsk;
      try {
        if (!sharedSites.linksLoaded) await loadLinks();
        const near = await withSession((api, token) => api.nearby(token, { lat: p.latUdeg / 1e6, lon: p.lonUdeg / 1e6, radiusM: CHOOSE_RADIUS_M, limit: 10, q }));
        if (ask === commonAsk) common = near.filter((b) => !inYourSites(b.id, sharedSites.links));
      } catch {
        // Not a subscriber, or the server does not answer: the list stays hidden.
        if (ask === commonAsk) common = [];
      }
    }, q ? 300 : 0);
    return () => clearTimeout(commonTimer);
  });

  /** « Carte commune · à 1,4 mi · 87 plongées ». @param {import('../lib/shared-sites.js').BaseSite} b */
  const commonLine = (b) => [t('sharedSites.commonMapButton'), b.distanceM !== undefined ? awayText(b.distanceM, unit) : '', baseDivesText(b)].filter(Boolean).join(' · ');

  /** Runs a choice once: the chooser stays until the dive is written, then closes. @param {() => void|Promise<void>} act */
  async function run(act) {
    if (busy) return;
    busy = true;
    try {
      await act();
      onclose();
    } catch {
      // The caller told the diver; the chooser stays for another try.
    } finally {
      busy = false;
    }
  }

  /** Under <body>, above the pages; Escape and the system Back (« bc-cancel ») close it. @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      onclose();
    };
    node.addEventListener('bc-cancel', cancel);
    return {
      destroy() {
        node.removeEventListener('bc-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  onMount(() => {
    // On a phone the keyboard would hide the lists: the search takes the focus only on a larger screen.
    if (!phone) input?.focus();
  });

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
</script>

{#snippet searchField()}
  <input bind:this={input} type="search" bind:value={query} placeholder={t('sites.searchSitePlaceholder')} aria-label={t('sites.searchSitePlaceholder')} enterkeyhint="search" autocomplete="off" />
  {#if query}<SearchClear onclear={() => (query = '')} />{/if}
{/snippet}

{#snippet newButton()}
  <button type="button" class="bc-dive-site-chooser--new" disabled={busy} onclick={() => onnew(query.trim())}>
    <Icon name="plus" size={22} />
    <span>{t('sites.newSite')}</span>
  </button>
{/snippet}

{#snippet logbookList()}
  <p class="bc-dive-site-chooser--heading" id="{id}-logbook">{t('diveSite.inLogbook')}</p>
  {#if rows.length}
    <ul class="bc-dive-site-chooser--list" role="listbox" aria-labelledby="{id}-logbook">
      {#each rows as s (s.uuid)}
        <li role="option" aria-selected={s.uuid === current}>
          <button type="button" class="bc-dive-site-chooser--row" class:bc-dive-site-chooser--current={s.uuid === current} data-site={s.uuid} disabled={busy} onclick={() => run(() => onchoose(s))}>
            <Icon name="place" size={22} />
            <span class="bc-dive-site-chooser--texts">
              <span class="bc-dive-site-chooser--name">{s.name || t('sites.noName')}</span>
              <span class="bc-dive-site-chooser--line bc-value">{line(s)}</span>
            </span>
            {#if s.uuid === current}<Icon name="check" size={22} />{/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="bc-dive-site-chooser--none" role="status">{t('sites.noMatch')}</p>
  {/if}
{/snippet}

{#snippet commonList()}
  <p class="bc-dive-site-chooser--heading bc-dive-site-chooser--common-title" id="{id}-common">
    <Icon name="globe" size={18} />{t('sharedSites.chooseSection')}<span class="bc-dive-site-chooser--plus" title={t('benthicPlus.chipName')}>B+</span>
  </p>
  <ul class="bc-dive-site-chooser--list" aria-labelledby="{id}-common">
    {#each common as b (b.id)}
      <li>
        <button type="button" class="bc-dive-site-chooser--row" data-base={b.id} disabled={busy} onclick={() => run(() => onchoosebase(b))}>
          <span class="bc-dive-site-chooser--dot" aria-hidden="true"></span>
          <span class="bc-dive-site-chooser--texts">
            <span class="bc-dive-site-chooser--name">{b.name}</span>
            <span class="bc-dive-site-chooser--line bc-value">{commonLine(b)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
  <p class="bc-dive-site-chooser--note">{t('diveSite.commonNote')}</p>
{/snippet}

{#snippet noneButton()}
  <button type="button" class="bc-dive-site-chooser--none-button" disabled={busy} onclick={() => run(onnone)}>{t('diveSite.none')}</button>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bc-dive-site-chooser modal-in" class:bc-dive-site-chooser--phone={phone} class:bc-dive-site-chooser--ios={ios} use:portal onkeydown={keydown}>
  {#if !phone}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bc-dive-site-chooser--scrim" onclick={onclose}></div>
  {/if}
  <div class="bc-dive-site-chooser--surface" role="dialog" aria-modal="true" aria-labelledby="{id}-title" tabindex="-1">
    {#if phone && !ios}
      <!-- Android phone: the search bar with ←, then « Nouveau site », the lists and the notes. -->
      <h2 id="{id}-title" class="bc-sr-only">{t('diveSite.title')}</h2>
      <div class="bc-dive-site-chooser--bar">
        <button type="button" class="bc-dive-site-chooser--back" aria-label={t('common.back')} onclick={onclose}><Icon name="arrowBack" /></button>
        {@render searchField()}
      </div>
      <div class="bc-dive-site-chooser--body" data-bc-scroll>
        <div class="bc-dive-site-chooser--card">{@render newButton()}</div>
        {@render logbookList()}
        {#if common.length}{@render commonList()}{/if}
        <p class="bc-dive-site-chooser--note">{t('diveSite.filterNote')}</p>
        <div class="bc-dive-site-chooser--card bc-dive-site-chooser--card-end">{@render noneButton()}</div>
      </div>
    {:else if phone}
      <!-- iPhone: « Annuler », the title, the search field under them. -->
      <div class="bc-dive-site-chooser--nav">
        <button type="button" class="bc-dive-site-chooser--cancel" onclick={onclose}>{t('dialog.cancel')}</button>
        <h2 id="{id}-title" class="bc-dive-site-chooser--title">{t('diveSite.title')}</h2>
      </div>
      <div class="bc-dive-site-chooser--bar"><Icon name="search" size={18} />{@render searchField()}</div>
      <div class="bc-dive-site-chooser--body" data-bc-scroll>
        <div class="bc-dive-site-chooser--card">{@render newButton()}</div>
        {@render logbookList()}
        <p class="bc-dive-site-chooser--note">{t('diveSite.touchNote')}</p>
        {#if common.length}{@render commonList()}{/if}
        <div class="bc-dive-site-chooser--card bc-dive-site-chooser--card-end">{@render noneButton()}</div>
      </div>
    {:else}
      <!-- Tablet and desktop: a dialog, the two lists side by side. -->
      <h2 id="{id}-title" class="bc-dive-site-chooser--dialog-title">{t('diveSite.title')}</h2>
      <div class="bc-dive-site-chooser--top">
        <div class="bc-dive-site-chooser--bar">
          <Icon name="search" size={20} />
          {@render searchField()}
        </div>
        {@render newButton()}
      </div>
      <div class="bc-dive-site-chooser--columns" class:bc-dive-site-chooser--one={!common.length} data-bc-scroll>
        <section class="bc-dive-site-chooser--column" aria-label={t('diveSite.inLogbook')}>{@render logbookList()}</section>
        {#if common.length}<section class="bc-dive-site-chooser--column" aria-label={t('sharedSites.listLabel')}>{@render commonList()}</section>{/if}
      </div>
      <p class="bc-dive-site-chooser--note bc-dive-site-chooser--dialog-note">{t('diveSite.clickNote')}</p>
      <div class="bc-dive-site-chooser--actions">
        {@render noneButton()}
        <button type="button" class="bc-dive-site-chooser--text-button" onclick={onclose}>{t('dialog.cancel')}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  @layer bc.components {
    .bc-dive-site-chooser {
      position: fixed;
      inset: 0;
      z-index: 13400;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
    }
    .bc-dive-site-chooser--scrim {
      position: absolute;
      inset: 0;
      background: var(--bc-scrim);
    }
    /* The dialog (tablet, desktop): 880 dp wide, the lists scroll inside it. */
    .bc-dive-site-chooser--surface {
      position: relative;
      box-sizing: border-box;
      width: min(880px, calc(100% - 48px));
      max-height: calc(100% - 48px);
      display: flex;
      flex-direction: column;
      padding: 24px;
      border-radius: 28px;
      background: var(--bc-dialog);
      color: var(--bc-text);
      outline: none;
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.25);
    }
    .bc-dive-site-chooser--dialog-title {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
    }
    .bc-dive-site-chooser--top {
      flex: none;
      display: flex;
      align-items: center;
      gap: 12px;
      & .bc-dive-site-chooser--bar {
        flex: 1;
        margin: 0;
      }
    }
    .bc-dive-site-chooser--bar {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      height: 48px;
      padding: 0 16px;
      border-radius: 24px;
      background: var(--bc-surface-container-highest);
      color: var(--bc-text-2);
      & input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: 0;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
      }
    }
    .bc-dive-site-chooser--columns {
      flex: 1;
      min-height: 0;
      margin-top: 8px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 24px;
      overflow: auto;
      &.bc-dive-site-chooser--one {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .bc-dive-site-chooser--column {
      min-width: 0;
    }
    .bc-dive-site-chooser--heading {
      margin: 16px 0 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }
    .bc-dive-site-chooser--common-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--bc-shared-site);
    }
    .bc-dive-site-chooser--plus {
      font-family: Georgia, serif;
      font-size: 12px;
      font-weight: 700;
      color: var(--bc-alarm);
    }
    .bc-dive-site-chooser--list {
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;
    }
    .bc-dive-site-chooser--list li + li {
      border-top: 1px solid var(--bc-row-divider);
    }
    .bc-dive-site-chooser--row,
    .bc-dive-site-chooser--new {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: 0;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      & :global(.bc-icon) {
        flex: none;
        color: var(--bc-text-2);
      }
    }
    .bc-dive-site-chooser--row:hover,
    .bc-dive-site-chooser--new:hover {
      background: var(--bc-surface-container-high);
    }
    .bc-dive-site-chooser--current {
      background: var(--bc-selected-row, var(--bc-surface-container-high));
      & :global(.bc-icon:last-child) {
        color: var(--bc-secondary);
      }
    }
    /* The dialog's « Nouveau site » is a button beside the search; on a phone it is the first row of a card. */
    .bc-dive-site-chooser--top .bc-dive-site-chooser--new {
      width: auto;
      min-height: 48px;
      padding: 0 20px 0 16px;
      gap: 8px;
      border-radius: 24px;
      background: var(--bc-primary-action, var(--bc-text));
      color: var(--bc-on-primary-action, var(--bc-surface));
      font-weight: 500;
      & :global(.bc-icon) {
        color: inherit;
      }
    }
    .bc-dive-site-chooser--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bc-dive-site-chooser--name {
      font-size: 16px;
      line-height: 24px;
    }
    .bc-dive-site-chooser--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }
    .bc-dive-site-chooser--dot {
      flex: none;
      width: 12px;
      height: 12px;
      margin: 0 5px;
      border-radius: 6px;
      background: var(--bc-shared-site);
    }
    .bc-dive-site-chooser--note {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
    .bc-dive-site-chooser--none {
      margin: 0;
      padding: 12px 16px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-dive-site-chooser--dialog-note {
      flex: none;
    }
    .bc-dive-site-chooser--actions {
      flex: none;
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .bc-dive-site-chooser--none-button,
    .bc-dive-site-chooser--text-button {
      flex: none;
      width: auto;
      min-height: 40px;
      padding: 0 16px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .bc-dive-site-chooser--none-button:hover,
    .bc-dive-site-chooser--text-button:hover {
      background: var(--bc-surface-container-high);
    }

    /* A phone: the whole screen. */
    .bc-dive-site-chooser--phone {
      align-items: stretch;
      & .bc-dive-site-chooser--surface {
        width: 100%;
        max-height: none;
        padding: calc(12px + var(--f7-safe-area-top, 0px)) 0 var(--f7-safe-area-bottom, 0px);
        border-radius: 0;
        background: var(--bc-background);
        box-shadow: none;
      }
      & .bc-dive-site-chooser--bar {
        height: 56px;
        margin: 0 16px 8px;
        padding: 0 4px 0 8px;
        border-radius: 28px;
        background: var(--bc-surface-container-high);
      }
      & .bc-dive-site-chooser--body {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 0 16px 24px;
      }
      & .bc-dive-site-chooser--heading {
        margin: 16px 16px 8px;
      }
      & .bc-dive-site-chooser--note {
        margin: 8px 16px 0;
      }
    }
    .bc-dive-site-chooser--back {
      flex: none;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 24px;
      background: none;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bc-dive-site-chooser--card {
      margin-top: 8px;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;
    }
    .bc-dive-site-chooser--card-end {
      margin-top: 24px;
      & .bc-dive-site-chooser--none-button {
        width: 100%;
        min-height: 56px;
        border-radius: 0;
        text-align: start;
        padding: 0 16px;
        font-size: 16px;
        font-weight: 400;
      }
    }

    /* iPhone: a navigation bar with « Annuler », the grouped lists. */
    .bc-dive-site-chooser--ios .bc-dive-site-chooser--nav {
      flex: none;
      position: relative;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bc-dive-site-chooser--ios .bc-dive-site-chooser--cancel {
      position: absolute;
      inset-inline-start: 8px;
      min-height: 44px;
      padding: 0 8px;
      border: 0;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 17px;
    }
    .bc-dive-site-chooser--ios .bc-dive-site-chooser--title {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }
    .bc-dive-site-chooser--ios .bc-dive-site-chooser--bar {
      height: 36px;
      margin: 8px 16px;
      padding: 0 8px;
      border-radius: 10px;
    }
    .bc-dive-site-chooser--ios .bc-dive-site-chooser--card,
    .bc-dive-site-chooser--ios .bc-dive-site-chooser--list {
      border-radius: 10px;
    }
  }
</style>
