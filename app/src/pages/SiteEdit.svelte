<script>
  // @ts-check
  // New or edited site (docs/mockups/sites-edition-android.dc.html): name;
  // position by moving the pin (the map can go full screen), by typing
  // coordinates or from the device; country and region looked up at each
  // change of position (OpenStreetMap, else the offline Natural Earth file),
  // a corrected value is never replaced; description and notes. A site
  // within 100 m is offered instead of a duplicate. With ?dive=<id>, the new
  // site is set on that dive (dives without a site). A new site next to a site of the shared map (Benthic+,
  // task 2026-11-19-315, point 6; sites-edition-commun-android.dc.html) gets the teal banner « La carte commune a déjà
  // un site à 160 pi » with « Utiliser ce site »: its name and position fill the form and the saved site is linked to it.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { logbook, saveDiveChanges } from '../lib/logbook.svelte.js';
  import { formatCoordinates, geocodeSite, parseCoordinates, siteChange } from '../lib/sites.svelte.js';
  import { placeAt } from '../lib/place-lookup.js';
  import { deliverSite } from '../lib/site-choice.js';
  import { language, t } from '../lib/i18n.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import LeaveGuard from '../components/LeaveGuard.svelte';
  import { benthicPlusAccount } from '../lib/benthic-plus-state.svelte.js';
  import { linkSite, loadLinks, sharedSites, withSession } from '../lib/shared-sites.svelte.js';
  import { SUGGEST_RADIUS_M, inYourSites } from '../lib/shared-sites.js';
  import { baseDivesText, distanceValue } from '../lib/shared-sites-format.js';
  import { connection } from '../lib/online.svelte.js';
  import { isDirty } from '../lib/leave-guard.js';

  /** @type {{ f7route: { params: { uuid?: string }, query: { dive?: string, lat?: string, lon?: string, choose?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const editing = f7route.params.uuid ? Number(f7route.params.uuid) : 0;
  const forDive = f7route.query?.dive ? Number(f7route.query.dive) : 0;
  /** Opened from « Choisir un site » (?choose=1): the site saved, or the one nearby used, is given back. */
  const forChoice = f7route.query?.choose === '1';
  /** ?lat=&lon= (micro-degrees): the position recorded with the dive, where « Nouveau site » creates the site (task 2026-11-14-148). */
  const givenPosition =
    f7route.query?.lat && f7route.query?.lon ? { latUdeg: Number(f7route.query.lat), lonUdeg: Number(f7route.query.lon) } : null;

  let original = $state(/** @type {import('benthic-core').SiteDetail|null} */ (null));
  let name = $state('');
  let description = $state('');
  let notes = $state('');
  let country = $state('');
  let region = $state('');
  /** The values last filled in from the position: shown as "automatic". */
  let autoCountry = $state('');
  let autoRegion = $state('');
  let position = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  let coordsText = $state('');
  let coordsError = $state(false);
  let nearby = $state(/** @type {import('benthic-core').SiteSummary|null} */ (null));
  /** The closest site of the shared map, when the logbook has none close. */
  let commonNear = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite|null} */ (null));
  /** « Utiliser ce site »: the base site the new site is linked to when saved. */
  let useBase = $state(/** @type {string|null} */ (null));
  let saving = $state(false);
  let lookups = 0;
  let positionLookup = Promise.resolve(true);

  // Leaving with changes asks first (components/LeaveGuard.svelte): the fields
  // against those at opening. A new site opens at once; one being edited, when it
  // is read. The position the device finds by itself is not a change.
  const values = () => ({ name, description, notes, country, region, place: position ? `${position.latUdeg},${position.lonUdeg}` : '' });
  let opened = $state(/** @type {ReturnType<typeof values>|null} */ (editing ? null : values()));
  const dirty = () => opened !== null && isDirty(opened, values());
  let guard = /** @type {LeaveGuard|undefined} */ (undefined);

  onMount(async () => {
    if (!editing) {
      /** @param {{latUdeg: number, lonUdeg: number}} p */
      const start = (p) =>
        setPosition(p).then((ok) => {
          // The found position, country and region are the opening values; what was typed meanwhile stays a change.
          if (!ok || !opened || position?.latUdeg !== p.latUdeg || position?.lonUdeg !== p.lonUdeg) return;
          const now = values();
          const auto = (/** @type {string} */ typed, /** @type {string} */ found) => (found && typed === found ? typed : null);
          opened = {
            ...opened,
            place: now.place,
            country: auto(country, autoCountry) ?? opened.country,
            region: auto(region, autoRegion) ?? opened.region,
          };
        });
      // At the dive's recorded position, when there is one.
      if (givenPosition) {
        start(givenPosition);
        return;
      }
      // A new site starts where the diver is (often on the boat or the
      // shore); without a position, the map stays as it is, silently.
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          if (position) return;
          start({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 },
      );
      return;
    }
    const s = await BenthicCore.siteQuery({ kind: 'site', uuid: editing });
    original = s;
    name = s.name;
    description = s.description;
    notes = s.notes;
    country = s.country;
    region = s.region.value;
    autoCountry = s.countryTaxonomy.manual ? '' : s.country;
    autoRegion = s.region.manual ? '' : s.region.value;
    if (s.hasLocation) {
      position = { latUdeg: s.latUdeg, lonUdeg: s.lonUdeg };
      coordsText = formatCoordinates(s.latUdeg, s.lonUdeg);
    }
    opened = values();
  });

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  function setPosition(p) {
    const asked = ++lookups;
    position = p;
    coordsText = formatCoordinates(p.latUdeg, p.lonUdeg);
    coordsError = false;
    positionLookup = (async () => {
      try {
        const near = await BenthicCore.siteQuery({ kind: 'nearby', lat: p.latUdeg, lon: p.lonUdeg, a: 100 });
        if (asked !== lookups) return true;
        nearby = near && near.uuid !== editing ? near : null;
        if (!editing) suggestCommon(p, asked);
        const place = await placeAt(p.latUdeg, p.lonUdeg, language);
        if (asked !== lookups || !place) return true;
        if (!country || country === autoCountry) country = autoCountry = place.country;
        if (!region || region === autoRegion) region = autoRegion = place.region;
        return true;
      } catch (e) {
        console.error('Site position lookup', e);
        showSnackbar(t('edit.failed'));
        return false;
      }
    })();
    return positionLookup;
  }

  /** A base site close to the new site's position (none when the logbook already has one close). @param {{latUdeg: number, lonUdeg: number}} p @param {number} asked */
  async function suggestCommon(p, asked) {
    if (nearby || !benthicPlusAccount.signedIn || !connection.online) {
      commonNear = null;
      return;
    }
    try {
      if (!sharedSites.linksLoaded) await loadLinks();
      const near = await withSession((api, token) => api.nearby(token, { lat: p.latUdeg / 1e6, lon: p.lonUdeg / 1e6, radiusM: SUGGEST_RADIUS_M, limit: 3 }));
      if (asked === lookups) commonNear = near.find((b) => !inYourSites(b.id, sharedSites.links)) ?? null;
    } catch {
      if (asked === lookups) commonNear = null;
    }
  }

  /** « Utiliser ce site »: the base site's name and position; the saved site is linked to it. */
  function useCommon() {
    const b = commonNear;
    if (!b) return;
    name = b.name;
    useBase = b.id;
    setPosition({ latUdeg: Math.round(b.lat * 1e6), lonUdeg: Math.round(b.lon * 1e6) });
  }

  // Coordinates that cannot be read are told as the diver types, after a pause (forms are
  // validated live); leaving the field then places the site (typedCoordinates).
  const coordsLive = liveError(() => coordsText, (text) => (parseCoordinates(text) ? '' : 'invalid'));
  const coordsBad = $derived(coordsError || !!coordsLive.error);

  function typedCoordinates() {
    if (!coordsText.trim()) {
      ++lookups;
      positionLookup = Promise.resolve(true);
      position = null;
      nearby = null;
      coordsError = false;
      return;
    }
    const p = parseCoordinates(coordsText);
    coordsError = !p;
    if (p) setPosition(p);
  }

  function useDevicePosition() {
    const failed = () => showSnackbar(t('sites.noDevicePosition'));
    if (!navigator.geolocation) return failed();
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      failed,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    if (saving) return;
    if (coordsText.trim() && !parseCoordinates(coordsText)) {
      coordsError = true;
      return;
    }
    saving = true;
    try {
      if (!(await positionLookup)) return;
      let uuid = editing;
      const lat = position?.latUdeg ?? 0;
      const lon = position?.lonUdeg ?? 0;
      let moved = false;
      if (!uuid) {
        const created = await siteChange({ action: 'create', value: name.trim(), lat, lon });
        uuid = created.site?.uuid ?? 0;
        moved = !!position;
        if (uuid && useBase) await linkSite(uuid, useBase);
      } else if (original) {
        if (name.trim() !== original.name) await siteChange({ action: 'edit', uuid, field: 'name', value: name.trim() });
        if (lat !== original.latUdeg || lon !== original.lonUdeg) {
          await siteChange({ action: 'edit', uuid, field: 'location', lat, lon });
          moved = !!position;
        }
      }
      if (description !== (original?.description ?? '')) await siteChange({ action: 'edit', uuid, field: 'description', value: description });
      if (notes !== (original?.notes ?? '')) await siteChange({ action: 'edit', uuid, field: 'notes', value: notes });
      // Country and region found from the position, then what the diver
      // typed where it differs (kept as a correction).
      if (moved) await geocodeSite(uuid);
      const now = await BenthicCore.siteQuery({ kind: 'site', uuid });
      if (country.trim() !== now.country) await siteChange({ action: 'edit', uuid, field: 'country', value: country.trim() });
      if (region.trim() !== now.region.value) await siteChange({ action: 'edit', uuid, field: 'region', value: region.trim() });
      if (forDive) {
        await saveDiveChanges(forDive, { site: uuid });
        // The site lists change once the dive has its site.
        logbook.sitesVersion++;
      }
      if (forChoice) deliverSite({ uuid, name: name.trim() });
      f7router.back();
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Save site', code);
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    } finally {
      saving = false;
    }
  }

  /**
   * Edit mode: delete the site after a confirmation (DeleteDiveSites). Its
   * dives stay in the logbook without a site; undoable. Back to the list,
   * as the site's own sheet is gone.
   */
  function deleteSite() {
    const n = original?.diveList.length ?? 0;
    confirmAction({
      title: t('sites.deleteSiteTitle'),
      text: n ? t('sites.deleteSiteText', { n }) : t('sites.deleteSiteTextUnused'),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'deleteSite', uuid: editing });
          f7router.back('/sites/', { force: true });
        } catch (e) {
          const code = String(/** @type {any} */ (e)?.message ?? '');
          console.error('Delete site', code);
          showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
        }
      },
    });
  }

  /** The existing site instead of a duplicate. */
  async function useNearby(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    if (!nearby) return;
    if (forChoice) {
      // The site nearby is the one chosen.
      deliverSite({ uuid: nearby.uuid, name: nearby.name });
      f7router.back();
    } else if (forDive) {
      await saveDiveChanges(forDive, { site: nearby.uuid });
      logbook.sitesVersion++;
      f7router.back();
    } else {
      f7router.navigate(`/sites/${nearby.uuid}`, { reloadCurrent: true });
    }
  }
</script>

<Page class="bc-site-edit">
  <Navbar title={editing ? t('sites.editTitle') : t('sites.newSite')}>
    {#snippet left()}
      {#if ios}
        <Link onClick={() => guard?.attempt()}>{t('dialog.cancel')}</Link>
      {:else}
        <Link iconOnly onClick={() => guard?.attempt()}><Icon name="close" /><span class="bc-sr-only">{t('sites.close')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t(ios ? 'dialog.ok' : 'edit.save')}</Link>
    {/snippet}
  </Navbar>
  <LeaveGuard bind:this={guard} noun="site" {dirty} {save} leave={() => f7router.back()} />

  <TextField label={t('sites.name')} bind:value={name} />

  <!-- Full screen (SiteMap's button): the pin still moves, and the new position is kept. -->
  <div class="bc-site-edit--map-card">
    <SiteMap pin={position} editable onmove={setPosition} ratio={2.1}>
      {#snippet overlay(/** @type {boolean} */ full)}
        <span class="chip bc-site-edit--chip" class:bc-site-edit--full={full}>{t('sites.movePin')}</span>
        {#if full && coordsText}<span class="bc-site-edit--coords bc-value">{coordsText}</span>{/if}
      {/snippet}
    </SiteMap>
  </div>

  {#if !editing && nearby}
    <div class="bc-site-edit--nearby" role="note">
      <span>{t('sites.nearbyShort', { site: nearby.name || t('sites.noName') })}</span>
      <button type="button" class="bc-text-button bc-site-edit--use" onclick={useNearby}>{t('sites.useNearby')}</button>
    </div>
  {/if}

  {#if !editing && !nearby && commonNear && useBase !== commonNear.id}
    <div class="bc-site-edit--common" role="note">
      <span>{t('sharedSites.suggest', { distance: distanceValue(commonNear.distanceM ?? 0, logbook.prefs), name: commonNear.name, dives: baseDivesText(commonNear) })}</span>
      <button type="button" class="bc-text-button bc-site-edit--use" onclick={useCommon}>{t('sites.useNearby')}</button>
    </div>
  {/if}
  <!-- Position: coordinates, then country and region found from them. -->
  <div class="bc-form-surface">
    <TextField
      label={t('sites.coordinates')}
      bind:value={coordsText}
      onchange={typedCoordinates}
      oninput={() => { ++lookups; }}
      invalid={coordsBad}
      supporting={coordsBad ? t('sites.coordinatesInvalid') : t('sites.coordinatesHint')}
    >
      {#snippet trailing()}
        <button type="button" class="bc-icon-button" onclick={useDevicePosition}>
          <Icon name="locate" />
          <span class="bc-sr-only">{t('sites.useDevicePosition')}</span>
        </button>
      {/snippet}
    </TextField>
    <TextField label={t('sites.country')} bind:value={country} supporting={country && country === autoCountry ? t('sites.fromPosition') : ''} />
    <TextField label={t('sites.region')} bind:value={region} supporting={region && region === autoRegion ? t('sites.fromPosition') : ''} />
    <p class="bc-site-edit--explain">{t('sites.placeExplain')}</p>
  </div>

  <div class="bc-form-surface">
    <TextField label={t('sites.description')} bind:value={description} multiline />
    <TextField label={t('sites.notes')} bind:value={notes} multiline />
  </div>

  {#if editing}
    <div class="bc-form-surface bc-site-edit--delete">
      <button type="button" class={ios ? 'bc-site-edit--delete-ios' : 'bc-outlined-button bc-danger'} onclick={deleteSite}>{t('sites.deleteSite')}</button>
      <p class="bc-site-edit--explain">{t('sites.deleteSiteHint')}</p>
    </div>
  {/if}
  <div class="bc-site-edit--end"></div>
</Page>

<style>
  @layer od.components {
    .bc-site-edit--map-card {
      position: relative;
      margin: 8px 16px 0;
      border-radius: 16px;
      overflow: hidden;

      /* The credits stay inside the rounded corners. */
      --bc-map-credits-right: 12px;
      --bc-map-credits-bottom: 8px;
    }

    .bc-site-edit--chip {
      position: absolute;
      left: 12px;
      top: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--bc-surface);
      font-size: 13px;
      color: var(--bc-text-2);
      pointer-events: none;

      &.bc-site-edit--full {
        top: calc(12px + var(--bc-safe-top));
      }
    }

    .bc-site-edit--coords {
      position: absolute;
      left: 50%;
      bottom: calc(40px + var(--bc-safe-bottom));
      transform: translateX(-50%);
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--bc-surface);
      font-size: 15px;
      white-space: nowrap;
    }

    .bc-site-edit--explain {
      margin: 12px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* iPhone: a red row at the bottom of the form (ios-sites-modifier.dc.html). */
    .bc-site-edit--delete-ios {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      border: none;
      border-radius: 10px;
      background: var(--bc-surface);
      color: var(--bc-alarm);
      font: inherit;
      font-size: 17px;
    }

    .bc-site-edit--delete {
      padding: 16px 12px;

      .bc-site-edit--explain {
        margin: 8px 4px 0;
      }
    }

    .bc-site-edit--nearby {
      margin: 18px 16px 0;
      padding: 12px 16px 4px;
      border-radius: 12px;
      background: var(--bc-surface-2);
      font-size: 14px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-site-edit--common {
      margin: 18px 16px 0;
      padding: 12px 16px 4px;
      border-radius: 12px;
      background: var(--bc-shared-site-container);
      color: var(--bc-on-shared-site-container);
      font-size: 14px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      & .bc-text-button {
        color: var(--bc-on-shared-site-container);
      }
    }

    .bc-site-edit--use {
      align-self: flex-end;
    }

    .bc-site-edit--end {
      height: 32px;
    }
  }
</style>
