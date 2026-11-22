<script>
  // @ts-check
  // Why the sync failed and what to do (spec, "Sync failures";
  // docs/mockups/android-etat-synchro-*.dc.html): a modal bottom sheet, opened
  // only from the status row, never by itself.
  import { Sheet, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { isRelease } from '../lib/edition.js';
  import { logbook, syncNow, syncFlavour } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** What the sheet shows: it stays while the sheet closes. @type {import('../lib/sync-failure.js').SyncFailure} */
  let cause = $state('server');
  $effect(() => {
    if (logbook.syncFailure) cause = logbook.syncFailure;
  });

  const ICONS = /** @type {const} */ ({ auth: 'lock', server: 'cloud', repository: 'git' });
  /** An own repository whose server does not answer: the texts say « dépôt git », the icon is git's. */
  const gitServer = $derived(cause === 'server' && logbook.mode === 'git');
  const flavour = $derived(gitServer ? syncFlavour() : '');

  const stays = $derived.by(() => {
    if (!logbook.pending) return t('sync.failure.staysNone');
    return t(cause === 'auth' ? 'sync.failure.staysAuth' : 'sync.failure.stays', { n: logbook.pending });
  });

  function close() {
    logbook.syncFailureOpen = false;
  }

  function act() {
    close();
    if (cause === 'server') {
      syncNow();
    } else if (isRelease) {
      // The beta has no git form to repair the access with: the account page holds « Se déconnecter ».
      f7.views.main.router.navigate('/account');
    } else {
      f7.views.main.router.navigate(cause === 'auth' && !isRelease ? '/account/sign-in' : '/account/git', {
        props: cause === 'auth' && !isRelease ? { prefilledEmail: logbook.email } : {},
      });
    }
  }
</script>

<Sheet opened={logbook.syncFailureOpen && !!logbook.syncFailure} swipeToClose backdrop class="bc-sync-failure-sheet bc-sync-failure-sheet--failure-sheet bc-sheet-dialog" style="height: auto" onSheetClosed={close}>
  <div class="bc-sync-failure-sheet--sheet" role="dialog" aria-labelledby="bc-failure-title">
    <div class="bc-sync-failure-sheet--handle" aria-hidden="true"></div>
    <span class="badge" aria-hidden="true"><Icon name={gitServer && !logbook.benthicPlus ? 'git' : ICONS[cause]} weight={2} /></span>
    <h2 id="bc-failure-title" class="bc-sync-failure-sheet--title">{t(`sync.failure.${cause}.title${flavour}`)}</h2>
    <p class="bc-sync-failure-sheet--text">
      {t(`sync.failure.${cause}.intro${flavour}`)}
      {#if cause === 'server' && logbook.retryMinutes}{t('sync.failure.server.retry', { n: logbook.retryMinutes })}{/if}
      {stays}
    </p>
    <div class="bc-sync-failure-sheet--actions">
      <button type="button" class="bc-sync-failure-sheet--text-button" onclick={close}>{t(cause === 'server' ? 'sync.failure.close' : 'sync.failure.later')}</button>
      <button type="button" class="bc-sync-failure-sheet--tonal" onclick={act}>{cause !== 'server' && isRelease ? t('sync.failure.accountAction') : t(`sync.failure.${cause}.action`)}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer bc.components {
    :global(.bc-sync-failure-sheet--failure-sheet) {
      border-radius: 28px 28px 0 0;
      background: var(--bc-dialog);
      overflow: hidden;
    }

    .bc-sync-failure-sheet--sheet {
      padding: 0 24px calc(32px + var(--f7-safe-area-bottom, 0px));
    }

    .bc-sync-failure-sheet--handle {
      width: 32px;
      height: 4px;
      margin: 22px auto 20px;
      border-radius: 2px;
      background: var(--bc-text-2);
    }

    .badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
    }

    .bc-sync-failure-sheet--title {
      margin: 16px 0 8px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--bc-text);
    }

    .bc-sync-failure-sheet--text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--bc-text-2);
    }

    .bc-sync-failure-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 24px;

      button {
        width: auto;
        height: 40px;
        border: none;
        border-radius: 20px;
        font: inherit;
        font-size: 14px;
        letter-spacing: 0.1px;
        cursor: pointer;
      }
    }

    .bc-sync-failure-sheet--text-button {
      padding: 0 12px;
      background: transparent;
      color: var(--bc-text);
      font-weight: 500;
    }

    .bc-sync-failure-sheet--tonal {
      padding: 0 24px;
      background: var(--bc-tonal);
      color: var(--bc-on-secondary-container);
      font-weight: 600;
    }
  }
</style>
