<script>
  // @ts-check
  // « Tout le carnet à une date » on a phone (task 2026-11-22-319; sauvegarde-carnet-android, ios-sauvegarde): the versions of the
  // logbook as a timeline; a version opens its page, whose back arrow returns here.
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupTimeline from '../components/BackupTimeline.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();
</script>

<Page class="bc-account-backup-page">
  <Navbar title={t('backup.timeline.title')}>
    {#snippet left()}
      <BackLink label={t('backup.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  <BackupTimeline onversion={(id) => f7router.navigate(`/account/backup/version/${id}`)} />
</Page>
