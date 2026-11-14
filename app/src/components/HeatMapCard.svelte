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
  import SiteMap from './SiteMap.svelte';
  import { busiestArea, siteHeat } from '../lib/heatmap.js';
  import { currentPosition } from '../lib/site-choice.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   dives: { site: string }[],
   *   sites: { name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number, dives: number }[],
   * }}
   */
  let { dives, sites } = $props();

  const spots = $derived(siteHeat(dives, sites));
  const frame = $derived(/** @type {[number, number][]} */ (busiestArea(spots).map((s) => [s.lon, s.lat])));
  const shown = $derived(spots.length >= 2);
  const lead = $derived(spots[0]);

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
      background: linear-gradient(to right, var(--od-heat-3), var(--od-heat-2), var(--od-heat-1));
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
