<script>
  // @ts-check
  // An earlier version of the logbook, read only (task 2026-11-19-290, « Parcourir cette version »), whatever the screen.
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupBrowse from '../components/BackupBrowse.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
</script>

<Page class="od-account-backup-page">
  <Navbar title={t('backup.version.title')}>
    {#snippet left()}
      <BackLink label={t('backup.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  <BackupBrowse id={f7route.params.id} onclose={() => f7router.back()} />
</Page>
