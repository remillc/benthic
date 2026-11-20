<script>
  // @ts-check
  // The backup and restore screens side by side (task 2026-11-19-290; android-tablette-sauvegarde-paysage, bureau-sauvegarde):
  // the list on the left, what the choice shows on the right. The tablet's page and the desktop's dialog host it; the
  // phone's pages show the same bodies one at a time.
  import './backup.css';
  import BackupMain from './BackupMain.svelte';
  import BackupVersion from './BackupVersion.svelte';
  import BackupDive from './BackupDive.svelte';
  import BackupDeleted from './BackupDeleted.svelte';
  import { backup } from '../lib/backup.svelte.js';
  import { t } from '../lib/i18n.js';

  /** `onbrowse`: « Parcourir » leaves the panes for the read-only version. @type {{ onbrowse: (id: string) => void }} */
  let { onbrowse } = $props();

  const choice = $derived(backup.choice);
</script>

<div class="bc-backup-panes">
  <div class="bc-backup-panes--list">
    <BackupMain
      selected={choice}
      onversion={(id) => (backup.choice = { kind: 'version', id })}
      ondive={() => (backup.choice = { kind: 'dive', key: '' })}
      ondeleted={() => (backup.choice = { kind: 'deleted' })}
    />
  </div>
  <div class="bc-backup-panes--detail">
    {#if choice?.kind === 'version'}
      {#key choice.id}<BackupVersion id={choice.id} {onbrowse} />{/key}
    {:else if choice?.kind === 'dive'}
      {#key choice.key}<BackupDive startKey={choice.key} />{/key}
    {:else if choice?.kind === 'deleted'}
      <BackupDeleted />
    {:else}
      <div class="bc-backup-panes--empty">{t('backup.pane.empty')}</div>
    {/if}
  </div>
</div>
