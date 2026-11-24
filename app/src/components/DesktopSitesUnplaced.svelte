<script>
  // @ts-check
  // « Sites sans coordonnées » on the desktop (task 2026-11-24-395; mock-up bureau-sites-sans-coordonnees): a
  // card for each site, with the GPS position found in one of its dives (« Utiliser cette position ») and
  // « Placer sur la carte », which opens the placing step in this pane.
  import Icon from './Icon.svelte';
  import DesktopCleanupHeader from './DesktopCleanupHeader.svelte';
  import { formatCoordinates } from '../lib/sites.svelte.js';
  import { setSitePosition } from '../lib/site-place.js';
  import { fillPlace } from '../lib/desktop-sites.svelte.js';
  import { positionOfSiteDives } from '../lib/site-dive-position.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ sites: import('benthic-core').SiteSummary[], onback: () => void, onplace: (uuid: number) => void }} */
  let { sites, onback, onplace } = $props();

  /** The GPS position found in the dives of each site. @type {Record<number, {latUdeg: number, lonUdeg: number}|null>} */
  let positions = $state({});

  $effect(() => {
    const list = sites;
    Promise.all(list.map(async (s) => [s.uuid, await positionOfSiteDives(s)])).then((found) => (positions = Object.fromEntries(found)));
  });

  /** @param {number} uuid @param {{latUdeg: number, lonUdeg: number}} position */
  async function usePosition(uuid, position) {
    try {
      const steps = await setSitePosition(uuid, position, fillPlace);
      offerUndo(t('sites.done'), undefined, 6000, steps);
    } catch (e) {
      console.error('Place site', e);
      showSnackbar(t('edit.failed'));
    }
  }
</script>

<section class="bc-cleanup-unplaced" data-bc-scroll aria-label={t('sites.unplacedTitle')}>
  <DesktopCleanupHeader title={t('sites.unplacedTitle')} {onback} />
  <p class="bc-cleanup-unplaced--lead">{t('sites.unplacedIntro')}</p>
  {#each sites as site (site.uuid)}
    {@const position = positions[site.uuid]}
    <div class="bc-cleanup-unplaced--card">
      <div class="bc-cleanup-unplaced--text">
        <p class="bc-cleanup-unplaced--name">{site.name || t('sites.noName')}</p>
        <p class="bc-cleanup-unplaced--sub">{t('sites.unplacedLine', { n: site.dives, date: formatDate(site.lastDate) })}</p>
        {#if position}
          <p class="bc-cleanup-unplaced--sub bc-value">{formatCoordinates(position.latUdeg, position.lonUdeg)}</p>
        {:else}
          <p class="bc-cleanup-unplaced--none"><Icon name="place" size={16} />{t('sites.noDiveGps')}</p>
        {/if}
      </div>
      <div class="bc-cleanup-unplaced--actions">
        {#if position}
          <button type="button" class="bc-cleanup-unplaced--filled" onclick={() => usePosition(site.uuid, position)}>{t('sites.useThisPosition')}</button>
          <button type="button" class="bc-cleanup-unplaced--text" onclick={() => onplace(site.uuid)}>{t('sites.placeOnMap')}</button>
        {:else}
          <button type="button" class="bc-cleanup-unplaced--filled" onclick={() => onplace(site.uuid)}>{t('sites.placeOnMap')}</button>
        {/if}
      </div>
    </div>
  {/each}
</section>

<style>
  @layer bc.components {
    .bc-cleanup-unplaced {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      padding: 4px 12px 24px 4px;
    }
    .bc-cleanup-unplaced--lead {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-cleanup-unplaced--card {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      max-width: 640px;
      margin-bottom: 8px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    .bc-cleanup-unplaced--text p {
      margin: 0;
    }
    .bc-cleanup-unplaced--name {
      font-size: 16px;
      font-weight: 500;
    }
    .bc-cleanup-unplaced--sub,
    .bc-cleanup-unplaced--none {
      font-size: 13px;
      line-height: 17px;
      color: var(--bc-text-2);
    }
    .bc-cleanup-unplaced--none {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .bc-cleanup-unplaced--actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }
    .bc-cleanup-unplaced--filled,
    .bc-cleanup-unplaced--text {
      width: auto;
      height: 36px;
      padding: 0 16px;
      white-space: nowrap;
      border: 0;
      border-radius: 18px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .bc-cleanup-unplaced--filled {
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
    }
    .bc-cleanup-unplaced--text {
      background: none;
      color: var(--bc-on-table-selected);
      &:hover {
        background: color-mix(in srgb, currentColor 8%, transparent);
      }
    }
  }
</style>
