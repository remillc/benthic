<script>
  // @ts-check
  // « Gérer le compte » on a tablet and on the desktop (task 2026-11-18-281; android-tablette-compte-gerer-paysage and
  // bureau-compte-gerer): a two-column dialog with its ✕ on the right, over the section. A Framework7 popup, so that the
  // Android Back key and Escape close it like the other dialogs.
  import { Popup } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import AccountManage from './AccountManage.svelte';
  import { navigation } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  const close = () => (navigation.manageOpen = false);

  // The body is built when the dialog opens (it reads the account then) and dropped once it has closed.
  let shown = $state(false);
  $effect(() => {
    if (navigation.manageOpen) shown = true;
  });
</script>

<Popup class="od-account-manage-dialog" opened={navigation.manageOpen} onPopupClosed={() => ((shown = false), close())} closeByBackdropClick aria-label={t('account.manage.title')}>
  <div class="od-account-manage-dialog--head">
    <h2 class="od-account-manage-dialog--title">{t('account.manage.title')}</h2>
    <button type="button" class="od-account-manage-dialog--close" onclick={close}>
      <Icon name="close" /><span class="od-sr-only">{t('nav.close')}</span>
    </button>
  </div>
  <div class="od-account-manage-dialog--body">
    {#if shown}<AccountManage columns onclose={close} />{/if}
  </div>
</Popup>

<style>
  @layer od.components {
    :global(.popup.od-account-manage-dialog) {
      --f7-popup-tablet-width: min(800px, calc(100vw - 48px));
      --f7-popup-tablet-height: 640px;
      background: var(--od-background);
      max-height: calc(100vh - 32px);
      overflow: hidden;
      border-radius: 28px;
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.25);
    }

    .od-account-manage-dialog--head {
      height: 64px;
      padding: 8px 8px 0 24px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
    }

    .od-account-manage-dialog--title {
      flex: 1;
      margin: 0;
      font-size: 24px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-account-manage-dialog--close {
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .od-account-manage-dialog--body {
      height: calc(100% - 64px);
      overflow: auto;
    }
  }
</style>
