<script>
  // @ts-check
  // « Sauvegarde et synchronisation » of an OpenDives+ account, opened from the account sheet. A minimal page that shows
  // only what exists today (sync status, pending changes, « Synchroniser maintenant », the server, what the server
  // keeps), built to be replaced by the design session's mock-ups.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import SyncStatus from '../components/SyncStatus.svelte';
  import SyncFailureRow from '../components/SyncFailureRow.svelte';
  import SyncButton from '../components/SyncButton.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { serverUrl } from '../lib/server-url.js';
  import { serverName } from '../lib/backup-info.js';
  import { t } from '../lib/i18n.js';

  const server = serverName(serverUrl());
</script>

<Page class="od-account-backup-page">
  <Navbar title={t('account.backup.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>
  <div class="od-account-backup">
    <div class="od-account-backup--card">
      <div class="od-account-backup--status">
        {#if logbook.syncFailure}
          <SyncFailureRow />
        {:else}
          <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
        {/if}
      </div>
      {#if logbook.pending > 0}
        <span class="od-account-backup--pending">{t('nav.pendingChanges', { n: logbook.pending })}</span>
      {/if}
      <SyncButton label={t('desktopSettings.account.syncNow')} />
    </div>
    <div class="od-account-backup--card">
      {#if server}
        <span class="od-account-backup--label">{t('account.backup.server')}</span>
        <span class="od-account-backup--value">{server}</span>
      {/if}
      <span class="od-account-backup--note">{t('account.backup.history')}</span>
    </div>
  </div>
</Page>

<style>
  @layer od.components {
    .od-account-backup {
      padding: 8px 16px calc(16px + var(--od-safe-bottom));
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-account-backup--card {
      padding: 16px;
      border-radius: 28px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .od-account-backup--status {
      align-self: stretch;
    }

    .od-account-backup--pending {
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-pending);
    }

    .od-account-backup--label {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-account-backup--value {
      font-size: 16px;
      font-weight: 500;
      color: var(--od-text);
      overflow-wrap: anywhere;
    }

    .od-account-backup--note {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
