<script>
  // @ts-check
  // An earlier version of the logbook, read only (task 2026-11-19-290, « Parcourir cette version »): its dives in a list, a
  // banner that says so, and « Revenir au carnet ». The core holds the version instead of the logbook while this is open: nothing
  // can be edited, saved or sent from it (core/libbenthic, history_call "open"); closing it reads the logbook again.
  import './backup.css';
  import { onDestroy, onMount } from 'svelte';
  import { openVersion, closeVersion, logbook } from '../lib/logbook.svelte.js';
  import { backup } from '../lib/backup.svelte.js';
  import { versionWhen } from '../lib/backup-text.js';
  import { formatDepth, formatDuration, formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** `id`: the version's commit. `onclose`: leaves the screen. @type {{ id: string, onclose: () => void }} */
  let { id, onclose } = $props();

  const version = $derived(backup.versions.find((v) => v.id === id) ?? null);
  /** @type {import('benthic-core').Dive[]|null} */
  let dives = $state(null);
  let failed = $state(false);

  onMount(async () => {
    try {
      const list = await openVersion(id);
      dives = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
    } catch (e) {
      console.error('Opening a version', e);
      failed = true;
    }
  });

  let closing = false;
  async function leave() {
    if (!closing) {
      closing = true;
      await closeVersion().catch((e) => console.error('Closing a version', e));
    }
    onclose();
  }

  // Leaving the page any other way (the Back key, a swipe) closes the version as well.
  onDestroy(() => {
    if (!closing) {
      closing = true;
      closeVersion().catch((e) => console.error('Closing a version', e));
    }
  });

  /** @param {import('benthic-core').Dive} d */
  const title = (d) => [d.number ? t('backup.version.number', { n: d.number }) : '', d.site].filter(Boolean).join(' · ') || formatDate(d.date);
</script>

<div class="bc-backup bc-backup-browse">
  <p class="bc-backup--banner" role="status">
    <span>{t('backup.browse.banner', { date: version ? versionWhen(version.time) : '' })}</span>
    <button type="button" class="bc-outlined-button" onclick={leave}>{t('backup.browse.back')}</button>
  </p>
  {#if failed}
    <p class="bc-backup--error">{t('backup.browse.failed')}</p>
  {:else if dives === null}
    <p class="bc-backup--empty" role="status">{t('backup.versions.loading')}</p>
  {:else if !dives.length}
    <p class="bc-backup--empty">{t('backup.browse.empty')}</p>
  {:else}
    <div class="bc-backup--list" role="list" style="margin-top: 12px">
      {#each dives as d (d.id)}
        <div class="bc-backup--row" role="listitem">
          <span class="bc-backup--texts">
            <span class="bc-backup--row-title">{title(d)}</span>
            <span class="bc-backup--row-line">{formatDate(d.date)} · {formatDepth(d.maxDepthMm, logbook.prefs)} · {formatDuration(d.durationSeconds)}</span>
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
