<script>
  // @ts-check
  // « Placer <site> » (task 2026-11-24-395; mock-ups sites-placer-android, ios-sites-placer): opened by « Placer
  // sur la carte » of « Sites sans coordonnées ». A « Chercher un lieu » field, a map with a pin to drag, the
  // my-position button, and under the map the coordinates (Settings, « Coordonnées GPS ») with the country and
  // region found from the position. « Enregistrer » (iPhone « OK ») saves the position on the site.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { formatCoordinates } from '../lib/sites.svelte.js';
  import { setSitePosition } from '../lib/site-place.js';
  import { placeAt } from '../lib/place-lookup.js';
  import { searchPlaces } from '../lib/place-search.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { language, t } from '../lib/i18n.js';

  /** @type {{ f7route: any, f7router: any }} */
  let { f7route, f7router } = $props();
  const uuid = Number(f7route.params.uuid);

  let name = $state('');
  let position = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  let place = $state(/** @type {import('../lib/place-lookup.js').Place|null} */ (null));
  let saving = $state(false);
  let query = $state('');
  /** @type {import('../lib/place-search.js').FoundPlace[]|null} */
  let found = $state(null);
  let searchFailed = $state(false);
  let lookups = 0;

  onMount(async () => {
    try {
      const s = await BenthicCore.siteQuery({ kind: 'site', uuid });
      name = s.name;
      if (s.hasLocation) setPosition({ latUdeg: s.latUdeg, lonUdeg: s.lonUdeg });
    } catch (e) {
      console.error('Place site', e);
    }
  });

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  async function setPosition(p) {
    const asked = ++lookups;
    position = p;
    const there = await placeAt(p.latUdeg, p.lonUdeg, language).catch(() => null);
    if (asked === lookups) place = there;
  }

  async function search() {
    searchFailed = false;
    found = null;
    if (!query.trim()) return;
    const places = await searchPlaces(query, language);
    if (places === null) searchFailed = true;
    else found = places;
  }

  /** @param {import('../lib/place-search.js').FoundPlace} p */
  function choose(p) {
    found = null;
    setPosition({ latUdeg: p.latUdeg, lonUdeg: p.lonUdeg });
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
    if (!position || saving) return;
    saving = true;
    try {
      const steps = await setSitePosition(uuid, position);
      f7router.back();
      offerUndo(t('sites.done'), undefined, 6000, steps);
    } catch (e) {
      console.error('Place site', e);
      showSnackbar(t('edit.failed'));
      saving = false;
    }
  }

  const placeText = $derived(place ? [place.country, place.region].filter(Boolean).join(', ') : '');
</script>

<Page class="bc-site-place">
  <Navbar title={t('sites.placeTitle', { name: name || t('sites.noName') })}>
    {#snippet left()}
      {#if ios}
        <Link back>{t('dialog.cancel')}</Link>
      {:else}
        <Link back iconOnly><Icon name="close" /><span class="bc-sr-only">{t('sites.close')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving || !position ? 'disabled' : ''}>{t(ios ? 'dialog.ok' : 'edit.save')}</Link>
    {/snippet}
  </Navbar>

  <TextField label={t('sites.searchPlace')} bind:value={query} onchange={search}>
    {#snippet trailing()}
      <button type="button" class="bc-icon-button" onclick={search}>
        <Icon name="search" />
        <span class="bc-sr-only">{t('sites.searchPlace')}</span>
      </button>
    {/snippet}
  </TextField>
  {#if found}
    <ul class="bc-site-place--results" aria-label={t('sites.searchPlace')}>
      {#each found as p (p.name + p.latUdeg)}
        <li><button type="button" class="bc-site-place--result" onclick={() => choose(p)}>{p.name}</button></li>
      {:else}
        <li class="bc-site-place--none" role="status">{t('sites.searchPlaceNone')}</li>
      {/each}
    </ul>
  {:else if searchFailed}
    <p class="bc-site-place--none" role="status">{t('sites.searchPlaceFailed')}</p>
  {/if}

  <div class="bc-site-place--map-card">
    <SiteMap pin={position} editable onmove={setPosition} ratio={1.2} onlocate={useDevicePosition}>
      {#snippet overlay()}
        <span class="chip bc-site-place--chip">{t('sites.dragPin')}</span>
      {/snippet}
    </SiteMap>
    <button type="button" class="bc-site-place--locate bc-icon-button" onclick={useDevicePosition}>
      <Icon name="locate" />
      <span class="bc-sr-only">{t('sites.useDevicePosition')}</span>
    </button>
  </div>

  <dl class="bc-site-place--values">
    <div class="bc-site-place--value">
      <dt>{t('sites.coordinates')}</dt>
      <dd class="bc-value">{position ? formatCoordinates(position.latUdeg, position.lonUdeg) : '–'}</dd>
    </div>
    <div class="bc-site-place--value">
      <dt>{t('sites.country')}</dt>
      <dd>{placeText || '–'}</dd>
    </div>
  </dl>
</Page>

<style>
  @layer bc.components {
    .bc-site-place--map-card {
      position: relative;
      margin: 8px 16px 0;
      border-radius: 16px;
      overflow: hidden;
      --bc-map-credits-right: 12px;
      --bc-map-credits-bottom: 8px;
    }

    .bc-site-place--locate {
      position: absolute;
      right: 8px;
      bottom: 28px;
      background: var(--bc-surface);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
    }

    .bc-site-place--chip {
      position: absolute;
      left: 12px;
      top: 12px;
    }

    .bc-site-place--results {
      margin: 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 12px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-site-place--result {
      display: block;
      width: 100%;
      min-height: 48px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      text-align: left;
      cursor: pointer;
    }

    .bc-site-place--none {
      margin: 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-site-place--values {
      margin: 12px 16px;
      padding: 0 16px;
      border-radius: 16px;
      background: var(--bc-surface);
    }

    .bc-site-place--value {
      min-height: 48px;
      padding: 8px 0;
      box-sizing: border-box;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;

      & + & {
        border-top: 1px solid var(--bc-separator);
      }

      dt {
        color: var(--bc-text-2);
        font-size: 14px;
      }

      dd {
        margin: 0;
        font-size: 16px;
        text-align: right;
      }
    }
  }
</style>
