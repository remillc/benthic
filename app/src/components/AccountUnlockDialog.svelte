<script>
  // @ts-check
  // « Nouvel appareil, déverrouiller les données chiffrées » (inbox task 2026-11-23-338, item 1; Benthic+ only): shown over
  // the profile when this device has no data key and the account has one (`MISSING_DATA_KEY`). Two rows, then the
  // reassurance line; « Plus tard » closes it, « Plus d’appareil ni de clé ? » opens StartOverDialog. No ✕. Driven by props
  // and callbacks only; the wiring step (docs/account-sync.md, « Screens ») decides when it opens.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * camera: this device can read a QR code (phone, tablet); false on a computer, which shows its own code instead.
   * @type {{
   *   camera: boolean,
   *   onpair: () => void,
   *   onrecoverykey: () => void,
   *   onlater: () => void,
   *   onlost: () => void,
   * }}
   */
  let { camera, onpair, onrecoverykey, onlater, onlost } = $props();
</script>

<Md3Dialog title={t('accountSync.unlock.title')} class="bc-unlock-dialog" oncancel={onlater}>
  <div class="bc-unlock-dialog--rows">
    <button type="button" class="bc-unlock-dialog--row" data-row="pair" onclick={onpair}>
      <Icon name={camera ? 'qr' : 'device'} size={24} />
      <span class="bc-unlock-dialog--texts">
        <span class="bc-unlock-dialog--label">{t('accountSync.unlock.pair')}</span>
        <span class="bc-unlock-dialog--line">{t(camera ? 'accountSync.unlock.pairCamera' : 'accountSync.unlock.pairDesktop')}</span>
      </span>
    </button>
    <button type="button" class="bc-unlock-dialog--row" data-row="recovery-key" onclick={onrecoverykey}>
      <Icon name="keyboard" size={24} />
      <span class="bc-unlock-dialog--texts">
        <span class="bc-unlock-dialog--label">{t('accountSync.unlock.recoveryKey')}</span>
      </span>
    </button>
  </div>
  <p class="bc-unlock-dialog--meanwhile">{t('accountSync.unlock.meanwhile')}</p>
  {#snippet actions()}
    <button type="button" class="bc-md3-dialog--start" data-action="lost" onclick={onlost}>{t('accountSync.unlock.lost')}</button>
    <button type="button" data-action="later" onclick={onlater}>{t('accountSync.unlock.later')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-unlock-dialog--rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0 24px;
    }

    .bc-unlock-dialog--row {
      width: 100%;
      min-height: 64px;
      padding: 12px 16px;
      box-sizing: border-box;
      border: none;
      border-radius: 16px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      display: flex;
      align-items: center;
      gap: 16px;
      text-align: start;
      cursor: pointer;
    }

    .bc-unlock-dialog--texts {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-unlock-dialog--label {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
    }

    .bc-unlock-dialog--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-unlock-dialog--meanwhile {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }
  }
</style>
