<script>
  // @ts-check
  // "Créer un jeton d'accès" (tasks 2026-11-16-253 to 255; docs/mockups/git-jeton-aide*.dc.html): the steps to create, on each host, a token that reads and writes the repository.
  // The page is the phone's: the app bar with ←, then the body that the first-launch column of a tablet and of the
  // desktop shows too (components/GitHelp.svelte; the hosts and their texts: lib/git-help.js).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import GitHelp from '../components/GitHelp.svelte';
  import { t } from '../lib/i18n.js';
</script>

<Page class="od-token-help">
  <Navbar title={t('tokenHelp.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <GitHelp kind="token" />
</Page>
