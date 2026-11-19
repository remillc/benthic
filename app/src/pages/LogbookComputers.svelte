<script>
  // @ts-check
  // "Ordinateurs du carnet" (reglages-ordinateurs-android.dc.html; spec, "Settings, logbook dive computers"): the
  // computers the dives come from. The list itself is components/LogbookComputersList.svelte.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import LogbookComputersList from '../components/LogbookComputersList.svelte';
  import { t } from '../lib/i18n.js';
</script>

<Page class="od-logbook-computers">
  <Navbar title={t('settings.logbookComputers.title')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('detail.back')}</span></Link>
    {/snippet}
  </Navbar>
  <LogbookComputersList />
</Page>
