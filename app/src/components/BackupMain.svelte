<script>
  // @ts-check
  // « Sauvegarde et restauration » (task 2026-11-19-290; docs/mockups/sauvegarde-android, android-tablette-sauvegarde-paysage,
  // bureau-sauvegarde, ios-sauvegarde): the state of the backup, the versions of the logbook (a version per sync), and
  // « Restaurer seulement » one dive or the deleted dives. The same body in the phone's page, the tablet's list pane and the
  // desktop's dialog; what a row opens is decided by the host (`onversion`, `ondive`, `ondeleted`).
  import './backup.css';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { backup, loadVersions, moreVersions, loadDeleted } from '../lib/backup.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { versionWhen, versionLine } from '../lib/backup-text.js';
  import { formatShortAgo } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `selected`: the pane's current choice, marked in the lists.
   * @type {{ selected?: import('../lib/backup.svelte.js').Choice|null, onversion: (id: string) => void, ondive: () => void, ondeleted: () => void }}
   */
  let { selected = null, onversion, ondive, ondeleted } = $props();

  onMount(() => {
    loadVersions();
    if (backup.deleted === null) loadDeleted();
  });

  /** The state of the backup: what the logbook tells about its last sync. */
  const status = $derived.by(() => {
    if (logbook.syncFailure) return { kind: 'failed', title: t('backup.status.failed'), line: t('backup.status.failedLine') };
    if (logbook.sync === 'offline') return { kind: 'pending', title: t('backup.status.offline'), line: t('backup.status.offlineLine') };
    if (logbook.pending > 0) return { kind: 'pending', title: t('backup.status.pending', { n: logbook.pending }), line: t('backup.status.pendingLine') };
    const line = logbook.lastSync ? t('backup.status.savedLine', { when: capital(formatShortAgo(logbook.lastSync)) }) : t('backup.status.neverLine');
    return { kind: 'saved', title: t('backup.status.saved'), line };
  });

  /** @param {string} text */
  const capital = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

  const deletedLine = $derived(
    backup.deletedLoading || backup.deleted === null
      ? t('backup.only.deletedSearching')
      : backup.deletedFailed
        ? t('backup.only.deletedFailed')
        : backup.deleted.length
          ? t('backup.only.deletedLine', { n: backup.deleted.length })
          : t('backup.only.deletedNone'),
  );
</script>

<div class="bc-backup bc-backup-main">
  <div class="bc-backup--card bc-backup-main--status">
    <span class="bc-backup--status-tile" class:bc-backup--pending={status.kind !== 'saved'} aria-hidden="true">
      <Icon name={status.kind === 'saved' ? 'cloudCheck' : 'cloud'} size={26} weight={1.8} />
    </span>
    <span class="bc-backup--texts">
      <span class="bc-backup--title">{status.title}</span>
      <span class="bc-backup--line">{status.line}</span>
    </span>
  </div>

  <div class="bc-backup-main--versions">
  <h2 class="bc-backup--section">{t('backup.versions.title')}</h2>
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
    <div class="bc-backup--list">
      {#each backup.versions as v (v.id)}
        {#if v.current}
          <div class="bc-backup--row bc-backup-main--current" aria-current="true">
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{versionWhen(v.time)}</span>
              <span class="bc-backup--row-line">{versionLine(v)}</span>
            </span>
            <span class="bc-backup--chip">{t('backup.versions.current')}</span>
          </div>
        {:else}
          <button type="button" class="bc-backup--row" class:bc-backup--row-selected={selected?.kind === 'version' && selected.id === v.id} onclick={() => onversion(v.id)}>
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{versionWhen(v.time)}</span>
              <span class="bc-backup--row-line">{versionLine(v)}</span>
            </span>
            <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
          </button>
        {/if}
      {/each}
      {#if backup.more}
        <button type="button" class="bc-backup--more" disabled={backup.loading} onclick={moreVersions}>{t('backup.versions.older')}</button>
      {/if}
      {#if backup.loading}
        <div class="bc-backup-main--skeleton-list skeleton-effect-wave" aria-hidden="true">
          {#each Array(2) as _, i (i)}
            <div class="bc-backup-main--skeleton-row">
              <span class="bc-backup--texts">
                <span class="skeleton-block bc-backup-main--skeleton-title"></span>
                <span class="skeleton-block bc-backup-main--skeleton-line"></span>
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <p class="bc-backup--note">{t('backup.versions.note')} {t('backup.media')}</p>
  {/if}
  </div>

  <div class="bc-backup-main--only">
  <h2 class="bc-backup--section">{t('backup.only.title')}</h2>
  <div class="bc-backup--list">
    <button type="button" class="bc-backup--row" class:bc-backup--row-selected={selected?.kind === 'dive'} onclick={ondive}>
      <span class="bc-backup--tile"><Icon name="book" size={22} weight={1.8} /></span>
      <span class="bc-backup--texts">
        <span class="bc-backup--row-title">{t('backup.only.dive')}</span>
        <span class="bc-backup--row-line">{t('backup.only.diveLine')}</span>
      </span>
      <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
    <button type="button" class="bc-backup--row" class:bc-backup--row-selected={selected?.kind === 'deleted'} aria-busy={backup.deletedLoading || backup.deleted === null} onclick={ondeleted}>
      <span class="bc-backup--tile"><Icon name="trash" size={22} weight={1.8} /></span>
      <span class="bc-backup--texts">
        <span class="bc-backup--row-title">{t('backup.only.deleted')}</span>
        {#if backup.deletedLoading || backup.deleted === null}
          <span class="bc-sr-only">{deletedLine}</span>
          <span class="skeleton-block bc-backup-main--deleted-skeleton" aria-hidden="true"></span>
        {:else}
          <span class="bc-backup--row-line">{deletedLine}</span>
        {/if}
      </span>
      <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
  </div>
  </div>
</div>
