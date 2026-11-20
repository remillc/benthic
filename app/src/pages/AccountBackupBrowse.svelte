<script>
  // @ts-check
  // An earlier version of the logbook, read only (task 2026-11-19-290, « Parcourir cette version »), whatever the screen.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupBrowse from '../components/BackupBrowse.svelte';
  import { layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  /** Back to the screen this one was opened over; the desktop's detail pane has nothing behind it and shows its empty state. */
  function leave() {
    if (layout.desktop) f7router.navigate('/pane/empty');
    else f7router.back();
  }
</script>

<Page class="bc-account-backup-page">
  <Navbar title={t('backup.version.title')}>
    {#snippet left()}
      {#if layout.desktop}
        <Link iconOnly onclick={leave}><i class="icon icon-back"></i><span class="bc-sr-only">{t('detail.back')}</span></Link>
      {:else}
        <BackLink label={t('backup.title')} name={t('detail.back')} />
      {/if}
    {/snippet}
  </Navbar>
  <BackupBrowse id={f7route.params.id} onclose={leave} />
</Page>
