<script>
  // @ts-check
  // « Où je plonge le plus » (od-stats-heatmap, tasks 2026-11-14-152 and 154; the card under
  // « Graphiques » in android-stats.dc.html, full screen in
  // stats-carte-chaleur-plein-ecran-android.dc.html): the dives of the Statistics filter as
  // a density (lib/heat-density.js), on a live map (one finger pans, two fingers zoom),
  // desaturated so the heat stands out, opening on the area that holds most of the dives
  // (lib/heatmap.js). No site names, no pins, no credit (it is in About). Full screen is the
  // same live map, slightly closer, with « Centrer sur ma position » and the legend in a
  // white card. Not shown with fewer than 2 sites with coordinates.
  // Up close (task 2026-11-14-155): from zoom 14 the heat fades out and the sites' pins show,
  // with their dives in the filter and no names; a pin opens the card of a selected site.
  import { f7 } from 'framework7-svelte';
  import SiteMap from './SiteMap.svelte';
  import MapSiteCard from './MapSiteCard.svelte';
  import { busiestArea, siteHeat } from '../lib/heatmap.js';
  import { currentPosition } from '../lib/site-choice.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   dives: { site: string }[],
   *   sites: import('opendives-core').SiteSummary[],
   * }}
   */
  let { dives, sites } = $props();

  const spots = $derived(siteHeat(dives, sites));
  const frame = $derived(/** @type {[number, number][]} */ (busiestArea(spots).map((s) => [s.lon, s.lat])));
  const shown = $derived(spots.length >= 2);
  const lead = $derived(spots[0]);

  /** The sites as pins up close: their dives in the filter. */
  const pins = $derived(spots.map((s) => ({ uuid: s.site.uuid, name: s.name, latUdeg: s.site.latUdeg, lonUdeg: s.site.lonUdeg, dives: s.count })));
  let selectedUuid = $state(/** @type {number|null} */ (null));
  const selectedSite = $derived(selectedUuid === null ? null : (spots.find((s) => s.site.uuid === selectedUuid)?.site ?? null));

  /** The site's sheet, full screen left first. @param {number} uuid */
  function openSite(uuid) {
    selectedUuid = null;
    map?.exitFullScreen();
    f7.views.current?.router.navigate(`/sites/${uuid}`);
  }

  /** @type {SiteMap|undefined} */
  let map = $state();

  async function centreOnMe() {
    const here = await currentPosition();
    if (here) map?.centreOn(here);
  }
</script>

{#snippet legend()}
  <div class="od-stats-heatmap--legend" aria-hidden="true">
    <span>{t('stats.heatLess')}</span><span class="od-stats-heatmap--ramp"></span><span>{t('stats.heatMore')}</span>
  </div>
{/snippet}

{#if shown}
  <section class="od-stats-heatmap" aria-label={t('stats.heatTitle')}>
    <h3 class="od-stats-heatmap--title">{t('stats.heatTitle')}</h3>
    <p class="od-stats-heatmap--lead">{t('stats.heatLead', { site: lead.name, dives: t('trip.dives', { n: lead.count }) })}</p>
    <div class="od-stats-heatmap--map">
      <SiteMap
        bind:this={map}
        heat={spots}
        {frame}
        sites={pins}
        names="never"
        pinsFromZoom={14}
        selected={selectedUuid}
        onselect={(uuid) => (selectedUuid = uuid)}
        onmapclick={() => (selectedUuid = null)}
        credits={false}
        desaturated
        closerInFullScreen
        height="170px"
        label={t('stats.heatTitle')}
        fullscreenLabel={t('stats.heatFullscreen')}
        onlocate={centreOnMe}
      >
        {#snippet overlay(/** @type {boolean} */ full)}
          {#if full}<div class="od-stats-heatmap--full-legend">{@render legend()}</div>{/if}
          {#if selectedSite}
            <MapSiteCard site={selectedSite} onopen={() => openSite(selectedSite.uuid)} onclose={() => (selectedUuid = null)} />
          {/if}
        {/snippet}
      </SiteMap>
    </div>
    {@render legend()}
  </section>
{/if}

<style>
  @layer od.components {
    .od-stats-heatmap {
      margin: 0 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
    }

    .od-stats-heatmap--title {
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-stats-heatmap--lead {
      margin: 0 0 12px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    /* 170 dp, 8 dp corners; the full-screen button 8 dp from the edges (SiteMap's default). */
    .od-stats-heatmap--map {
      border-radius: 8px;
      overflow: hidden;
    }

    .od-stats-heatmap--legend {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-stats-heatmap--ramp {
      width: 96px;
      height: 8px;
      border-radius: 4px;
      /* The six stops, least (blue) to most (red), as on the map (task 2026-11-14-161). */
      /* The ramp from t = 0.12 (« Moins ») to 1 (« Plus »), each stop where it sits (task 162). */
      background: linear-gradient(to right, var(--od-heat-1) 0%, var(--od-heat-2) 20.5%, var(--od-heat-3) 40.9%, var(--od-heat-4) 61.4%, var(--od-heat-5) 80.7%, var(--od-heat-6) 100%);
    }

    /* Full screen: the legend in a white card at the bottom left. */
    .od-stats-heatmap--full-legend {
      position: absolute;
      z-index: 2;
      left: 16px;
      bottom: calc(env(safe-area-inset-bottom) + 24px);
      padding: 4px 12px 10px;
      border-radius: 12px;
      background: var(--od-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    }
  }
</style>
