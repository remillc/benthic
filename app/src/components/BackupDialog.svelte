<script>
  // @ts-check
  // « Sauvegarde et restauration » in the desktop app (task 2026-11-19-290; bureau-sauvegarde, -restaurer, -plongee): a 1000 px
  // dialog over the section with the list on the left and what the choice shows on the right, its ✕ on the right. A Framework7
  // popup, so that Escape closes it like the other dialogs. « Parcourir cette version » closes it and opens the version read only.
  import { Popup, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import BackupPanes from './BackupPanes.svelte';
  import BackupNotOnServer from './BackupNotOnServer.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { backup } from '../lib/backup.svelte.js';
  import { t } from '../lib/i18n.js';

  const close = () => (navigation.backupOpen = false);

  // The body is built when the dialog opens (it reads the history then) and dropped once it has closed.
  let shown = $state(false);
  $effect(() => {
    if (navigation.backupOpen) shown = true;
  });

  /** @param {string} id */
  function browse(id) {
    close();
    f7.views.current?.router.navigate(`/account/backup/browse/${id}`);
  }
</script>

<Popup class="od-backup-dialog" opened={navigation.backupOpen} onPopupClosed={() => ((shown = false), close(), (backup.choice = null))} closeByBackdropClick aria-label={t('backup.title')}>
  <div class="od-backup-dialog--head">
    <h2 class="od-backup-dialog--title">{t('backup.title')}</h2>
    <button type="button" class="od-backup-dialog--close" onclick={close}>
      <Icon name="close" /><span class="od-sr-only">{t('nav.close')}</span>
    </button>
  </div>
  <div class="od-backup-dialog--body">
    {#if shown}{#if logbook.odplus}<BackupPanes onbrowse={browse} />{:else}<BackupNotOnServer />{/if}{/if}
  </div>
</Popup>

<style>
  @layer od.components {
    :global(.popup.od-backup-dialog) {
      --f7-popup-tablet-width: min(1000px, calc(100vw - 48px));
      --f7-popup-tablet-height: min(720px, calc(100vh - 48px));
      background: var(--od-background);
      max-height: calc(100vh - 32px);
      overflow: hidden;
      border-radius: 28px;
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.25);
    }

    .od-backup-dialog--head {
      height: 64px;
      padding: 8px 8px 0 24px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
    }

    .od-backup-dialog--title {
      flex: 1;
      margin: 0;
      font-size: 24px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-backup-dialog--close {
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

    .od-backup-dialog--body {
      height: calc(100% - 64px);
      overflow: hidden;
    }
  }
</style>
