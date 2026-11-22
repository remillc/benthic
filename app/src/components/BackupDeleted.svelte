<script>
  // @ts-check
  // The deleted dives (tasks 2026-11-19-290 and 2026-11-22-319; sauvegarde-supprimees-android): they stay in the history, so they
  // are always recoverable, with no time limit. « Restaurer » brings one back as a new commit, « Restaurer les N plongées » all of
  // them, and a restored dive takes back its number; nothing else changes. Photos and videos are not in the history: they are kept
  // 90 days after a deletion, then erased (said under the list).
  import './backup.css';
  import Icon from './Icon.svelte';
  import { backup, restoreOne, loadDeleted, loadVersions } from '../lib/backup.svelte.js';
  import { restoredDiveNumberPlan, restoredNumberCollisionPlan } from '../lib/backup-history.js';
  import { renumberDivesTo, logbook } from '../lib/logbook.svelte.js';
  import { versionDay, isoOfEpoch } from '../lib/backup-text.js';
  import { formatDate, formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** `heading`: the title above the list (a phone's page already has it in its bar). @type {{ heading?: boolean, onrestored?: () => void }} */
  let { heading = true, onrestored } = $props();

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

  /** The facts line of a dive: its day, its duration and its maximum depth. @param {import('../lib/backup-history.js').DeletedDive} d */
  function factsLine(d) {
    const parts = [formatDate(startIso(d))];
    if (d.durationSeconds != null) parts.push(formatDuration(d.durationSeconds));
    if (d.maxDepthMm != null) parts.push(formatDepth(d.maxDepthMm, logbook.prefs));
    return parts.join(' · ');
  }

  /**
   * A dive restored with the number its file carries: when later dives took that number since (deleting a dive renumbers them),
   * they move up so that it keeps it.
   * @param {import('../lib/backup-history.js').DeletedDive} d
   * @returns {Promise<{ ok: boolean, message: string, values: Record<string, string> }>}
   */
  async function keepNumber(d) {
    const plan = restoredNumberCollisionPlan(d.key, logbook.dives);
    const values = { number: String(d.number) };
    if (!plan) return { ok: true, message: 'backup.deleted.restoredWithNumber', values };
    backup.busy = true;
    try {
      await renumberDivesTo(plan.ids, plan.numbers);
      await loadVersions();
      return { ok: true, message: 'backup.deleted.restoredAndShifted', values };
    } catch (e) {
      console.error('Numbering the restored dive', e);
      return { ok: true, message: 'backup.deleted.numberFailed', values: {} };
    } finally {
      backup.busy = false;
    }
  }

  /**
   * Brings one dive back and gives it its number when the logbook had none for it (restoredDiveNumberPlan).
   * @param {import('../lib/backup-history.js').DeletedDive} d
   * @returns {Promise<{ ok: boolean, message: string, values: Record<string, string> }>}
   */
  async function bringBack(d) {
    const ok = await restoreOne({ commit: d.commit, dir: d.dir, key: d.key, date: versionDay(d.deletedAt) });
    if (!ok) return { ok: false, message: 'backup.deleted.restoreFailed', values: {} };
    if (d.number != null) return keepNumber(d);
    const plan = restoredDiveNumberPlan(d.key, logbook.dives);
    if (!plan) {
      console.error('The restored dive could not be found for numbering', d.key);
      return { ok: true, message: 'backup.deleted.numberFailed', values: {} };
    }
    backup.busy = true;
    try {
      await renumberDivesTo(plan.ids, plan.numbers);
      await loadVersions();
      return { ok: true, message: plan.shifted ? 'backup.deleted.restoredAndShifted' : 'backup.deleted.restoredWithNumber', values: { number: String(plan.number) } };
    } catch (e) {
      console.error('Numbering the restored dive', e);
      return { ok: true, message: 'backup.deleted.numberFailed', values: {} };
    } finally {
      backup.busy = false;
    }
  }

  /** @param {import('../lib/backup-history.js').DeletedDive} d */
  async function restore(d) {
    if (backup.busy) return;
    const result = await bringBack(d);
    showSnackbar(t(result.message, result.values));
    if (result.ok) onrestored?.();
  }

  /** « Restaurer les N plongées »: the oldest first, so that each takes its place in the numbering. */
  async function restoreAll() {
    if (backup.busy || !backup.deleted?.length) return;
    const all = [...backup.deleted].sort((a, b) => (a.key < b.key ? -1 : 1));
    let done = 0;
    for (const d of all) {
      const result = await bringBack(d);
      if (!result.ok) {
        showSnackbar(t(result.message, result.values));
        break;
      }
      done++;
    }
    if (done === all.length) showSnackbar(t('backup.deleted.restoredAll', { n: done }));
    if (done) onrestored?.();
  }
</script>

<div class="bc-backup bc-backup-deleted">
  {#if heading}
    <header class="bc-backup-deleted--heading">
      <h2 class="bc-backup-deleted--title">{t('backup.deleted.title')}</h2>
    </header>
  {/if}
  <p class="bc-backup-deleted--intro">{t('backup.deleted.intro')}</p>

  {#if backup.deleted === null || backup.deletedLoading}
    <div class="bc-backup--list bc-backup-deleted--loading skeleton-effect-wave" role="status" aria-busy="true" aria-label={t('backup.hub.deletedSearching')}>
      {#each Array(2) as _, i (i)}
        <article class="bc-backup-deleted--item" aria-hidden="true">
          <div class="bc-backup-deleted--top">
            <div class="bc-backup--texts">
              <span class="skeleton-block bc-backup-deleted--skeleton-title"></span>
              <span class="skeleton-block bc-backup-deleted--skeleton-line"></span>
              <span class="skeleton-block bc-backup-deleted--skeleton-line"></span>
            </div>
            <span class="skeleton-block bc-backup-deleted--skeleton-action"></span>
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
              <p class="bc-backup-deleted--facts">{factsLine(d)}</p>
              <p class="bc-backup-deleted--removed">{t('backup.deleted.row', { date: formatDate(isoOfEpoch(d.deletedAt)) })}</p>
            </div>
            <button type="button" class="bc-text-button bc-backup-deleted--restore" disabled={backup.busy} onclick={() => restore(d)}>{t('backup.deleted.restore')}</button>
          </div>
        </article>
      {/each}
    </div>
    {#if backup.deleted.length > 1}
      <div class="bc-backup--actions">
        <button type="button" class="bc-outlined-button" disabled={backup.busy} onclick={restoreAll}>{t('backup.deleted.restoreAll', { n: backup.deleted.length })}</button>
      </div>
    {/if}
    <p class="bc-backup--note">{t('backup.media')}</p>
  {/if}
</div>
