<script>
  // @ts-check
  // « Tout le carnet à une date » (task 2026-11-22-319; sauvegarde-carnet-android): the versions of the logbook as a vertical
  // timeline grouped by day, a dot per version, with chips for what changed since. The current version is filled, with its
  // « Actuelle » chip, and cannot be opened; the others open `onversion` (a phone's page, a pane's detail).
  import './backup.css';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { backup, loadVersions, moreVersions } from '../lib/backup.svelte.js';
  import { isoOfEpoch } from '../lib/backup-text.js';
  import { formatDate, formatTimeOfDay, localNowIso, oneLine } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `selected`: the version open in the pane next to the timeline.
   * @type {{ selected?: string|null, onversion: (id: string) => void }}
   */
  let { selected = null, onversion } = $props();

  onMount(() => {
    if (!backup.loaded) loadVersions();
  });

  const DAY = 86400000;
  /** @param {string} iso */
  const dayNumber = (iso) => Math.floor(Date.parse(`${iso}Z`) / DAY);

  /**
   * The day of a version: « Aujourd’hui », « Hier », else the date in the format chosen in Settings.
   * @param {string} iso
   */
  function dayLabel(iso) {
    const days = dayNumber(localNowIso()) - dayNumber(iso);
    return days === 0 ? t('backup.timeline.today') : days === 1 ? t('backup.timeline.yesterday') : formatDate(iso);
  }

  /** The versions with their day, a day's label shown on the first of its versions. */
  const entries = $derived(
    backup.versions.map((v, i) => {
      const iso = isoOfEpoch(v.time);
      const day = iso.slice(0, 10);
      const before = i > 0 ? isoOfEpoch(backup.versions[i - 1].time).slice(0, 10) : '';
      return { v, iso, label: day === before ? '' : dayLabel(iso) };
    }),
  );

  /** The chips of what changed since a version, in the order added, modified, deleted, sites. @param {import('../lib/backup-history.js').Version} v */
  function chips(v) {
    if (!v.since) return [];
    const { added, removed, modified, sites } = v.since;
    /** @type {{ kind: string, text: string }[]} */
    const out = [];
    if (added) out.push({ kind: 'added', text: t('backup.timeline.added', { n: added }) });
    if (modified) out.push({ kind: 'modified', text: t('backup.timeline.modified', { n: modified }) });
    if (removed) out.push({ kind: 'removed', text: t('backup.timeline.removed', { n: removed }) });
    if (!added && !modified && !removed && sites) out.push({ kind: 'modified', text: t('backup.timeline.sites', { n: sites }) });
    return out;
  }
</script>

<div class="bc-backup bc-backup-timeline">
  {#if backup.failed && !backup.versions.length}
    <div class="bc-backup--error">
      {t('backup.versions.failed')}
      <button type="button" class="bc-outlined-button" onclick={loadVersions}>{t('backup.versions.retry')}</button>
    </div>
  {:else if !backup.loaded}
    <div class="bc-backup--list bc-backup-main--skeleton-list skeleton-effect-wave" role="status" aria-busy="true" aria-label={t('backup.versions.loading')}>
      {#each Array(3) as _, i (i)}
        <div class="bc-backup-main--skeleton-row" aria-hidden="true">
          <span class="bc-backup--texts">
            <span class="skeleton-block bc-backup-main--skeleton-title"></span>
            <span class="skeleton-block bc-backup-main--skeleton-line"></span>
          </span>
          <span class="skeleton-block bc-backup-main--skeleton-chip"></span>
        </div>
      {/each}
    </div>
  {:else if !backup.versions.length}
    <p class="bc-backup--empty">{t('backup.versions.empty')}</p>
  {:else}
    <ol class="bc-backup--timeline">
      {#each entries as { v, iso, label }, i (v.id)}
        {#if label}<li class="bc-backup--day">{label}</li>{/if}
        <li class="bc-backup--version" class:bc-backup--version-last={i === entries.length - 1 && !backup.more}>
          {#snippet content()}
            <span class="bc-backup--dot-column" aria-hidden="true"><span class="bc-backup--dot" class:bc-backup--dot-current={v.current}></span></span>
            <span class="bc-backup--texts bc-backup--version-texts">
              <span class="bc-backup--version-title">
                <span class="bc-backup--version-time">{formatTimeOfDay(iso)}</span>
                <span class="bc-backup--version-dives">· {t('backup.versions.dives', { n: v.counts.dives })}</span>
              </span>
              {#if chips(v).length}
                <span class="bc-backup--chips">
                  {#each chips(v) as c (c.kind)}<span class="bc-backup--change-chip bc-backup--change-{c.kind}">{oneLine(c.text)}</span>{/each}
                </span>
              {/if}
            </span>
          {/snippet}
          {#if v.current}
            <div class="bc-backup--version-row" aria-current="true">
              {@render content()}
              <span class="bc-backup--current-chip">{t('backup.versions.current')}</span>
            </div>
          {:else}
            <button type="button" class="bc-backup--version-row" class:bc-backup--row-selected={selected === v.id} onclick={() => onversion(v.id)}>
              {@render content()}
              <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
            </button>
          {/if}
        </li>
      {/each}
      {#if backup.more}
        <li class="bc-backup--older">
          <button type="button" class="bc-backup--more" disabled={backup.loading} onclick={moreVersions}>{t('backup.versions.older')}</button>
        </li>
      {/if}
    </ol>
    <p class="bc-backup--note">{t('backup.timeline.note')} {t('backup.media')}</p>
  {/if}
</div>
