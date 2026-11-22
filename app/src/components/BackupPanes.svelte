<script>
  // @ts-check
  // The backup and restore screens side by side (tasks 2026-11-19-290 and 2026-11-22-319; android-tablette-sauvegarde-paysage,
  // bureau-sauvegarde): the three choices on the left, the chosen screen on the right. The tablet's page and the desktop's dialog
  // host it; the phone's pages show the same bodies one at a time.
  import './backup.css';
  import Icon from './Icon.svelte';
  import BackupMain from './BackupMain.svelte';
  import BackupTimeline from './BackupTimeline.svelte';
  import BackupVersion from './BackupVersion.svelte';
  import BackupDivePick from './BackupDivePick.svelte';
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
      oncarnet={() => (backup.choice = { kind: 'carnet' })}
      ondive={() => (backup.choice = { kind: 'dive', key: '' })}
      ondeleted={() => (backup.choice = { kind: 'deleted' })}
    />
  </div>
  <div class="bc-backup-panes--detail">
    {#if choice?.kind === 'carnet'}
      <h2 class="bc-backup--section">{t('backup.hub.carnet')}</h2>
      <BackupTimeline onversion={(id) => (backup.choice = { kind: 'version', id })} />
    {:else if choice?.kind === 'version'}
      <button type="button" class="bc-text-button bc-backup-panes--back" onclick={() => (backup.choice = { kind: 'carnet' })}>
        <Icon name="arrowBack" size={20} />{t('backup.hub.carnet')}
      </button>
      {#key choice.id}<BackupVersion id={choice.id} heading={false} {onbrowse} />{/key}
    {:else if choice?.kind === 'dive'}
      {#if choice.key}
        {#key choice.key}<BackupDive startKey={choice.key} onchange={() => (backup.choice = { kind: 'dive', key: '' })} />{/key}
      {:else}
        <h2 class="bc-backup--section">{t('backup.dive.pickTitle')}</h2>
        <BackupDivePick onpick={(key) => (backup.choice = { kind: 'dive', key })} />
      {/if}
    {:else if choice?.kind === 'deleted'}
      <BackupDeleted />
    {:else}
      <div class="bc-backup-panes--empty">{t('backup.pane.empty')}</div>
    {/if}
  </div>
</div>
