<script>
  // @ts-check
  // The deleted dives (task 2026-11-19-290): they stay in the history, so they are always recoverable, with no time limit.
  // « Restaurer » brings one back as a new commit; nothing else changes. Photos and videos are not in the history: they are
  // kept 90 days after a deletion, then erased (said under the list).
  import './backup.css';
  import { backup, restoreOne, loadDeleted } from '../lib/backup.svelte.js';
  import { versionDay, isoOfEpoch } from '../lib/backup-text.js';
  import { formatLongDate, formatTimeAgo } from '../lib/format.js';
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
    const date = formatLongDate(d.key.replace(' ', 'T'));
    return [number, d.site, date].filter(Boolean).join(' · ');
  }

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  async function restore(d) {
    if (backup.busy) return;
    const ok = await restoreOne({ commit: d.commit, dir: d.dir, key: d.key, date: versionDay(d.deletedAt) });
    showSnackbar(t(ok ? 'backup.deleted.restored' : 'backup.deleted.restoreFailed'));
    if (ok) onrestored?.();
  }
</script>

<div class="od-backup od-backup-deleted">
  <h2 class="od-backup--section">{t('backup.deleted.title')}</h2>
  {#if backup.deleted === null || backup.deletedLoading}
    <p class="od-backup--empty" role="status">{t('backup.only.deletedSearching')}</p>
  {:else if !backup.deleted.length}
    <p class="od-backup--empty">{t('backup.deleted.empty')}</p>
  {:else}
    <div class="od-backup--list" role="list">
      {#each backup.deleted as d (d.key)}
        <div class="od-backup--row" role="listitem">
          <span class="od-backup--texts">
            <span class="od-backup--row-title">{rowTitle(d)}</span>
            <span class="od-backup--row-line">{t('backup.deleted.row', { when: formatTimeAgo(isoOfEpoch(d.deletedAt)) })}</span>
          </span>
          <button type="button" class="od-backup--restore" disabled={backup.busy} onclick={() => restore(d)}>{t('backup.deleted.restore')}</button>
        </div>
      {/each}
    </div>
  {/if}
  <p class="od-backup--note">{t('backup.deleted.note')} {t('backup.media')}</p>
</div>
