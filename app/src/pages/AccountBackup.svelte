<script>
  // @ts-check
  // « Sauvegarde et restauration » of an OpenDives+ account (tasks 2026-11-19-290 and 2026-11-22-319), opened from the account sheet.
  // On a phone « Que voulez-vous récupérer ? » and each of its three choices (the deleted dives, a version of a dive, the whole
  // logbook at a date, then one version) are pages with a back arrow (AccountBackupDeleted and the others); from the tablet layout
  // the choices and what one shows sit side by side in this page (the desktop opens the same panes in a
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

<Page class="bc-account-backup-page">
  <Navbar title={t('backup.title')}>
    {#snippet left()}
      <BackLink label={t('account.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  {#if !logbook.odplus}
    <BackupNotOnServer />
  {:else if layout.split}
    <div class="bc-account-backup-page--panes">
      <BackupPanes onbrowse={(id) => f7router.navigate(`/account/backup/browse/${id}`)} />
    </div>
  {:else}
    <BackupMain
      oncarnet={() => f7router.navigate('/account/backup/carnet/')}
      ondive={() => f7router.navigate('/account/backup/dive/')}
      ondeleted={() => f7router.navigate('/account/backup/deleted/')}
    />
  {/if}
</Page>

<style>
  @layer od.components {
    .bc-account-backup-page--panes {
      height: 100%;
    }
  }
</style>
