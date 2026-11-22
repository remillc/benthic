<script>
  // @ts-check
  // « Choisir un site » (task 2026-11-14-151; choisir-site-android.dc.html): one screen
  // for every place that needs a site (lib/site-choice.js). At the top a search bar
  // (← « Retour », « Rechercher un site »), then « Créer un site à ma position actuelle »,
  // then every site of the logbook, nearest first when the phone knows its position
  // (« {pays} · à {distance} · {n} plongées »), else the most recently dived first.
  // Typing filters on the name and the country. A site is chosen and the screen goes
  // back. On iPhone, a navigation bar with the title, and the search field under it.
  // A signed-in Benthic+ account also sees « Dans la carte commune » (task 2026-11-19-315, point 5;
  // choisir-site-commun-android.dc.html): base sites near the phone that the logbook does not have; choosing one adds
  // it to the diver's sites (lib/shared-sites.svelte.js, addBaseSite) and gives it back like any site.
  import { onDestroy } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import { cachedSites } from '../lib/core-cache.js';
  import Icon from '../components/Icon.svelte';
  import SearchClear from '../components/SearchClear.svelte';
  import { t } from '../lib/i18n.js';
  import { formatNumber } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { ios } from '../lib/layout.svelte.js';
  import { matchesSite } from '../lib/site-search.js';
  import { distanceParts, sitesInChoiceOrder } from '../lib/site-distance.js';
  import { currentPosition, deliverSite, forgetSiteChoice } from '../lib/site-choice.js';
  import { benthicPlusAccount } from '../lib/benthic-plus-state.svelte.js';
  import { addBaseSite, loadLinks, sharedSites, withSession } from '../lib/shared-sites.svelte.js';
  import { CHOOSE_RADIUS_M, inYourSites } from '../lib/shared-sites.js';
  import { baseDivesText, distanceText as awayText } from '../lib/shared-sites-format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { connection } from '../lib/online.svelte.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** @type {import('benthic-core').SiteSummary[]} */
  let sites = $state([]);
  let position = $state(/** @type {{ latUdeg: number, lonUdeg: number }|null} */ (null));
  let query = $state('');
  let creating = $state(false);
  /** A site was chosen or is being created: the screen that asked keeps waiting. */
  let handedOver = false;

  cachedSites().then(
    (/** @type {import('benthic-core').SiteSummary[]} */ list) => (sites = list.filter((s) => s.name || s.dives)),
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

  /** @param {{ site: import('benthic-core').SiteSummary, metres: number|null }} row */
  const line = (row) =>
    [row.site.country, row.metres === null ? '' : distanceText(row.metres), row.site.dives ? t('sites.diveCount', { n: row.site.dives }) : t('sites.noDive')]
      .filter(Boolean)
      .join(' · ');

  /** @param {import('benthic-core').SiteSummary} site */
  function choose(site) {
    handedOver = true;
    deliverSite({ uuid: site.uuid, name: site.name });
    f7router.back();
  }

  /** The base sites near the phone, without those the logbook has. */
  let commonRows = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite[]} */ ([]));
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let commonTimer;
  let commonAsk = 0;
  $effect(() => {
    const p = position;
    const q = query;
    clearTimeout(commonTimer);
    if (!p || !benthicPlusAccount.signedIn || !connection.online) {
      commonRows = [];
      return;
    }
    commonTimer = setTimeout(async () => {
      const ask = ++commonAsk;
      try {
        if (!sharedSites.linksLoaded) await loadLinks();
        const near = await withSession((api, token) => api.nearby(token, { lat: p.latUdeg / 1e6, lon: p.lonUdeg / 1e6, radiusM: CHOOSE_RADIUS_M, limit: 10, q }));
        if (ask === commonAsk) commonRows = near.filter((b) => !inYourSites(b.id, sharedSites.links));
      } catch {
        // Not a subscriber, or the server does not answer: the section stays hidden.
        if (ask === commonAsk) commonRows = [];
      }
    }, q ? 300 : 0);
  });

  /** « Carte commune · à 1,4 mi · 87 plongées ». @param {import('../lib/shared-sites.js').BaseSite} b */
  const commonLine = (b) => [t('sharedSites.commonMapButton'), b.distanceM !== undefined ? awayText(b.distanceM, logbook.prefs) : '', baseDivesText(b)].filter(Boolean).join(' · ');

  /** @param {import('../lib/shared-sites.js').BaseSite} b */
  async function chooseBase(b) {
    if (creating) return;
    creating = true;
    try {
      const uuid = await addBaseSite(b.id);
      handedOver = true;
      deliverSite({ uuid, name: b.name });
      f7router.back();
    } catch {
      showSnackbar(t('sharedSites.card.addFailed'));
    } finally {
      creating = false;
    }
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

<Page class="bc-site-choose">
  {#if ios}
    <Navbar title={t('sites.chooseSite')}>
      {#snippet left()}
        <Link back>{t('common.back')}</Link>
      {/snippet}
    </Navbar>
  {/if}
  <div class="bc-site-choose--search" class:bc-site-choose--search-ios={ios}>
    {#if !ios}
      <button type="button" class="bc-site-choose--back" aria-label={t('common.back')} onclick={() => f7router.back()}><Icon name="arrowBack" /></button>
    {:else}
      <Icon name="search" size={18} />
    {/if}
    <input type="search" bind:value={query} placeholder={t('sites.searchSitePlaceholder')} aria-label={t('sites.searchSitePlaceholder')} enterkeyhint="search" />
    {#if query}<SearchClear onclear={() => (query = '')} />{/if}
  </div>

  <div class="bc-site-choose--surface">
    <button type="button" class="bc-site-choose--create" disabled={creating} onclick={createHere}>
      <Icon name="locate" size={22} />
      <span>{t('sites.createHere')}</span>
    </button>
  </div>

  <p class="bc-site-choose--count" role="status">
    {position ? t('sites.chooseCountNear', { n: rows.length }) : t('sites.chooseCountRecent', { n: rows.length })}
  </p>

  <ul class="bc-site-choose--surface bc-site-choose--list" role="list">
    {#each rows as row (row.site.uuid)}
      <li>
        <button type="button" class="bc-site-choose--row" onclick={() => choose(row.site)}>
          <Icon name="place" size={22} />
          <span class="bc-site-choose--texts">
            <span class="bc-site-choose--name">{row.site.name || t('sites.noName')}</span>
            <span class="bc-site-choose--line bc-value">{line(row)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
  {#if commonRows.length}
    <p class="bc-site-choose--count bc-site-choose--common-title"><Icon name="globe" size={18} />{t('sharedSites.chooseSection')}</p>
    <ul class="bc-site-choose--surface bc-site-choose--list" role="list" aria-label={t('sharedSites.listLabel')}>
      {#each commonRows as b (b.id)}
        <li>
          <button type="button" class="bc-site-choose--row" disabled={creating} onclick={() => chooseBase(b)}>
            <span class="bc-site-choose--common-dot" aria-hidden="true"></span>
            <span class="bc-site-choose--texts">
              <span class="bc-site-choose--name">{b.name}</span>
              <span class="bc-site-choose--line bc-value">{commonLine(b)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="bc-site-choose--note">{t('sharedSites.chooseNote')}</p>
  {/if}
  <p class="bc-site-choose--note">{t('sites.chooseNote')}</p>
</Page>

<style>
  @layer bc.components {
    /* Material 3 search bar: 56 dp pill, ← and the field (choisir-site-android). */
    .bc-site-choose--search {
      margin: calc(12px + var(--f7-safe-area-top)) 16px 8px;
      height: 56px;
      padding: 0 4px;
      border-radius: 28px;
      background: var(--bc-surface-container-high);
      display: flex;
      align-items: center;
      gap: 4px;

      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: none;
        background: transparent;
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }

      /* iPhone: the search field under the navigation bar. */
      &.bc-site-choose--search-ios {
        margin: 8px 16px;
        height: 36px;
        padding: 0 8px;
        border-radius: 10px;
        gap: 6px;
        color: var(--bc-text-2);
      }
    }

    .bc-site-choose--back {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-site-choose--surface {
      margin: 8px 16px 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .bc-site-choose--create,
    .bc-site-choose--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;

      :global(.bc-icon) {
        flex: none;
        color: var(--bc-text-2);
      }
    }

    .bc-site-choose--create {
      font-weight: 500;

      :global(.bc-icon) {
        color: var(--bc-secondary);
      }
    }

    .bc-site-choose--list li + li {
      border-top: 1px solid var(--bc-row-divider);
    }

    .bc-site-choose--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-site-choose--name {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-site-choose--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-site-choose--count {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-site-choose--common-title {
      margin-top: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--bc-shared-site);
      font-weight: 600;
    }
    .bc-site-choose--common-dot {
      flex: none;
      width: 12px;
      height: 12px;
      margin: 0 5px;
      border-radius: 6px;
      background: var(--bc-shared-site);
    }

    .bc-site-choose--note {
      margin: 12px 24px 32px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
  }
</style>
