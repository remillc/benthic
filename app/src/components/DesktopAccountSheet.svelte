<script>
  // @ts-check
  // Desktop app: the account sheet (task 2026-11-15-202, docs/mockups/bureau-compte.dc.html), a
  // 380 dp card anchored above the rail's account initial: the account, « Synchroniser maintenant »,
  // the two sync switches, then « Se déconnecter ». Escape or a click outside closes it. Réglages
  // and À propos are not here: the rail's gear and the ⋮ menus have them. Opened by
  // navigation.accountOpen (components/AccountAvatar.svelte).
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import SyncFailureRow from './SyncFailureRow.svelte';
  import SyncButton from './SyncButton.svelte';
  import { logbook, setAutoSync, signOut } from '../lib/logbook.svelte.js';
  import { navigation, openOver, showSection } from '../lib/navigation.svelte.js';
  import { syncNetwork, setUnmeteredOnly } from '../lib/sync-network.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  const initial = $derived(logbook.email ? logbook.email.trim().charAt(0).toLocaleUpperCase() : '');
  const accountName = $derived(logbook.email || t('menu.noAccount'));
  const git = $derived(logbook.mode === 'git');
  const server = $derived(git && logbook.odplus);

  /** @type {HTMLElement|undefined} */
  let sheet = $state();

  function close() {
    navigation.accountOpen = false;
  }

  // Focus goes into the sheet when it opens and back to the initial when it closes.
  /** @type {HTMLElement|null} */
  let opener = null;
  $effect(() => {
    if (!navigation.accountOpen) return;
    opener = /** @type {HTMLElement|null} */ (document.activeElement);
    tick().then(() => /** @type {HTMLElement|null} */ (sheet?.querySelector('button, input'))?.focus());
    /** @param {KeyboardEvent} e */
    const keydown = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.dialog.modal-in')) return;
      e.preventDefault();
      close();
    };
    /** @param {PointerEvent} e */
    const outside = (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      // The initial toggles the sheet itself.
      if (!sheet?.contains(target) && !target.closest('.od-account-avatar') && !target.closest('.dialog, .popover')) close();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('pointerdown', outside, true);
      opener?.focus?.();
    };
  });

  function manage() {
    close();
    openOver('/account');
  }

  function confirmSignOut() {
    const pending = logbook.pending;
    confirmAction({
      title: t(server ? 'signOut.titleServer' : git ? 'signOut.titleGit' : 'signOut.title'),
      text: pending ? t(server ? 'signOut.textPendingServer' : git ? 'signOut.textPendingGit' : 'signOut.textPending', { n: pending }) : t(server ? 'signOut.textNoneServer' : git ? 'signOut.textNoneGit' : 'signOut.textNone'),
      action: t('signOut.confirm'),
      onConfirm: async () => {
        try {
          await signOut({ deleteCopy: false });
          close();
          showSection('logbook');
        } catch (e) {
          console.error('Signing out', e);
          showSnackbar(t('signOut.failed'));
        }
      },
    });
  }
</script>

{#if navigation.accountOpen}
  <div class="od-desktop-account" role="dialog" aria-label={t('desktopSettings.account.sheet')} bind:this={sheet}>
    <div class="od-desktop-account--head">
      <span class="od-desktop-account--initial" aria-hidden="true">
        {#if initial}{initial}{:else}<Icon name="account" size={22} weight={2} />{/if}
      </span>
      <span class="od-desktop-account--texts">
        <span class="od-desktop-account--name">{accountName}</span>
        {#if logbook.email && !logbook.loading && !logbook.error}
          <span class="od-desktop-account--status">
            {#if logbook.syncFailure}
              <SyncFailureRow />
            {:else}
              <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
            {/if}
          </span>
        {:else if !logbook.email}
          <span class="od-desktop-account--status">{t('menu.localDives', { n: logbook.dives.length })}</span>
        {/if}
      </span>
    </div>

    {#if logbook.email}
      <div class="od-desktop-account--sync"><SyncButton label={t('desktopSettings.account.syncNow')} /></div>
      <label class="od-desktop-account--switch">
        <span class="od-desktop-account--switch-texts">
          <span class="od-desktop-account--switch-label">{t('desktopSettings.account.auto')}</span>
          <span class="od-desktop-account--switch-text">{t('desktopSettings.account.autoText')}</span>
        </span>
        <span class="toggle"><input type="checkbox" checked={logbook.autoSync} onchange={(e) => setAutoSync(e.currentTarget.checked)} /><span class="toggle-icon"></span></span>
      </label>
      <label class="od-desktop-account--switch">
        <span class="od-desktop-account--switch-texts">
          <span class="od-desktop-account--switch-label">{t('desktopSettings.account.unmetered')}</span>
          <span class="od-desktop-account--switch-text">{t('desktopSettings.account.unmeteredText')}</span>
        </span>
        <span class="toggle"><input type="checkbox" checked={syncNetwork.unmeteredOnly} onchange={(e) => setUnmeteredOnly(e.currentTarget.checked)} /><span class="toggle-icon"></span></span>
      </label>
      <div class="od-desktop-account--divider"></div>
      <button type="button" class="od-desktop-account--row" onclick={confirmSignOut}>
        <Icon name="logout" size={22} />
        <span>{t('account.signOut')}</span>
      </button>
    {:else}
      <div class="od-desktop-account--sync"><button type="button" class="od-tonal-button" onclick={manage}>{t('desktopSettings.account.manage')}</button></div>
    {/if}
  </div>
{/if}

<style>
  @layer od.components {
    .od-desktop-account {
      position: fixed;
      z-index: 13000;
      left: calc(var(--od-nav-width) + env(safe-area-inset-left) + 8px);
      bottom: 16px;
      width: 380px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      box-sizing: border-box;
      padding: 16px 0 8px;
      border-radius: 16px;
      background: var(--od-surface);
      outline: 1px solid var(--od-separator);
      color: var(--od-text);
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.12);
    }
    .od-desktop-account--head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
    }
    .od-desktop-account--initial {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: var(--od-band-avatar);
      color: var(--od-nav-avatar-ink);
      font-size: 20px;
      font-weight: 500;
    }
    .od-desktop-account--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .od-desktop-account--name {
      font-size: 16px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-desktop-account--status {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-account--sync {
      padding: 16px;
    }
    .od-desktop-account--switch {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 16px;
      min-height: 56px;
    }
    .od-desktop-account--switch-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .od-desktop-account--switch-label {
      font-size: 15px;
    }
    .od-desktop-account--switch-text {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-account--divider {
      height: 1px;
      margin: 8px 0;
      background: var(--od-separator);
    }
    .od-desktop-account--row {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      min-height: 48px;
      padding: 0 16px;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: color-mix(in srgb, var(--od-text) 6%, transparent);
      }
      &:focus-visible {
        outline: 2px solid var(--od-text);
        outline-offset: -2px;
      }
    }
    /* « Synchroniser maintenant »: the page's main action, in the ink (the mock-up's black button). */
    .od-desktop-account--sync :global(.od-sync-button) {
      background: var(--od-action);
      color: var(--od-on-action);
    }
  }
</style>
