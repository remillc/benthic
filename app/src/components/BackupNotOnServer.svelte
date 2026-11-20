<script>
  // @ts-check
  // « Sauvegarde et restauration » of a subscriber whose logbook is still on the device: the versions live in the logbook's
  // repository on the OpenDives server, so there is nothing to list yet. The one button starts the first launch's step that
  // sends the logbook of this device (« Aucun carnet sur votre compte »).
  import './backup.css';
  import Icon from './Icon.svelte';
  import { openMoveToServer } from '../lib/open-offer.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  function send() {
    navigation.backupOpen = false;
    openMoveToServer();
  }
</script>

<div class="bc-backup bc-backup-not-on-server">
  <div class="bc-backup--card">
    <span class="bc-backup--status-tile bc-backup--pending" aria-hidden="true"><Icon name="cloud" size={26} weight={1.8} /></span>
    <span class="bc-backup--texts">
      <span class="bc-backup--title">{t('backup.notOnServer.title')}</span>
      <span class="bc-backup--line">{t('backup.notOnServer.line')}</span>
    </span>
  </div>
  <div class="bc-backup-not-on-server--action">
    <button type="button" class="bc-outlined-button bc-backup-not-on-server--send" onclick={send}>{t('backup.notOnServer.send')}</button>
  </div>
</div>

<style>
  @layer od.components {
    .bc-backup-not-on-server--action {
      margin: 16px 16px 0;
      display: flex;
    }
  }
</style>
