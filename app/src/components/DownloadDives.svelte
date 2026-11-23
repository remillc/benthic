<script>
  // @ts-check
  // The dives a download brought, one row each (profile thumbnail, number when the logbook has given one, date,
  // duration, depth). While the download runs the newest row carries the « Nouvelle » chip (task 2026-11-23-357).
  import { theme } from 'framework7-svelte';
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `number`: the dive's number in the logbook, only for dives already in it.
   * @typedef {{ key: string, date: string, durationSeconds: number, maxDepthMm: number, profile: number[], number?: number }} DownloadedDive
   */

  /** @type {{ dives: DownloadedDive[], prefs: any, chip?: boolean }} */
  let { dives, prefs, chip = false } = $props();
</script>

<ul class="bc-download-dives">
  {#each dives as d, i (d.key)}
    <li class="bc-download-dives--row">
      <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} {prefs} />
      <span class="bc-download-dives--texts">
        <span class="bc-download-dives--headline">
          <span class="bc-download-dives--number">{d.number ? `#${d.number}` : formatDateTime(d.date)}</span>
          {#if chip && i === 0}<span class="bc-download-dives--chip">{t('download.newChip')}</span>{/if}
        </span>
        {#if d.number}<span class="bc-download-dives--supporting">{formatDateTime(d.date)}</span>{/if}
      </span>
      <span class="bc-download-dives--values">
        {#if theme.ios}
          <span class="bc-download-dives--depth">{formatDepth(d.maxDepthMm, prefs)}</span>
          <span class="bc-download-dives--supporting">{formatDuration(d.durationSeconds)}</span>
        {:else}
          <span class="bc-download-dives--depth">{formatDuration(d.durationSeconds)}</span>
          {#if d.maxDepthMm}<span class="bc-download-dives--supporting">{formatDepth(d.maxDepthMm, prefs)}</span>{/if}
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  @layer bc.components {
    .bc-download-dives {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .bc-download-dives--row {
      box-sizing: border-box;
      min-height: 72px;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--bc-text);
    }

    .bc-download-dives--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-download-dives--headline {
      min-height: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-download-dives--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-download-dives--values {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-variant-numeric: tabular-nums;
    }

    .bc-download-dives--depth {
      font-size: 16px;
      font-weight: 600;
    }

    .bc-download-dives--chip {
      padding: 0 8px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      border-radius: 10px;
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
    }
  }
</style>
