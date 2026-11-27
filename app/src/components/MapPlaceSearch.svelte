<script>
  // @ts-check
  // « Chercher un lieu » on the map of a site form (task 2026-11-27-412; mock-ups nouveau-site-plongee-android,
  // bureau-site-nouveau-plongee): a white pill over the map's top left. Entrée (or the button) asks OpenStreetMap's
  // Nominatim for the place (lib/place-search.js, the app's one-request-a-second policy); the places found are listed
  // under it, and choosing one gives its position to the map.
  import Icon from './Icon.svelte';
  import { language, t } from '../lib/i18n.js';
  import { searchPlaces } from '../lib/place-search.js';

  /** @type {{ onpick: (place: import('../lib/place-search.js').FoundPlace) => void, wide?: boolean }} */
  // `wide`: about 420 px (a tablet's « Nouveau site », task 2026-11-27-420) instead of 282.
  let { onpick, wide = false } = $props();

  let query = $state('');
  /** @type {import('../lib/place-search.js').FoundPlace[]|null} */
  let found = $state(null);
  let failed = $state(false);
  let busy = $state(false);

  async function search() {
    failed = false;
    found = null;
    if (!query.trim() || busy) return;
    busy = true;
    try {
      const places = await searchPlaces(query, language);
      if (places === null) failed = true;
      else found = places;
    } finally {
      busy = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      search();
    } else if (e.key === 'Escape' && (found || failed)) {
      e.preventDefault();
      e.stopPropagation();
      found = null;
      failed = false;
    }
  }

  /** @param {import('../lib/place-search.js').FoundPlace} place */
  function pick(place) {
    found = null;
    onpick(place);
  }
</script>

<div class="bc-map-place-search" class:bc-map-place-search--wide={wide}>
  <div class="bc-map-place-search--box">
    <button type="button" class="bc-map-place-search--go" aria-label={t('diveSite.mapSearchLabel')} disabled={busy} onclick={search}><Icon name="search" size={20} /></button>
    <input type="search" bind:value={query} placeholder={t('sites.searchPlace')} aria-label={t('diveSite.mapSearchLabel')} enterkeyhint="search" autocomplete="off" onkeydown={keydown} />
  </div>
  {#if found}
    <ul class="bc-map-place-search--results" aria-label={t('sites.searchPlace')}>
      {#each found as place (place.name + place.latUdeg)}
        <li><button type="button" onclick={() => pick(place)}>{place.name}</button></li>
      {:else}
        <li class="bc-map-place-search--none" role="status">{t('sites.searchPlaceNone')}</li>
      {/each}
    </ul>
  {:else if failed}
    <p class="bc-map-place-search--none bc-map-place-search--failed" role="status">{t('sites.searchPlaceFailed')}</p>
  {/if}
</div>

<style>
  @layer bc.components {
    .bc-map-place-search {
      position: absolute;
      z-index: 3;
      left: 12px;
      top: 12px;
      width: min(282px, calc(100% - 80px));
      &.bc-map-place-search--wide {
        width: min(420px, calc(100% - 80px));
      }
    }
    .bc-map-place-search--box {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 44px;
      padding: 0 12px 0 4px;
      border-radius: 22px;
      background: var(--bc-surface);
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.2);
      & input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: 0;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 15px;
      }
    }
    .bc-map-place-search--go {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
    }
    .bc-map-place-search--results,
    .bc-map-place-search--failed {
      margin: 6px 0 0;
      padding: 4px 0;
      list-style: none;
      border-radius: 16px;
      background: var(--bc-surface);
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.2);
      max-height: 200px;
      overflow: auto;
      & button {
        display: block;
        width: 100%;
        min-height: 40px;
        padding: 6px 16px;
        border: 0;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 14px;
        text-align: start;
        cursor: pointer;
        &:hover {
          background: var(--bc-surface-container-high);
        }
      }
    }
    .bc-map-place-search--none {
      padding: 8px 16px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
