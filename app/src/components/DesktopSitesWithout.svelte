<script>
  // @ts-check
  // « Plongées sans site » on the desktop (task 2026-11-15-177, mock-ups bureau-sites-sans-site and
  // -choisir): a card for each dive, with the suggestion as a tonal button when there is one,
  // « Choisir un site… », « Nouveau site » (created at the dive's position) and a line that explains
  // the suggestion or its absence. The dives of a trip are grouped under the trip, with « Les associer
  // toutes au même site ». The rules are the phone's (lib/site-suggestion.js, same wording).
  import DesktopSiteChooser from './DesktopSiteChooser.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { setDiveSite } from '../lib/dive-site.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { fillPlace } from '../lib/desktop-sites.svelte.js';
  import { groupWithout } from '../lib/desktop-sites.js';
  import { SITE_SUGGESTION_LIMIT_M, distanceInDepthUnit, suggestByDistance } from '../lib/site-suggestion.js';
  import { formatDateTime, formatDepth, formatMinutes, formatNumber, depthUnit, formatLongDate } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {{id: number, number: number, date: string, durationSeconds: number, suggestedSite: number, latUdeg?: number, lonUdeg?: number}} WithoutDive */

  /**
   * @type {{
   *   dives: WithoutDive[],
   *   sites: import('opendives-core').SiteSummary[],
   *   onnew: (dive: WithoutDive) => void,
   * }}
   */
  let { dives, sites, onnew } = $props();

  const placed = $derived(sites.filter((s) => s.hasLocation));
  const byId = $derived(new Map(logbook.dives.map((d) => [d.id, d])));
  const groups = $derived(groupWithout(dives, (id) => logbook.dives.find((d) => d.id === id)?.trip ?? undefined));
  const siteName = (/** @type {number} */ uuid) => sites.find((s) => s.uuid === uuid)?.name || t('sites.noName');

  /** A distance in the depth unit, whole: « 689 pi », « 210 m ». @param {number} metres */
  const distanceText = (metres) => {
    const unit = logbook.prefs.length === 'ft' ? 'ft' : 'm';
    return `${formatNumber(distanceInDepthUnit(metres, unit))} ${depthUnit(logbook.prefs)}`;
  };

  /** @param {WithoutDive} d */
  const positionOf = (d) => (d.latUdeg !== undefined && d.lonUdeg !== undefined ? { latUdeg: d.latUdeg, lonUdeg: d.lonUdeg } : null);

  /**
   * How many dives of the same trip are at the suggested site.
   * @param {number} diveId @param {number} uuid
   */
  function sameTrip(diveId, uuid) {
    const trip = byId.get(diveId)?.trip?.id;
    const name = siteName(uuid);
    return trip ? logbook.dives.filter((d) => d.trip?.id === trip && d.site === name).length : 0;
  }

  /** @param {WithoutDive} d */
  function suggestion(d) {
    const point = positionOf(d);
    if (point) {
      const near = suggestByDistance(point, placed);
      return { uuid: near?.site.uuid ?? 0, why: near ? t('sites.distanceSuggestion', { site: siteName(near.site.uuid), distance: distanceText(near.distanceM) }) : t('sites.noSiteNear', { limit: distanceText(SITE_SUGGESTION_LIMIT_M) }) };
    }
    if (d.suggestedSite) return { uuid: d.suggestedSite, why: t('sites.suggestionLine', { n: sameTrip(d.id, d.suggestedSite), site: siteName(d.suggestedSite) }) };
    return { uuid: 0, why: t('desktopSites.noPosition') };
  }

  /** @param {WithoutDive} d */
  function sub(d) {
    const listed = byId.get(d.id);
    return [formatMinutes(d.durationSeconds), listed?.maxDepthMm ? formatDepth(listed.maxDepthMm, logbook.prefs) : ''].filter(Boolean).join(' · ');
  }

  /** The chooser opened: for one dive, or for every dive of a trip. @type {{ ids: number[], position: {latUdeg: number, lonUdeg: number}|null, x: number, y: number }|null} */
  let choosing = $state(null);

  /** @param {MouseEvent} e @param {number[]} ids @param {WithoutDive} d */
  function openChooser(e, ids, d) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    choosing = { ids, position: positionOf(d), x: r.left, y: r.bottom + 4 };
  }

  /** @param {number[]} ids @param {number} uuid */
  async function assign(ids, uuid) {
    for (const id of ids) await setDiveSite(id, uuid);
  }

  /** A site named in the chooser, at the dive's position. @param {string} name */
  async function createHere(name) {
    const c = choosing;
    choosing = null;
    if (!c) return;
    try {
      const created = await siteChange({ action: 'create', value: name, lat: c.position?.latUdeg ?? 0, lon: c.position?.lonUdeg ?? 0 });
      const uuid = created.site?.uuid ?? 0;
      if (c.position) await fillPlace(uuid);
      await assign(c.ids, uuid);
    } catch (e) {
      console.error('Create a site', e);
      showSnackbar(t('edit.failed'));
    }
  }

  /** @param {{ id: number, location: string }|null} trip @param {import('opendives-core').Dive[]} all */
  function tripTitle(trip, all) {
    const dated = all.filter((d) => d.trip?.id === trip?.id);
    const start = dated.reduce((a, d) => (d.date < a ? d.date : a), dated[0]?.date ?? '');
    const title = trip?.location || (start ? t('trip.startingOn', { date: formatLongDate(start) }) : '');
    return `${title} · ${t('trip.dives', { n: dated.length })}`;
  }
</script>

<section class="od-without" aria-label={t('sites.withoutTitle')}>
  <h2 class="od-without--title">{t('sites.withoutTitle')}</h2>
  <p class="od-without--intro">{t('sites.withoutIntro', { n: dives.length })}</p>

  {#each groups as group (group.first.id)}
    {#if group.trip}<h3 class="od-without--trip">{tripTitle(group.trip, logbook.dives)}</h3>{/if}
    {@const d = group.first}
    {@const s = suggestion(d)}
    <article class="od-without--card">
      <div class="od-without--line">
        <span class="od-without--number od-value">{d.number || ''}</span>
        <span class="od-without--text">
          <span class="od-without--date od-value">{formatDateTime(d.date)}</span>
          <span class="od-without--sub od-value">{sub(d)}</span>
        </span>
        <span class="od-without--actions">
          {#if s.uuid}
            <button type="button" class="od-without--tonal" onclick={() => assign([d.id], s.uuid)}>{siteName(s.uuid)}</button>
          {/if}
          <button type="button" class="od-without--outlined" onclick={(e) => openChooser(e, [d.id], d)}>{t('desktopSites.chooseSite')}</button>
          <button type="button" class="od-without--plain" onclick={() => onnew(d)}>{t('sites.newSite')}</button>
        </span>
      </div>
      <p class="od-without--why">{s.why}</p>
    </article>
    {#if group.others.length}
      <p class="od-without--more">
        {t('desktopSites.otherTripDives', { n: group.others.length })} ·
        <button type="button" class="od-without--link" onclick={(e) => openChooser(e, [d.id, ...group.others.map((o) => o.id)], d)}>{t('desktopSites.assignAll')}</button>
      </p>
    {/if}
  {/each}
  {#if !dives.length}<p class="od-without--empty" role="status">{t('desktopSites.noneWithout')}</p>{/if}
</section>

{#if choosing}
  <DesktopSiteChooser
    {sites}
    position={choosing.position}
    x={choosing.x}
    y={choosing.y}
    onchoose={(site) => {
      const ids = choosing?.ids ?? [];
      choosing = null;
      assign(ids, site.uuid);
    }}
    oncreate={createHere}
    onclose={() => (choosing = null)}
  />
{/if}

<style>
  @layer od.components {
    .od-without {
      height: 100%;
      overflow: auto;
      padding: 4px 12px 24px 4px;
    }
    .od-without--title {
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
    }
    .od-without--intro {
      margin: 2px 0 12px;
      max-width: 640px;
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-without--trip {
      margin: 16px 4px 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-without--card {
      margin-bottom: 8px;
      padding: 10px 16px 10px 12px;
      border-radius: 16px;
      background: var(--od-surface);
    }
    .od-without--line {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .od-without--number {
      flex: none;
      min-width: 24px;
      text-align: center;
      font-size: 18px;
      color: var(--od-text-2);
    }
    .od-without--text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .od-without--date {
      font-size: 15px;
    }
    .od-without--sub {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-without--actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .od-without--tonal,
    .od-without--outlined,
    .od-without--plain {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 16px;
      border-radius: 20px;
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }
    .od-without--tonal {
      border: 0;
      background: var(--od-table-selected);
      color: var(--od-on-table-selected);
      font-weight: 600;
    }
    .od-without--outlined {
      border: 1px solid var(--od-outline);
      background: none;
      color: var(--od-text);
    }
    .od-without--plain {
      border: 0;
      background: none;
      color: var(--od-on-table-selected);
      font-weight: 600;
    }
    .od-without--tonal:hover,
    .od-without--outlined:hover,
    .od-without--plain:hover {
      filter: brightness(0.96);
    }
    .od-without--why {
      margin: 2px 0 0 48px;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-without--more {
      margin: 0 0 8px 48px;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-without--link {
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      font-weight: 600;
      color: var(--od-on-table-selected);
      cursor: pointer;
    }
    .od-without--empty {
      padding: 32px 0;
      color: var(--od-text-2);
    }
  }
</style>
