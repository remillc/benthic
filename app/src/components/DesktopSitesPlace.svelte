<script>
  // @ts-check
  // « Placer <site> » on the desktop (task 2026-11-24-395; mock-up bureau-sites-placer): a « Chercher un lieu »
  // field, the map with the crosshair to drag, the coordinates (Settings, « Coordonnées GPS ») with the country
  // and region found from the position, and « Enregistrer ». Escape goes back to the list of sites.
  import DesktopCleanupHeader from './DesktopCleanupHeader.svelte';
  import DesktopSitePosMap from './DesktopSitePosMap.svelte';
  import { formatCoordinates } from '../lib/sites.svelte.js';
  import { setSitePosition } from '../lib/site-place.js';
  import { fillPlace } from '../lib/desktop-sites.svelte.js';
  import { placeAt } from '../lib/place-lookup.js';
  import { searchPlaces } from '../lib/place-search.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { language, t } from '../lib/i18n.js';

  /**
   * @type {{
   *   site: import('benthic-core').SiteSummary,
   *   sites: import('benthic-core').SiteSummary[],
   *   onback: () => void,
   *   ondone: () => void,
   * }}
   */
  let { site, sites, onback, ondone } = $props();

  let position = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  let place = $state(/** @type {import('../lib/place-lookup.js').Place|null} */ (null));
  let saving = $state(false);
  let query = $state('');
  /** @type {import('../lib/place-search.js').FoundPlace[]|null} */
  let found = $state(null);
  let searchFailed = $state(false);
  let lookups = 0;

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

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      search();
    } else if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      onback();
    }
  }

  async function save() {
    if (!position || saving) return;
    saving = true;
    try {
      const steps = await setSitePosition(site.uuid, position, fillPlace);
      offerUndo(t('sites.done'), undefined, 6000, steps);
      ondone();
    } catch (e) {
      console.error('Place site', e);
      showSnackbar(t('edit.failed'));
      saving = false;
    }
  }

  const placeText = $derived(place ? [place.country, place.region].filter(Boolean).join(', ') : '');
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="bc-cleanup-place" data-bc-scroll aria-label={t('sites.placeTitle', { name: site.name || t('sites.noName') })} onkeydown={keydown}>
  <DesktopCleanupHeader title={t('sites.placeTitle', { name: site.name || t('sites.noName') })} {onback}>
    {#snippet action()}
      <button type="button" class="bc-cleanup-place--filled" disabled={!position || saving} onclick={save}>{t('edit.save')}</button>
    {/snippet}
  </DesktopCleanupHeader>

  <label class="bc-cleanup-place--search">
    <span class="bc-sr-only">{t('sites.searchPlace')}</span>
    <input type="search" placeholder={t('sites.searchPlace')} bind:value={query} />
  </label>
  {#if found}
    <ul class="bc-cleanup-place--results" aria-label={t('sites.searchPlace')}>
      {#each found as p (p.name + p.latUdeg)}
        <li>
          <button
            type="button"
            class="bc-cleanup-place--result"
            onclick={() => {
              found = null;
              setPosition({ latUdeg: p.latUdeg, lonUdeg: p.lonUdeg });
            }}>{p.name}</button
          >
        </li>
      {:else}
        <li class="bc-cleanup-place--none" role="status">{t('sites.searchPlaceNone')}</li>
      {/each}
    </ul>
  {:else if searchFailed}
    <p class="bc-cleanup-place--none" role="status">{t('sites.searchPlaceFailed')}</p>
  {/if}

  <div class="bc-cleanup-place--map">
    <DesktopSitePosMap {position} others={sites.filter((s) => s.hasLocation)} hint={t('sites.dragPin')} placeOnClick onmove={setPosition} />
  </div>

  <dl class="bc-cleanup-place--values">
    <div>
      <dt>{t('sites.coordinates')}</dt>
      <dd class="bc-value">{position ? formatCoordinates(position.latUdeg, position.lonUdeg) : '–'}</dd>
    </div>
    <div>
      <dt>{t('sites.country')}</dt>
      <dd>{placeText || '–'}</dd>
    </div>
  </dl>
</section>

<style>
  @layer bc.components {
    .bc-cleanup-place {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      padding: 4px 12px 24px 4px;
    }
    .bc-cleanup-place--search input {
      box-sizing: border-box;
      width: 100%;
      max-width: 560px;
      height: 40px;
      padding: 0 14px;
      border: 1px solid var(--bc-outline);
      border-radius: 20px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
    }
    .bc-cleanup-place--results {
      max-width: 560px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      border-radius: 12px;
      background: var(--bc-surface);
      overflow: hidden;
    }
    .bc-cleanup-place--result {
      display: block;
      width: 100%;
      min-height: 40px;
      padding: 8px 14px;
      border: 0;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, currentColor 6%, transparent);
      }
    }
    .bc-cleanup-place--none {
      margin: 6px 0 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-cleanup-place--map {
      max-width: 560px;
      margin-top: 12px;
    }
    .bc-cleanup-place--values {
      max-width: 560px;
      margin: 12px 0 0;
      padding: 4px 14px;
      border-radius: 16px;
      background: var(--bc-surface);
      & > div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 8px 0;
      }
      & dt {
        font-size: 14px;
        color: var(--bc-text-2);
      }
      & dd {
        margin: 0;
        font-size: 15px;
        text-align: right;
      }
    }
    .bc-cleanup-place--filled {
      width: auto;
      height: 36px;
      padding: 0 18px;
      border: 0;
      border-radius: 18px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }
  }
</style>
