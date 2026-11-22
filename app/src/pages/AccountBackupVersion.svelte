<script>
  // @ts-check
  // One version of the logbook on a phone (task 2026-11-19-290; sauvegarde-version-android, ios-sauvegarde-version).
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupVersion from '../components/BackupVersion.svelte';
  import { backup, loadVersions } from '../lib/backup.svelte.js';
  import { versionDay } from '../lib/backup-text.js';
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  const id = f7route.params.id;
  const version = $derived(backup.versions.find((v) => v.id === id) ?? null);
  // A page opened from a link finds the versions not read yet.
  $effect(() => {
    if (!backup.loaded) loadVersions();
  });
</script>

<Page class="bc-account-backup-page">
  <Navbar title={ios || !version ? t('backup.version.title') : t('backup.version.navTitle', { date: versionDay(version.time) })}>
    {#snippet left()}
      <BackLink label={t('backup.timeline.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  <BackupVersion {id} heading={false} onrestored={() => f7router.back()} onbrowse={(commit) => f7router.navigate(`/account/backup/browse/${commit}`)} />
</Page>
