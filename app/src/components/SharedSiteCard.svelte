<script>
  // @ts-check
  // The card of a selected site of « Carte commune » (bc-shared-site-card, task 2026-11-25-398; docs/mockups/
  // sites-commun-android, ios-sites-commun, android-tablette-sites-commun-paysage, ipad-sites-commun, bureau-sites-commun).
  // A shared site only has a name and a position, so the card holds its actions instead of opening a page: the
  // coordinates (copied with one button), « Itinéraire » (the device's maps app; on the desktop, the map web page) and
  // « Ajouter à mes sites » (the diver's own copy, linked to the base site; once there, « Dans vos sites » opens it).
  // Back closes it (lib/back-button.js sends bc-cancel to it).
  import { f7, theme } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { formatCoordinates, openInMapsApp } from '../lib/sites.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { addBaseSite, sharedSites } from '../lib/shared-sites.svelte.js';
  import { localSiteOf } from '../lib/shared-sites.js';
  import { baseDivesText } from '../lib/shared-sites-format.js';
  /**
   * @type {{
   *   site: import('../lib/shared-sites.js').BaseSite,
   *   desktop?: boolean,
   *   onclose: () => void,
   * }}
   */
  let { site, desktop = false, onclose } = $props();

  const ios = $derived(!desktop && theme.ios);
  const latUdeg = $derived(Math.round(site.lat * 1e6));
  const lonUdeg = $derived(Math.round(site.lon * 1e6));
  const coordinates = $derived(formatCoordinates(latUdeg, lonUdeg));
  /** The logbook site linked to this one, once added. */
  const mine = $derived(localSiteOf(site.id, sharedSites.links));
  /** On the desktop, the map web page (OpenStreetMap, the maps' own data). */
  const webMap = $derived(`https://www.openstreetmap.org/?mlat=${site.lat}&mlon=${site.lon}#map=15/${site.lat}/${site.lon}`);
  let adding = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(coordinates);
      showSnackbar(t('sharedSites.card.coordinatesCopied'));
    } catch {
      showSnackbar(t('sharedSites.card.copyFailed'));
    }
  }

  async function add() {
    if (adding) return;
    adding = true;
    try {
      await addBaseSite(site.id);
      showSnackbar(t('sharedSites.card.added'));
    } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      showSnackbar(t(code === 'SITE_GONE' ? 'sharedSites.card.gone' : 'sharedSites.card.addFailed'));
    } finally {
      adding = false;
    }
  }

  const openMine = () => mine !== null && f7.views.current?.router.navigate(`/sites/${mine}`);

  /** Back closes the card. @param {HTMLElement} node */
  function cancelable(node) {
    const close = () => onclose();
    node.addEventListener('bc-cancel', close);
    return { destroy: () => node.removeEventListener('bc-cancel', close) };
  }
</script>

<div class="bc-shared-site-card" class:bc-shared-site-card--ios={ios} class:bc-shared-site-card--desktop={desktop} role="region" aria-label={t('sharedSites.card.region', { name: site.name })} use:cancelable>
  <div class="bc-shared-site-card--head">
    <span class="bc-shared-site-card--badge" aria-hidden="true"><Icon name="place" size={22} /></span>
    <span class="bc-shared-site-card--texts">
      <span class="bc-shared-site-card--name">{site.name}</span>
      <span class="bc-shared-site-card--line">{[site.country, baseDivesText(site)].filter(Boolean).join(' · ')}</span>
    </span>
    <button type="button" class="bc-shared-site-card--close" aria-label={t('sites.close')} onclick={onclose}><Icon name="close" size={ios ? 16 : 22} /></button>
  </div>
  <div class="bc-shared-site-card--position">
    <Icon name="locate" size={18} />
    <span class="bc-shared-site-card--coordinates bc-value">{coordinates}</span>
    <button type="button" class="bc-shared-site-card--copy" aria-label={t('sharedSites.card.copyCoordinates')} title={t('sharedSites.card.copyCoordinates')} onclick={copy}><Icon name="copy" size={20} /></button>
  </div>
  <div class="bc-shared-site-card--actions">
    {#if desktop}
      <a class="bc-shared-site-card--directions external" href={webMap} target="_blank" rel="noopener"><Icon name="directions" size={18} />{t('sharedSites.card.directions')}</a>
    {:else}
      <button type="button" class="bc-shared-site-card--directions" onclick={() => openInMapsApp(latUdeg, lonUdeg, site.name)}><Icon name="directions" size={18} />{t('sharedSites.card.directions')}</button>
    {/if}
    {#if mine !== null}
      <button type="button" class="bc-shared-site-card--add bc-shared-site-card--mine" onclick={openMine}><Icon name="check" size={18} weight={2} />{t('sharedSites.card.inYourSites')}</button>
    {:else}
      <button type="button" class="bc-shared-site-card--add" disabled={adding} onclick={add}>{t('sharedSites.card.add')}</button>
    {/if}
  </div>
</div>

<style>
  @layer bc.components {
    /* Over the bottom of the map, 16 dp from the edges (the tablet, the iPad and the desktop: at the bottom left). */
    .bc-shared-site-card {
      position: absolute;
      z-index: 4;
      left: 16px;
      right: 16px;
      /* Phone: at the bottom of the short map, over « Mes sites | Carte commune » while it is open. */
      bottom: 16px;
      box-sizing: border-box;
      padding: 16px;
      border-radius: 20px;
      background: var(--bc-surface);
      color: var(--bc-text);
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.16);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-shared-site-card--head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-shared-site-card--badge {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-shared-site-container);
      color: var(--bc-shared-site);
    }

    .bc-shared-site-card--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-shared-site-card--name {
      font-size: 18px;
      line-height: 24px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-shared-site-card--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-shared-site-card--close,
    .bc-shared-site-card--copy {
      flex: none;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .bc-shared-site-card--close {
      align-self: flex-start;
      margin: -8px -8px 0 0;
      border-radius: 50%;
    }

    .bc-shared-site-card--copy {
      border-radius: 12px;
    }

    /* The coordinates on a light grey band. */
    .bc-shared-site-card--position {
      height: 40px;
      padding-left: 12px;
      border-radius: 12px;
      background: var(--bc-surface-container);
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bc-shared-site-card--coordinates {
      flex: 1;
      min-width: 0;
      font-size: 15px;
      color: var(--bc-text);
      font-variant-numeric: tabular-nums;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Two buttons across the width, 12 dp apart. */
    .bc-shared-site-card--actions {
      display: flex;
      gap: 12px;
    }

    .bc-shared-site-card--directions,
    .bc-shared-site-card--add {
      height: 40px;
      padding: 0 12px;
      border-radius: 20px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
      text-decoration: none;
      cursor: pointer;
    }

    .bc-shared-site-card--directions {
      flex: 1;
      border: 1px solid var(--bc-outline);
      background: transparent;
      color: var(--bc-text);
    }

    .bc-shared-site-card--add {
      flex: 1.4;
      border: none;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);

      &:disabled {
        opacity: 0.6;
      }
    }

    .bc-shared-site-card--mine {
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
    }

    /* iPhone and iPad: a grey round close button, « Itinéraire » tinted. */
    .bc-shared-site-card--ios {
      .bc-shared-site-card--close {
        width: 30px;
        height: 30px;
        margin: 0;
        background: var(--bc-surface-container);
        color: var(--bc-text-2);
      }

      .bc-shared-site-card--directions {
        border: none;
        background: color-mix(in srgb, var(--bc-action) 14%, transparent);
        color: var(--bc-action);
      }
    }

    /* Tablet and desktop: at the bottom left of the map. */
    :global(.bc-sites--split) .bc-shared-site-card,
    .bc-shared-site-card--desktop {
      right: auto;
      width: min(400px, calc(100% - 32px));
    }

    /* Tablet: above « Mes sites | Carte commune » (40 dp, 32 dp from the bottom); desktop (the control is at the top):
       above the map credits. */
    :global(.bc-sites--split) .bc-shared-site-card {
      bottom: 84px;
    }

    .bc-shared-site-card--desktop {
      bottom: 40px;
    }

    .bc-shared-site-card--desktop {
      .bc-shared-site-card--close:hover,
      .bc-shared-site-card--copy:hover {
        background: var(--bc-surface-container);
      }
    }
  }
</style>
