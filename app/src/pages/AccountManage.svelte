<script>
  // @ts-check
  // « Gérer le compte » on the phone (task 2026-11-18-281, docs/mockups-release/compte-android-connecte.dc.html): a screen
  // with a back arrow, opened from the account sheet. The tablet and the desktop open the same body as a dialog
  // (components/AccountManageDialog.svelte).
  import BackLink from '../components/BackLink.svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import AccountManage from '../components/AccountManage.svelte';
  import { t } from '../lib/i18n.js';

  /** Back to the page this one was opened over. */
  function leave() {
    f7.views.current?.router.back();
  }
</script>

<Page class="bc-account-manage-page">
  <Navbar title={t('account.manage.title')}>
    {#snippet left()}
      <BackLink label={t('account.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  <AccountManage onclose={leave} />
</Page>
