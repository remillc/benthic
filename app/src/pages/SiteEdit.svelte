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
  import { OpenDivesCore } from 'opendives-core';
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
  import { odplusAccount } from '../lib/benthic-plus-state.svelte.js';
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

  let original = $state(/** @type {import('opendives-core').SiteDetail|null} */ (null));
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
  let nearby = $state(/** @type {import('opendives-core').SiteSummary|null} */ (null));
  /** The closest site of the shared map, when the logbook has none close. */
  let commonNear = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite|null} */ (null));
  /** « Utiliser ce site »: the base site the new site is linked to when saved. */
  let useBase = $state(/** @type {string|null} */ (null));
  let saving = $state(false);
  let lookups = 0;

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
        setPosition(p).then(() => {
          // The found position, country and region are the opening values; what was typed meanwhile stays a change.
          if (!opened) return;
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
    const s = await OpenDivesCore.siteQuery({ kind: 'site', uuid: editing });
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
  async function setPosition(p) {
    const asked = ++lookups;
    position = p;
    coordsText = formatCoordinates(p.latUdeg, p.lonUdeg);
    coordsError = false;
    const near = await OpenDivesCore.siteQuery({ kind: 'nearby', lat: p.latUdeg, lon: p.lonUdeg, a: 100 });
    nearby = near && near.uuid !== editing ? near : null;
    if (!editing) suggestCommon(p, asked);
    // Country and region of the new position, unless the diver corrected them.
    const place = await placeAt(p.latUdeg, p.lonUdeg, language);
    // Only the answer for the latest position counts.
    if (asked !== lookups || !place) return;
    if (!country || country === autoCountry) country = autoCountry = place.country;
    if (!region || region === autoRegion) region = autoRegion = place.region;
  }

  /** A base site close to the new site's position (none when the logbook already has one close). @param {{latUdeg: number, lonUdeg: number}} p @param {number} asked */
  async function suggestCommon(p, asked) {
    if (nearby || !odplusAccount.signedIn || !connection.online) {
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
      position = null;
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
    saving = true;
    try {
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
      const now = await OpenDivesCore.siteQuery({ kind: 'site', uuid });
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

<Page class="od-site-edit">
  <Navbar title={editing ? t('sites.editTitle') : t('sites.newSite')}>
    {#snippet left()}
      {#if ios}
        <Link onClick={() => guard?.attempt()}>{t('dialog.cancel')}</Link>
      {:else}
        <Link iconOnly onClick={() => guard?.attempt()}><Icon name="close" /><span class="od-sr-only">{t('sites.close')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t(ios ? 'dialog.ok' : 'edit.save')}</Link>
    {/snippet}
  </Navbar>
  <LeaveGuard bind:this={guard} noun="site" {dirty} {save} leave={() => f7router.back()} />

  <TextField label={t('sites.name')} bind:value={name} />

  <!-- Full screen (SiteMap's button): the pin still moves, and the new position is kept. -->
  <div class="od-site-edit--map-card">
    <SiteMap pin={position} editable onmove={setPosition} ratio={2.1}>
      {#snippet overlay(/** @type {boolean} */ full)}
        <span class="chip od-site-edit--chip" class:od-site-edit--full={full}>{t('sites.movePin')}</span>
        {#if full && coordsText}<span class="od-site-edit--coords od-value">{coordsText}</span>{/if}
      {/snippet}
    </SiteMap>
  </div>

  {#if !editing && nearby}
    <div class="od-site-edit--nearby" role="note">
      <span>{t('sites.nearbyShort', { site: nearby.name || t('sites.noName') })}</span>
      <button type="button" class="od-text-button od-site-edit--use" onclick={useNearby}>{t('sites.useNearby')}</button>
    </div>
  {/if}

  {#if !editing && !nearby && commonNear && useBase !== commonNear.id}
    <div class="od-site-edit--common" role="note">
      <span>{t('sharedSites.suggest', { distance: distanceValue(commonNear.distanceM ?? 0, logbook.prefs), name: commonNear.name, dives: baseDivesText(commonNear) })}</span>
      <button type="button" class="od-text-button od-site-edit--use" onclick={useCommon}>{t('sites.useNearby')}</button>
    </div>
  {/if}
  <!-- Position: coordinates, then country and region found from them. -->
  <div class="od-form-surface">
    <TextField
      label={t('sites.coordinates')}
      bind:value={coordsText}
      onchange={typedCoordinates}
      invalid={coordsBad}
      supporting={coordsBad ? t('sites.coordinatesInvalid') : t('sites.coordinatesHint')}
    >
      {#snippet trailing()}
        <button type="button" class="od-icon-button" onclick={useDevicePosition}>
          <Icon name="locate" />
          <span class="od-sr-only">{t('sites.useDevicePosition')}</span>
        </button>
      {/snippet}
    </TextField>
    <TextField label={t('sites.country')} bind:value={country} supporting={country && country === autoCountry ? t('sites.fromPosition') : ''} />
    <TextField label={t('sites.region')} bind:value={region} supporting={region && region === autoRegion ? t('sites.fromPosition') : ''} />
    <p class="od-site-edit--explain">{t('sites.placeExplain')}</p>
  </div>

  <div class="od-form-surface">
    <TextField label={t('sites.description')} bind:value={description} multiline />
    <TextField label={t('sites.notes')} bind:value={notes} multiline />
  </div>

  {#if editing}
    <div class="od-form-surface od-site-edit--delete">
      <button type="button" class={ios ? 'od-site-edit--delete-ios' : 'od-outlined-button od-danger'} onclick={deleteSite}>{t('sites.deleteSite')}</button>
      <p class="od-site-edit--explain">{t('sites.deleteSiteHint')}</p>
    </div>
  {/if}
  <div class="od-site-edit--end"></div>
</Page>

<style>
  @layer od.components {
    .od-site-edit--map-card {
      position: relative;
      margin: 8px 16px 0;
      border-radius: 16px;
      overflow: hidden;

      /* The credits stay inside the rounded corners. */
      --od-map-credits-right: 12px;
      --od-map-credits-bottom: 8px;
    }

    .od-site-edit--chip {
      position: absolute;
      left: 12px;
      top: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--od-surface);
      font-size: 13px;
      color: var(--od-text-2);
      pointer-events: none;

      &.od-site-edit--full {
        top: calc(12px + var(--od-safe-top));
      }
    }

    .od-site-edit--coords {
      position: absolute;
      left: 50%;
      bottom: calc(40px + var(--od-safe-bottom));
      transform: translateX(-50%);
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--od-surface);
      font-size: 15px;
      white-space: nowrap;
    }

    .od-site-edit--explain {
      margin: 12px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* iPhone: a red row at the bottom of the form (ios-sites-modifier.dc.html). */
    .od-site-edit--delete-ios {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      border: none;
      border-radius: 10px;
      background: var(--od-surface);
      color: var(--od-alarm);
      font: inherit;
      font-size: 17px;
    }

    .od-site-edit--delete {
      padding: 16px 12px;

      .od-site-edit--explain {
        margin: 8px 4px 0;
      }
    }

    .od-site-edit--nearby {
      margin: 18px 16px 0;
      padding: 12px 16px 4px;
      border-radius: 12px;
      background: var(--od-surface-2);
      font-size: 14px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .od-site-edit--common {
      margin: 18px 16px 0;
      padding: 12px 16px 4px;
      border-radius: 12px;
      background: var(--od-shared-site-container);
      color: var(--od-on-shared-site-container);
      font-size: 14px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      & .od-text-button {
        color: var(--od-on-shared-site-container);
      }
    }

    .od-site-edit--use {
      align-self: flex-end;
    }

    .od-site-edit--end {
      height: 32px;
    }
  }
</style>
