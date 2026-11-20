<script>
  // @ts-check
  // The deleted dives (task 2026-11-19-290): they stay in the history, so they are always recoverable, with no time limit.
  // « Restaurer » brings one back as a new commit; nothing else changes. Photos and videos are not in the history: they are
  // kept 90 days after a deletion, then erased (said under the list).
  import './backup.css';
  import { backup, restoreOne, loadDeleted, loadVersions } from '../lib/backup.svelte.js';
  import { restoredDiveNumberPlan } from '../lib/backup-history.js';
  import { renumberDivesTo, logbook } from '../lib/logbook.svelte.js';
  import { versionDay, isoOfEpoch } from '../lib/backup-text.js';
  import { formatDate, formatTimeAgo } from '../lib/format.js';
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
    const date = formatDate(d.key.replace(' ', 'T'));
    return [number, d.site, date].filter(Boolean).join(' · ');
  }

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  async function restore(d) {
    if (backup.busy) return;
    const ok = await restoreOne({ commit: d.commit, dir: d.dir, key: d.key, date: versionDay(d.deletedAt) });
    if (!ok) {
      showSnackbar(t('backup.deleted.restoreFailed'));
      return;
    }

    let message = 'backup.deleted.restored';
    /** @type {Record<string, string>} */
    let values = {};
    if (d.number == null) {
      const plan = restoredDiveNumberPlan(d.key, logbook.dives);
      if (!plan) {
        console.error('The restored dive could not be found for numbering', d.key);
        message = 'backup.deleted.numberFailed';
      } else {
        backup.busy = true;
        try {
          await renumberDivesTo(plan.ids, plan.numbers);
          await loadVersions();
          message = plan.shifted ? 'backup.deleted.restoredAndShifted' : 'backup.deleted.restoredWithNumber';
          values = { number: String(plan.number) };
        } catch (e) {
          console.error('Numbering the restored dive', e);
          message = 'backup.deleted.numberFailed';
        } finally {
          backup.busy = false;
        }
      }
    }
    showSnackbar(t(message, values));
    onrestored?.();
  }
</script>

<div class="bc-backup bc-backup-deleted">
  <h2 class="bc-backup--section">{t('backup.deleted.title')}</h2>
  {#if backup.deleted === null || backup.deletedLoading}
    <p class="bc-backup--empty" role="status">{t('backup.only.deletedSearching')}</p>
  {:else if !backup.deleted.length}
    <p class="bc-backup--empty">{t('backup.deleted.empty')}</p>
  {:else}
    <div class="bc-backup--list" role="list">
      {#each backup.deleted as d (d.key)}
        <div class="bc-backup--row" role="listitem">
          <span class="bc-backup--texts">
            <span class="bc-backup--row-title">{rowTitle(d)}</span>
            <span class="bc-backup--row-line">{t('backup.deleted.row', { when: formatTimeAgo(isoOfEpoch(d.deletedAt)) })}</span>
          </span>
          <button type="button" class="bc-backup--restore" disabled={backup.busy} onclick={() => restore(d)}>{t('backup.deleted.restore')}</button>
        </div>
      {/each}
    </div>
  {/if}
  <p class="bc-backup--note">{t('backup.deleted.note')} {t('backup.media')}</p>
</div>
