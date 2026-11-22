<script>
  // @ts-check
  // « Nouveau site » on the desktop (task 2026-11-15-177, mock-up bureau-sites-nouveau): an
  // exception to automatic saving, a form that is valid once it has a name, with « Annuler » and
  // « Ajouter le site ». The position by a click on the map (the crosshair), by dragging, or typed;
  // country and region are filled from it (a value typed is kept) and complete as the diver types.
  // A site already within 100 m is offered instead of a duplicate.
  import { onMount } from 'svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from './Icon.svelte';
  import DesktopSiteField from './DesktopSiteField.svelte';
  import DesktopSitePosMap from './DesktopSitePosMap.svelte';
  import { formatCoordinates, parseCoordinates, siteChange } from '../lib/sites.svelte.js';
  import { deskSites, fillPlace } from '../lib/desktop-sites.svelte.js';
  import { completions, countValues, regionsOfCountry, worldCountries } from '../lib/desktop-sites.js';
  import { placeAt } from '../lib/place-lookup.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { language, t } from '../lib/i18n.js';

  /**
   * @type {{
   *   sites: import('benthic-core').SiteSummary[],
   *   at?: { latUdeg: number, lonUdeg: number }|null,
   *   oncreated: (site: { uuid: number, name: string }) => void,
   *   onuse: (site: import('benthic-core').SiteSummary) => void,
   *   oncancel: () => void,
   * }}
   * at: where the site starts (the position recorded with a dive without a site).
   * oncreated: the site was added; onuse: the diver chose the site that exists nearby.
   */
  let { sites, at = null, oncreated, onuse, oncancel } = $props();

  let name = $state('');
  let description = $state('');
  let notes = $state('');
  let country = $state('');
  let region = $state('');
  /** The values last filled from the position: shown as automatic, replaced by the next position. */
  let autoCountry = '';
  let autoRegion = '';
  let position = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  let preview = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  let coordsText = $state('');
  let nearby = $state(/** @type {import('benthic-core').SiteSummary|null} */ (null));
  let saving = $state(false);
  let lookups = 0;
  let positionLookup = Promise.resolve(true);
  /** @type {DesktopSiteField|undefined} */
  let nameField = $state();

  onMount(() => {
    nameField?.edit();
    if (at) setPosition(at);
  });

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  function setPosition(p) {
    const asked = ++lookups;
    position = p;
    preview = null;
    coordsText = formatCoordinates(p.latUdeg, p.lonUdeg);
    positionLookup = (async () => {
      try {
        const near = await BenthicCore.siteQuery({ kind: 'nearby', lat: p.latUdeg, lon: p.lonUdeg, a: 100 });
        if (asked !== lookups) return true;
        nearby = near ?? null;
        const found = await placeAt(p.latUdeg, p.lonUdeg, language);
        if (asked !== lookups || !found) return true;
        if (!country || country === autoCountry) country = autoCountry = found.country;
        if (!region || region === autoRegion) region = autoRegion = found.region;
        return true;
      } catch (e) {
        console.error('Site position lookup', e);
        showSnackbar(t('edit.failed'));
        return false;
      }
    })();
    return positionLookup;
  }

  /** @param {string} text */
  const coordsError = (text) => (text.trim() === '' || parseCoordinates(text) ? '' : t('sites.coordinatesInvalid'));

  /** @param {string} text */
  function typedCoordinates(text) {
    const p = parseCoordinates(text);
    if (p) setPosition(p);
    else if (!text.trim()) {
      ++lookups;
      positionLookup = Promise.resolve(true);
      position = null;
      preview = null;
      coordsText = '';
      nearby = null;
    }
  }

  const worldNames = $derived(worldCountries(language));
  const countryCounts = $derived(countValues(sites.map((s) => s.country), language));
  /** @param {string} text */
  const completeCountry = (text) => completions(text, countryCounts, worldNames);
  /** @param {string} text */
  const completeRegion = (text) => completions(text, regionsOfCountry(sites, deskSites.regions, country, language), []);
  /** @param {number} n */
  const siteCount = (n) => t('desktopSites.sitesInLogbook', { n });

  const valid = $derived(name.trim() !== '');

  async function add() {
    if (!valid || saving) return;
    saving = true;
    try {
      if (!(await positionLookup)) return;
      const lat = position?.latUdeg ?? 0;
      const lon = position?.lonUdeg ?? 0;
      const created = await siteChange({ action: 'create', value: name.trim(), lat, lon });
      const uuid = created.site?.uuid ?? 0;
      if (description) await siteChange({ action: 'edit', uuid, field: 'description', value: description });
      if (notes) await siteChange({ action: 'edit', uuid, field: 'notes', value: notes });
      // Country and region from the position, then what the diver typed where it differs.
      if (position) await fillPlace(uuid);
      const now = await BenthicCore.siteQuery({ kind: 'site', uuid });
      if (country.trim() !== now.country) await siteChange({ action: 'edit', uuid, field: 'country', value: country.trim() });
      if (region.trim() !== now.region.value) await siteChange({ action: 'edit', uuid, field: 'region', value: region.trim() });
      oncreated({ uuid, name: name.trim() });
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Add a site', code);
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    } finally {
      saving = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="bc-site-form" data-od-scroll aria-label={t('sites.newSite')} onkeydown={keydown}>
  <h2 class="bc-site-form--title">{t('sites.newSite')}</h2>
  <div class="bc-site-form--body">
    <div class="bc-site-form--left">
      <DesktopSitePosMap position={preview ?? position} others={sites.filter((s) => s.hasLocation)} hint={t('desktopSites.clickToPlace')} placeOnClick onmove={setPosition} />
      <p class="bc-site-form--explain">{t('desktopSites.placeExplain')}</p>
    </div>
    <div class="bc-site-form--right">
      <div class="bc-site-form--fields">
        <label for="od-new-name">{t('sites.name')}</label>
        <DesktopSiteField id="od-new-name" form bind:this={nameField} value={name} oninput={(v) => (name = v)} onkeep={(v) => (name = v)} />

        <label for="od-new-coords">{t('sites.coordinates')}</label>
        <DesktopSiteField id="od-new-coords" form value={coordsText} note={t('desktopSites.coordinatesExample')} error={coordsError} oninput={(text) => (preview = parseCoordinates(text))} onkeep={typedCoordinates} oncancel={() => (preview = null)} />

        <label for="od-new-country">{t('sites.country')}</label>
        <DesktopSiteField id="od-new-country" form value={country} note={country && country === autoCountry ? t('sites.fromPosition') : ''} complete={completeCountry} countText={siteCount} oninput={(v) => (country = v)} onkeep={(v) => (country = v)} />

        <label for="od-new-region">{t('sites.region')}</label>
        <DesktopSiteField id="od-new-region" form value={region} note={region && region === autoRegion ? t('sites.fromPosition') : ''} complete={completeRegion} countText={siteCount} oninput={(v) => (region = v)} onkeep={(v) => (region = v)} />

        <label for="od-new-description">{t('sites.description')}</label>
        <DesktopSiteField id="od-new-description" form multiline value={description} oninput={(v) => (description = v)} onkeep={(v) => (description = v)} />

        <label for="od-new-notes">{t('sites.notes')}</label>
        <DesktopSiteField id="od-new-notes" form multiline value={notes} oninput={(v) => (notes = v)} onkeep={(v) => (notes = v)} />
      </div>

      {#if nearby}
        <div class="bc-site-form--notice" role="status">
          <Icon name="warning" size={22} />
          <p>{t('sites.nearbyShort', { site: nearby.name || t('sites.noName') })}</p>
          <button type="button" class="bc-site-form--text" onclick={() => nearby && onuse(nearby)}>{t('sites.useNearby')}</button>
        </div>
      {/if}

      <div class="bc-site-form--actions">
        <button type="button" class="bc-site-form--text" onclick={oncancel}>{t('desktopSites.cancel')}</button>
        <button type="button" class="bc-site-form--filled" disabled={!valid || saving} onclick={add}>{t('desktopSites.addSite')}</button>
      </div>
    </div>
  </div>
</section>

<style>
  @layer od.components {
    .bc-site-form {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      container-type: inline-size;
      padding: 4px 12px 24px 4px;
    }
    .bc-site-form--title {
      margin: 0 0 12px;
      font-family: var(--bc-title-font);
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
    }
    .bc-site-form--body {
      display: grid;
      grid-template-columns: minmax(280px, 330px) minmax(300px, 1fr);
      gap: 20px;
      align-items: start;
    }
    @container (max-width: 639px) {
      .bc-site-form--body {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .bc-site-form--explain {
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-site-form--fields {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 8px 12px;
      align-items: start;
      & > label {
        padding-top: 10px;
        font-size: 15px;
        color: var(--bc-text-2);
      }
    }
    .bc-site-form--notice {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--bc-tertiary-container);
      color: var(--bc-on-tertiary-container);
      & p {
        flex: 1;
        margin: 0;
        font-size: 14px;
      }
    }
    .bc-site-form--actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }
    .bc-site-form--text {
      width: auto;
      height: 40px;
      padding: 0 12px;
      border: 0;
      border-radius: 20px;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-on-table-selected);
      cursor: pointer;
    }
    .bc-site-form--notice .bc-site-form--text {
      color: var(--bc-on-tertiary-container);
    }
    .bc-site-form--text:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .bc-site-form--filled {
      width: auto;
      height: 40px;
      padding: 0 24px;
      border: 0;
      border-radius: 20px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 15px;
      cursor: pointer;
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }
  }
</style>
