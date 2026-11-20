<script>
  // @ts-check
  // Dives without a site (docs/mockups/sites-sans-site-android.dc.html): each
  // dive opens its profile, with "Choose a site" and "New site" apart. A dive
  // with a recorded position is a numbered point on the map (bc-dives-without-site-map)
  // and gets the nearest site within 500 m (lib/site-suggestion.js); one without
  // a position gets the site of the other dives of the same trip (task 2026-11-14-148).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { setDiveSite } from '../lib/dive-site.js';
  import { chooseSite } from '../lib/site-choice.js';
  import { formatDateTime, formatNumber, depthUnit } from '../lib/format.js';
  import { SITE_SUGGESTION_LIMIT_M, distanceInDepthUnit, suggestByDistance } from '../lib/site-suggestion.js';
  import { diveLines } from '../lib/sites.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** @type {{id: number, number: number, date: string, durationSeconds: number, suggestedSite: number, latUdeg?: number, lonUdeg?: number}[]} */
  let dives = $state([]);
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);

  async function load() {
    // The latest dive first, as in the logbook.
    dives = (await OpenDivesCore.siteQuery({ kind: 'without' })).sort((/** @type {any} */ a, /** @type {any} */ b) => b.date.localeCompare(a.date));
    sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    diveLines(dives, (l) => (lines = l), ', ');
  }

  /** Second line of each dive ("55 min, recycleur"), by dive id. */
  let lines = $state(/** @type {Record<number, string>} */ ({}));

  /**
   * How many dives of the same trip are at the suggested site.
   * @param {number} diveId
   * @param {number} uuid
   */
  function sameTrip(diveId, uuid) {
    const trip = logbook.dives.find((d) => d.id === diveId)?.trip?.id;
    const name = siteName(uuid);
    return trip ? logbook.dives.filter((d) => d.trip?.id === trip && d.site === name).length : 0;
  }

  $effect(() => {
    logbook.sitesVersion;
    load();
  });

  const siteName = (/** @type {number} */ uuid) => sites.find((s) => s.uuid === uuid)?.name || t('sites.noName');

  /** The logbook's dives, for the profile thumbnails. */
  const byId = $derived(new Map(logbook.dives.map((d) => [d.id, d])));

  /** The dives with a recorded position, numbered in the order of the list. */
  const points = $derived(
    dives
      .filter((d) => d.latUdeg !== undefined && d.lonUdeg !== undefined)
      .map((d, i) => ({ n: i + 1, id: d.id, latUdeg: /** @type {number} */ (d.latUdeg), lonUdeg: /** @type {number} */ (d.lonUdeg) })),
  );
  const pointOf = $derived(new Map(points.map((p) => [p.id, p])));
  const placed = $derived(sites.filter((s) => s.hasLocation));

  /** A distance in the depth unit, whole: « 689 pi », « 210 m ». @param {number} metres */
  const distanceText = (metres) => {
    const unit = logbook.prefs.length === 'ft' ? 'ft' : 'm';
    return `${formatNumber(distanceInDepthUnit(metres, unit))}\u00a0${depthUnit(logbook.prefs)}`;
  };

  /** The site near a dive's position, or null (none within the limit). @param {{ latUdeg: number, lonUdeg: number }} p */
  const nearOf = (p) => suggestByDistance(p, placed);

  const listFormat = new Intl.ListFormat(document.documentElement.lang || undefined, { type: 'conjunction' });
  const mapLabel = $derived(
    [
      t('sites.withoutMapLabel', { n: points.length, list: listFormat.format(points.map((p) => formatNumber(p.n))) }),
      points.length < dives.length ? t('sites.withoutMapOthers') : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<Page class="bc-dives-without-site">
  <Navbar title={t('sites.withoutTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="bc-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="bc-intro">{t('sites.withoutIntro', { n: dives.length })}</p>

  {#if points.length}
    <!-- The positions recorded with the dives, numbered as in the list, and the sites around in grey. -->
    <div class="bc-dives-without-site-map">
      <SiteMap sites={placed} muted points={points} height="170px" label={mapLabel} />
      <p class="bc-dives-without-site-map--note"><span class="bc-dives-without-site-map--dot" aria-hidden="true"></span>{t('sites.withoutMapNote')}</p>
    </div>
  {/if}

  {#if dives.length}
    <!-- All the dives in one white surface, with dividers. -->
    <ul class="bc-dives-without-site--surface">
      {#each dives as dive (dive.id)}
        {@const listed = byId.get(dive.id)}
        {@const point = pointOf.get(dive.id)}
        {@const near = point ? nearOf(point) : null}
        {@const suggested = point ? near?.site.uuid ?? 0 : dive.suggestedSite}
        <li class="bc-dives-without-site--dive">
          <a href="/sites/without-site/{dive.id}" class="bc-dives-without-site--open" aria-label={t('sites.seeProfile')}>
            {#if listed}<ProfileThumbnail profile={listed.profile} maxDepthMm={listed.maxDepthMm} prefs={logbook.prefs} />{/if}
            <span class="bc-dives-without-site--text">
              <span class="bc-dives-without-site--date bc-value"
                >{#if point}<span class="bc-dives-without-site--badge" role="img" aria-label={t('sites.mapPoint', { n: point.n })}>{formatNumber(point.n)}</span>{/if}{formatDateTime(dive.date)}</span
              >
              <span class="bc-dives-without-site--sub bc-value">{lines[dive.id] ?? ''}</span>
            </span>
            <span class="bc-dives-without-site--chevron"><Icon name="chevron" size={20} /></span>
          </a>
          <span class="bc-dives-without-site--actions">
            {#if suggested}
              <!-- The suggested site first, as a filled tonal chip. -->
              <button type="button" class="bc-dives-without-site--small bc-dives-without-site--tonal" onclick={() => setDiveSite(dive.id, suggested)}>
                {siteName(suggested)}
              </button>
            {/if}
            <button type="button" class="bc-dives-without-site--small" onclick={() => chooseSite(f7router, (site) => setDiveSite(dive.id, site.uuid))}>{t('sites.chooseSite')}</button>
            <!-- With a position, the new site is created there. -->
            <button
              type="button"
              class="bc-dives-without-site--small"
              onclick={() => f7router.navigate(point ? `/sites/new?dive=${dive.id}&lat=${point.latUdeg}&lon=${point.lonUdeg}` : `/sites/new?dive=${dive.id}`)}
              >{t('sites.newSite')}</button
            >
          </span>
          {#if point && near}
            <span class="bc-dives-without-site--why">{t('sites.distanceSuggestion', { site: siteName(near.site.uuid), distance: distanceText(near.distanceM) })}</span>
          {:else if point}
            <span class="bc-dives-without-site--why">{t('sites.noSiteNear', { limit: distanceText(SITE_SUGGESTION_LIMIT_M) })}</span>
          {:else if dive.suggestedSite}
            <span class="bc-dives-without-site--why">{t('sites.suggestionLine', { n: sameTrip(dive.id, dive.suggestedSite), site: siteName(dive.suggestedSite) })}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Page>

<style>
  @layer od.components {
    /* The map card (bc-dives-without-site-map): 16 dp corners, 170 dp map, a note under it. */
    .bc-dives-without-site-map {
      margin: 14px 16px 0;
      border-radius: 16px;
      overflow: hidden;
      background: var(--bc-surface);
      /* The credits stay inside the rounded corners. */
      --bc-map-credits-right: 12px;
      --bc-map-credits-bottom: 8px;
    }

    .bc-dives-without-site-map--note {
      margin: 0;
      padding: 8px 16px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-dives-without-site-map--dot {
      flex: none;
      width: 14px;
      height: 14px;
      margin: 0 2px;
      border-radius: 50%;
      background: var(--bc-text);
    }

    /* The dive's point on the map, before its date: as drawn on the map. */
    .bc-dives-without-site--badge {
      box-sizing: border-box;
      display: inline-block;
      vertical-align: 2px;
      width: 22px;
      height: 22px;
      margin-right: 8px;
      border-radius: 50%;
      background: var(--bc-text);
      color: var(--bc-surface);
      font-size: 13px;
      font-weight: 700;
      line-height: 22px;
      text-align: center;
    }

    .bc-dives-without-site--surface {
      margin: 14px 16px 24px;
      padding: 0;
      list-style: none;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-dives-without-site--dive {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;

      & + .bc-dives-without-site--dive {
        border-top: 1px solid var(--bc-separator);
      }
    }

    /* The thumbnail and the text: one tappable area, apart from the buttons. */
    .bc-dives-without-site--open {
      margin: -4px -8px;
      padding: 4px 8px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: inherit;
      text-decoration: none;
    }

    .bc-dives-without-site--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-dives-without-site--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-dives-without-site--date {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
    }

    .bc-dives-without-site--sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-dives-without-site--actions {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Small outlined buttons: 32 dp, 8 dp corners, 48 dp touch target. */
    .bc-dives-without-site--small {
      position: relative;
      width: auto;
      height: 32px;
      padding: 0 12px;
      border: var(--bc-outline-width) solid var(--bc-text-2);
      border-radius: 8px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;

      &::after {
        content: '';
        position: absolute;
        inset: -8px 0;
      }

      /* The suggested site: a filled tonal chip. */
      &.bc-dives-without-site--tonal {
        border-color: transparent;
        background: var(--bc-tint);
        color: var(--bc-on-tint);
      }
    }

    .bc-dives-without-site--why {
      margin-top: 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
  }
</style>
