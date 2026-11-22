<script>
  // @ts-check
  // The card of a selected pin (bc-map-site-card, task 2026-11-14-150): over the bottom of
  // a map, the site's name, « {pays} · {n} plongées, la dernière le {date} », its maximum
  // depth and a chevron; it opens the site's sheet. Back closes it (lib/back-button.js
  // sends od-cancel to it). On the Sites map and, up close, on the heat map (task 155). A site of the shared map
  // (task 2026-11-19-315) gives its own line and no depth. The shared map hides dive counts.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { formatDepth, formatDate } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';

  /**
   * @type {{
   *   site: { name: string, country: string, dives: number, lastDate: string, maxDepthMm: number },
   *   line?: string,
   *   hideDiveCounts?: boolean,
   *   onopen: () => void,
   *   onclose: () => void,
   * }}
   */
  let { site, line = '', hideDiveCounts = false, onopen, onclose } = $props();

  /** « Northern Arch, Nouvelle-Zélande, 1 plongée. Ouvrir la fiche du site ». */
  const label = $derived(
    `${line ? [site.name, line].join(', ') : [site.name || t('sites.noName'), site.country, hideDiveCounts ? '' : t('sites.diveCount', { n: site.dives })].filter(Boolean).join(', ')}. ${t('sites.openSiteSheet')}`,
  );

  /** Back closes the card. @param {HTMLElement} node */
  function cancelable(node) {
    const close = () => onclose();
    node.addEventListener('od-cancel', close);
    return { destroy: () => node.removeEventListener('od-cancel', close) };
  }
</script>

<button type="button" class="bc-map-site-card" aria-label={label} onclick={onopen} use:cancelable>
  <span class="bc-map-site-card--texts">
    <span class="bc-map-site-card--name">{site.name || t('sites.noName')}</span>
    <span class="bc-map-site-card--line">{line || [site.country, hideDiveCounts ? '' : t('sites.rowDives', { n: site.dives, date: formatDate(site.lastDate) })].filter(Boolean).join(' · ')}</span>
  </span>
  {#if site.maxDepthMm && !line}<span class="bc-map-site-card--depth bc-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</span>{/if}
  <Icon name="chevron" size={20} />
</button>

<style>
  @layer od.components {
    /* The card of the selected pin (bc-map-site-card): over the bottom of the map, 16 dp
       from the edges, white, 16 dp corners, a light shadow. */
    .bc-map-site-card {
      position: absolute;
      z-index: 3;
      left: 16px;
      right: 16px;
      /* Above the map credit, which stays readable. */
      bottom: 28px;
      box-sizing: border-box;
      width: auto;
      min-height: 72px;
      padding: 10px 12px 10px 16px;
      border: none;
      border-radius: 16px;
      background: var(--bc-surface);
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      :global(.bc-icon) {
        flex: none;
        color: var(--bc-text-2);
      }

      :global(.bc-map-fullscreen) & {
        bottom: calc(var(--bc-safe-bottom) + 112px);
      }
    }

    .bc-map-site-card--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-map-site-card--name {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-map-site-card--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-map-site-card--depth {
      flex: none;
      font-size: 16px;
      font-weight: 500;
    }
  }
</style>
