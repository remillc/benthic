<script>
  // @ts-check
  // « Sites sans coordonnées » (task 2026-11-24-395; mock-ups sites-sans-coordonnees-android,
  // ios-sites-sans-coordonnees): the sites used by dives that have no position, one card each: name, dives,
  // a map strip, and the actions stacked at the right. With a GPS position found in one of its dives, the
  // strip shows it with a pin, its coordinates are written under it (Settings › « Coordonnées GPS »), and
  // « Utiliser cette position » saves it. Without, a grey strip and « Placer sur la carte » only.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { logbook, formatCoordinates } from '../lib/sites.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { setSitePosition } from '../lib/site-place.js';
  import { positionOfSiteDives } from '../lib/site-dive-position.js';
  import { unplacedSites } from '../lib/site-cleanup.js';
  import { formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let sites = $state(/** @type {import('benthic-core').SiteSummary[]} */ ([]));
  /** The GPS position found in the dives of each site, by site. @type {Record<number, {latUdeg: number, lonUdeg: number}|null>} */
  let positions = $state({});
  let loaded = $state(false);

  $effect(() => {
    logbook.sitesVersion;
    BenthicCore.siteQuery({ kind: 'list' }).then(async (all) => {
      const list = unplacedSites(all);
      const found = await Promise.all(list.map(async (s) => [s.uuid, await positionOfSiteDives(s)]));
      positions = Object.fromEntries(found);
      sites = list;
      loaded = true;
    });
  });

  /** @param {import('benthic-core').SiteSummary} site @param {{latUdeg: number, lonUdeg: number}} position */
  async function usePosition(site, position) {
    try {
      const steps = await setSitePosition(site.uuid, position);
      offerUndo(t('sites.done'), undefined, 6000, steps);
    } catch (e) {
      console.error('Place site', e);
      showSnackbar(t('edit.failed'));
    }
  }
</script>

<Page class="bc-sites-unplaced">
  <Navbar title={t('sites.unplacedTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="bc-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="bc-sites-unplaced--intro">{t('sites.unplacedIntro')}</p>

  {#each sites as site (site.uuid)}
    {@const position = positions[site.uuid]}
    <section class="bc-sites-unplaced--card" aria-label={site.name || t('sites.noName')}>
      <div class="bc-sites-unplaced--head">
        <span class="bc-sites-unplaced--name">{site.name || t('sites.noName')}</span>
        <span class="bc-sites-unplaced--sub">{t('sites.unplacedLine', { n: site.dives, date: formatDate(site.lastDate) })}</span>
      </div>
      {#if position}
        <div class="bc-sites-unplaced--strip">
          <SiteMap pin={position} height="120px" label={t('sites.diveGpsLabel', { name: site.name || t('sites.noName') })} />
        </div>
        <div class="bc-sites-unplaced--coordinates bc-value">{formatCoordinates(position.latUdeg, position.lonUdeg)}</div>
      {:else}
        <div class="bc-sites-unplaced--strip bc-sites-unplaced--none">
          <Icon name="place" size={24} />
          <span>{t('sites.noDiveGps')}</span>
        </div>
      {/if}
      <div class="bc-sites-unplaced--actions">
        {#if position}
          <button type="button" class="bc-sites-unplaced--filled" onclick={() => usePosition(site, position)}>{t('sites.useThisPosition')}</button>
          <button type="button" class="bc-text-button" onclick={() => f7router.navigate(`/sites/${site.uuid}/place`)}>{t('sites.placeOnMap')}</button>
        {:else}
          <button type="button" class="bc-sites-unplaced--filled" onclick={() => f7router.navigate(`/sites/${site.uuid}/place`)}>{t('sites.placeOnMap')}</button>
        {/if}
      </div>
    </section>
  {/each}
</Page>

<style>
  @layer bc.components {
    .bc-sites-unplaced--intro {
      margin: 12px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-sites-unplaced--card {
      margin: 0 16px 12px;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-sites-unplaced--head {
      padding: 12px 16px 10px;
      display: flex;
      flex-direction: column;
    }

    .bc-sites-unplaced--name {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-sites-unplaced--sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-sites-unplaced--strip {
      height: 120px;
      overflow: hidden;
    }

    /* No position in any dive: a grey strip with a pin. */
    .bc-sites-unplaced--none {
      background: var(--bc-surface-2);
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
      line-height: 20px;
    }

    .bc-sites-unplaced--coordinates {
      padding: 8px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* The buttons stacked at the right, 12 apart, 16 of padding. */
    .bc-sites-unplaced--actions {
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }

    .bc-sites-unplaced--filled {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      cursor: pointer;
    }
  }
</style>
