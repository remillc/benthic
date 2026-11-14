<script>
  // @ts-check
  // « Choisir un site » (task 2026-11-14-151; choisir-site-android.dc.html): one screen
  // for every place that needs a site (lib/site-choice.js). At the top a search bar
  // (← « Retour », « Rechercher un site »), then « Créer un site à ma position actuelle »,
  // then every site of the logbook, nearest first when the phone knows its position
  // (« {pays} · à {distance} · {n} plongées »), else the most recently dived first.
  // Typing filters on the name and the country. A site is chosen and the screen goes
  // back. On iPhone, a navigation bar with the title, and the search field under it.
  import { onDestroy } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import SearchClear from '../components/SearchClear.svelte';
  import { t } from '../lib/i18n.js';
  import { formatNumber } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { ios } from '../lib/layout.svelte.js';
  import { matchesSite } from '../lib/site-search.js';
  import { distanceParts, sitesInChoiceOrder } from '../lib/site-distance.js';
  import { currentPosition, deliverSite, forgetSiteChoice } from '../lib/site-choice.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let position = $state(/** @type {{ latUdeg: number, lonUdeg: number }|null} */ (null));
  let query = $state('');
  let creating = $state(false);
  /** A site was chosen or is being created: the screen that asked keeps waiting. */
  let handedOver = false;

  OpenDivesCore.siteQuery({ kind: 'list' }).then(
    (/** @type {import('opendives-core').SiteSummary[]} */ list) => (sites = list.filter((s) => s.name || s.dives)),
    (/** @type {unknown} */ e) => console.error('Sites', e),
  );
  currentPosition().then((p) => (position = p));

  const rows = $derived(sitesInChoiceOrder(sites.filter((s) => matchesSite(s, query)), position));
  const unit = $derived(/** @type {'m'|'ft'} */ (logbook.prefs.length === 'ft' ? 'ft' : 'm'));

  /** « à 394 pi », « à 1,1 mi ». @param {number} metres */
  function distanceText(metres) {
    const d = distanceParts(metres, unit);
    const names = { m: t('units.meters'), ft: t('units.feet'), km: t('units.kilometers'), mi: t('units.miles') };
    return t('sites.chooseAway', { distance: `${formatNumber(d.value, d.decimals)} ${names[d.unit]}` });
  }

  /** @param {{ site: import('opendives-core').SiteSummary, metres: number|null }} row */
  const line = (row) =>
    [row.site.country, row.metres === null ? '' : distanceText(row.metres), row.site.dives ? t('sites.diveCount', { n: row.site.dives }) : t('sites.noDive')]
      .filter(Boolean)
      .join(' · ');

  /** @param {import('opendives-core').SiteSummary} site */
  function choose(site) {
    handedOver = true;
    deliverSite({ uuid: site.uuid, name: site.name });
    f7router.back();
  }

  /** « Nouveau site » at the phone's position, in this screen's place: its site is given back. */
  async function createHere() {
    creating = true;
    const here = position ?? (await currentPosition());
    creating = false;
    handedOver = true;
    const at = here ? `&lat=${here.latUdeg}&lon=${here.lonUdeg}` : '';
    f7router.navigate(`/sites/new?choose=1${at}`, { reloadCurrent: true });
  }

  onDestroy(() => {
    if (!handedOver) forgetSiteChoice();
  });
</script>

<Page class="od-site-choose">
  {#if ios}
    <Navbar title={t('sites.chooseSite')}>
      {#snippet left()}
        <Link back>{t('common.back')}</Link>
      {/snippet}
    </Navbar>
  {/if}
  <div class="od-site-choose--search" class:od-site-choose--search-ios={ios}>
    {#if !ios}
      <button type="button" class="od-site-choose--back" aria-label={t('common.back')} onclick={() => f7router.back()}><Icon name="arrowBack" /></button>
    {:else}
      <Icon name="search" size={18} />
    {/if}
    <input type="search" bind:value={query} placeholder={t('sites.searchSitePlaceholder')} aria-label={t('sites.searchSitePlaceholder')} enterkeyhint="search" />
    {#if query}<SearchClear onclear={() => (query = '')} />{/if}
  </div>

  <div class="od-site-choose--surface">
    <button type="button" class="od-site-choose--create" disabled={creating} onclick={createHere}>
      <Icon name="locate" size={22} />
      <span>{t('sites.createHere')}</span>
    </button>
  </div>

  <p class="od-site-choose--count" role="status">
    {position ? t('sites.chooseCountNear', { n: rows.length }) : t('sites.chooseCountRecent', { n: rows.length })}
  </p>

  <ul class="od-site-choose--surface od-site-choose--list" role="list">
    {#each rows as row (row.site.uuid)}
      <li>
        <button type="button" class="od-site-choose--row" onclick={() => choose(row.site)}>
          <Icon name="place" size={22} />
          <span class="od-site-choose--texts">
            <span class="od-site-choose--name">{row.site.name || t('sites.noName')}</span>
            <span class="od-site-choose--line od-value">{line(row)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
  <p class="od-site-choose--note">{t('sites.chooseNote')}</p>
</Page>

<style>
  @layer od.components {
    /* Material 3 search bar: 56 dp pill, ← and the field (choisir-site-android). */
    .od-site-choose--search {
      margin: calc(12px + var(--f7-safe-area-top)) 16px 8px;
      height: 56px;
      padding: 0 4px;
      border-radius: 28px;
      background: var(--od-surface-container-high);
      display: flex;
      align-items: center;
      gap: 4px;

      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: none;
        background: transparent;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }

      /* iPhone: the search field under the navigation bar. */
      &.od-site-choose--search-ios {
        margin: 8px 16px;
        height: 36px;
        padding: 0 8px;
        border-radius: 10px;
        gap: 6px;
        color: var(--od-text-2);
      }
    }

    .od-site-choose--back {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-site-choose--surface {
      margin: 8px 16px 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-site-choose--create,
    .od-site-choose--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;

      :global(.od-icon) {
        flex: none;
        color: var(--od-text-2);
      }
    }

    .od-site-choose--create {
      font-weight: 500;

      :global(.od-icon) {
        color: var(--od-secondary);
      }
    }

    .od-site-choose--list li + li {
      border-top: 1px solid var(--od-row-divider);
    }

    .od-site-choose--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-site-choose--name {
      font-size: 16px;
      line-height: 22px;
    }

    .od-site-choose--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-site-choose--count {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-site-choose--note {
      margin: 12px 24px 32px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
