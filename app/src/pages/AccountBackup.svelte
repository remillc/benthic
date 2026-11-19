<script>
  // @ts-check
  // « Sauvegarde et restauration » of an OpenDives+ account (task 2026-11-19-290), opened from the account sheet. On a phone the
  // list, a version, one dive's versions and the deleted dives are pages with a back arrow (AccountBackupVersion and the others);
  // from the tablet layout the list and what a choice shows sit side by side in this page (the desktop opens the same panes in a
  // dialog, components/BackupDialog.svelte). The layout follows the width, the route stays this one.
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupMain from '../components/BackupMain.svelte';
  import BackupPanes from '../components/BackupPanes.svelte';
  import BackupNotOnServer from '../components/BackupNotOnServer.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();
</script>

<Page class="od-account-backup-page">
  <Navbar title={t('backup.title')}>
    {#snippet left()}
      <BackLink label={t('account.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  {#if !logbook.odplus}
    <BackupNotOnServer />
  {:else if layout.split}
    <div class="od-account-backup-page--panes">
      <BackupPanes onbrowse={(id) => f7router.navigate(`/account/backup/browse/${id}`)} />
    </div>
  {:else}
    <BackupMain
      onversion={(id) => f7router.navigate(`/account/backup/version/${id}`)}
      ondive={() => f7router.navigate('/account/backup/dive/')}
      ondeleted={() => f7router.navigate('/account/backup/deleted/')}
    />
  {/if}
</Page>

<style>
  @layer od.components {
    .od-account-backup-page--panes {
      height: 100%;
    }
  }
</style>
