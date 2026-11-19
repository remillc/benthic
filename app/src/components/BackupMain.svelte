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
    backup.deletedLoading || backup.deleted === null ? t('backup.only.deletedSearching') : backup.deleted.length ? t('backup.only.deletedLine', { n: backup.deleted.length }) : t('backup.only.deletedNone'),
  );
</script>

<div class="od-backup od-backup-main">
  <div class="od-backup--card od-backup-main--status">
    <span class="od-backup--status-tile" class:od-backup--pending={status.kind !== 'saved'} aria-hidden="true">
      <Icon name={status.kind === 'saved' ? 'cloudCheck' : 'cloud'} size={26} weight={1.8} />
    </span>
    <span class="od-backup--texts">
      <span class="od-backup--title">{status.title}</span>
      <span class="od-backup--line">{status.line}</span>
    </span>
  </div>

  <h2 class="od-backup--section">{t('backup.versions.title')}</h2>
  {#if backup.failed && !backup.versions.length}
    <div class="od-backup--error">
      {t('backup.versions.failed')}
      <button type="button" class="od-outlined-button" onclick={loadVersions}>{t('backup.versions.retry')}</button>
    </div>
  {:else if !backup.loaded}
    <p class="od-backup--empty" role="status">{t('backup.versions.loading')}</p>
  {:else if !backup.versions.length}
    <p class="od-backup--empty">{t('backup.versions.empty')}</p>
  {:else}
    <div class="od-backup--list">
      {#each backup.versions as v (v.id)}
        {#if v.current}
          <div class="od-backup--row od-backup-main--current" aria-current="true">
            <span class="od-backup--texts">
              <span class="od-backup--row-title">{versionWhen(v.time)}</span>
              <span class="od-backup--row-line">{versionLine(v)}</span>
            </span>
            <span class="od-backup--chip">{t('backup.versions.current')}</span>
          </div>
        {:else}
          <button type="button" class="od-backup--row" class:od-backup--row-selected={selected?.kind === 'version' && selected.id === v.id} onclick={() => onversion(v.id)}>
            <span class="od-backup--texts">
              <span class="od-backup--row-title">{versionWhen(v.time)}</span>
              <span class="od-backup--row-line">{versionLine(v)}</span>
            </span>
            <span class="od-backup--chevron"><Icon name="chevron" size={20} /></span>
          </button>
        {/if}
      {/each}
      {#if backup.more}
        <button type="button" class="od-backup--more" disabled={backup.loading} onclick={moreVersions}>{t('backup.versions.older')}</button>
      {/if}
    </div>
    <p class="od-backup--note">{t('backup.versions.note')} {t('backup.media')}</p>
  {/if}

  <h2 class="od-backup--section">{t('backup.only.title')}</h2>
  <div class="od-backup--list">
    <button type="button" class="od-backup--row" class:od-backup--row-selected={selected?.kind === 'dive'} onclick={ondive}>
      <span class="od-backup--tile"><Icon name="book" size={22} weight={1.8} /></span>
      <span class="od-backup--texts">
        <span class="od-backup--row-title">{t('backup.only.dive')}</span>
        <span class="od-backup--row-line">{t('backup.only.diveLine')}</span>
      </span>
      <span class="od-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
    <button type="button" class="od-backup--row" class:od-backup--row-selected={selected?.kind === 'deleted'} onclick={ondeleted}>
      <span class="od-backup--tile"><Icon name="trash" size={22} weight={1.8} /></span>
      <span class="od-backup--texts">
        <span class="od-backup--row-title">{t('backup.only.deleted')}</span>
        <span class="od-backup--row-line">{deletedLine}</span>
      </span>
      <span class="od-backup--chevron"><Icon name="chevron" size={20} /></span>
    </button>
  </div>
</div>
