<script>
  // @ts-check
  // « Gérer le compte » of an OpenDives+ account (task 2026-11-18-281; mock-ups docs/mockups-release/
  // compte-android-connecte, android-tablette-compte-gerer-paysage, bureau-compte-gerer): the account and its sign-in
  // method, the subscription (managed in the store, never here), the photo and video space, the diver's data, and the
  // deletion of the account. One body for the phone's page and for the dialog of a tablet and of the desktop (`columns`).
  // What the server cannot tell yet (lib/benthic-plus-account.js) shows a placeholder, never a made-up number.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import googleLogo from '../assets/brands/google-g.svg?raw';
  import appleLogoBlack from '../assets/brands/apple-logo-black.svg';
  import appleLogoWhite from '../assets/brands/apple-logo-white.svg';
  import { logbook, signOut } from '../lib/logbook.svelte.js';
  import { showSection } from '../lib/navigation.svelte.js';
  import { deleteServerAccount, downloadMyData, loadOverview } from '../lib/benthic-plus-account.js';
  import { spaceUse, storeSubscriptionsUrl, subscriptionStore } from '../lib/account-sheet.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { formatDate } from '../lib/format.js';
  import { formatMapSize } from '../lib/maps-format.js';
  import { desktopApp, ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * `columns`: the dialog's two columns. `onclose`: leaves the page or the dialog (after signing out or deleting).
   * @type {{ columns?: boolean, onclose: () => void }}
   */
  let { columns = false, onclose } = $props();

  const APP_ID = 'org.opendives.app';

  /** @type {import('../lib/server-api.js').AccountOverview|null} */
  let overview = $state(null);
  onMount(() => {
    let alive = true;
    loadOverview().then((o) => alive && (overview = o));
    return () => (alive = false);
  });

  const email = $derived(overview?.email || logbook.email);
  const method = $derived(overview?.signInMethod ?? '');
  const store = $derived(subscriptionStore(overview?.subscription, ios));
  const storeName = $derived(t(store === 'apple' ? 'account.manage.appStore' : 'account.manage.googlePlay'));
  const price = $derived(overview?.subscription?.price ?? t('odplus.offer.price'));
  const renews = $derived(overview?.subscription?.renewsOn);
  const space = $derived(spaceUse(overview?.storage?.usedBytes, overview?.storage?.limitBytes));
  const limit = $derived(formatMapSize(space.limit));
  const initial = $derived(email.trim().charAt(0).toLocaleUpperCase());

  async function exportData() {
    const answer = await downloadMyData();
    if (answer.status === 'unavailable') showSnackbar(t('account.manage.exportUnavailable'));
  }

  function askSignOut() {
    const pending = logbook.pending;
    confirmAction({
      title: t('signOut.titleServer'),
      text: pending ? t('signOut.textPendingServer', { n: pending }) : t('signOut.textNoneServer'),
      action: t('signOut.confirm'),
      onConfirm: async () => {
        try {
          await signOut({ deleteCopy: false });
          onclose();
          showSection('logbook');
        } catch (e) {
          console.error('Signing out', e);
          showSnackbar(t('signOut.failed'));
        }
      },
    });
  }

  function askDelete() {
    confirmAction({
      title: t('account.manage.deleteTitle'),
      text: t('account.manage.deleteText', { store: storeName }),
      action: t('account.manage.deleteConfirm'),
      onConfirm: async () => {
        try {
          await deleteServerAccount();
        } catch (e) {
          console.error('Deleting the account', e);
          showSnackbar(t('account.manage.deleteFailed'));
          return;
        }
        try {
          await signOut({ deleteCopy: false });
          onclose();
          showSection('logbook');
          showSnackbar(t('account.manage.deleted'));
        } catch (e) {
          console.error('Signing out after deleting the account', e);
          showSnackbar(t('signOut.failed'));
        }
      },
    });
  }
</script>

<div class="bc-account-manage" class:bc-account-manage--columns={columns}>
  <div class="bc-account-manage--column">
    <div class="bc-account-manage--card bc-account-manage--identity">
      <span class="bc-account-manage--initial" aria-hidden="true">{initial}</span>
      <span class="bc-account-manage--texts">
        <span class="bc-account-manage--email">{email}</span>
        {#if method}
          <span class="bc-account-manage--method" data-method={method}>
            {#if method === 'google'}
              <span class="bc-account-manage--logo" aria-hidden="true">{@html googleLogo}</span>
            {:else if method === 'apple'}
              <img class="bc-account-manage--logo bc-account-manage--apple bc-account-manage--apple-light" src={appleLogoBlack} alt="" aria-hidden="true" /><img class="bc-account-manage--logo bc-account-manage--apple bc-account-manage--apple-dark" src={appleLogoWhite} alt="" aria-hidden="true" />
            {:else}
              <Icon name="mail" size={18} />
            {/if}
            {t(`account.manage.signedIn.${method}`)}
          </span>
        {/if}
      </span>
    </div>

    <h2 class="bc-account-manage--heading">{t('account.manage.subscription')}</h2>
    <div class="bc-account-manage--card bc-account-manage--subscription">
      <span class="bc-account-manage--chip"><BenthicPlusChip onSheet /></span>
      <span class="bc-account-manage--price">{t('account.manage.perYear', { price })}</span>
      <span class="bc-account-manage--line">
        {#if renews}{t('account.manage.renews', { date: formatDate(renews), store: storeName })}{:else}{t('account.manage.boughtOn', { store: storeName })}{/if}
      </span>
      <!-- The store's own page: payment method, receipts and renewal are managed there, not here. A link, opened by the
           system (the browser or the store's app): no billing tool in OpenDives. -->
      <a class="bc-account-manage--store" href={storeSubscriptionsUrl(store, APP_ID)} target="_blank" rel="noopener noreferrer">
        {t(store === 'apple' ? 'account.manage.manageAppStore' : 'account.manage.manageGooglePlay')}<Icon name="openInNew" size={18} />
      </a>
      <span class="bc-account-manage--note">{t(desktopApp ? 'account.manage.storeNoteDesktop' : 'account.manage.storeNote', { store: storeName })}</span>
    </div>
  </div>

  <div class="bc-account-manage--column">
    <h2 class="bc-account-manage--heading" class:bc-account-manage--first={columns}>{t('account.manage.space')}</h2>
    <div class="bc-account-manage--card bc-account-manage--space">
      <span class="bc-account-manage--space-head">
        <span>{t('account.manage.photosVideos')}</span>
        {#if space.known}
          <span class="bc-account-manage--figures">{t('account.manage.spaceOf', { used: formatMapSize(space.used), limit })}</span>
        {:else}
          <span class="bc-account-manage--figures bc-account-manage--unknown">{t('account.manage.spaceUnknown', { limit })}</span>
        {/if}
      </span>
      {#if space.known}
        <span class="bc-account-manage--bar" role="progressbar" aria-valuenow={space.percent} aria-valuemin="0" aria-valuemax="100" aria-label={t('account.manage.spaceUsed', { n: space.percent })}>
          <span class="bc-account-manage--bar-fill" style:width="{space.percent}%"></span>
        </span>
      {/if}
      <span class="bc-account-manage--note">{t('account.manage.spaceNote')}</span>
    </div>

    <h2 class="bc-account-manage--heading">{t('account.manage.data')}</h2>
    <div class="bc-account-manage--card bc-account-manage--rows">
      <button type="button" class="bc-account-manage--row bc-account-manage--export" onclick={exportData}>
        <span class="bc-account-manage--tile"><Icon name="download" size={22} weight={1.8} /></span>
        <span class="bc-account-manage--texts">
          <span class="bc-account-manage--label">{t('account.manage.export')}</span>
          <span class="bc-account-manage--supporting">{t('account.manage.exportText')}</span>
        </span>
        <Icon name="chevron" size={20} />
      </button>
      <div class="bc-account-manage--divider"></div>
      <button type="button" class="bc-account-manage--row bc-account-manage--sign-out" onclick={askSignOut}>
        <span class="bc-account-manage--tile"><Icon name="logout" size={22} weight={1.8} /></span>
        <span class="bc-account-manage--texts">
          <span class="bc-account-manage--label">{t('account.manage.signOut')}</span>
          <span class="bc-account-manage--supporting">{t('account.manage.signOutText')}</span>
        </span>
      </button>
    </div>

    <div class="bc-account-manage--card bc-account-manage--danger">
      <button type="button" class="bc-account-manage--row bc-account-manage--delete" onclick={askDelete}>
        <span class="bc-account-manage--tile bc-account-manage--tile-late"><Icon name="delete" size={22} weight={1.8} /></span>
        <span class="bc-account-manage--texts">
          <span class="bc-account-manage--label">{t('account.manage.delete')}</span>
          <span class="bc-account-manage--supporting">{t('account.manage.deleteSupporting')}</span>
        </span>
      </button>
    </div>
  </div>
</div>

<style>
  @layer od.components {
    .bc-account-manage {
      padding: 8px 0 calc(24px + var(--bc-safe-bottom));
      color: var(--bc-text);
      font-size: 16px;
    }

    .bc-account-manage--columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: start;
      padding-bottom: 8px;
    }

    .bc-account-manage--card {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-account-manage--identity {
      margin-top: 8px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-account-manage--initial {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      background: var(--bc-nav-avatar-ink);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 600;
    }

    .bc-account-manage--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-account-manage--email {
      font-size: 18px;
      line-height: 24px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-account-manage--method {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-account-manage--logo {
      flex: none;
      width: 18px;
      height: 18px;

      :global(svg) {
        width: 18px;
        height: 18px;
        display: block;
      }
    }

    .bc-account-manage--apple {
      width: auto;
    }

    .bc-account-manage--apple-dark {
      display: none;
    }

    :global(html.dark) {
      .bc-account-manage--apple-light {
        display: none;
      }

      .bc-account-manage--apple-dark {
        display: block;
      }
    }

    .bc-account-manage--heading {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-account-manage--first {
      margin-top: 0;
    }

    .bc-account-manage--subscription,
    .bc-account-manage--space {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-account-manage--space {
      gap: 8px;
    }

    .bc-account-manage--chip {
      align-self: flex-start;
    }

    .bc-account-manage--price {
      margin-top: 6px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 500;
    }

    .bc-account-manage--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-account-manage--store {
      align-self: flex-start;
      margin-top: 12px;
      min-height: 40px;
      padding: 0 16px 0 20px;
      border: 1px solid var(--bc-outline);
      border-radius: 20px;
      color: var(--bc-text);
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
    }

    .bc-account-manage--note {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-account-manage--subscription .bc-account-manage--note {
      margin-top: 8px;
    }

    .bc-account-manage--space-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .bc-account-manage--figures {
      font-variant-numeric: tabular-nums;
    }

    .bc-account-manage--unknown {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-account-manage--bar {
      height: 8px;
      border-radius: 4px;
      background: var(--bc-surface-container-high);
      display: block;
      overflow: hidden;
    }

    .bc-account-manage--bar-fill {
      height: 8px;
      border-radius: 4px;
      background: var(--bc-release-row-main);
      display: block;
    }

    .bc-account-manage--danger {
      margin-top: 16px;
    }

    .bc-account-manage--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: -2px;
      }
    }

    .bc-account-manage--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-account-manage--tile-late {
      background: var(--bc-late-tint);
      color: var(--bc-late-text);
    }

    .bc-account-manage--label {
      font-size: 16px;
      line-height: 21px;
    }

    .bc-account-manage--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-account-manage--delete .bc-account-manage--label {
      color: var(--bc-late-text);
    }

    .bc-account-manage--divider {
      height: 1px;
      margin-left: 72px;
      background: var(--bc-row-divider);
    }
  }
</style>
