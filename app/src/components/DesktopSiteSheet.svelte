<script>
  // @ts-check
  // The desktop site sheet (task 2026-11-15-177, mock-ups bureau-sites-fiche, -modifier,
  // -modifier-pays): the name and the place, « Voir les plongées » and a ⋮ menu; on the left a
  // small map with the position as a crosshair, the figures and the dives at the site; on the
  // right the fields, edited in place and saved at once (task 172): Nom, Coordonnées, Pays,
  // Région, Description, Notes. When the position changes (the crosshair, the map, typed
  // coordinates), country and region are filled again from it; what the diver corrected is kept.
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import DesktopSiteField from './DesktopSiteField.svelte';
  import DesktopSitePosMap from './DesktopSitePosMap.svelte';
  import DesktopContextMenu from './DesktopContextMenu.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { diveLines, formatCoordinates, parseCoordinates, siteChange } from '../lib/sites.svelte.js';
  import { deskSites, fillPlace, openDiveInCarnet, showSiteDives } from '../lib/desktop-sites.svelte.js';
  import { completions, countValues, regionsOfCountry, worldCountries } from '../lib/desktop-sites.js';
  import { formatDepth, formatDateTime, formatDate, formatMinutes } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { language, t } from '../lib/i18n.js';

  /**
   * @type {{
   *   uuid: number,
   *   sites: import('opendives-core').SiteSummary[],
   *   ondeleted: () => void,
   * }}
   * sites: every site of the logbook (the nearby ones on the map, the countries to complete).
   */
  let { uuid, sites, ondeleted } = $props();

  let site = $state(/** @type {import('opendives-core').SiteDetail|null} */ (null));
  /** Second line of each dive, by dive id. */
  let lines = $state(/** @type {Record<number, string>} */ ({}));
  /** The position proposed by the crosshair or the map, not kept yet. */
  let pending = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  /** Country and region are being filled from the new position. */
  let updating = $state(false);
  /** Country and region were just filled from the position: the note says so. */
  let updated = $state(false);
  /** @type {DesktopSiteField|undefined} */
  let coordsField = $state();

  async function load() {
    try {
      const s = await OpenDivesCore.siteQuery({ kind: 'site', uuid });
      site = s?.uuid ? s : null;
      if (s?.diveList) diveLines(s.diveList, (l) => (lines = l), ' · ');
    } catch (e) {
      console.error('Site sheet', e);
    }
  }

  $effect(() => {
    logbook.sitesVersion;
    uuid;
    load();
  });

  // Another site: nothing of the previous one stays.
  $effect(() => {
    uuid;
    pending = null;
    updating = false;
    updated = false;
  });

  /** @param {unknown} e */
  function failed(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Site change', code);
    showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
  }

  /** @param {string} field @param {string} value */
  async function edit(field, value) {
    try {
      await siteChange({ action: 'edit', uuid, field, value });
      if (field === 'country' || field === 'region') updated = false;
    } catch (e) {
      failed(e);
    }
  }

  const coordsText = $derived(site?.hasLocation ? formatCoordinates(site.latUdeg, site.lonUdeg) : '');
  /** Where the crosshair is: the proposal, else the site. */
  const position = $derived(pending ?? (site?.hasLocation ? { latUdeg: site.latUdeg, lonUdeg: site.lonUdeg } : null));
  const saved = $derived(site?.hasLocation ? { latUdeg: site.latUdeg, lonUdeg: site.lonUdeg } : null);

  /** The crosshair or the map moved: the coordinates field shows the new position, to keep. @param {{latUdeg: number, lonUdeg: number}} p */
  function moved(p) {
    pending = p;
    coordsField?.propose(formatCoordinates(p.latUdeg, p.lonUdeg));
  }

  /** Coordinates typed: the crosshair follows once they read. @param {string} text */
  function typedCoordinates(text) {
    const p = parseCoordinates(text);
    if (p) pending = p;
  }

  /** @param {string} text */
  const coordsError = (text) => (text.trim() === '' || parseCoordinates(text) ? '' : t('sites.coordinatesInvalid'));

  /** Keeps the position, then refills country and region from it. @param {string} text */
  async function keepCoordinates(text) {
    // The crosshair's own position is exact; the text shows four decimals.
    const p = pending && formatCoordinates(pending.latUdeg, pending.lonUdeg) === text ? pending : parseCoordinates(text);
    if (!p) {
      pending = null;
      return;
    }
    pending = p;
    updating = true;
    try {
      await siteChange({ action: 'edit', uuid, field: 'location', lat: p.latUdeg, lon: p.lonUdeg });
      // The crosshair stays where it is until the site has its new position.
      await load();
      pending = null;
      updated = await fillPlace(uuid);
    } catch (e) {
      pending = null;
      failed(e);
    } finally {
      updating = false;
    }
  }

  function cancelCoordinates() {
    pending = null;
  }

  // --- Completions of Country and Region. ---
  const worldNames = $derived(worldCountries(language));
  const countryCounts = $derived(countValues(sites.map((s) => s.country), language));
  /** @param {string} text */
  const completeCountry = (text) => completions(text, countryCounts, worldNames);
  /** @param {string} text */
  const completeRegion = (text) => completions(text, regionsOfCountry(sites, deskSites.regions, site?.country ?? '', language), []);
  /** @param {number} n */
  const siteCount = (n) => t('desktopSites.sitesInLogbook', { n });

  const place = $derived(site ? [site.country, site.region.value].filter(Boolean).join(' · ') : '');
  const latestFirst = $derived(site ? [...site.diveList].sort((a, b) => b.date.localeCompare(a.date)) : []);
  const byId = $derived(new Map(logbook.dives.map((d) => [d.id, d])));
  const nearby = $derived(sites.filter((s) => s.uuid !== uuid && s.hasLocation));

  // --- The ⋮ menu: delete. ---
  /** @type {{x: number, y: number}|null} */
  let menuAt = $state(null);
  /** @param {MouseEvent} e */
  function openMenu(e) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    menuAt = { x: r.right - 280, y: r.bottom + 4 };
  }
  const menuEntries = $derived(/** @type {import('../lib/desktop-table.js').MenuEntry[]} */ ([{ key: 'delete', label: '', text: t('sites.deleteSite'), icon: 'delete', danger: true }]));

  function deleteSite() {
    const n = site?.diveList.length ?? 0;
    confirmAction({
      title: t('sites.deleteSiteTitle'),
      text: n ? t('sites.deleteSiteText', { n }) : t('sites.deleteSiteTextUnused'),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'deleteSite', uuid });
          ondeleted();
          offerUndo(t('desktopSites.deleted'));
        } catch (e) {
          failed(e);
        }
      },
    });
  }

  /** The first editable field takes the focus (Ctrl/⌘+E). */
  export function focusFirst() {
    nameField?.edit();
  }
  /** @type {DesktopSiteField|undefined} */
  let nameField = $state();
</script>

{#if site}
  <section class="bc-site-sheet-desk" data-od-scroll aria-label={site.name || t('sites.noName')}>
    <header class="bc-site-sheet-desk--head">
      <div class="bc-site-sheet-desk--titles">
        <h2 class="bc-site-sheet-desk--title">{site.name || t('sites.noName')}</h2>
        {#if place}<p class="bc-site-sheet-desk--place">{place}</p>{/if}
      </div>
      <button type="button" class="bc-site-sheet-desk--outlined" onclick={() => showSiteDives(site?.name ?? '')}>{t('desktopSites.seeDives')}</button>
      <button type="button" class="bc-site-sheet-desk--icon" aria-label={t('sites.actions')} title={t('sites.actions')} aria-haspopup="menu" onclick={openMenu}><Icon name="more" size={22} /></button>
    </header>

    <div class="bc-site-sheet-desk--body">
      <div class="bc-site-sheet-desk--left">
        <DesktopSitePosMap {position} previous={pending ? saved : null} others={nearby} hint={pending ? t('desktopSites.moveHint') : ''} onmove={moved} />

        <dl class="bc-site-sheet-desk--figures">
          <div><dt>{t('desktopSites.column.dives')}</dt><dd class="bc-value">{site.dives}</dd></div>
          <div><dt>{t('desktopSites.deepest')}</dt><dd class="bc-value">{site.maxDepthMm ? formatDepth(site.maxDepthMm, logbook.prefs) : '—'}</dd></div>
          <div><dt>{t('desktopSites.column.last')}</dt><dd class="bc-value">{site.lastDate ? formatDate(site.lastDate) : '—'}</dd></div>
        </dl>

        {#if latestFirst.length}
          <h3 class="bc-site-sheet-desk--subtitle">{t('sites.divesHere')}</h3>
          <ul class="bc-site-sheet-desk--dives">
            {#each latestFirst as dive (dive.id)}
              {@const listed = byId.get(dive.id)}
              <li>
                <button type="button" class="bc-site-sheet-desk--dive" onclick={() => openDiveInCarnet(dive.id)}>
                  <span class="bc-site-sheet-desk--number bc-value">{dive.number || ''}</span>
                  <span class="bc-site-sheet-desk--dive-text">
                    <span class="bc-value">{formatDateTime(dive.date)}</span>
                    <span class="bc-site-sheet-desk--dive-sub bc-value">{[lines[dive.id] ?? formatMinutes(dive.durationSeconds), listed?.maxDepthMm ? formatDepth(listed.maxDepthMm, logbook.prefs) : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="bc-site-sheet-desk--right">
        <div class="bc-site-sheet-desk--fields">
          <label for="od-site-name">{t('sites.name')}</label>
          <DesktopSiteField id="od-site-name" bind:this={nameField} value={site.name} placeholder={t('desktopSites.addName')} onkeep={(v) => edit('name', v.trim())} />

          <label for="od-site-coords">{t('sites.coordinates')}</label>
          <DesktopSiteField
            id="od-site-coords"
            bind:this={coordsField}
            value={coordsText}
            placeholder={t('desktopSites.addCoordinates')}
            hint={t('desktopSites.orMoveMap')}
            error={coordsError}
            oninput={typedCoordinates}
            onkeep={keepCoordinates}
            oncancel={cancelCoordinates}
          />

          <label for="od-site-country">{t('sites.country')}</label>
          <DesktopSiteField
            id="od-site-country"
            value={site.country}
            placeholder={t('desktopSites.addCountry')}
            {updating}
            note={updating || updated ? t('desktopSites.updatedFromPosition') : site.hasLocation && !site.countryTaxonomy.manual && site.country ? t('sites.fromPosition') : ''}
            complete={completeCountry}
            countText={siteCount}
            onkeep={(v) => edit('country', v.trim())}
          />

          <label for="od-site-region">{t('sites.region')}</label>
          <DesktopSiteField
            id="od-site-region"
            value={site.region.value}
            placeholder={t('desktopSites.addRegion')}
            {updating}
            note={updating || updated ? t('desktopSites.updatedFromPosition') : site.hasLocation && !site.region.manual && site.region.value ? t('sites.fromPosition') : ''}
            complete={completeRegion}
            countText={siteCount}
            onkeep={(v) => edit('region', v.trim())}
          />

          <label for="od-site-description">{t('sites.description')}</label>
          <DesktopSiteField id="od-site-description" multiline value={site.description} placeholder={t('desktopSites.addDescription')} onkeep={(v) => edit('description', v)} />

          <label for="od-site-notes">{t('sites.notes')}</label>
          <DesktopSiteField id="od-site-notes" multiline value={site.notes} placeholder={t('desktopSites.addNotes')} onkeep={(v) => edit('notes', v)} />
        </div>
        <p class="bc-site-sheet-desk--saved"><Icon name="info" size={16} />{t('desktopSites.savedAtOnce')}</p>
      </div>
    </div>
  </section>
  {#if menuAt}
    <DesktopContextMenu x={menuAt.x} y={menuAt.y} heading="" entries={menuEntries} onchoose={deleteSite} onclose={() => (menuAt = null)} />
  {/if}
{/if}

<style>
  @layer od.components {
    .bc-site-sheet-desk {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      /* Fluid layout: the sheet lays out by its own width (@container below). */
      container-type: inline-size;
      padding: 0 12px 24px 4px;
    }
    .bc-site-sheet-desk--head {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 4px 0 12px;
    }
    .bc-site-sheet-desk--titles {
      flex: 1;
      min-width: 0;
    }
    .bc-site-sheet-desk--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-site-sheet-desk--place {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-site-sheet-desk--outlined {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: 1px solid var(--bc-outline);
      border-radius: 20px;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--bc-text);
      cursor: pointer;
    }
    .bc-site-sheet-desk--outlined:hover {
      background: color-mix(in srgb, var(--bc-text) 6%, transparent);
    }
    .bc-site-sheet-desk--icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
    }
    .bc-site-sheet-desk--icon:hover {
      background: color-mix(in srgb, var(--bc-text) 8%, transparent);
    }
    .bc-site-sheet-desk--body {
      display: grid;
      grid-template-columns: minmax(280px, 330px) minmax(300px, 1fr);
      gap: 20px;
      align-items: start;
    }
    @container (max-width: 639px) {
      .bc-site-sheet-desk--body {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .bc-site-sheet-desk--figures {
      display: flex;
      gap: 28px;
      margin: 12px 0 0;
    }
    .bc-site-sheet-desk--figures dt {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-site-sheet-desk--figures dd {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }
    .bc-site-sheet-desk--subtitle {
      margin: 16px 0 8px;
      font-size: 14px;
      font-weight: 600;
    }
    .bc-site-sheet-desk--dives {
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      overflow: hidden;
      background: var(--bc-surface);
    }
    .bc-site-sheet-desk--dive {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 8px 12px;
      border: 0;
      background: none;
      font: inherit;
      color: var(--bc-text);
      text-align: start;
      cursor: pointer;
    }
    .bc-site-sheet-desk--dive:hover {
      background: color-mix(in srgb, var(--bc-text) 5%, transparent);
    }
    .bc-site-sheet-desk--number {
      flex: none;
      min-width: 24px;
      text-align: end;
      font-size: 18px;
      color: var(--bc-text-2);
    }
    .bc-site-sheet-desk--dive-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      font-size: 15px;
    }
    .bc-site-sheet-desk--dive-sub {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-site-sheet-desk--fields {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 8px 12px;
      align-items: start;
    }
    .bc-site-sheet-desk--fields > label {
      padding-top: 10px;
      font-size: 15px;
      color: var(--bc-text-2);
    }
    .bc-site-sheet-desk--saved {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 0 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }
  }
</style>
