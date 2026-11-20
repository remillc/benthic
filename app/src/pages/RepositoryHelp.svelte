<script>
  // @ts-check
  // "Créer un dépôt" (task 2026-11-16-247; docs/mockups/git-depot-aide-android.dc.html): the steps to create, on each host, a private and empty repository, and to copy its HTTPS address.
  // The page is the phone's: the app bar with ←, then the body that the first-launch column of a tablet and of the
  // desktop shows too (components/GitHelp.svelte; the hosts and their texts: lib/git-help.js).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import GitHelp from '../components/GitHelp.svelte';
  import { t } from '../lib/i18n.js';
</script>

<Page class="bc-repository-help">
  <Navbar title={t('repoHelp.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="bc-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <GitHelp kind="repository" />
</Page>
