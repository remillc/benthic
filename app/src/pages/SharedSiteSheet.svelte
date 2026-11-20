<script>
  // @ts-check
  // The card of a site of the shared map (docs/mockups/sites-commun-fiche-android.dc.html; task 2026-11-19-315, point 3):
  // name, country and region, the chip « Carte commune · 214 plongées », the map (2.1 : 1, task 314), the coordinates,
  // « Ce que disent les carnets » (water type, the depth most often noted, dives of the last 12 months), « Ajouter à mes
  // sites » (the diver's own copy, linked to the base site) and « Signaler » (lib/shared-sites.svelte.js). A merged id
  // answers the surviving site: the stored links follow it. No diver's name anywhere.
  import { Page, Navbar, f7 } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import Icon from '../components/Icon.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import SharedSiteReport from '../components/SharedSiteReport.svelte';
  import { t } from '../lib/i18n.js';
  import { depthUnit, depthValue, formatDepth } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatCoordinates } from '../lib/sites.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { connection } from '../lib/online.svelte.js';
  import { openOdPlus } from '../lib/open-offer.svelte.js';
  import { addBaseSite, followRedirect, loadLinks, sharedSites, withSession } from '../lib/shared-sites.svelte.js';
  import { localSiteOf } from '../lib/shared-sites.js';
  import { baseCardLine, baseDivesText } from '../lib/shared-sites-format.js';
  import { OpenDivesCore } from 'opendives-core';

  /** @type {{ f7route?: { params: { id: string } } }} */
  let { f7route } = $props();
  const askedId = $derived(decodeURIComponent(f7route?.params.id ?? ''));

  let site = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite|null} */ (null));
  /** @type {'loading'|'ready'|'gone'|'offer'|'failed'} */
  let status = $state('loading');
  let adding = $state(false);
  let reporting = $state(false);

  const mine = $derived(site ? localSiteOf(site.id, sharedSites.links) : null);
  const NBSP = ' ';

  async function load() {
    status = 'loading';
    try {
      if (!sharedSites.linksLoaded) await loadLinks();
      const s = await withSession((api, token) => api.card(token, askedId));
      if (s.redirectedFrom) await followRedirect(s.redirectedFrom, s.id);
      site = s;
      status = 'ready';
    } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      status = code === 'SITE_GONE' ? 'gone' : code === 'SUBSCRIPTION_REQUIRED' ? 'offer' : 'failed';
    }
  }

  $effect(() => {
    askedId;
    load();
  });

  /** « 60 à 100 pi », or one depth when the logbooks agree. */
  const depthText = $derived.by(() => {
    const c = site?.carnets;
    if (!c) return '';
    const prefs = logbook.prefs;
    if (c.depthRangeMm && c.depthRangeMm[0] !== c.depthRangeMm[1]) {
      return t('sharedSites.card.depthRange', { from: depthValue(c.depthRangeMm[0], prefs), to: `${depthValue(c.depthRangeMm[1], prefs)}${NBSP}${depthUnit(prefs)}` });
    }
    const mm = c.depthMm ?? c.depthRangeMm?.[0] ?? null;
    return mm ? formatDepth(mm, prefs) : '';
  });

  const recentText = $derived.by(() => {
    const c = site?.carnets;
    if (!c) return '';
    return c.fewDivesLast12Months || c.divesLast12Months === null ? t('sharedSites.fewDives') : String(c.divesLast12Months);
  });

  async function add() {
    if (!site || adding) return;
    adding = true;
    try {
      const uuid = await addBaseSite(site.id);
      showSnackbar(t('sharedSites.card.added'), { action: t('sharedSites.card.open'), timeout: 5000, onAction: () => f7.views.current?.router.navigate(`/sites/${uuid}`) });
    } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      showSnackbar(t(code === 'SITE_GONE' ? 'sharedSites.card.gone' : 'sharedSites.card.addFailed'));
    } finally {
      adding = false;
    }
  }

  /** @param {{ reason: import('../lib/shared-sites.js').ReportReason, details: string }} r */
  async function sendReport({ reason, details }) {
    if (!site) return;
    const id = site.id;
    /** @type {{ lat: number, lon: number }|undefined} */
    let position;
    if (reason === 'wrong_position' && mine !== null) {
      try {
        const own = await OpenDivesCore.siteQuery({ kind: 'site', uuid: mine });
        if (own?.hasLocation) position = { lat: own.latUdeg / 1e6, lon: own.lonUdeg / 1e6 };
      } catch {
        // Sent without a position.
      }
    }
    try {
      await withSession((api, token) => api.report(token, id, { reason, details, position }));
      reporting = false;
      showSnackbar(t('sharedSites.report.sent'));
    } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      showSnackbar(t(code === 'TOO_MANY_REPORTS' ? 'sharedSites.report.tooMany' : 'sharedSites.report.failed'));
    }
  }
</script>

<Page class="od-shared-site">
  <Navbar>
    {#snippet left()}
      <BackLink label={t('sites.title')} name={t('common.back')} />
    {/snippet}
  </Navbar>

  {#if status === 'ready' && site}
    <header class="od-shared-site--head">
      <h1>{site.name}</h1>
      {#if site.country || site.region}<p class="od-shared-site--sub">{[site.country, site.region].filter(Boolean).join(' · ')}</p>{/if}
      <p class="od-shared-site--chips">
        <span class="od-shared-site--chip"><Icon name="globe" size={16} weight={2} />{t('sharedSites.card.chip', { dives: baseDivesText(site) })}</span>
        {#if site.closed}<span class="od-shared-site--chip od-shared-site--closed"><Icon name="warning" size={16} weight={2} />{t('sharedSites.card.closed')}</span>{/if}
      </p>
    </header>

    <!-- Inside the margins, 16 dp corners, aspect ratio 2.1 : 1 (task 2026-11-19-314); the site as a teal dot. -->
    <div class="od-shared-site--map">
      <SiteMap
        ratio={2.1}
        frame={[[site.lon, site.lat]]}
        base={{ sites: [{ id: site.id, name: site.name, lat: site.lat, lon: site.lon, mine: false, label: `${site.name}, ${baseCardLine(site)}` }], clusters: [] }}
        label={t('sharedSites.card.mapLabel', { name: site.name })}
      />
    </div>
    <p class="od-shared-site--coords od-value">{formatCoordinates(Math.round(site.lat * 1e6), Math.round(site.lon * 1e6))}</p>

    {#if site.carnets}
      <h2 class="od-shared-site--title">{t('sharedSites.card.logbooksSay')}</h2>
      <ul class="od-shared-site--surface">
        {#if site.carnets.waterType}
          <li class="od-shared-site--row"><span class="od-shared-site--label">{t('tools.waterType')}</span><span>{t(`tools.waterTypes.${site.carnets.waterType}`)}</span></li>
        {/if}
        {#if depthText}
          <li class="od-shared-site--row"><span class="od-shared-site--label">{t('sharedSites.card.usualDepth')}</span><span class="od-value">{depthText}</span></li>
        {/if}
        <li class="od-shared-site--row"><span class="od-shared-site--label">{t('sharedSites.card.recentDives')}</span><span class="od-value">{recentText}</span></li>
      </ul>
    {/if}
    <p class="od-shared-site--note">{t('sharedSites.card.note')}</p>

    <div class="od-shared-site--actions">
      {#if mine !== null}
        <a class="od-shared-site--add" href="/sites/{mine}"><Icon name="check" size={20} weight={2} />{t('sharedSites.card.inYourSites')}</a>
      {:else}
        <button type="button" class="od-shared-site--add" disabled={adding || !connection.online} onclick={add}><Icon name="plus" size={20} weight={2} />{t('sharedSites.card.add')}</button>
      {/if}
      <button type="button" class="od-shared-site--report" disabled={!connection.online} onclick={() => (reporting = true)}><Icon name="warning" size={20} />{t('sharedSites.card.report')}</button>
    </div>
  {:else if status === 'gone'}
    <p class="od-shared-site--message">{t('sharedSites.card.gone')}</p>
  {:else if status === 'offer'}
    <div class="od-shared-site--message">
      <p>{t('sharedSites.offerText')}</p>
      <button type="button" class="od-tonal-button" onclick={() => openOdPlus('offer')}>{t('sharedSites.offerButton')}</button>
    </div>
  {:else if status === 'failed'}
    <div class="od-shared-site--message">
      <p>{t(connection.online ? 'sharedSites.failed' : 'sharedSites.offline')}</p>
      <button type="button" class="od-tonal-button" onclick={load}>{t('sharedSites.retry')}</button>
    </div>
  {/if}
</Page>

{#if reporting && site}
  <SharedSiteReport name={site.name} onsend={sendReport} oncancel={() => (reporting = false)} />
{/if}

<style>
  @layer od.components {
    .od-shared-site--head {
      padding: 0 24px;
      & h1 {
        margin: 0;
        font-size: 32px;
        line-height: 40px;
        font-weight: 600;
      }
    }
    .od-shared-site--sub {
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--od-text-2);
    }
    .od-shared-site--chips {
      margin: 10px 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .od-shared-site--chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 12px;
      border-radius: 14px;
      background: var(--od-shared-site-container);
      color: var(--od-on-shared-site-container);
      font-size: 13px;
      font-weight: 600;
    }
    .od-shared-site--closed {
      background: var(--od-tint);
      color: var(--od-text);
    }
    .od-shared-site--map {
      margin: 16px 16px 0;
      border-radius: 20px;
      overflow: hidden;
      --od-map-credits-right: 12px;
      --od-map-credits-bottom: 8px;
    }
    .od-shared-site--coords {
      margin: 8px 24px 0;
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-shared-site--title {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }
    .od-shared-site--surface {
      margin: 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
      & li + li {
        border-top: 1px solid var(--od-separator);
      }
    }
    .od-shared-site--row {
      min-height: 56px;
      padding: 8px 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      font-size: 16px;
    }
    .od-shared-site--label {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-shared-site--note {
      margin: 12px 24px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-shared-site--actions {
      margin: 20px 16px 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .od-shared-site--add,
    .od-shared-site--report {
      height: 48px;
      padding: 0 20px;
      box-sizing: border-box;
      border-radius: 24px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font: inherit;
      font-size: 15px;
      text-decoration: none;
      cursor: pointer;
      &:disabled {
        opacity: 0.5;
      }
    }
    .od-shared-site--add {
      border: none;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font-weight: 600;
    }
    .od-shared-site--report {
      border: 1px solid var(--od-outline);
      background: none;
      color: var(--od-text);
      font-weight: 500;
    }
    .od-shared-site--message {
      margin: 24px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      color: var(--od-text-2);
      & p {
        margin: 0;
      }
    }
    :global(.ios) .od-shared-site--surface {
      border-radius: 10px;
    }
    :global(.ios) .od-shared-site--title {
      font-weight: 400;
      font-size: 13px;
      text-transform: uppercase;
    }
  }
</style>
