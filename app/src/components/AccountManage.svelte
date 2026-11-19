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

<div class="od-account-manage" class:od-account-manage--columns={columns}>
  <div class="od-account-manage--column">
    <div class="od-account-manage--card od-account-manage--identity">
      <span class="od-account-manage--initial" aria-hidden="true">{initial}</span>
      <span class="od-account-manage--texts">
        <span class="od-account-manage--email">{email}</span>
        {#if method}
          <span class="od-account-manage--method" data-method={method}>
            {#if method === 'google'}
              <span class="od-account-manage--logo" aria-hidden="true">{@html googleLogo}</span>
            {:else if method === 'apple'}
              <img class="od-account-manage--logo od-account-manage--apple od-account-manage--apple-light" src={appleLogoBlack} alt="" aria-hidden="true" /><img class="od-account-manage--logo od-account-manage--apple od-account-manage--apple-dark" src={appleLogoWhite} alt="" aria-hidden="true" />
            {:else}
              <Icon name="mail" size={18} />
            {/if}
            {t(`account.manage.signedIn.${method}`)}
          </span>
        {/if}
      </span>
    </div>

    <h2 class="od-account-manage--heading">{t('account.manage.subscription')}</h2>
    <div class="od-account-manage--card od-account-manage--subscription">
      <span class="od-account-manage--chip"><BenthicPlusChip onSheet /></span>
      <span class="od-account-manage--price">{t('account.manage.perYear', { price })}</span>
      <span class="od-account-manage--line">
        {#if renews}{t('account.manage.renews', { date: formatDate(renews), store: storeName })}{:else}{t('account.manage.boughtOn', { store: storeName })}{/if}
      </span>
      <!-- The store's own page: payment method, receipts and renewal are managed there, not here. A link, opened by the
           system (the browser or the store's app): no billing tool in OpenDives. -->
      <a class="od-account-manage--store" href={storeSubscriptionsUrl(store, APP_ID)} target="_blank" rel="noopener noreferrer">
        {t(store === 'apple' ? 'account.manage.manageAppStore' : 'account.manage.manageGooglePlay')}<Icon name="openInNew" size={18} />
      </a>
      <span class="od-account-manage--note">{t(desktopApp ? 'account.manage.storeNoteDesktop' : 'account.manage.storeNote', { store: storeName })}</span>
    </div>
  </div>

  <div class="od-account-manage--column">
    <h2 class="od-account-manage--heading" class:od-account-manage--first={columns}>{t('account.manage.space')}</h2>
    <div class="od-account-manage--card od-account-manage--space">
      <span class="od-account-manage--space-head">
        <span>{t('account.manage.photosVideos')}</span>
        {#if space.known}
          <span class="od-account-manage--figures">{t('account.manage.spaceOf', { used: formatMapSize(space.used), limit })}</span>
        {:else}
          <span class="od-account-manage--figures od-account-manage--unknown">{t('account.manage.spaceUnknown', { limit })}</span>
        {/if}
      </span>
      {#if space.known}
        <span class="od-account-manage--bar" role="progressbar" aria-valuenow={space.percent} aria-valuemin="0" aria-valuemax="100" aria-label={t('account.manage.spaceUsed', { n: space.percent })}>
          <span class="od-account-manage--bar-fill" style:width="{space.percent}%"></span>
        </span>
      {/if}
      <span class="od-account-manage--note">{t('account.manage.spaceNote')}</span>
    </div>

    <h2 class="od-account-manage--heading">{t('account.manage.data')}</h2>
    <div class="od-account-manage--card od-account-manage--rows">
      <button type="button" class="od-account-manage--row od-account-manage--export" onclick={exportData}>
        <span class="od-account-manage--tile"><Icon name="download" size={22} weight={1.8} /></span>
        <span class="od-account-manage--texts">
          <span class="od-account-manage--label">{t('account.manage.export')}</span>
          <span class="od-account-manage--supporting">{t('account.manage.exportText')}</span>
        </span>
        <Icon name="chevron" size={20} />
      </button>
      <div class="od-account-manage--divider"></div>
      <button type="button" class="od-account-manage--row od-account-manage--sign-out" onclick={askSignOut}>
        <span class="od-account-manage--tile"><Icon name="logout" size={22} weight={1.8} /></span>
        <span class="od-account-manage--texts">
          <span class="od-account-manage--label">{t('account.manage.signOut')}</span>
          <span class="od-account-manage--supporting">{t('account.manage.signOutText')}</span>
        </span>
      </button>
    </div>

    <div class="od-account-manage--card od-account-manage--danger">
      <button type="button" class="od-account-manage--row od-account-manage--delete" onclick={askDelete}>
        <span class="od-account-manage--tile od-account-manage--tile-late"><Icon name="delete" size={22} weight={1.8} /></span>
        <span class="od-account-manage--texts">
          <span class="od-account-manage--label">{t('account.manage.delete')}</span>
          <span class="od-account-manage--supporting">{t('account.manage.deleteSupporting')}</span>
        </span>
      </button>
    </div>
  </div>
</div>

<style>
  @layer od.components {
    .od-account-manage {
      padding: 8px 0 calc(24px + var(--od-safe-bottom));
      color: var(--od-text);
      font-size: 16px;
    }

    .od-account-manage--columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: start;
      padding-bottom: 8px;
    }

    .od-account-manage--card {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-account-manage--identity {
      margin-top: 8px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .od-account-manage--initial {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      background: var(--od-nav-avatar-ink);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 600;
    }

    .od-account-manage--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-account-manage--email {
      font-size: 18px;
      line-height: 24px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .od-account-manage--method {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-account-manage--logo {
      flex: none;
      width: 18px;
      height: 18px;

      :global(svg) {
        width: 18px;
        height: 18px;
        display: block;
      }
    }

    .od-account-manage--apple {
      width: auto;
    }

    .od-account-manage--apple-dark {
      display: none;
    }

    :global(html.dark) {
      .od-account-manage--apple-light {
        display: none;
      }

      .od-account-manage--apple-dark {
        display: block;
      }
    }

    .od-account-manage--heading {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-account-manage--first {
      margin-top: 0;
    }

    .od-account-manage--subscription,
    .od-account-manage--space {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .od-account-manage--space {
      gap: 8px;
    }

    .od-account-manage--chip {
      align-self: flex-start;
    }

    .od-account-manage--price {
      margin-top: 6px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 500;
    }

    .od-account-manage--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-account-manage--store {
      align-self: flex-start;
      margin-top: 12px;
      min-height: 40px;
      padding: 0 16px 0 20px;
      border: 1px solid var(--od-outline);
      border-radius: 20px;
      color: var(--od-text);
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    .od-account-manage--note {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-account-manage--subscription .od-account-manage--note {
      margin-top: 8px;
    }

    .od-account-manage--space-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .od-account-manage--figures {
      font-variant-numeric: tabular-nums;
    }

    .od-account-manage--unknown {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-account-manage--bar {
      height: 8px;
      border-radius: 4px;
      background: var(--od-surface-container-high);
      display: block;
      overflow: hidden;
    }

    .od-account-manage--bar-fill {
      height: 8px;
      border-radius: 4px;
      background: var(--od-release-row-main);
      display: block;
    }

    .od-account-manage--danger {
      margin-top: 16px;
    }

    .od-account-manage--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: -2px;
      }
    }

    .od-account-manage--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-account-manage--tile-late {
      background: var(--od-late-tint);
      color: var(--od-late-text);
    }

    .od-account-manage--label {
      font-size: 16px;
      line-height: 21px;
    }

    .od-account-manage--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-account-manage--delete .od-account-manage--label {
      color: var(--od-late-text);
    }

    .od-account-manage--divider {
      height: 1px;
      margin-left: 72px;
      background: var(--od-row-divider);
    }
  }
</style>
