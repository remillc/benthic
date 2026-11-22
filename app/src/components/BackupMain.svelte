<script>
  // @ts-check
  // « Sauvegarde et restauration » (task 2026-11-22-319; docs/mockups/sauvegarde-android, android-tablette-sauvegarde-paysage,
  // bureau-sauvegarde, ios-sauvegarde): the state of the backup with « Sauvegarder maintenant », then « Que voulez-vous récupérer ? »
  // with three choices: a deleted dive, a version of a dive, the whole logbook at a date. The same body in the phone's page, the
  // tablet's list pane and the desktop's dialog; what a row opens is decided by the host (`ondeleted`, `ondive`, `oncarnet`).
  import './backup.css';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { backup, loadVersions, loadDeleted } from '../lib/backup.svelte.js';
  import { logbook, syncNow } from '../lib/logbook.svelte.js';
  import { formatShortAgo } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `selected`: the pane's current choice, marked in the lists.
   * @type {{ selected?: import('../lib/backup.svelte.js').Choice|null, oncarnet: () => void, ondive: () => void, ondeleted: () => void }}
   */
  let { selected = null, oncarnet, ondive, ondeleted } = $props();

  onMount(() => {
    loadVersions();
    if (backup.deleted === null) loadDeleted();
  });

  /** The state of the backup: what the logbook tells about its last sync. */
  const status = $derived.by(() => {
    if (logbook.syncFailure) return { kind: 'failed', title: t('backup.status.failed'), line: t('backup.status.failedLine') };
    if (logbook.sync === 'offline') return { kind: 'pending', title: t('backup.status.offline'), line: t('backup.status.offlineLine') };
    if (logbook.pending > 0) return { kind: 'pending', title: t('backup.status.pending', { n: logbook.pending }), line: t('backup.status.pendingLine') };
    return logbook.lastSync
      ? { kind: 'saved', title: t('backup.status.saved', { when: formatShortAgo(logbook.lastSync) }), line: t('backup.status.savedLine') }
      : { kind: 'pending', title: t('backup.status.never'), line: t('backup.status.neverLine') };
  });

  const searching = $derived(backup.deletedLoading || backup.deleted === null);
  const deletedCount = $derived(backup.deleted?.length ?? 0);
  const syncing = $derived(logbook.sync === 'syncing');

  async function backUpNow() {
    if (syncing) return;
    await syncNow();
    await loadVersions();
  }
</script>

<div class="bc-backup bc-backup-main">
  <div class="bc-backup--card bc-backup-main--status">
    <span class="bc-backup--status-icon" class:bc-backup--pending={status.kind !== 'saved'} aria-hidden="true">
      <Icon name={status.kind === 'saved' ? 'cloudCheck' : 'cloud'} size={24} weight={1.8} />
    </span>
    <span class="bc-backup--texts">
      <span class="bc-backup--title">{status.title}</span>
      <span class="bc-backup--line">{status.line}</span>
    </span>
    <button type="button" class="bc-backup--sync" disabled={syncing} aria-busy={syncing} aria-label={t('backup.status.syncNow')} onclick={backUpNow}>
      <Icon name="sync" size={22} weight={2} />
    </button>
  </div>

  <h2 class="bc-backup--section">{t('backup.hub.title')}</h2>
  <div class="bc-backup--choices">
    <button type="button" class="bc-backup--choice" class:bc-backup--row-selected={selected?.kind === 'deleted'} aria-busy={searching} onclick={ondeleted}>
      <span class="bc-backup--tile"><Icon name="trash" size={24} weight={1.8} /></span>
      <span class="bc-backup--texts">
        <span class="bc-backup--choice-title">{t('backup.hub.deleted')}</span>
        <span class="bc-backup--choice-line">{t('backup.hub.deletedLine')}</span>
      </span>
      {#if searching}
        <span class="bc-sr-only">{t('backup.hub.deletedSearching')}</span>
        <span class="skeleton-block bc-backup-main--badge-skeleton" aria-hidden="true"></span>
      {:else if backup.deletedFailed}
        <span class="bc-sr-only">{t('backup.hub.deletedFailed')}</span>
      {:else if deletedCount}
        <span class="bc-backup--badge" aria-label={t('backup.hub.deletedCount', { n: deletedCount })}>{deletedCount}</span>
      {/if}
      <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
    <button type="button" class="bc-backup--choice" class:bc-backup--row-selected={selected?.kind === 'dive'} onclick={ondive}>
      <span class="bc-backup--tile"><Icon name="edit" size={24} weight={1.8} /></span>
      <span class="bc-backup--texts">
        <span class="bc-backup--choice-title">{t('backup.hub.dive')}</span>
        <span class="bc-backup--choice-line">{t('backup.hub.diveLine')}</span>
      </span>
      <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
    <button type="button" class="bc-backup--choice" class:bc-backup--row-selected={selected?.kind === 'carnet' || selected?.kind === 'version'} onclick={oncarnet}>
      <span class="bc-backup--tile"><Icon name="history" size={24} weight={1.8} /></span>
      <span class="bc-backup--texts">
        <span class="bc-backup--choice-title">{t('backup.hub.carnet')}</span>
        <span class="bc-backup--choice-line">{t('backup.hub.carnetLine')}</span>
      </span>
      <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
  </div>
  <p class="bc-backup--note bc-backup--footnote">{t('backup.hub.note')}</p>
</div>
