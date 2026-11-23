<script>
  // @ts-check
  // « État verrouillé des données chiffrées » (inbox task 2026-11-23-338, item 5; Benthic+ only): the card that stands in for
  // a sealed pane while this device has no data key. « Jumeler cet appareil » (filled) and « Saisir la clé de secours »
  // (outlined). On a phone it sits under the three locked rows of « Mon profil de plongeur »; on a tablet and the desktop it
  // replaces the Informations pane (and the Brevets pane reads the same). The sealed items are neither uploaded nor
  // overwritten while it shows (docs/account-sync.md).
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { accountLock } from '../lib/locked-data.svelte.js';

  /** onpair and onrecoverykey default to the shared actions the wiring step sets (lib/locked-data.svelte.js). */
  /** @type {{ onpair?: () => void, onrecoverykey?: () => void }} */
  let { onpair = () => accountLock.onpair(), onrecoverykey = () => accountLock.onrecoverykey() } = $props();
</script>

<div class="bc-locked-card" data-locked-card>
  <span class="bc-locked-card--icon" aria-hidden="true"><Icon name="lock" size={28} weight={1.8} /></span>
  <h2 class="bc-locked-card--title">{t('accountSync.locked.title')}</h2>
  <p class="bc-locked-card--line">{t('accountSync.locked.line')}</p>
  <div class="bc-locked-card--actions">
    <button type="button" class="bc-locked-card--pair" data-action="pair" onclick={onpair}>{t('accountSync.locked.pair')}</button>
    <button type="button" class="bc-locked-card--key" data-action="recovery-key" onclick={onrecoverykey}>{t('accountSync.locked.recoveryKey')}</button>
  </div>
</div>

<style>
  @layer bc.components {
    .bc-locked-card {
      margin: 16px;
      padding: 24px 16px 16px;
      border-radius: 24px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 4px;
    }

    .bc-locked-card--icon {
      width: 56px;
      height: 56px;
      border-radius: 28px;
      background: var(--bc-surface-container-high);
      display: grid;
      place-items: center;
    }

    .bc-locked-card--title {
      margin: 12px 0 0;
      font-size: 18px;
      line-height: 24px;
      font-weight: 500;
    }

    .bc-locked-card--line {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-locked-card--actions {
      width: 100%;
      max-width: 360px;
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-locked-card--actions button {
      width: 100%;
      min-height: 48px;
      padding: 0 24px;
      border-radius: 24px;
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
    }

    .bc-locked-card--pair {
      border: none;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
    }

    .bc-locked-card--key {
      border: 1px solid var(--bc-outline);
      background: none;
      color: var(--bc-action);
    }
  }
</style>
