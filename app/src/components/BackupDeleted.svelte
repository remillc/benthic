<script>
  // @ts-check
  // The deleted dives (task 2026-11-19-290): they stay in the history, so they are always recoverable, with no time limit.
  // « Restaurer » brings one back as a new commit; nothing else changes. Photos and videos are not in the history: they are
  // kept 90 days after a deletion, then erased (said under the list).
  import './backup.css';
  import { backup, restoreOne, loadDeleted } from '../lib/backup.svelte.js';
  import { versionDay, isoOfEpoch } from '../lib/backup-text.js';
  import { formatDateTime, formatDepth, formatDuration, formatTimeAgo } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ onrestored?: () => void }} */
  let { onrestored } = $props();

  $effect(() => {
    if (backup.deleted === null && !backup.deletedLoading) loadDeleted();
  });

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  function rowTitle(d) {
    const number = d.number != null ? t('backup.version.number', { n: d.number }) : '';
    return [number, d.site].filter(Boolean).join(' · ') || formatDateTime(startIso(d));
  }

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  const startIso = (d) => d.key.replace(' ', 'T');

  /** What identifies the dive: when it started, how deep, how long, the mode and the computer. @param {import('../lib/backup-history.js').DeletedDive} d */
  function identityLine(d) {
    const title = rowTitle(d);
    const when = formatDateTime(startIso(d));
    return [
      title === when ? '' : when,
      d.maxDepthMm ? formatDepth(d.maxDepthMm, logbook.prefs) : '',
      d.durationSeconds != null ? formatDuration(d.durationSeconds) : '',
      d.mode && d.mode !== 'OC' ? t(`detail.modes.${d.mode}`) : '',
      d.computer,
    ].filter(Boolean).join(' · ');
  }

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  async function restore(d) {
    if (backup.busy) return;
    const ok = await restoreOne({ commit: d.commit, dir: d.dir, key: d.key, date: versionDay(d.deletedAt) });
    showSnackbar(t(ok ? 'backup.deleted.restored' : 'backup.deleted.restoreFailed'));
    if (ok) onrestored?.();
  }
</script>

<div class="bc-backup bc-backup-deleted">
  <h2 class="bc-backup--section">{t('backup.deleted.title')}</h2>
  {#if backup.deleted === null || backup.deletedLoading}
    <p class="bc-backup--empty" role="status">{t('backup.only.deletedSearching')}</p>
  {:else if backup.deletedFailed}
    <div class="bc-backup--error">
      {t('backup.deleted.failed')}
      <button type="button" class="bc-outlined-button" onclick={loadDeleted}>{t('backup.versions.retry')}</button>
    </div>
  {:else if !backup.deleted.length}
    <p class="bc-backup--empty">{t('backup.deleted.empty')}</p>
  {:else}
    <div class="bc-backup--list" role="list">
      {#each backup.deleted as d (d.key)}
        <div class="bc-backup--row" role="listitem">
          <span class="bc-backup--texts">
            <span class="bc-backup--row-title">{rowTitle(d)}</span>
            {#if identityLine(d)}<span class="bc-backup--row-line">{identityLine(d)}</span>{/if}
            <span class="bc-backup--row-line">{t('backup.deleted.row', { when: formatTimeAgo(isoOfEpoch(d.deletedAt)) })}</span>
          </span>
          <button type="button" class="bc-backup--restore" disabled={backup.busy} onclick={() => restore(d)}>{t('backup.deleted.restore')}</button>
        </div>
      {/each}
    </div>
  {/if}
  <p class="bc-backup--note">{t('backup.deleted.note')} {t('backup.media')}</p>
</div>
