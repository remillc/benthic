<script>
  // @ts-check
  // « Choisir un site… » on the desktop (task 2026-11-15-177, mock-up bureau-sites-sans-site-
  // choisir): a searchable list opened under the button, the sites from the nearest to the farthest
  // from the dive (« à 3,2 km »), the most recently dived first without a position; it ends with
  // « Nouveau site « {texte} » à la position de la plongée ». ↑ ↓ and Entrée choose, Échap closes.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { deskSites } from '../lib/desktop-sites.svelte.js';
  import { filterChoice } from '../lib/desktop-sites.js';
  import { distanceParts, sitesInChoiceOrder } from '../lib/site-distance.js';
  import { formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   sites: import('opendives-core').SiteSummary[],
   *   position: { latUdeg: number, lonUdeg: number }|null,
   *   x: number, y: number,
   *   onchoose: (site: import('opendives-core').SiteSummary) => void,
   *   oncreate: (name: string) => void,
   *   onclose: () => void,
   * }}
   * position: where the dive was recorded, or null.
   */
  let { sites, position, x, y, onchoose, oncreate, onclose } = $props();

  let query = $state('');
  let active = $state(0);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();
  /** @type {HTMLElement|undefined} */
  let box = $state();
  let left = $state(0);
  let top = $state(0);

  const rows = $derived(filterChoice(sitesInChoiceOrder(sites, position), deskSites.regions, query));
  const typed = $derived(query.trim());
  /** The rows, then « Nouveau site » when a text is typed. */
  const count = $derived(rows.length + (typed ? 1 : 0));

  onMount(() => {
    const r = box?.getBoundingClientRect();
    left = Math.max(8, Math.min(x, innerWidth - (r?.width ?? 380) - 8));
    top = Math.max(8, Math.min(y, innerHeight - (r?.height ?? 400) - 8));
    input?.focus();
  });

  $effect(() => {
    query;
    active = 0;
  });

  /** @param {number} metres */
  function away(metres) {
    const unit = logbook.prefs.length === 'ft' ? 'ft' : 'm';
    const p = distanceParts(metres, unit);
    return t('sites.chooseAway', { distance: `${formatNumber(p.value, p.decimals)} ${p.unit}` });
  }

  function pick(/** @type {number} */ i) {
    if (i < rows.length) onchoose(rows[i].site);
    else if (typed) oncreate(typed);
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % Math.max(1, count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + Math.max(1, count)) % Math.max(1, count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  $effect(() => {
    active;
    box?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-site-chooser--scrim" onpointerdown={(e) => e.target === e.currentTarget && onclose()}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="od-site-chooser" role="dialog" aria-label={t('sites.chooseSite')} bind:this={box} style:left="{left}px" style:top="{top}px" onkeydown={keydown}>
    <label class="od-site-chooser--search">
      <Icon name="search" size={20} />
      <input type="search" bind:this={input} bind:value={query} placeholder={t('sites.searchSitePlaceholder')} aria-label={t('sites.searchSitePlaceholder')} autocomplete="off" />
    </label>
    <p class="od-site-chooser--heading">{position ? t('desktopSites.nearestToDive') : t('desktopSites.mostRecent')}</p>
    <ul class="od-site-chooser--list" role="listbox">
      {#each rows as row, i (row.site.uuid)}
        <li role="option" aria-selected={i === active} class:od-site-chooser--active={i === active}>
          <button type="button" tabindex="-1" onclick={() => pick(i)}>
            <Icon name="sites" size={18} />
            <span class="od-site-chooser--text">
              <span class="od-site-chooser--name">{row.site.name || t('sites.noName')}</span>
              <span class="od-site-chooser--sub">{[row.site.country || t('sites.noCountry'), t('sites.diveCount', { n: row.site.dives })].join(' · ')}</span>
            </span>
            {#if row.metres !== null}<span class="od-site-chooser--distance od-value">{away(row.metres)}</span>{/if}
          </button>
        </li>
      {/each}
      {#if !rows.length}<li class="od-site-chooser--none">{t('sites.noMatch')}</li>{/if}
    </ul>
    {#if typed}
      <button type="button" tabindex="-1" role="option" aria-selected={active === rows.length} class="od-site-chooser--new" class:od-site-chooser--active={active === rows.length} onclick={() => pick(rows.length)}>
        <Icon name="plus" size={18} />
        <span>{t(position ? 'desktopSites.newSiteNamedHere' : 'desktopSites.newSiteNamed', { text: typed })}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  @layer od.components {
    .od-site-chooser--scrim {
      position: fixed;
      inset: 0;
      z-index: 13000;
    }
    .od-site-chooser {
      position: fixed;
      width: 380px;
      max-height: min(480px, calc(100vh - 16px));
      display: flex;
      flex-direction: column;
      padding: 12px 0 4px;
      border-radius: 16px;
      background: var(--od-surface);
      box-shadow:
        0 2px 6px 2px rgb(0 0 0 / 0.15),
        0 1px 2px rgb(0 0 0 / 0.3);
    }
    .od-site-chooser--search {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      margin: 0 12px;
      padding: 0 12px;
      border: 2px solid var(--od-secondary);
      border-radius: 22px;
      color: var(--od-text-2);
    }
    .od-site-chooser--search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      outline: none;
    }
    .od-site-chooser--heading {
      margin: 8px 0 2px;
      padding: 0 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--od-text-2);
    }
    .od-site-chooser--list {
      flex: 1;
      min-height: 0;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: auto;
    }
    .od-site-chooser--list button,
    .od-site-chooser--new {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 48px;
      padding: 4px 16px;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      text-align: start;
      cursor: pointer;
    }
    .od-site-chooser--new {
      border-top: 1px solid var(--od-separator);
      font-weight: 500;
      color: var(--od-on-table-selected);
    }
    .od-site-chooser--active > button,
    .od-site-chooser--new.od-site-chooser--active,
    .od-site-chooser--list li:hover > button,
    .od-site-chooser--new:hover {
      background: var(--od-surface-container-high);
    }
    .od-site-chooser--text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .od-site-chooser--name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-site-chooser--sub {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-site-chooser--distance {
      flex: none;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-site-chooser--none {
      padding: 12px 16px;
      font-size: 14px;
      color: var(--od-text-2);
    }
  }
</style>
