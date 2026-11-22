<script>
  // @ts-check
  // The deleted dives (task 2026-11-19-290): they stay in the history, so they are always recoverable, with no time limit.
  // « Restaurer » brings one back as a new commit; nothing else changes. Photos and videos are not in the history: they are
  // kept 90 days after a deletion, then erased (said under the list).
  import './backup.css';
  import Icon from './Icon.svelte';
  import { backup, restoreOne, loadDeleted, loadVersions } from '../lib/backup.svelte.js';
  import { restoredDiveNumberPlan } from '../lib/backup-history.js';
  import { renumberDivesTo, logbook } from '../lib/logbook.svelte.js';
  import { versionDay, isoOfEpoch } from '../lib/backup-text.js';
  import { formatDateTime, formatDepth, formatDuration, formatTimeAgo } from '../lib/format.js';
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

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  const hasIdentifier = (d) => d.number != null || Boolean(d.site);

  const summary = $derived(backup.deleted?.length ? t('backup.only.deletedLine', { n: backup.deleted.length }) : '');

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
  <header class="bc-backup-deleted--heading">
    <div>
      <h2 class="bc-backup-deleted--title">{t('backup.deleted.title')}</h2>
      {#if summary && !backup.deletedLoading && !backup.deletedFailed}
        <p class="bc-backup-deleted--summary">{summary}</p>
      {/if}
    </div>
  </header>
  <p class="bc-backup-deleted--note">{t('backup.deleted.note')}</p>

  {#if backup.deleted === null || backup.deletedLoading}
    <div class="bc-backup--list bc-backup-deleted--loading skeleton-effect-wave" role="status" aria-busy="true" aria-label={t('backup.only.deletedSearching')}>
      {#each Array(3) as _, i (i)}
        <article class="bc-backup-deleted--item" aria-hidden="true">
          <div class="bc-backup-deleted--top">
            <div class="bc-backup--texts">
              <span class="skeleton-block bc-backup-deleted--skeleton-title"></span>
              <span class="skeleton-block bc-backup-deleted--skeleton-line"></span>
            </div>
            <span class="skeleton-block bc-backup-deleted--skeleton-action"></span>
          </div>
          <div class="bc-backup-deleted--skeleton-facts">
            <span class="skeleton-block"></span>
            <span class="skeleton-block"></span>
            <span class="skeleton-block"></span>
          </div>
        </article>
      {/each}
    </div>
  {:else if backup.deletedFailed}
    <div class="bc-backup-deleted--state" role="alert">
      <p>{t('backup.deleted.failed')}</p>
      <button type="button" class="bc-outlined-button" onclick={loadDeleted}>{t('backup.versions.retry')}</button>
    </div>
  {:else if !backup.deleted.length}
    <div class="bc-backup-deleted--empty">
      <span class="bc-backup--tile" aria-hidden="true"><Icon name="trash" size={24} weight={1.8} /></span>
      <p>{t('backup.deleted.empty')}</p>
    </div>
  {:else}
    <div class="bc-backup--list bc-backup-deleted--list" role="list">
      {#each backup.deleted as d (d.key)}
        <article class="bc-backup-deleted--item" role="listitem">
          <div class="bc-backup-deleted--top">
            <div class="bc-backup-deleted--identity">
              <h3 class="bc-backup-deleted--name">{rowTitle(d)}</h3>
              {#if hasIdentifier(d)}
                <p class="bc-backup-deleted--date">{formatDateTime(startIso(d))}</p>
              {/if}
            </div>
            <button type="button" class="bc-backup--restore bc-backup-deleted--restore" disabled={backup.busy} onclick={() => restore(d)}>{t('backup.deleted.restore')}</button>
          </div>
          <dl class="bc-backup-deleted--facts">
            {#if d.maxDepthMm != null}
              <div class="bc-backup-deleted--fact-depth"><dt>{t('backup.deleted.fields.depth')}</dt><dd>{formatDepth(d.maxDepthMm, logbook.prefs)}</dd></div>
            {/if}
            {#if d.durationSeconds != null}
              <div class="bc-backup-deleted--fact-duration"><dt>{t('backup.deleted.fields.duration')}</dt><dd>{formatDuration(d.durationSeconds)}</dd></div>
            {/if}
            {#if d.mode}
              <div class="bc-backup-deleted--fact-mode"><dt>{t('backup.deleted.fields.mode')}</dt><dd>{t(`detail.modes.${d.mode}`)}</dd></div>
            {/if}
            {#if d.computer}
              <div class="bc-backup-deleted--fact-computer"><dt>{t('backup.deleted.fields.computer')}</dt><dd>{d.computer}</dd></div>
            {/if}
          </dl>
          <p class="bc-backup-deleted--removed">{t('backup.deleted.row', { when: formatTimeAgo(isoOfEpoch(d.deletedAt)) })}</p>
        </article>
      {/each}
    </div>
  {/if}
</div>
