<script>
  // @ts-check
  // « Notifications désactivées pour Benthic » (inbox task 2026-11-23-356, part 4): shown at the top of Réglages › Notifications when
  // the system refuses notifications for Benthic. A tertiary banner (what waits for the diver); its button opens the system's
  // notification settings for Benthic. Built from the task's text: the canvases « Réglages, Notifications, refusées » are not in
  // docs/mockups*.
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { openNotificationSettings } from '../lib/push-notifications.svelte.js';
  import { t } from '../lib/i18n.js';
</script>

<div class="bc-notify-refused" role="note">
  <span class="bc-notify-refused--icon"><Icon name="bell" size={24} /></span>
  <span class="bc-notify-refused--text">
    <span class="bc-notify-refused--title">{t('accountSync.push.refusedTitle')}</span>
    <span class="bc-notify-refused--body">{t('accountSync.push.refusedText')}</span>
    <button type="button" class="bc-notify-refused--button" onclick={() => void openNotificationSettings()}>{t(ios ? 'accountSync.push.openIos' : 'accountSync.push.openAndroid')}</button>
  </span>
</div>

<style>
  @layer bc.components {
    .bc-notify-refused {
      margin: 8px 16px 4px;
      padding: 14px 16px;
      box-sizing: border-box;
      border-radius: 16px;
      background: var(--bc-tertiary-container);
      color: var(--bc-on-tertiary-container);
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .bc-notify-refused--icon {
      flex: none;
      display: flex;
      color: var(--bc-tertiary);
    }

    .bc-notify-refused--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .bc-notify-refused--title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-notify-refused--body {
      font-size: 14px;
      line-height: 20px;
    }

    .bc-notify-refused--button {
      margin-top: 8px;
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: var(--bc-tertiary);
      color: #fff;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
  }
</style>
