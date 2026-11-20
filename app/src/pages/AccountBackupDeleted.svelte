<script>
  // @ts-check
  // The deleted dives on a phone (task 2026-11-19-290): always recoverable.
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupDeleted from '../components/BackupDeleted.svelte';
  import { t } from '../lib/i18n.js';
</script>

<Page class="bc-account-backup-page">
  <Navbar title={t('backup.deleted.title')}>
    {#snippet left()}
      <BackLink label={t('backup.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  <BackupDeleted />
</Page>
