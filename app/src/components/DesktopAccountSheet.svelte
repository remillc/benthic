<script>
  // @ts-check
  import { devAccounts } from '../lib/dev-switch.js';
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
  import { benthicPlusAccount, benthicPlusSubscriber } from '../lib/benthic-plus-state.svelte.js';
  import { logbook, setAutoSync, signOut } from '../lib/logbook.svelte.js';
  import { navigation, openOver, openProfile, openBackup, openManageAccount, openSettings, openAbout, showSection } from '../lib/navigation.svelte.js';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import { openBenthicPlus } from '../lib/open-offer.svelte.js';
  import { loadInventory, overdueBadge } from '../lib/inventory.svelte.js';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { accountEmail as emailOfAccount, profileRow, sheetVariant } from '../lib/account-sheet.js';
  import { isRelease } from '../lib/edition.js';
  import { logbooks } from '../lib/desktop-logbooks.svelte.js';
  import { syncNetwork, setUnmeteredOnly } from '../lib/sync-network.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import { accountLock } from '../lib/locked-data.svelte.js';

  const email = $derived(emailOfAccount(benthicPlusAccount, logbook));
  // A Benthic+ account shows the diver's full name first and the e-mail under it (task 2026-11-19-312).
  const fullName = $derived(benthicPlusSubscriber() ? diver.info.fullName : '');
  const initial = $derived((fullName || email) ? (fullName || email).trim().charAt(0).toLocaleUpperCase() : '');
  const accountName = $derived(fullName || email || t('menu.noAccount'));
  const accountEmail = $derived(fullName ? email : '');
  const git = $derived(logbook.mode === 'git');
  const server = $derived(git && logbook.benthicPlus);

  // The versions of the sheet (task 2026-11-18-281; bureau-compte-gratuit, bureau-profil-compte). The release edition
  // without a Benthic+ account has the free one; there is no tablet or desktop offer screen yet, so « S'abonner » opens
  // the phone's offer content.
  const variant = $derived(sheetVariant({ release: isRelease, subscriber: benthicPlusSubscriber(), email: logbook.email, git, repository: logbook.repository }));
  const free = $derived(variant === 'free');
  const subscriber = $derived(variant === 'subscriber');
  const gitSheet = $derived(variant === 'git');
  const late = $derived(profileRow(subscriber ? overdueBadge() : 0));
  $effect(() => {
    if (navigation.accountOpen && subscriber) loadInventory().catch((e) => console.error('Reading the equipment', e));
    if (navigation.accountOpen && subscriber) loadProfile().catch((e) => console.error('Reading the profile', e));
  });

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
      if (!sheet?.contains(target) && !target.closest('.bc-account-avatar') && !target.closest('.dialog, .popover')) close();
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
    if (subscriber) openManageAccount();
    else openOver('/account');
  }

  /** @param {'offer'|'signIn'} screen */
  function plus(screen) {
    close();
    openBenthicPlus(screen);
  }

  /** @param {() => void} open */
  function leaveTo(open) {
    close();
    open();
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

{#if navigation.accountOpen && subscriber}
  <!-- A Benthic+ account (task 2026-11-19-292, docs/mockups/bureau-profil-compte.dc.html): the logo, the account group
       (the buttons beside what they act on), « Mon profil de plongeur » and the backup, then Réglages and À propos, each
       entry with its icon in a small blue tile. No close button: a click outside or Esc closes it. -->
  <div class="bc-desktop-account bc-desktop-account--plus" role="dialog" aria-label={t('desktopSettings.account.sheet')} bind:this={sheet}>
    <div class="bc-desktop-account--brand">
      <img class="bc-desktop-account--logo bc-desktop-account--light" src="/logo-light.svg" alt="" width="24" height="24" />
      <img class="bc-desktop-account--logo bc-desktop-account--dark" src="/logo-dark.svg" alt="" width="24" height="24" />
      <span class="bc-desktop-account--brand-name"><span aria-hidden="true">{t('menu.title')}<span class="bc-desktop-account--dot">+</span></span><span class="bc-sr-only">{t('benthicPlus.chipName')}</span></span>
    </div>

    <div class="bc-desktop-account--group">
      <div class="bc-desktop-account--identity">
        <span class="bc-desktop-account--avatar" aria-hidden="true">{initial}</span>
        <span class="bc-desktop-account--texts">
          <span class="bc-desktop-account--name">{accountName}</span>
          {#if accountEmail}<span class="bc-desktop-account--email">{accountEmail}</span>{/if}
          <span class="bc-desktop-account--status">{t('account.sheet.plusDives', { n: logbook.dives.length })}</span>
          <button type="button" class="bc-outlined-button bc-desktop-account--manage" onclick={manage}>{t('nav.manageAccount')}</button>
        </span>
      </div>
      {#if !logbook.loading && !logbook.error}
        <div class="bc-desktop-account--divider-line"></div>
        <div class="bc-desktop-account--syncline">
          {#if logbook.syncFailure}
            <SyncFailureRow />
          {:else}
            <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
          {/if}
          <SyncButton />
        </div>
      {/if}
    </div>
    {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}

    <div class="bc-desktop-account--group">
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openProfile)}>
        <span class="bc-desktop-account--tile"><Icon name="account" size={22} /></span>
        <span class="bc-desktop-account--row-texts">
          <span class="bc-desktop-account--entry-title">{t('gear.profile.title')}</span>
          <span class="bc-desktop-account--row-line" class:bc-desktop-account--late-line={late.late}>{late.late ? t('account.sheet.maintenanceLate', { n: late.badge }) : t('gear.profile.cardLine')}</span>
        </span>
        {#if late.late}<span class="bc-desktop-account--late-badge" role="status" aria-label={t('maintenance.badge', { n: late.badge })}>{late.badge}</span>{/if}
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openBackup)}>
        <span class="bc-desktop-account--tile"><Icon name="history" size={22} /></span>
        <span class="bc-desktop-account--row-texts"><span class="bc-desktop-account--entry-title">{t('account.sheet.backup')}</span><span class="bc-desktop-account--row-line">{t('account.sheet.backupText')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
    </div>

    <div class="bc-desktop-account--group">
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openSettings)}>
        <span class="bc-desktop-account--tile"><Icon name="settings" size={22} /></span>
        <span class="bc-desktop-account--row-texts"><span class="bc-desktop-account--entry-title">{t('settings.title')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openAbout)}>
        <span class="bc-desktop-account--tile"><Icon name="info" size={22} /></span>
        <span class="bc-desktop-account--row-texts"><span class="bc-desktop-account--entry-title">{t('about.title')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
    </div>
  </div>
{:else if navigation.accountOpen && gitSheet}
  <!-- The one-off licence with git sync (task 2026-11-19-298, docs/mockups/bureau-profil-compte-git.dc.html): the
       repository card with « Changer de dépôt » and the sync row, the backup (the repository's own history), the
       « Passer à Benthic+ » card, then Réglages and À propos. No « Mon profil de plongeur ». -->
  <div class="bc-desktop-account bc-desktop-account--plus bc-desktop-account--git" role="dialog" aria-label={t('desktopSettings.account.sheet')} bind:this={sheet}>
    <div class="bc-desktop-account--brand">
      <img class="bc-desktop-account--logo bc-desktop-account--light" src="/logo-light.svg" alt="" width="24" height="24" />
      <img class="bc-desktop-account--logo bc-desktop-account--dark" src="/logo-dark.svg" alt="" width="24" height="24" />
      <span class="bc-desktop-account--brand-name">{t('menu.title')}</span>
    </div>

    <div class="bc-desktop-account--group">
      <div class="bc-desktop-account--identity">
        <span class="bc-desktop-account--tile bc-desktop-account--repo-tile" aria-hidden="true"><Icon name="git" size={26} /></span>
        <span class="bc-desktop-account--texts">
          <span class="bc-desktop-account--name">{t('account.sheet.gitTitle')}</span>
          <span class="bc-desktop-account--status">{t('account.sheet.gitLine', { repository: logbook.repository, n: logbook.dives.length })}</span>
          <button type="button" class="bc-outlined-button bc-desktop-account--manage" onclick={() => leaveTo(() => (logbooks.dialog = true))}>{t('account.sheet.changeRepository')}</button>
        </span>
      </div>
      {#if !logbook.loading && !logbook.error}
        <div class="bc-desktop-account--divider-line"></div>
        <div class="bc-desktop-account--syncline">
          {#if logbook.syncFailure}
            <SyncFailureRow />
          {:else}
            <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
          {/if}
          <SyncButton />
        </div>
      {/if}
    </div>
    {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}

    <div class="bc-desktop-account--group">
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openBackup)}>
        <span class="bc-desktop-account--tile"><Icon name="history" size={22} /></span>
        <span class="bc-desktop-account--row-texts"><span class="bc-desktop-account--entry-title">{t('account.sheet.backup')}</span><span class="bc-desktop-account--row-line">{t('account.sheet.backupTextGit')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
    </div>

    <div class="bc-desktop-account--upgrade">
      <span class="bc-desktop-account--row-texts">
        <span class="bc-desktop-account--entry-title">{t('account.sheet.upgradeTitle')}</span>
        <span class="bc-desktop-account--row-line">{t('account.sheet.upgradeText')}</span>
      </span>
      <button type="button" class="bc-desktop-account--upgrade-action" onclick={() => plus('offer')}>{t('account.sheet.upgradeAction')}</button>
    </div>

    <div class="bc-desktop-account--group">
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openSettings)}>
        <span class="bc-desktop-account--tile"><Icon name="settings" size={22} /></span>
        <span class="bc-desktop-account--row-texts"><span class="bc-desktop-account--entry-title">{t('settings.title')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" class="bc-desktop-account--entry" onclick={() => leaveTo(openAbout)}>
        <span class="bc-desktop-account--tile"><Icon name="info" size={22} /></span>
        <span class="bc-desktop-account--row-texts"><span class="bc-desktop-account--entry-title">{t('about.title')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
    </div>
  </div>
{:else if navigation.accountOpen}
  <div class="bc-desktop-account" role="dialog" aria-label={t('desktopSettings.account.sheet')} bind:this={sheet}>
    <div class="bc-desktop-account--head">
      <span class="bc-desktop-account--initial" class:bc-desktop-account--silhouette={free} aria-hidden="true">
        {#if initial}{initial}{:else}<Icon name="account" size={22} weight={2} />{/if}
      </span>
      <span class="bc-desktop-account--texts">
        <span class="bc-desktop-account--name">{free ? t('account.free.device') : accountName}</span>
        {#if logbook.email && !logbook.loading && !logbook.error}
          <span class="bc-desktop-account--status">
            {#if logbook.syncFailure}
              <SyncFailureRow />
            {:else}
              <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
            {/if}
          </span>
        {:else if free}
          <span class="bc-desktop-account--status">{t('logbook.count', { n: logbook.dives.length })}</span>
        {:else if !logbook.email}
          <span class="bc-desktop-account--status">{t('menu.localDives', { n: logbook.dives.length })}</span>
        {/if}
      </span>
    </div>

    {#if free}
      <div class="bc-desktop-account--offer">
        <button type="button" class="bc-desktop-account--subscribe" onclick={() => plus('offer')}>{t('benthicPlus.offer.subscribe')}</button>
        <span class="bc-desktop-account--already">{t('benthicPlus.offer.already')}&nbsp;<button type="button" class="bc-desktop-account--sign-in" onclick={() => plus('signIn')}>{t('benthicPlus.offer.signIn')}</button></span>
      </div>
      <div class="bc-desktop-account--divider"></div>
      <button type="button" class="bc-desktop-account--row bc-desktop-account--plus-row" onclick={() => plus('offer')}>
        <Icon name="cloudDownload" size={22} />
        <span class="bc-desktop-account--row-texts"><BenthicPlusChip onSheet /><span>{t('account.free.sync')}</span><span class="bc-desktop-account--row-line">{t('account.free.syncText')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" class="bc-desktop-account--row bc-desktop-account--plus-row" onclick={() => plus('offer')}>
        <Icon name="briefcase" size={22} />
        <span class="bc-desktop-account--row-texts"><BenthicPlusChip onSheet /><span>{t('gear.profile.title')}</span><span class="bc-desktop-account--row-line">{t('gear.profile.cardLine')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
    {:else if logbook.email}
      <div class="bc-desktop-account--sync bc-desktop-account--buttons">
        {#if subscriber}<button type="button" class="bc-outlined-button" onclick={manage}>{t('nav.manageAccount')}</button>{/if}
        <SyncButton label={t('desktopSettings.account.syncNow')} />
      </div>
      <label class="bc-desktop-account--switch">
        <span class="bc-desktop-account--switch-texts">
          <span class="bc-desktop-account--switch-label">{t('desktopSettings.account.auto')}</span>
          <span class="bc-desktop-account--switch-text">{t('desktopSettings.account.autoText')}</span>
        </span>
        <span class="toggle"><input type="checkbox" checked={logbook.autoSync} onchange={(e) => setAutoSync(e.currentTarget.checked)} /><span class="toggle-icon"></span></span>
      </label>
      <label class="bc-desktop-account--switch">
        <span class="bc-desktop-account--switch-texts">
          <span class="bc-desktop-account--switch-label">{t('desktopSettings.account.unmetered')}</span>
          <span class="bc-desktop-account--switch-text">{t('desktopSettings.account.unmeteredText')}</span>
        </span>
        <span class="toggle"><input type="checkbox" checked={syncNetwork.unmeteredOnly} onchange={(e) => setUnmeteredOnly(e.currentTarget.checked)} /><span class="toggle-icon"></span></span>
      </label>
      <div class="bc-desktop-account--divider"></div>
      <button type="button" class="bc-desktop-account--row" onclick={confirmSignOut}>
        <Icon name="logout" size={22} />
        <span>{t('account.signOut')}</span>
      </button>
    {:else}
      <div class="bc-desktop-account--sync"><button type="button" class="bc-tonal-button" onclick={manage}>{t('desktopSettings.account.manage')}</button></div>
    {/if}
    {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}
    {#if subscriber}
      <div class="bc-desktop-account--divider"></div>
      <button type="button" class="bc-desktop-account--row bc-desktop-account--profile" onclick={() => leaveTo(openProfile)}>
        <Icon name="briefcase" size={22} />
        <span class="bc-desktop-account--row-texts">
          <span>{t('gear.profile.title')}</span>
          <span class="bc-desktop-account--row-line" class:bc-desktop-account--late-line={late.late}>{late.late ? t('account.sheet.maintenanceLate', { n: late.badge }) : t('gear.profile.cardLine')}</span>
        </span>
        {#if late.late}<span class="bc-desktop-account--late-badge" role="status" aria-label={t('maintenance.badge', { n: late.badge })}>{late.badge}</span>{/if}
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" class="bc-desktop-account--row bc-desktop-account--profile" onclick={() => leaveTo(openBackup)}>
        <Icon name="history" size={22} />
        <span class="bc-desktop-account--row-texts"><span>{t('account.sheet.backup')}</span><span class="bc-desktop-account--row-line">{t('account.sheet.backupText')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
      {#if accountLock.canPair}
        <button type="button" class="bc-desktop-account--row bc-desktop-account--profile" data-row="pair" onclick={() => leaveTo(accountLock.onpairnew)}>
          <Icon name="qr" size={22} />
          <span class="bc-desktop-account--row-texts"><span>{t('accountSync.pair.entry')}</span><span class="bc-desktop-account--row-line">{t('accountSync.pair.entryText')}</span></span>
          <Icon name="chevron" size={20} />
        </button>
      {/if}
    {/if}
    {#if free || subscriber}
      <div class="bc-desktop-account--divider"></div>
      <button type="button" class="bc-desktop-account--row" onclick={() => leaveTo(openSettings)}>
        <Icon name="settings" size={22} />
        <span class="bc-desktop-account--row-texts"><span>{t('settings.title')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" class="bc-desktop-account--row" onclick={() => leaveTo(openAbout)}>
        <Icon name="info" size={22} />
        <span class="bc-desktop-account--row-texts"><span>{t('about.title')}</span></span>
        <Icon name="chevron" size={20} />
      </button>
    {/if}
  </div>
{/if}

<style>
  @layer bc.components {
    .bc-desktop-account {
      position: fixed;
      z-index: 13000;
      left: calc(var(--bc-nav-width) + var(--bc-safe-left) + 8px);
      bottom: 16px;
      width: 380px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      box-sizing: border-box;
      padding: 16px 0 8px;
      border-radius: 16px;
      background: var(--bc-surface);
      outline: 1px solid var(--bc-separator);
      color: var(--bc-text);
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.12);
    }
    .bc-desktop-account--head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
    }
    .bc-desktop-account--initial {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: var(--bc-band-avatar);
      color: var(--bc-nav-avatar-ink);
      font-size: 20px;
      font-weight: 500;
    }
    .bc-desktop-account--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .bc-desktop-account--name {
      font-size: 16px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-desktop-account--email {
      font-size: 13px;
      color: var(--bc-text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-desktop-account--status {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-account--sync {
      padding: 16px;
    }
    .bc-desktop-account--switch {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 16px;
      min-height: 56px;
    }
    .bc-desktop-account--switch-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .bc-desktop-account--switch-label {
      font-size: 15px;
    }
    .bc-desktop-account--switch-text {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-account--divider {
      height: 1px;
      margin: 8px 0;
      background: var(--bc-separator);
    }
    .bc-desktop-account--row {
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
      color: var(--bc-text);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
      }
    }
    /* Free version and Benthic+ rows (task 2026-11-18-281). */
    .bc-desktop-account--silhouette {
      background: var(--bc-surface-container-high);
      color: var(--bc-text-2);
    }
    .bc-desktop-account--offer {
      padding: 12px 16px 12px 76px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
    .bc-desktop-account--subscribe {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .bc-desktop-account--already {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-desktop-account--sign-in {
      width: auto;
      padding: 10px 4px;
      margin: 0 -4px;
      border: none;
      background: none;
      color: var(--bc-release-link);
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    .bc-desktop-account--buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .bc-desktop-account--row-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      :global(.bc-plus-chip) {
        align-self: flex-start;
        height: 22px;
        padding: 0 8px 0 6px;
        border-radius: 11px;
      }
    }
    .bc-desktop-account--plus-row,
    .bc-desktop-account--profile {
      min-height: 56px;
    }
    .bc-desktop-account--row-line {
      font-size: 13px;
      color: var(--bc-text-2);

      &.bc-desktop-account--late-line {
        color: var(--bc-late-text);
      }
    }
    .bc-desktop-account--late-badge {
      flex: none;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 12px;
      background: var(--bc-late);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    /* « Synchroniser maintenant »: the page's main action, in the ink (the mock-up's black button). */
    .bc-desktop-account--sync :global(.bc-sync-button) {
      background: var(--bc-action);
      color: var(--bc-on-action);
    }

    /* A Benthic+ account (task 2026-11-19-292): the sheet's background, white rounded groups, a 36 px blue tile per entry. */
    .bc-desktop-account--plus {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--bc-background);
    }
    .bc-desktop-account--brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 32px;
    }
    .bc-desktop-account--brand-name {
      font-size: 18px;
      font-weight: 500;
    }
    .bc-desktop-account--dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-left: 3px;
      border-radius: 9px;
      background: var(--bc-account-chip);
      color: var(--bc-account-chip-ink);
      font-size: 14px;
      line-height: 1;
      font-weight: 700;
      vertical-align: 1px;
    }
    .bc-desktop-account--dark,
    :global(html.dark) .bc-desktop-account--light {
      display: none;
    }
    :global(html.dark) .bc-desktop-account--dark {
      display: inline;
    }
    .bc-desktop-account--group {
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }
    .bc-desktop-account--identity {
      display: flex;
      gap: 16px;
      padding: 16px 16px 12px;
    }
    .bc-desktop-account--avatar {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 24px;
      display: grid;
      place-items: center;
      background: var(--bc-nav-avatar-ink);
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 500;
    }
    .bc-desktop-account--manage {
      align-self: flex-start;
      width: auto;
      margin-top: 12px;
    }
    .bc-desktop-account--divider-line {
      height: 1px;
      margin: 0 16px;
      background: var(--bc-separator);
    }
    .bc-desktop-account--syncline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;

      :global(.bc-sync-button) {
        flex: none;
        white-space: nowrap;
      }

      :global(.bc-sync-status) {
        flex: 1;
        min-width: 0;
      }
    }
    .bc-desktop-account--entry {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: 0;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      & + .bc-desktop-account--entry {
        border-top: 1px solid var(--bc-separator);
      }
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
      }
    }
    .bc-desktop-account--tile {
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
    }
    .bc-desktop-account--entry-title {
      font-size: 16px;
      font-weight: 500;
    }
    /* The git sheet: the repository's icon in a round tile where the avatar sits, and the upgrade card in the release blue. */
    .bc-desktop-account--repo-tile {
      width: 48px;
      height: 48px;
      border-radius: 24px;
    }
    .bc-desktop-account--upgrade {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 12px 12px 16px;
      border-radius: 16px;
      background: var(--bc-release-tile);
      & .bc-desktop-account--row-texts {
        flex: 1;
        min-width: 0;
      }
    }
    .bc-desktop-account--upgrade-action {
      flex: none;
      width: auto;
      height: 36px;
      padding: 0 16px;
      border: 0;
      border-radius: 18px;
      background: var(--bc-release-tile-icon);
      color: var(--bc-background);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      &:hover {
        opacity: 0.88;
      }
      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: 2px;
      }
    }
  }
</style>
