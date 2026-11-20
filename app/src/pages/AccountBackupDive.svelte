<script>
  // @ts-check
  // The versions of one dive on a phone (task 2026-11-19-290; sauvegarde-plongee-android, ios-sauvegarde-plongee): from « Une plongée »
  // (the diver picks the dive) or from the dive's menu, « Versions de cette plongée » (the dive is in the address).
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupDive from '../components/BackupDive.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> } }} */
  let { f7route } = $props();
  /** `2022-04-24T10:30:00` in the address, `2022-04-24 10:30:00` for the repository. */
  const startKey = (f7route.params.key ?? '').replace('T', ' ');
</script>

<Page class="bc-account-backup-page">
  <Navbar title={t('backup.dive.title')}>
    {#snippet left()}
      <BackLink label={t('backup.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  <BackupDive {startKey} />
</Page>
