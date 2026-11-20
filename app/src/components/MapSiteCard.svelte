<script>
  // @ts-check
  // The card of a selected pin (od-map-site-card, task 2026-11-14-150): over the bottom of
  // a map, the site's name, « {pays} · {n} plongées, la dernière le {date} », its maximum
  // depth and a chevron; it opens the site's sheet. Back closes it (lib/back-button.js
  // sends od-cancel to it). On the Sites map and, up close, on the heat map (task 155). A site of the shared map
  // (task 2026-11-19-315) gives its own line (« Nouvelle-Zélande · carte commune · 214 plongées ») and no depth.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { formatDepth, formatDate } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';

  /**
   * @type {{
   *   site: { name: string, country: string, dives: number, lastDate: string, maxDepthMm: number },
   *   line?: string,
   *   onopen: () => void,
   *   onclose: () => void,
   * }}
   */
  let { site, line = '', onopen, onclose } = $props();

  /** « Northern Arch, Nouvelle-Zélande, 1 plongée. Ouvrir la fiche du site ». */
  const label = $derived(
    `${line ? [site.name, line].join(', ') : [site.name || t('sites.noName'), site.country, t('sites.diveCount', { n: site.dives })].filter(Boolean).join(', ')}. ${t('sites.openSiteSheet')}`,
  );

  /** Back closes the card. @param {HTMLElement} node */
  function cancelable(node) {
    const close = () => onclose();
    node.addEventListener('od-cancel', close);
    return { destroy: () => node.removeEventListener('od-cancel', close) };
  }
</script>

<button type="button" class="od-map-site-card" aria-label={label} onclick={onopen} use:cancelable>
  <span class="od-map-site-card--texts">
    <span class="od-map-site-card--name">{site.name || t('sites.noName')}</span>
    <span class="od-map-site-card--line">{line || [site.country, t('sites.rowDives', { n: site.dives, date: formatDate(site.lastDate) })].filter(Boolean).join(' · ')}</span>
  </span>
  {#if site.maxDepthMm && !line}<span class="od-map-site-card--depth od-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</span>{/if}
  <Icon name="chevron" size={20} />
</button>

<style>
  @layer od.components {
    /* The card of the selected pin (od-map-site-card): over the bottom of the map, 16 dp
       from the edges, white, 16 dp corners, a light shadow. */
    .od-map-site-card {
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
      background: var(--od-surface);
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      :global(.od-icon) {
        flex: none;
        color: var(--od-text-2);
      }

      :global(.od-map-fullscreen) & {
        bottom: calc(var(--od-safe-bottom) + 112px);
      }
    }

    .od-map-site-card--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-map-site-card--name {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-map-site-card--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-map-site-card--depth {
      flex: none;
      font-size: 16px;
      font-weight: 500;
    }
  }
</style>
